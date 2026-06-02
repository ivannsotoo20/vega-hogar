-- =============================================================================
-- 012_followups_labels.sql — Seguimientos, keywords, etiquetas y notas (Fase 4)
-- =============================================================================
-- followup_templates + tenant_followup_config + automation_keywords + sistema de
-- labels (tenant_labels/conversation_labels/label_automation_rules) + conversation_notes.
-- Autoría → users.id BIGINT. provider sin meta_cloud/manychat. NO portamos los
-- triggers de auto-seed de SETTER (el seed va explícito en S9).
-- Además: las 2 FKs diferidas de 009/010 (welcome_template_id, template_id).
--
-- Dependencias: tenants, users, conversations, integration_accounts, resources,
-- tenant_configs (009), message_schedules (010), enum channel_type (fase 1).
-- =============================================================================


CREATE TABLE IF NOT EXISTS public.followup_templates (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  channel_kind         public.channel_type NOT NULL,
  provider             TEXT NOT NULL DEFAULT 'manual'
                         CHECK (provider IN ('manual','ycloud','ghl')),
  body                 TEXT,
  description          TEXT,
  provider_template_id TEXT,
  language             TEXT,
  category             TEXT CHECK (category IS NULL OR category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  status               TEXT NOT NULL DEFAULT 'approved'
                         CHECK (status IN ('pending','approved','rejected','disabled')),
  variables            JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_personalize       BOOLEAN NOT NULL DEFAULT false,
  ai_guide             TEXT,
  created_by           BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, channel_kind)
);
CREATE INDEX IF NOT EXISTS followup_templates_tenant_channel_idx ON public.followup_templates (tenant_id, channel_kind);

CREATE TABLE IF NOT EXISTS public.tenant_followup_config (
  tenant_id              BIGINT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled                BOOLEAN NOT NULL DEFAULT false,
  window_start_hour      INT NOT NULL DEFAULT 9  CHECK (window_start_hour BETWEEN 0 AND 23),
  window_end_hour        INT NOT NULL DEFAULT 21 CHECK (window_end_hour BETWEEN 0 AND 23),
  window_timezone        TEXT NOT NULL DEFAULT 'Europe/Madrid',
  max_followups_per_lead INT NOT NULL DEFAULT 3 CHECK (max_followups_per_lead BETWEEN 1 AND 10),
  intervals_hours        INTEGER[] NOT NULL DEFAULT '{24,72,168}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_keywords (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('bienvenida','lm','inbound','wa_open')),
  pattern    TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_keywords_tenant_idx ON public.automation_keywords (tenant_id, is_active, type);

CREATE TABLE IF NOT EXISTS public.tenant_labels (
  id                 BIGSERIAL PRIMARY KEY,
  tenant_id          BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  color              TEXT NOT NULL DEFAULT '#94a3b8',
  description        TEXT,
  is_system          BOOLEAN NOT NULL DEFAULT false,
  destination_bucket TEXT CHECK (destination_bucket IN
                       ('chats','hot','done','bought','cancelled','no_show','recontact','lost')),
  pause_ai_on_apply  BOOLEAN NOT NULL DEFAULT false,
  resume_ai_on_apply BOOLEAN NOT NULL DEFAULT false,
  auto_assign_to     BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_by         BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS tenant_labels_tenant_idx ON public.tenant_labels (tenant_id);

CREATE TABLE IF NOT EXISTS public.conversation_labels (
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  label_id        BIGINT NOT NULL REFERENCES public.tenant_labels(id) ON DELETE CASCADE,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  applied_by      BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  applied_via     TEXT NOT NULL CHECK (applied_via IN ('manual','rule','system_hook')),
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, label_id)
);
CREATE INDEX IF NOT EXISTS conversation_labels_tenant_idx ON public.conversation_labels (tenant_id);

CREATE TABLE IF NOT EXISTS public.label_automation_rules (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label_id      BIGINT NOT NULL REFERENCES public.tenant_labels(id) ON DELETE CASCADE,
  trigger_type  TEXT NOT NULL CHECK (trigger_type IN
                  ('text_contains','text_exact','attachment','product','inactivity_hours','comment_keyword')),
  trigger_who   TEXT NOT NULL CHECK (trigger_who IN ('lead','trainer','any')),
  trigger_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS label_automation_rules_label_idx ON public.label_automation_rules (label_id);

CREATE TABLE IF NOT EXISTS public.conversation_notes (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_user_id  BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  author_email    TEXT,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_notes_conv_idx ON public.conversation_notes (conversation_id, created_at DESC);

-- ── FKs diferidas de 009/010 (ahora followup_templates existe) ───────────────
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS welcome_template_id BIGINT REFERENCES public.followup_templates(id) ON DELETE SET NULL;
ALTER TABLE public.message_schedules
  ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES public.followup_templates(id) ON DELETE SET NULL;

-- ── Triggers updated_at ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.followup_templates;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.followup_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.tenant_followup_config;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.tenant_followup_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.automation_keywords;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.automation_keywords
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.tenant_labels;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.tenant_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS defensivo ─────────────────────────────────────────────────────────────
ALTER TABLE public.followup_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_followup_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_keywords     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_labels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_labels     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_automation_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_notes      ENABLE ROW LEVEL SECURITY;
