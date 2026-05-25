-- =============================================================================
-- 01-identity.sql — Policies de tenants, users, offices, user_office_assignments
-- =============================================================================
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- Todas las policies usan public.current_tenant() y public.current_user_role().
-- =============================================================================


-- -----------------------------------------------------------------------------
-- tenants — solo se ve el propio tenant; solo admin modifica
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS tenants_select ON public.tenants;
CREATE POLICY tenants_select ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.current_tenant());

DROP POLICY IF EXISTS tenants_admin_all ON public.tenants;
CREATE POLICY tenants_admin_all ON public.tenants
  FOR ALL TO authenticated
  USING (id = public.current_tenant() AND public.current_user_role() = 'admin')
  WITH CHECK (id = public.current_tenant() AND public.current_user_role() = 'admin');


-- -----------------------------------------------------------------------------
-- users — todos los del tenant se ven entre sí; admin/director_general escriben
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()        -- siempre puedo verme a mí mismo (bootstrap)
    OR tenant_id = public.current_tenant()
  );

DROP POLICY IF EXISTS users_insert ON public.users;
CREATE POLICY users_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  );

DROP POLICY IF EXISTS users_update ON public.users;
CREATE POLICY users_update ON public.users
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  );

DROP POLICY IF EXISTS users_delete ON public.users;
CREATE POLICY users_delete ON public.users
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() = 'admin'
  );


-- -----------------------------------------------------------------------------
-- offices — todos del tenant ven; admin/director_general escriben
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS offices_select ON public.offices;
CREATE POLICY offices_select ON public.offices
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS offices_modify ON public.offices;
CREATE POLICY offices_modify ON public.offices
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  );


-- -----------------------------------------------------------------------------
-- user_office_assignments — todos del tenant ven; admin/director_general escriben
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS uoa_select ON public.user_office_assignments;
CREATE POLICY uoa_select ON public.user_office_assignments
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS uoa_modify ON public.user_office_assignments;
CREATE POLICY uoa_modify ON public.user_office_assignments
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  );
