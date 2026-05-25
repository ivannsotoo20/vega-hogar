-- =============================================================================
-- 06-agent-sys.sql — Policies de prompt_blocks, integration_accounts
-- =============================================================================
-- Datos sensibles. Solo admin lee/escribe desde panel. Motor con service_role bypassa.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- prompt_blocks — solo admin lee y escribe; motor con service_role bypassa
-- shared (tenant_id NULL) visible para admin de cualquier tenant
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS prompt_blocks_select ON public.prompt_blocks;
CREATE POLICY prompt_blocks_select ON public.prompt_blocks
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'admin'
    AND (tenant_id IS NULL OR tenant_id = public.current_tenant())
  );

DROP POLICY IF EXISTS prompt_blocks_modify ON public.prompt_blocks;
CREATE POLICY prompt_blocks_modify ON public.prompt_blocks
  FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'admin'
    AND (tenant_id IS NULL OR tenant_id = public.current_tenant())
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND (tenant_id IS NULL OR tenant_id = public.current_tenant())
  );


-- -----------------------------------------------------------------------------
-- integration_accounts — datos extra-sensibles (credenciales encriptadas).
-- Solo admin y director_general leen. Solo admin escribe.
-- Motor con service_role bypassa RLS para todas las ops.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS integration_accounts_select ON public.integration_accounts;
CREATE POLICY integration_accounts_select ON public.integration_accounts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  );

DROP POLICY IF EXISTS integration_accounts_modify ON public.integration_accounts;
CREATE POLICY integration_accounts_modify ON public.integration_accounts
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() = 'admin'
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() = 'admin'
  );
