-- 017_pending_invites.sql
-- =============================================================================
-- INVITACIONES POR EMAIL (Fase 9) — alta de miembros sobre el auth magic-link SSR.
--
-- Decisión F9 #3/#3b (Iván): invites por email con ENLACE COPIABLE (sin email
-- automático). El admin/dg crea el invite (anon+RLS) y obtiene un enlace
-- /accept-invite?token=<raw>. El invitado se AUTO-REGISTRA (supabase.auth.signUp,
-- anon) y luego `claim_invite(token)` (SECURITY DEFINER) crea su fila public.users.
--
-- Por qué SECURITY DEFINER: un usuario recién registrado NO tiene fila en
-- public.users → `current_user_role()` es NULL → la RLS `users_insert` (admin/dg)
-- le impide auto-insertarse. La función corre como owner (bypassa RLS) y está
-- acotada por: token válido (hash) + no caducado/revocado + el EMAIL del invite ==
-- el email autenticado del que llama (un token robado no sirve para otra cuenta).
--
-- Seguridad (CLAUDE.md §10):
--   · token NUNCA en claro → solo sha256 (`token_hash`), lookup por índice único.
--   · `extensions.digest(...)` schema-qualified (pgcrypto vive en `extensions`, no
--     en public) → search_path se mantiene tight (`public, pg_temp`).
--   · SECURITY DEFINER + SET search_path + REVOKE FROM PUBLIC, anon + GRANT a authenticated.
--   · anti-escalada de rol se valida en `createInvite` (app-level), documentado.
--
-- RLS: la tabla se crea con RLS ENABLED aquí; las policies per-command (sin DELETE,
-- sin FOR ALL → lección F8) viven en packages/db/policies/13-invites.sql.
--
-- Idempotente (CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION). Sin
-- BEGIN/COMMIT propio (lo envuelve el runner). El índice parcial único se gestiona
-- aquí en SQL (no expresable en Prisma).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pending_invites (
  id               BIGSERIAL        PRIMARY KEY,
  tenant_id        BIGINT           NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email            CITEXT           NOT NULL,
  role             public.user_role NOT NULL,
  office_id        BIGINT           REFERENCES public.offices(id) ON DELETE SET NULL,
  invited_by       BIGINT           NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  token_hash       TEXT             NOT NULL,
  expires_at       TIMESTAMPTZ      NOT NULL,
  accepted_at      TIMESTAMPTZ,
  accepted_user_id BIGINT           REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pending_invites_token_hash_key
  ON public.pending_invites (token_hash);

-- Un único invite ACTIVO (ni aceptado ni revocado) por (tenant, email).
CREATE UNIQUE INDEX IF NOT EXISTS pending_invites_active_uq
  ON public.pending_invites (tenant_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS pending_invites_tenant_idx
  ON public.pending_invites (tenant_id, created_at DESC);

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- claim_invite(p_token) — el invitado autenticado canjea su token y se crea su
-- fila public.users. SECURITY DEFINER (bypassa RLS), acotado por token + email-match.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_invite(p_token text)
RETURNS TABLE (status text, tenant_id bigint, role public.user_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid   := auth.uid();
  v_email  citext := lower(coalesce(auth.jwt() ->> 'email', ''))::citext;
  v_hash   text;
  v_inv    public.pending_invites%ROWTYPE;
  v_user   public.users%ROWTYPE;
  v_new_id bigint;
  v_full   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING errcode = '28000'; END IF;
  IF v_email = '' THEN RAISE EXCEPTION 'NO_EMAIL_IN_JWT' USING errcode = '28000'; END IF;

  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'INVALID_TOKEN' USING errcode = '22023';
  END IF;
  -- pgcrypto vive en `extensions` → schema-qualified (search_path se queda tight).
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv FROM public.pending_invites WHERE token_hash = v_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_NOT_FOUND' USING errcode = 'P0002'; END IF;
  IF v_inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'INVITE_REVOKED' USING errcode = 'P0001'; END IF;
  IF v_inv.expires_at < now() THEN RAISE EXCEPTION 'INVITE_EXPIRED' USING errcode = 'P0001'; END IF;

  -- CRÍTICO: el email del invite debe coincidir con el email autenticado.
  IF v_inv.email <> v_email THEN RAISE EXCEPTION 'EMAIL_MISMATCH' USING errcode = '42501'; END IF;

  -- Idempotencia: si ya existe la fila users para este auth_user_id, no se recrea.
  SELECT * INTO v_user FROM public.users WHERE auth_user_id = v_uid;
  IF FOUND THEN
    UPDATE public.pending_invites
       SET accepted_at = coalesce(accepted_at, now()),
           accepted_user_id = coalesce(accepted_user_id, v_user.id)
     WHERE id = v_inv.id AND accepted_at IS NULL;
    RETURN QUERY SELECT 'already_member'::text, v_user.tenant_id, v_user.role;
    RETURN;
  END IF;

  -- CAS: solo se canjea si sigue libre (cierra la carrera de doble-claim).
  UPDATE public.pending_invites SET accepted_at = now()
   WHERE id = v_inv.id AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_ALREADY_USED' USING errcode = 'P0001'; END IF;

  v_full := split_part(v_inv.email::text, '@', 1);
  INSERT INTO public.users (auth_user_id, tenant_id, email, full_name, role, active)
       VALUES (v_uid, v_inv.tenant_id, v_inv.email::text, v_full, v_inv.role, true)
    RETURNING id INTO v_new_id;

  UPDATE public.pending_invites SET accepted_user_id = v_new_id WHERE id = v_inv.id;

  IF v_inv.office_id IS NOT NULL THEN
    INSERT INTO public.user_office_assignments (tenant_id, user_id, office_id, is_primary)
         VALUES (v_inv.tenant_id, v_new_id, v_inv.office_id, true)
    ON CONFLICT (user_id, office_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT 'created'::text, v_inv.tenant_id, v_inv.role;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_invite(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_invite(text) TO authenticated;
