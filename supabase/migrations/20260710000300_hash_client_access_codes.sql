-- Add hashed access codes for client admin profiles.
-- Existing plaintext access_code values remain temporarily for legacy login migration.

alter table public.clients
add column if not exists access_code_hash text;

comment on column public.clients.access_code_hash is 'Server-generated scrypt password hash for client admin access.';

revoke all on table public.clients from public;
revoke all on table public.clients from anon;
revoke all on table public.clients from authenticated;

grant select (id, name, slug, logo_url, is_active, created_at)
on table public.clients
to anon, authenticated;

grant select, insert, update, delete
on table public.clients
to service_role;
