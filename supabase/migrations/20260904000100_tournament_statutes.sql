create table if not exists public.tournament_statutes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references public.tournaments(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  file_size integer not null check (file_size > 0),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_tournament_statutes_tournament on public.tournament_statutes(tournament_id);

alter table public.tournament_statutes enable row level security;
revoke all on table public.tournament_statutes from public, anon, authenticated;
grant select, insert, update, delete on table public.tournament_statutes to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-statutes', 'tournament-statutes', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tournament_statutes_no_public_access" on storage.objects;
create policy "tournament_statutes_no_public_access"
on storage.objects for select to anon, authenticated
using (bucket_id = 'tournament-statutes' and false);
