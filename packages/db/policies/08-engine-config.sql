-- =============================================================================
-- 08-engine-config.sql — Policies de config del motor + catálogo phases (Fase 4)
-- =============================================================================
-- Datos sensibles/operativos del motor. Patrón Vega: tenant_id = current_tenant()
-- + rol. El motor con service_role bypassa RLS. (Cross-tenant del agency-admin se
-- difiere a F9 junto con el ScopeSwitcher.)
-- =============================================================================


-- phases — catálogo global sin tenant_id; lectura para cualquier autenticado.
-- Modificación: solo service_role (sin policy de escritura para authenticated).
DROP POLICY IF EXISTS phases_select ON public.phases;
CREATE POLICY phases_select ON public.phases
  FOR SELECT TO authenticated
  USING (true);


-- tenant_configs — config operativa; lectura gestores, escritura admin.
DROP POLICY IF EXISTS tenant_configs_select ON public.tenant_configs;
CREATE POLICY tenant_configs_select ON public.tenant_configs
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));

DROP POLICY IF EXISTS tenant_configs_modify ON public.tenant_configs;
CREATE POLICY tenant_configs_modify ON public.tenant_configs
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin')
  WITH CHECK (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin');


-- llm_configs — EXTRA-sensible (api_key_encrypted). Solo admin.
DROP POLICY IF EXISTS llm_configs_select ON public.llm_configs;
CREATE POLICY llm_configs_select ON public.llm_configs
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin');

DROP POLICY IF EXISTS llm_configs_modify ON public.llm_configs;
CREATE POLICY llm_configs_modify ON public.llm_configs
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin')
  WITH CHECK (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin');


-- llm_calls — audit; lectura gestores. Escritura solo service_role (motor).
DROP POLICY IF EXISTS llm_calls_select ON public.llm_calls;
CREATE POLICY llm_calls_select ON public.llm_calls
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- tenant_tokens — EXTRA-sensible (tokens webhook). Solo admin.
DROP POLICY IF EXISTS tenant_tokens_select ON public.tenant_tokens;
CREATE POLICY tenant_tokens_select ON public.tenant_tokens
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin');

DROP POLICY IF EXISTS tenant_tokens_modify ON public.tenant_tokens;
CREATE POLICY tenant_tokens_modify ON public.tenant_tokens
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin')
  WITH CHECK (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin');


-- tenant_followup_config — lectura gestores, escritura admin/director_general.
DROP POLICY IF EXISTS tenant_followup_config_select ON public.tenant_followup_config;
CREATE POLICY tenant_followup_config_select ON public.tenant_followup_config
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));

DROP POLICY IF EXISTS tenant_followup_config_modify ON public.tenant_followup_config;
CREATE POLICY tenant_followup_config_modify ON public.tenant_followup_config
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));
