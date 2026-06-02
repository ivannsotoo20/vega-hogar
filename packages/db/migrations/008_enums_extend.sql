-- =============================================================================
-- 008_enums_extend.sql — Ampliar enums existentes (Fase 4) · MIGRACIÓN AISLADA
-- =============================================================================
-- Postgres NO permite usar un valor de enum recién añadido en la MISMA
-- transacción. Por eso estos ALTER TYPE van solos, sin ninguna DDL/DML que use
-- los valores nuevos (las tablas/columnas que los usan vienen en 009+).
--
--   message_role        +'system'  → mensajes de sistema del motor (agent≡ai SETTER).
--   integration_provider +'ghl'    → GHL como proveedor de integración/calendario.
-- =============================================================================

ALTER TYPE public.message_role ADD VALUE IF NOT EXISTS 'system';
ALTER TYPE public.integration_provider ADD VALUE IF NOT EXISTS 'ghl';
