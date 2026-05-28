-- =============================================================================
-- 003_permissions_matrix.sql — Tabla de permisos UI editable por tenant × rol
-- =============================================================================
-- Esta tabla NO es la fuente de verdad de seguridad — las RLS policies en
-- packages/db/policies/ siguen siendo el ground truth. Esta matriz controla
-- visibilidad UI (botones, listas, items de menú) y es editable desde admin.
--
-- Dependencias:
--   - public.tenants (existente, fase 1)
--   - public.user_role enum (existente, fase 1)
--   - public.set_updated_at() (existente, fase 1)
--   - rls_auto_enable event trigger (existente, fase 1)
-- =============================================================================


CREATE TABLE public.permissions_matrix (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role            public.user_role NOT NULL,
  permission_key  VARCHAR(80) NOT NULL,
  granted         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, permission_key)
);

CREATE INDEX permissions_matrix_lookup_idx
  ON public.permissions_matrix (tenant_id, role, permission_key);

CREATE TRIGGER set_updated_at_trigger
  BEFORE UPDATE ON public.permissions_matrix
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- rls_auto_enable event trigger habilita RLS automáticamente al crear la tabla,
-- pero lo declaramos explícito por idempotencia.
ALTER TABLE public.permissions_matrix ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.permissions_matrix IS
  'Matriz UI-only de permisos por tenant × rol × permission_key. La fuente de '
  'verdad de seguridad son las RLS policies en packages/db/policies/.';
