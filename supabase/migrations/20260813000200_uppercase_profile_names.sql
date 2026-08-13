create or replace function public.normalize_profile_name_uppercase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := upper(trim(new.name));
  return new;
end;
$$;

update public.clients set name = upper(trim(name)) where name is distinct from upper(trim(name));
update public.delegate_users set name = upper(trim(name)) where name is distinct from upper(trim(name));
update public.scorekeeper_users set name = upper(trim(name)) where name is distinct from upper(trim(name));
update public.players set name = upper(trim(name)) where name is distinct from upper(trim(name));

drop trigger if exists normalize_clients_profile_name on public.clients;
create trigger normalize_clients_profile_name
before insert or update of name on public.clients
for each row execute function public.normalize_profile_name_uppercase();

drop trigger if exists normalize_delegate_profile_name on public.delegate_users;
create trigger normalize_delegate_profile_name
before insert or update of name on public.delegate_users
for each row execute function public.normalize_profile_name_uppercase();

drop trigger if exists normalize_scorekeeper_profile_name on public.scorekeeper_users;
create trigger normalize_scorekeeper_profile_name
before insert or update of name on public.scorekeeper_users
for each row execute function public.normalize_profile_name_uppercase();

drop trigger if exists normalize_player_profile_name on public.players;
create trigger normalize_player_profile_name
before insert or update of name on public.players
for each row execute function public.normalize_profile_name_uppercase();
