-- =============================================================================
-- 12-calendar.sql — Policies de calendario GHL, voz y mock WhatsApp (Fase 4)
-- =============================================================================
-- calendar_accounts/appointments + ignored_users: tenant-scoped, escritura gestores
-- (los appointments los escribe el webhook GHL vía service_role). voice_* y
-- mock_whatsapp_outbox: lectura tenant (delegando donde aplica); escritura del
-- motor vía service_role.
-- =============================================================================


-- calendar_accounts — config de integración de calendario.
DROP POLICY IF EXISTS calendar_accounts_select ON public.calendar_accounts;
CREATE POLICY calendar_accounts_select ON public.calendar_accounts
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS calendar_accounts_modify ON public.calendar_accounts;
CREATE POLICY calendar_accounts_modify ON public.calendar_accounts
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- calendar_appointments — espejo GHL (incl. huérfanos lead_id NULL para
-- reconciliación). Lectura tenant; escritura service_role (webhook) + admin manual.
DROP POLICY IF EXISTS calendar_appointments_select ON public.calendar_appointments;
CREATE POLICY calendar_appointments_select ON public.calendar_appointments
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS calendar_appointments_modify ON public.calendar_appointments;
CREATE POLICY calendar_appointments_modify ON public.calendar_appointments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin')
  WITH CHECK (tenant_id = public.current_tenant() AND public.current_user_role() = 'admin');


-- ignored_users — blacklist.
DROP POLICY IF EXISTS ignored_users_select ON public.ignored_users;
CREATE POLICY ignored_users_select ON public.ignored_users
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS ignored_users_modify ON public.ignored_users;
CREATE POLICY ignored_users_modify ON public.ignored_users
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'))
  WITH CHECK (tenant_id = public.current_tenant()
         AND public.current_user_role() IN ('admin','director_general'));


-- voice_calls — registro de llamadas; lectura tenant. Escritura service_role (motor).
DROP POLICY IF EXISTS voice_calls_select ON public.voice_calls;
CREATE POLICY voice_calls_select ON public.voice_calls
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());


-- voice_transcripts — delega a voice_calls. Escritura service_role.
DROP POLICY IF EXISTS voice_transcripts_select ON public.voice_transcripts;
CREATE POLICY voice_transcripts_select ON public.voice_transcripts
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND call_id IN (SELECT id FROM public.voice_calls));


-- mock_whatsapp_outbox — el panel (simulador) lo lee; el motor lo escribe (service_role).
DROP POLICY IF EXISTS mock_whatsapp_outbox_select ON public.mock_whatsapp_outbox;
CREATE POLICY mock_whatsapp_outbox_select ON public.mock_whatsapp_outbox
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND conversation_id IN (SELECT id FROM public.conversations));
