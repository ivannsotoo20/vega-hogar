-- =============================================================================
-- 002 — Helpers y triggers
-- =============================================================================
-- Funciones helper para RLS + trigger updated_at en todas las tablas con esa
-- columna. Idempotente: re-ejecutable sin error.
--
-- Importante: NO usar el nombre `current_role()` porque colisiona con built-in
-- de PostgreSQL (devuelve el rol de sesión actual). Usamos `current_user_role()`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Helpers RLS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_tenant()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT u.tenant_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_tenant() IS
'Devuelve el tenant_id del usuario autenticado (auth.uid()). NULL si no hay sesión.';


CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_role() IS
'Devuelve el rol (enum user_role) del usuario autenticado. NULL si no hay sesión.';


-- -----------------------------------------------------------------------------
-- Trigger updated_at universal
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
'Trigger BEFORE UPDATE que actualiza la columna updated_at a now().';


-- Aplica el trigger a cada tabla con columna updated_at.
-- Idempotente: DROP IF EXISTS + CREATE.

DO $$
DECLARE
  t TEXT;
  tables_with_updated_at TEXT[] := ARRAY[
    'tenants',
    'users',
    'offices',
    'user_office_assignments',
    'properties',
    'property_owners',
    'leads',
    'lead_preferences',
    'lead_property_interest',
    'conversations',
    'message_schedules',
    'visits',
    'prompt_blocks',
    'integration_accounts'
  ];
BEGIN
  FOREACH t IN ARRAY tables_with_updated_at LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_trigger
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- Defensa: forzar RLS habilitado por si `rls_auto_enable` event trigger no
-- pudo ejecutarse en alguna tabla (idempotente: ENABLE varias veces no rompe).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
  all_tables TEXT[] := ARRAY[
    'tenants',
    'users',
    'offices',
    'user_office_assignments',
    'properties',
    'property_photos',
    'property_owners',
    'leads',
    'lead_preferences',
    'lead_property_interest',
    'conversations',
    'conversation_messages',
    'message_schedules',
    'visits',
    'prompt_blocks',
    'integration_accounts'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
