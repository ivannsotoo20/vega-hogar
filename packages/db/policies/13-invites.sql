-- =============================================================================
-- 13-invites.sql — Policies de pending_invites (Fase 9, invites por email)
-- =============================================================================
-- Per-command (NO FOR ALL → no se sobre-expone el SELECT; lección F8). SIN DELETE
-- (las invitaciones no se borran: se revocan vía UPDATE revoked_at → audit-trail).
--
-- Solo admin/director_general del tenant gestionan invites (matriz admin.users.*).
-- El INSERT exige además que `invited_by` sea el propio usuario (anti-suplantación
-- de autoría). El invitado NO lee esta tabla con su cliente (no es admin); la
-- aceptación pasa por la función SECURITY DEFINER `claim_invite` (mig 017), que
-- bypassa RLS de forma acotada. anon queda totalmente bloqueado (sin policy anon).
-- =============================================================================

DROP POLICY IF EXISTS pending_invites_select ON public.pending_invites;
CREATE POLICY pending_invites_select ON public.pending_invites
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  );

DROP POLICY IF EXISTS pending_invites_insert ON public.pending_invites;
CREATE POLICY pending_invites_insert ON public.pending_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
    AND invited_by IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS pending_invites_update ON public.pending_invites;
CREATE POLICY pending_invites_update ON public.pending_invites
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  )
  WITH CHECK (
    tenant_id = public.current_tenant()
    AND public.current_user_role() IN ('admin', 'director_general')
  );
