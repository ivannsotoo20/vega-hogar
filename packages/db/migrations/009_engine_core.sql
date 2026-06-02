-- =============================================================================
-- 009_engine_core.sql — Tablas core del motor portado (Fase 4)
-- =============================================================================
-- 7 tablas nuevas que el motor (F10) y el panel (F5+) necesitan, re-domainizadas
-- a inmobiliaria. Todas con tenant_id → RLS (policies en packages/db/policies/08+
-- se aplican en S7; hasta entonces el event trigger rls_auto_enable las deja con
-- RLS ON sin policy = solo service_role accede, que es lo que usa el seed).
--
-- Omitido a propósito (entra en su migración por dependencia de orden):
--   - tenant_configs.welcome_template_id  → 012 (followup_templates aún no existe)
--   - tenant_configs.last_appointment_id  → 013 (calendar_appointments no existe)
--   - índice ivfflat sobre agent_knowledge.embedding → migración posterior (F10),
--     cuando haya datos; evita fallos de creación sobre tabla vacía.
--
-- Dependencias: public.tenants, public.conversations (fase 1) · extensión vector
-- (006) · enums llm_role/llm_provider/llm_call_status/resource_type (007).
-- =============================================================================


-- ── tenant_configs ──────────────────────────────────────────────────────────
-- Config operativa del motor por tenant (1 fila por inmobiliaria).
CREATE TABLE IF NOT EXISTS public.tenant_configs (
  tenant_id                       BIGINT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  active_conversation_delay_seconds INT        NOT NULL DEFAULT 30,
  idle_conversation_delay_seconds   INT        NOT NULL DEFAULT 300,
  debounce_window_seconds         INT          NOT NULL DEFAULT 25,
  timezone                        TEXT         NOT NULL DEFAULT 'Europe/Madrid',
  max_messages_per_conversation   INT          NOT NULL DEFAULT 22,
  default_audio_language          TEXT         NOT NULL DEFAULT 'es',
  health_threshold_hours_amber    INT          NOT NULL DEFAULT 12,
  health_threshold_hours_red      INT          NOT NULL DEFAULT 72,
  created_at                      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── phases ──────────────────────────────────────────────────────────────────
-- Catálogo de fases del pipeline. DUAL: una fila por (number, intent_track).
-- El agente elige el track según leads.intent (un solo agente, dos flujos).
CREATE TABLE IF NOT EXISTS public.phases (
  id            BIGSERIAL PRIMARY KEY,
  number        SMALLINT  NOT NULL CHECK (number BETWEEN 0 AND 7),
  intent_track  TEXT      NOT NULL DEFAULT 'shared'
                  CHECK (intent_track IN ('buyer','seller','shared')),
  name          TEXT      NOT NULL,
  description   TEXT,
  max_messages  SMALLINT  NOT NULL DEFAULT 5,
  UNIQUE (number, intent_track)
);

-- ── llm_configs ─────────────────────────────────────────────────────────────
-- Modelos LLM por tenant y rol. api_key_encrypted nullable: en Vega (agencia
-- única) la key real puede venir por env del motor; BYO-key opcional por tenant.
CREATE TABLE IF NOT EXISTS public.llm_configs (
  id                          BIGSERIAL PRIMARY KEY,
  tenant_id                   BIGINT        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role                        public.llm_role     NOT NULL DEFAULT 'generator',
  provider                    public.llm_provider NOT NULL DEFAULT 'anthropic',
  model                       TEXT          NOT NULL,
  api_key_encrypted           TEXT,
  price_input_per_1m          NUMERIC(10,4),
  price_output_per_1m         NUMERIC(10,4),
  price_cached_input_per_1m   NUMERIC(10,4),
  is_active                   BOOLEAN       NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, provider, model)
);

-- ── llm_calls ───────────────────────────────────────────────────────────────
-- Audit de cada llamada LLM (coste/latencia/tokens). conversation_id SET NULL.
CREATE TABLE IF NOT EXISTS public.llm_calls (
  id                 BIGSERIAL PRIMARY KEY,
  tenant_id          BIGINT        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id    BIGINT        REFERENCES public.conversations(id) ON DELETE SET NULL,
  role               public.llm_role        NOT NULL,
  provider           public.llm_provider    NOT NULL,
  model              TEXT          NOT NULL,
  status             public.llm_call_status NOT NULL,
  request_payload    JSONB,
  response_payload   JSONB,
  latency_ms         INT,
  tokens_in          INT,
  tokens_out         INT,
  tokens_in_cached   INT,
  cost               NUMERIC(12,6),
  error_message      TEXT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS llm_calls_tenant_conv_idx
  ON public.llm_calls (tenant_id, conversation_id);

-- ── tenant_tokens ───────────────────────────────────────────────────────────
-- Tokens opacos de webhook por tenant (mapea tenant sin exponer su id en la URL).
CREATE TABLE IF NOT EXISTS public.tenant_tokens (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT       NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token       TEXT         NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  purpose     TEXT         NOT NULL DEFAULT 'webhook',
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

-- ── agent_knowledge (ex coach_ai_knowledge) ─────────────────────────────────
-- KB vectorial del agente inmobiliario. Índice ivfflat diferido (ver cabecera).
CREATE TABLE IF NOT EXISTS public.agent_knowledge (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       TEXT,
  content     TEXT          NOT NULL,
  metadata    JSONB         NOT NULL DEFAULT '{}',
  embedding   vector(1536),
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── resources ───────────────────────────────────────────────────────────────
-- Recursos que el agente adjunta (dossiers de inmueble, guía del comprador, etc.).
CREATE TABLE IF NOT EXISTS public.resources (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT          NOT NULL,
  description    TEXT,
  resource_type  public.resource_type NOT NULL,
  mime_type      TEXT,
  url            TEXT,
  storage_path   TEXT,
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── Triggers updated_at (función public.set_updated_at de fase 1) ────────────
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.tenant_configs;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.tenant_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.llm_configs;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.llm_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.agent_knowledge;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS defensivo (policies reales en S7 · archivos policies/08+) ────────────
ALTER TABLE public.tenant_configs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_configs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_calls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources        ENABLE ROW LEVEL SECURITY;
