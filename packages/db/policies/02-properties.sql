-- =============================================================================
-- 02-properties.sql — Policies de properties, property_photos, property_owners
-- =============================================================================


-- -----------------------------------------------------------------------------
-- properties — todos del tenant ven (catálogo común); admin/director_* escriben
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS properties_select ON public.properties;
CREATE POLICY properties_select ON public.properties
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS properties_insert ON public.properties;
CREATE POLICY properties_insert ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina')
  );

DROP POLICY IF EXISTS properties_update ON public.properties;
CREATE POLICY properties_update ON public.properties
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial')
  );

DROP POLICY IF EXISTS properties_delete ON public.properties;
CREATE POLICY properties_delete ON public.properties
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() = 'admin'
  );


-- -----------------------------------------------------------------------------
-- property_photos — todos del tenant ven; mismo permiso que properties para CUD
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS property_photos_select ON public.property_photos;
CREATE POLICY property_photos_select ON public.property_photos
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

DROP POLICY IF EXISTS property_photos_modify ON public.property_photos;
CREATE POLICY property_photos_modify ON public.property_photos
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'comercial')
  );


-- -----------------------------------------------------------------------------
-- property_owners — info sensible: SELECT solo admin/director_*; mismo para CUD
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS property_owners_select ON public.property_owners;
CREATE POLICY property_owners_select ON public.property_owners
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'asistente_captador')
  );

DROP POLICY IF EXISTS property_owners_modify ON public.property_owners;
CREATE POLICY property_owners_modify ON public.property_owners
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'asistente_captador')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general', 'director_oficina', 'asistente_captador')
  );
