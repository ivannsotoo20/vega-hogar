-- =============================================================================
-- 05-visits.sql — Policies de visits
-- =============================================================================
-- Comerciales ven sus visitas asignadas.
-- director_oficina ve visitas de sus comerciales.
-- admin + director_general + asistente_captador ven todas.
-- =============================================================================

DROP POLICY IF EXISTS visits_select ON public.visits;
CREATE POLICY visits_select ON public.visits
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND (
      public.current_user_role() IN ('admin', 'director_general', 'asistente_captador')

      OR (
        public.current_user_role() = 'director_oficina'
        AND comercial_user_id IN (
          SELECT uoa2.user_id FROM public.user_office_assignments uoa1
          JOIN public.users u_me ON u_me.id = uoa1.user_id
          JOIN public.user_office_assignments uoa2 ON uoa2.office_id = uoa1.office_id
          WHERE u_me.auth_user_id = auth.uid()
        )
      )

      OR (
        public.current_user_role() IN ('comercial', 'asistente_captador')
        AND comercial_user_id IN (
          SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS visits_modify ON public.visits;
CREATE POLICY visits_modify ON public.visits
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial', 'asistente_captador')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial', 'asistente_captador')
  );
