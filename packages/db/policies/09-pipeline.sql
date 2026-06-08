-- =============================================================================
-- 09-pipeline.sql — Policies de observabilidad del pipeline + versionado prompts (Fase 4)
-- =============================================================================
-- Todo lectura para gestores (admin/director_general). Escritura: service_role
-- (motor) para runs/events; admin para prompts (editor /admin/cerebro).
-- =============================================================================


-- pipeline_runs — audit; lectura gestores. Escritura service_role.
DROP POLICY IF EXISTS pipeline_runs_select ON public.pipeline_runs;
CREATE POLICY pipeline_runs_select ON public.pipeline_runs
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- pipeline_events — funnel; lectura gestores. Escritura service_role.
DROP POLICY IF EXISTS pipeline_events_select ON public.pipeline_events;
CREATE POLICY pipeline_events_select ON public.pipeline_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));

-- pipeline_events — INSERT manual desde el panel (Fase 6): histórico de los cambios de
-- fase del kanban. ACOTADO: solo source='manual' + event_type='phase_change' sobre una
-- conversación visible (delega visibilidad al lead). NO permite outcomes ni source=motor
-- (eso lo escribe el motor con service_role, que bypassa RLS). Cualquier rol que vea el
-- lead puede mover su card; el SELECT del histórico sigue siendo solo admin/director_general.
DROP POLICY IF EXISTS pipeline_events_manual_insert ON public.pipeline_events;
CREATE POLICY pipeline_events_manual_insert ON public.pipeline_events
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND conversation_id IN (SELECT id FROM public.conversations)
    AND source = 'manual'
    AND event_type = 'phase_change'
  );


-- prompt_block_versions — sin tenant_id (delega al prompt_block). Solo admin
-- (editor de prompts es agency-level). Escritura service_role.
DROP POLICY IF EXISTS prompt_block_versions_select ON public.prompt_block_versions;
CREATE POLICY prompt_block_versions_select ON public.prompt_block_versions
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');


-- prompt_block_drafts — autosave del editor; solo admin (tenant propio o shared NULL).
DROP POLICY IF EXISTS prompt_block_drafts_select ON public.prompt_block_drafts;
CREATE POLICY prompt_block_drafts_select ON public.prompt_block_drafts
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin'
         AND (tenant_id IS NULL OR tenant_id = public.current_tenant()));

DROP POLICY IF EXISTS prompt_block_drafts_modify ON public.prompt_block_drafts;
CREATE POLICY prompt_block_drafts_modify ON public.prompt_block_drafts
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin'
         AND (tenant_id IS NULL OR tenant_id = public.current_tenant()))
  WITH CHECK (public.current_user_role() = 'admin'
         AND (tenant_id IS NULL OR tenant_id = public.current_tenant()));
