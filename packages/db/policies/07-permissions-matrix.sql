-- =============================================================================
-- 07-permissions-matrix.sql — Policies de permissions_matrix
-- =============================================================================
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- Lectura: cualquier authenticated del tenant. Escritura: solo admin del tenant.
-- =============================================================================


DROP POLICY IF EXISTS pm_select ON public.permissions_matrix;
CREATE POLICY pm_select ON public.permissions_matrix
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS pm_admin_all ON public.permissions_matrix;
CREATE POLICY pm_admin_all ON public.permissions_matrix
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() = 'admin'
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() = 'admin'
  );
