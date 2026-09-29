-- Allows administrators to reverse an approved proof while preserving its audit trail.
alter table public.fine_payment_proofs
  drop constraint if exists fine_payment_proofs_status_check;

alter table public.fine_payment_proofs
  add constraint fine_payment_proofs_status_check
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED')),
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.clients(id) on delete set null,
  add column if not exists reversal_reason text;

create or replace function public.sportscore_reverse_fine_payment_proof(
  p_proof_id uuid,
  p_reason text,
  p_reviewer uuid
)
returns table(updated_events integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proof record;
  v_event_count integer;
  v_updated_count integer;
begin
  if p_reviewer is null then
    raise exception 'No se identificó al administrador que revierte el pago.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indica el motivo de la reversión.';
  end if;

  select id, status, match_event_id
    into v_proof
    from public.fine_payment_proofs
   where id = p_proof_id
   for update;

  if not found then
    raise exception 'Comprobante no encontrado.';
  end if;
  if v_proof.status <> 'APPROVED' then
    raise exception 'Solo se pueden revertir comprobantes aprobados.';
  end if;

  select count(*) into v_event_count
    from public.fine_payment_proof_allocations
   where proof_id = p_proof_id;

  if v_event_count > 0 then
    if exists (
      select 1
        from public.fine_payment_proof_allocations allocation
        join public.match_events event_row on event_row.id = allocation.match_event_id
       where allocation.proof_id = p_proof_id
         and event_row.fine_status <> 'PAID'
    ) then
      raise exception 'Una sanción cubierta cambió de estado. Actualiza el Tribunal antes de revertir.';
    end if;

    update public.match_events event_row
       set fine_status = 'UNPAID'
      from public.fine_payment_proof_allocations allocation
     where allocation.proof_id = p_proof_id
       and event_row.id = allocation.match_event_id
       and event_row.fine_status = 'PAID';
    get diagnostics v_updated_count = row_count;
  elsif v_proof.match_event_id is not null then
    update public.match_events
       set fine_status = 'UNPAID'
     where id = v_proof.match_event_id
       and fine_status = 'PAID';
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then
      raise exception 'La sanción asociada no está pagada o ya cambió de estado.';
    end if;
  else
    raise exception 'El comprobante no tiene sanciones asociadas para revertir.';
  end if;

  if v_updated_count <> v_event_count and v_event_count > 0 then
    raise exception 'No se pudieron restaurar todas las sanciones del comprobante.';
  end if;

  update public.fine_payment_proofs
     set status = 'REVERSED',
         reversed_at = now(),
         reversed_by = p_reviewer,
         reversal_reason = trim(p_reason)
   where id = p_proof_id
     and status = 'APPROVED';

  if not found then
    raise exception 'No se pudo cerrar la reversión del comprobante.';
  end if;

  return query select v_updated_count;
end;
$$;

revoke all on function public.sportscore_reverse_fine_payment_proof(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.sportscore_reverse_fine_payment_proof(uuid, text, uuid) to service_role;
