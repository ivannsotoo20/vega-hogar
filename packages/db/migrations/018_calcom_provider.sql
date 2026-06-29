-- 018_calcom_provider.sql — Fase 10c (S20)
-- Añade 'cal_com' al enum public.integration_provider para registrar Cal.com como
-- integración de calendario (visits = verdad; Cal.com = espejo/disponibilidad).
--
-- ALTER TYPE ... ADD VALUE es ADITIVO e IDEMPOTENTE (IF NOT EXISTS). Fichero AISLADO:
-- PostgreSQL no permite USAR el valor nuevo en la misma transacción, así que aquí va
-- SOLO el ALTER TYPE (sin DDL/DML que lo use). Patrón idéntico a 008_enums_extend.sql.

ALTER TYPE public.integration_provider ADD VALUE IF NOT EXISTS 'cal_com';
