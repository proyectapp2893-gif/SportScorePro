-- Comprobantes privados de multas. Se versiona para aplicar en una ventana controlada.
create table if not exists public.fine_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  match_event_id uuid not null references public.match_events(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size integer not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  rejection_reason text,
  submitted_by_delegate_id uuid references public.delegate_users(id) on delete set null,
  reviewed_by uuid,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists fine_payment_proofs_event_idx on public.fine_payment_proofs(match_event_id, status);
create index if not exists fine_payment_proofs_team_idx on public.fine_payment_proofs(team_id, status);
alter table public.fine_payment_proofs enable row level security;
revoke all on public.fine_payment_proofs from anon;
revoke all on public.fine_payment_proofs from authenticated;
-- Las acciones server-side autorizadas son la única superficie de lectura/escritura.
