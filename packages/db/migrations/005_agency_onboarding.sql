-- =============================================================================
-- 005_agency_onboarding.sql — Cimientos del port (Fase 3)
-- =============================================================================
-- Añade dos columnas aditivas que el port de SETTER necesita:
--   - public.users.is_agency_admin → flag de agency-admin. Fyzon opera la
--     agencia; cada inmobiliaria es un tenant (Vega Hogar = tenant 1). Es
--     independiente del rol del tenant (un admin de tenant NO es agency-admin).
--   - public.tenants.onboarded_at  → marca de fin del onboarding (wizard setup).
--     NULL = pendiente; el panel redirige a /settings/setup mientras sea NULL.
--
-- Aditiva y reversible (ADD COLUMN IF NOT EXISTS). NO crea ni modifica policies:
-- las RLS de users/tenants (fase 1) siguen válidas tal cual. La impersonación
-- cross-tenant del agency-admin (que sí requeriría policy) se difiere a Fase 4.
--
-- Dependencias:
--   - public.users, public.tenants (existentes, fase 1)
-- =============================================================================


ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_agency_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Iván (showcase Fyzon) como agency-admin. Idempotente.
UPDATE public.users
  SET is_agency_admin = true
  WHERE email = 'sotobautistaivan@gmail.com';

COMMENT ON COLUMN public.users.is_agency_admin IS
  'Agency-admin de Fyzon (cross-tenant). Independiente del rol del tenant. Fase 3 (port).';
COMMENT ON COLUMN public.tenants.onboarded_at IS
  'Timestamp de fin de onboarding (wizard setup). NULL = pendiente. Fase 3 (port).';
