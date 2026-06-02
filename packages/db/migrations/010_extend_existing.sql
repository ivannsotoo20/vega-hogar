-- =============================================================================
-- 010_extend_existing.sql — Ampliar tablas existentes para el motor (Fase 4)
-- =============================================================================
-- ALTER aditivo (ADD COLUMN IF NOT EXISTS) sobre tablas con datos de seed.
-- Re-domain: is_call_scheduling_link_sent → is_scheduling_link_sent ; call_scheduled_at
--   → appointment_scheduled_at (cubren visita comprador Y visita técnica de tasación).
-- Identidad: assigned_user_id / created_by_user_id → BIGINT users.id (SETTER usaba
--   UUID auth.users). FK ON DELETE SET NULL.
-- Diferido: message_schedules.template_id → 012 (followup_templates aún no existe).
--
-- Dependencias: enums de 007 · tablas users/integration_accounts/resources (009/fase 1).
-- =============================================================================


-- ── conversations ────────────────────────────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_qualified            BOOLEAN,
  ADD COLUMN IF NOT EXISTS phase_message_count     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority                public.conversation_priority,
  ADD COLUMN IF NOT EXISTS direction               public.conversation_direction NOT NULL DEFAULT 'untagged',
  ADD COLUMN IF NOT EXISTS is_handoff_to_human     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handoff_cause           public.handoff_cause,
  ADD COLUMN IF NOT EXISTS handoff_reason          TEXT,
  ADD COLUMN IF NOT EXISTS handoff_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_scheduling_link_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS appointment_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_context         TEXT,
  ADD COLUMN IF NOT EXISTS general_motivation      TEXT,
  ADD COLUMN IF NOT EXISTS problem                 TEXT,
  ADD COLUMN IF NOT EXISTS custom_fields           JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS conversation_source     TEXT,
  ADD COLUMN IF NOT EXISTS is_unread               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_blocked              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_user_id        BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_ai_message_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_lead_response_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ghl_contact_id          TEXT,
  ADD COLUMN IF NOT EXISTS ghl_opportunity_id      TEXT,
  ADD COLUMN IF NOT EXISTS ghl_conversation_id     TEXT,
  ADD COLUMN IF NOT EXISTS ghl_opportunity_status  TEXT;

CREATE INDEX IF NOT EXISTS conversations_assigned_idx
  ON public.conversations (tenant_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS conversations_ghl_contact_idx
  ON public.conversations (ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;

-- ── leads ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS timezone        TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_uuid   TEXT,
  ADD COLUMN IF NOT EXISTS location        TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS leads_tracking_uuid_key
  ON public.leads (tracking_uuid) WHERE tracking_uuid IS NOT NULL;

-- ── conversation_messages ──────────────────────────────────────────────────────
ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS content_type   public.message_content_type NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_mime     TEXT,
  ADD COLUMN IF NOT EXISTS transcription  TEXT;

-- ── message_schedules ──────────────────────────────────────────────────────────
-- status VARCHAR → enum schedule_status (tabla vacía en seed → cast seguro). Idempotente.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'message_schedules'
          AND column_name = 'status') = 'character varying' THEN
    ALTER TABLE public.message_schedules ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.message_schedules
      ALTER COLUMN status TYPE public.schedule_status USING status::public.schedule_status;
    ALTER TABLE public.message_schedules ALTER COLUMN status SET DEFAULT 'pending';
  END IF;
END $$;

ALTER TABLE public.message_schedules
  ADD COLUMN IF NOT EXISTS message               TEXT,
  ADD COLUMN IF NOT EXISTS message_type          public.schedule_message_kind NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS integration_account_id BIGINT REFERENCES public.integration_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triggered_by          TEXT NOT NULL DEFAULT 'manual'
                            CHECK (triggered_by IN ('manual','auto_inactivity','manual_pipeline','ai_turn')),
  ADD COLUMN IF NOT EXISTS auto_cancel_on_reply  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS attempts              INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resource_id           BIGINT REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resource_type         public.resource_type,
  ADD COLUMN IF NOT EXISTS has_attachment        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_url        TEXT,
  ADD COLUMN IF NOT EXISTS ai_personalize        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_guide              TEXT,
  ADD COLUMN IF NOT EXISTS sequence_index        INT,
  ADD COLUMN IF NOT EXISTS created_by_user_id    BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

-- ── tenants ────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
