-- Phase 5.2: unaccent helper for diacritic-insensitive FTS (stack-decision §2).
-- Query-time to_tsvector/plainto_tsquery call library_unaccent; no stored
-- tsvector column yet — subtype rows are written after the base resource row,
-- so a title-only generated column would miss author/DOI until a later trigger
-- pass. Query-time FTS is correct at this catalog scale and keeps the contract
-- engine-agnostic.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION library_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;
