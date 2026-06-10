-- 015_fix_visits_select_rls.sql
-- =============================================================================
-- FIX de seguridad RLS (bug pre-existente de F1, descubierto en F8 por probe) +
-- endurecimiento de escrituras (decisión Iván, F8).
--
-- Síntoma: un `comercial` veía TODAS las visitas del tenant (no solo las suyas);
-- un `director_oficina` veía todas (no solo las de su oficina).
--
-- Causa: `visits_modify` se creó como FOR ALL. Una policy FOR ALL también aplica
-- a SELECT, y las policies permisivas se combinan con OR. Su USING permisivo
-- (tenant + los 5 roles) se OR-aba con `visits_select` (scoped) para el comando
-- SELECT, anulando por completo el scoping por comercial/oficina. `leads` no
-- sufre esto porque usa policies separadas por comando (sin FOR ALL).
--
-- Arreglo: se sustituye `visits_modify` (FOR ALL) por policies separadas de
-- INSERT/UPDATE/DELETE que usan EL MISMO predicado scoped que `visits_select`
-- (admin/dg/asistente → todas; director_oficina → su oficina; comercial → solo
-- las suyas). Así:
--   · SELECT queda gobernado SOLO por `visits_select` (que NO se toca).
--   · Las escrituras quedan tan acotadas como las lecturas: un comercial no puede
--     modificar/borrar visitas ajenas, ni reasignarse una a otro (WITH CHECK).
-- La app sigue siendo la primera línea (read-before-write, reassign do+, D4c).
--
-- Idempotente (DROP IF EXISTS + CREATE). `visits` es la única tabla afectada por
-- el combo FOR ALL + SELECT-scoped (verificado con un escaneo de pg_policy).
-- =============================================================================

DROP POLICY IF EXISTS visits_modify ON public.visits;

-- INSERT: el nuevo row debe caer dentro del scope del autor (WITH CHECK).
DROP POLICY IF EXISTS visits_insert ON public.visits;
CREATE POLICY visits_insert ON public.visits
  FOR INSERT TO authenticated
  WITH CHECK (
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
        public.current_user_role() = 'comercial'
        AND comercial_user_id IN (
          SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );

-- UPDATE: el row existente (USING) y el resultante (WITH CHECK) deben estar en scope.
DROP POLICY IF EXISTS visits_update ON public.visits;
CREATE POLICY visits_update ON public.visits
  FOR UPDATE TO authenticated
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
        public.current_user_role() = 'comercial'
        AND comercial_user_id IN (
          SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
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
        public.current_user_role() = 'comercial'
        AND comercial_user_id IN (
          SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );

-- DELETE: el row existente debe estar en scope.
DROP POLICY IF EXISTS visits_delete ON public.visits;
CREATE POLICY visits_delete ON public.visits
  FOR DELETE TO authenticated
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
        public.current_user_role() = 'comercial'
        AND comercial_user_id IN (
          SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );
