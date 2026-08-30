-- Modalidad deportiva independiente del formato competitivo y de la categoría de edad.
-- NULL/estándar conserva el comportamiento de torneos existentes.
alter table public.tournaments
  add column if not exists sport_modality text;
