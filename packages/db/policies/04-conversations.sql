-- =============================================================================
-- 04-conversations.sql — Policies de conversations, conversation_messages,
-- message_schedules. Todas delegan visibility al lead padre.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND lead_id IN (SELECT id FROM public.leads)
  );

DROP POLICY IF EXISTS conversations_modify ON public.conversations;
CREATE POLICY conversations_modify ON public.conversations
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND lead_id IN (SELECT id FROM public.leads)
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND lead_id IN (SELECT id FROM public.leads)
  );


-- -----------------------------------------------------------------------------
-- conversation_messages — visibility via conversación → lead
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS conversation_messages_select ON public.conversation_messages;
CREATE POLICY conversation_messages_select ON public.conversation_messages
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND conversation_id IN (SELECT id FROM public.conversations)
  );

DROP POLICY IF EXISTS conversation_messages_modify ON public.conversation_messages;
CREATE POLICY conversation_messages_modify ON public.conversation_messages
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND conversation_id IN (SELECT id FROM public.conversations)
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND conversation_id IN (SELECT id FROM public.conversations)
  );


-- -----------------------------------------------------------------------------
-- message_schedules — visibility via conversación; solo motor escribe (service_role bypassa RLS)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS message_schedules_select ON public.message_schedules;
CREATE POLICY message_schedules_select ON public.message_schedules
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND conversation_id IN (SELECT id FROM public.conversations)
  );

-- INSERT/UPDATE/DELETE solo admin desde panel; motor con service_role bypassa RLS
DROP POLICY IF EXISTS message_schedules_admin_modify ON public.message_schedules;
CREATE POLICY message_schedules_admin_modify ON public.message_schedules
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() = 'admin'
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() = 'admin'
  );
