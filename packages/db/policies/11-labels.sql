-- =============================================================================
-- 11-labels.sql — Policies de etiquetas y notas de conversación (Fase 4)
-- =============================================================================
-- tenant_labels / label_automation_rules: lectura tenant, escritura gestores.
-- conversation_labels / conversation_notes: delegan al acceso a la conversación
-- (cualquiera que vea la conversación puede etiquetar/anotar). El motor con
-- service_role bypassa.
-- =============================================================================


-- tenant_labels — catálogo de etiquetas del tenant.
DROP POLICY IF EXISTS tenant_labels_select ON public.tenant_labels;
CREATE POLICY tenant_labels_select ON public.tenant_labels
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS tenant_labels_modify ON public.tenant_labels;
CREATE POLICY tenant_labels_modify ON public.tenant_labels
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- label_automation_rules — reglas de auto-etiquetado.
DROP POLICY IF EXISTS label_automation_rules_select ON public.label_automation_rules;
CREATE POLICY label_automation_rules_select ON public.label_automation_rules
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS label_automation_rules_modify ON public.label_automation_rules;
CREATE POLICY label_automation_rules_modify ON public.label_automation_rules
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- conversation_labels — delega al acceso a la conversación.
DROP POLICY IF EXISTS conversation_labels_select ON public.conversation_labels;
CREATE POLICY conversation_labels_select ON public.conversation_labels
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND conversation_id IN (SELECT id FROM public.conversations));

DROP POLICY IF EXISTS conversation_labels_modify ON public.conversation_labels;
CREATE POLICY conversation_labels_modify ON public.conversation_labels
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND conversation_id IN (SELECT id FROM public.conversations))
  WITH CHECK (tenant_id = public.current_tenant()
         AND conversation_id IN (SELECT id FROM public.conversations));


-- conversation_notes — delega al acceso a la conversación.
DROP POLICY IF EXISTS conversation_notes_select ON public.conversation_notes;
CREATE POLICY conversation_notes_select ON public.conversation_notes
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND conversation_id IN (SELECT id FROM public.conversations));

DROP POLICY IF EXISTS conversation_notes_modify ON public.conversation_notes;
CREATE POLICY conversation_notes_modify ON public.conversation_notes
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND conversation_id IN (SELECT id FROM public.conversations))
  WITH CHECK (tenant_id = public.current_tenant()
         AND conversation_id IN (SELECT id FROM public.conversations));
