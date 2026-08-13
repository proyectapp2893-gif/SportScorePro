alter table public.delegate_users
  add column if not exists whatsapp_phone text;

comment on column public.delegate_users.whatsapp_phone is
  'Número de WhatsApp en formato internacional, solo dígitos y sin prefijo +.';

alter table public.delegate_users
  drop constraint if exists delegate_users_whatsapp_phone_format;

alter table public.delegate_users
  add constraint delegate_users_whatsapp_phone_format
  check (whatsapp_phone is null or whatsapp_phone ~ '^[0-9]{10,15}$');
