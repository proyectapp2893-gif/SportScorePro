-- Compatibilidad para instalaciones donde la cobertura parcial de multas
-- quedó aplicada sin crear el monto opcional por evento.
-- La función sportscore_approve_fine_payment_proof lo usa con fallback a la
-- configuración del torneo, por lo que la columna puede permanecer nula.
alter table public.match_events
  add column if not exists fine_amount numeric(12, 2);
