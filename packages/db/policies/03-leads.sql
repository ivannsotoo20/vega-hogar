-- =============================================================================
-- 03-leads.sql — Policies de leads, lead_preferences, lead_property_interest
-- =============================================================================
-- Comerciales ven SOLO sus leads asignados.
-- director_oficina ve los leads de su oficina (filtro via office_id).
-- admin + director_general ven TODOS los del tenant.
-- asistente_captador ve TODOS los del tenant (foco vendedores cross-oficina).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND (
      -- admin, director_general, asistente_captador → todos del tenant
      public.current_user_role() IN ('admin', 'director_general', 'asistente_captador')

      -- director_oficina → leads de su(s) oficina(s)
      OR (
        public.current_user_role() = 'director_oficina'
        AND (
          office_id IN (
            SELECT office_id FROM public.user_office_assignments uoa
            JOIN public.users u ON u.id = uoa.user_id
            WHERE u.auth_user_id = auth.uid()
          )
          OR office_id IS NULL
        )
      )

      -- comercial → solo sus leads asignados
      OR (
        public.current_user_role() = 'comercial'
        AND assigned_to_user_id IN (
          SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial', 'asistente_captador')
  );

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial', 'asistente_captador')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial', 'asistente_captador')
  );

DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete ON public.leads
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  );


-- -----------------------------------------------------------------------------
-- lead_preferences — mismo visibility que leads (siguen el lead padre)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS lead_preferences_select ON public.lead_preferences;
CREATE POLICY lead_preferences_select ON public.lead_preferences
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND lead_id IN (SELECT id FROM public.leads)  -- delega visibility a leads_select
  );

DROP POLICY IF EXISTS lead_preferences_modify ON public.lead_preferences;
CREATE POLICY lead_preferences_modify ON public.lead_preferences
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
-- lead_property_interest — mismo patrón delegado a leads
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS lead_property_interest_select ON public.lead_property_interest;
CREATE POLICY lead_property_interest_select ON public.lead_property_interest
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND lead_id IN (SELECT id FROM public.leads)
  );

DROP POLICY IF EXISTS lead_property_interest_modify ON public.lead_property_interest;
CREATE POLICY lead_property_interest_modify ON public.lead_property_interest
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND lead_id IN (SELECT id FROM public.leads)
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND lead_id IN (SELECT id FROM public.leads)
  );
