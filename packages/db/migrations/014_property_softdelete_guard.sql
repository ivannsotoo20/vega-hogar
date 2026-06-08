-- =============================================================================
-- 014 — Guard de soft-delete de inmuebles (F7)
-- =============================================================================
-- Defensa en profundidad: SOLO `admin` puede modificar `properties.deleted_at`.
--
-- La RLS de Postgres es a nivel de FILA, no de columna: la policy de UPDATE de
-- `properties` permite a admin/dg/director_oficina/comercial editar el inmueble,
-- pero el borrado (soft-delete = set `deleted_at`) debe ser admin-only (matriz
-- `properties.delete`=admin + RLS DELETE físico=admin). Para gatear esa única
-- columna se usa un trigger BEFORE UPDATE; complementa el app-gate admin-only de
-- `deleteProperty`.
--
-- Si no hay sesión autenticada (`current_user_role()` = NULL → motor con
-- service-role, seed), `TRUE AND NULL` = NULL → no salta → no bloquea al motor.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS. NO afecta a
-- Prisma (no modela triggers; convive con set_updated_at_trigger, que corre antes
-- por orden alfabético de nombre).
-- =============================================================================


CREATE OR REPLACE FUNCTION public.enforce_property_softdelete_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
     AND public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'solo admin puede modificar deleted_at de properties'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_property_softdelete_admin() IS
'Trigger BEFORE UPDATE: bloquea (42501) cambios en properties.deleted_at si el rol del usuario autenticado no es admin. Sin sesión (motor/seed) no bloquea.';


DROP TRIGGER IF EXISTS trg_property_softdelete_admin ON public.properties;
CREATE TRIGGER trg_property_softdelete_admin
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_softdelete_admin();
