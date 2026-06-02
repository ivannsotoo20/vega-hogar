-- =============================================================================
-- 10-knowledge-resources.sql — Policies de KB, recursos, plantillas y keywords (Fase 4)
-- =============================================================================
-- Datos operativos NO sensibles: lectura para todo el tenant; escritura gestores
-- (admin/director_general). El motor con service_role bypassa.
-- =============================================================================


-- agent_knowledge
DROP POLICY IF EXISTS agent_knowledge_select ON public.agent_knowledge;
CREATE POLICY agent_knowledge_select ON public.agent_knowledge
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS agent_knowledge_modify ON public.agent_knowledge;
CREATE POLICY agent_knowledge_modify ON public.agent_knowledge
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- resources
DROP POLICY IF EXISTS resources_select ON public.resources;
CREATE POLICY resources_select ON public.resources
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS resources_modify ON public.resources;
CREATE POLICY resources_modify ON public.resources
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- followup_templates
DROP POLICY IF EXISTS followup_templates_select ON public.followup_templates;
CREATE POLICY followup_templates_select ON public.followup_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS followup_templates_modify ON public.followup_templates;
CREATE POLICY followup_templates_modify ON public.followup_templates
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- automation_keywords
DROP POLICY IF EXISTS automation_keywords_select ON public.automation_keywords;
CREATE POLICY automation_keywords_select ON public.automation_keywords
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS automation_keywords_modify ON public.automation_keywords;
CREATE POLICY automation_keywords_modify ON public.automation_keywords
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));
