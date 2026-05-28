-- =============================================================================
-- 004_fix_helpers_security_definer.sql — Hotfix RLS recursión infinita
-- =============================================================================
-- Aplicado en caliente durante Fase 2 (2026-05-28).
--
-- Bug: current_tenant() y current_user_role() eran SECURITY INVOKER (default).
--      Cuando authenticated llamaba current_tenant() → query interna a
--      public.users → policy users_select evaluaba la condición
--      `tenant_id = current_tenant()` → llamada recursiva infinita →
--      "stack depth limit exceeded".
--
-- Detección: invisible durante el seed Fase 1 porque service_role bypasea RLS.
-- Se manifestó por primera vez en Fase 2 con un usuario real logueado.
--
-- Fix: SECURITY DEFINER + SET search_path + REVOKE/GRANT explícitos.
--      La query interna corre con permisos del owner (postgres) → bypasea RLS.
--
-- Cumple las reglas duras de seguridad declaradas en CLAUDE.md:
--   - SECURITY DEFINER ✓
--   - SET search_path = public, pg_temp ✓
--   - REVOKE EXECUTE FROM PUBLIC, anon ✓
--   - GRANT EXECUTE TO authenticated (necesario para RLS), service_role
-- =============================================================================


CREATE OR REPLACE FUNCTION public.current_tenant()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.tenant_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.active = true
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_tenant() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
