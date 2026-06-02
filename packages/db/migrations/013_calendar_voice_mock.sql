-- =============================================================================
-- 013_calendar_voice_mock.sql — Calendario GHL, voz y mock WhatsApp (Fase 4)
-- =============================================================================
-- calendar_accounts/appointments (GHL, espejo) + enlace visits.calendar_appointment_id
-- (visits sigue siendo el ground-truth inmobiliario). ignored_users con `channel`
-- enum (Vega no tiene tabla channels). voice_calls/voice_transcripts (ElevenLabs +
-- Zadarma, F12) y mock_whatsapp_outbox (simulador para alumnos) son NUEVAS.
--
-- Dependencias: tenants, integration_accounts, leads, conversations, visits,
-- enums channel_type/message_role (fase 1 + 008).
-- =============================================================================


CREATE TABLE IF NOT EXISTS public.calendar_accounts (
  id                     BIGSERIAL PRIMARY KEY,
  tenant_id              BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_account_id BIGINT NOT NULL REFERENCES public.integration_accounts(id) ON DELETE CASCADE,
  provider               TEXT NOT NULL DEFAULT 'ghl' CHECK (provider IN ('ghl')),
  external_calendar_id   TEXT NOT NULL,
  name                   TEXT NOT NULL,
  description            TEXT,
  slug                   TEXT,
  widget_base_url        TEXT,
  is_default             BOOLEAN NOT NULL DEFAULT false,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  channel_kind           public.channel_type,
  ghl_metadata           JSONB DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_calendar_id)
);
CREATE INDEX IF NOT EXISTS calendar_accounts_tenant_idx ON public.calendar_accounts (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.calendar_appointments (
  id                      BIGSERIAL PRIMARY KEY,
  tenant_id               BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  calendar_account_id     BIGINT NOT NULL REFERENCES public.calendar_accounts(id) ON DELETE CASCADE,
  external_appointment_id TEXT NOT NULL,
  external_contact_id     TEXT,
  lead_id                 BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id         BIGINT REFERENCES public.conversations(id) ON DELETE SET NULL,
  title                   TEXT,
  start_at                TIMESTAMPTZ NOT NULL,
  end_at                  TIMESTAMPTZ NOT NULL,
  appointment_status      TEXT NOT NULL DEFAULT 'new'
                            CHECK (appointment_status IN ('new','confirmed','cancelled','showed','noshow','invalid')),
  assigned_user_external_id TEXT,
  source                  TEXT,
  match_method            TEXT CHECK (match_method IN ('fyzon_uuid','phone','unmatched')),
  match_confidence        SMALLINT,
  notes                   TEXT,
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_appointment_id)
);
CREATE INDEX IF NOT EXISTS calendar_appointments_tenant_start_idx ON public.calendar_appointments (tenant_id, start_at);
CREATE INDEX IF NOT EXISTS calendar_appointments_lead_idx ON public.calendar_appointments (lead_id) WHERE lead_id IS NOT NULL;

-- visits = ground-truth inmobiliario; enlace opcional al espejo GHL.
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS calendar_appointment_id BIGINT REFERENCES public.calendar_appointments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.ignored_users (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel          public.channel_type,
  external_user_id TEXT NOT NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_user_id)
);

-- ── Voz (ElevenLabs Agents + Zadarma, F12) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voice_calls (
  id                         BIGSERIAL PRIMARY KEY,
  tenant_id                  BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id                    BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id            BIGINT REFERENCES public.conversations(id) ON DELETE SET NULL,
  direction                  TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  zadarma_call_id            TEXT,
  elevenlabs_conversation_id TEXT,
  status                     TEXT NOT NULL DEFAULT 'ringing'
                               CHECK (status IN ('ringing','in_progress','completed','failed','no_answer')),
  started_at                 TIMESTAMPTZ,
  ended_at                   TIMESTAMPTZ,
  duration_seconds           INT,
  outcome                    TEXT,
  recording_url              TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_calls_tenant_idx ON public.voice_calls (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_calls_conv_idx ON public.voice_calls (conversation_id);

CREATE TABLE IF NOT EXISTS public.voice_transcripts (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  call_id     BIGINT NOT NULL REFERENCES public.voice_calls(id) ON DELETE CASCADE,
  role        public.message_role NOT NULL,
  text        TEXT NOT NULL,
  offset_ms   INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_transcripts_call_idx ON public.voice_transcripts (call_id, offset_ms);

-- ── Mock WhatsApp (simulador para alumnos; el panel lee/streamea el outbox) ───
CREATE TABLE IF NOT EXISTS public.mock_whatsapp_outbox (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  parts           JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mock_whatsapp_outbox_conv_idx ON public.mock_whatsapp_outbox (conversation_id, created_at);

-- ── Triggers updated_at ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.calendar_accounts;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.calendar_appointments;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.calendar_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS defensivo ─────────────────────────────────────────────────────────────
ALTER TABLE public.calendar_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_appointments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ignored_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_calls            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_transcripts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_whatsapp_outbox   ENABLE ROW LEVEL SECURITY;
