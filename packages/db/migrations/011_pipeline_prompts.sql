-- =============================================================================
-- 011_pipeline_prompts.sql — Observabilidad del pipeline + versionado de prompts (Fase 4)
-- =============================================================================
-- pipeline_runs   → una fila por ejecución del pipeline 3-LLM (audit coste/stages).
-- pipeline_events → event sourcing del funnel (lo llena el motor explícitamente
--                   en F10; NO portamos el trigger automático de SETTER, que
--                   dependía de phase_number/conversation_labels).
-- prompt_block_versions / prompt_block_drafts → snapshot + autosave del editor
--                   /admin/cerebro (regla 9 CLAUDE.md). Autoría → users.id BIGINT.
--
-- Dependencias: tenants, conversations, prompt_blocks, users (fase 1).
-- =============================================================================


CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id                    BIGSERIAL PRIMARY KEY,
  tenant_id             BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id       BIGINT REFERENCES public.conversations(id) ON DELETE SET NULL,
  correlation_id        UUID NOT NULL UNIQUE,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at              TIMESTAMPTZ,
  duration_ms           INT,
  generator_model       TEXT,
  generator_tokens_in   INT,
  generator_tokens_out  INT,
  generator_cost_usd    NUMERIC(10,6),
  judge_model           TEXT,
  judge_tokens_in       INT,
  judge_tokens_out      INT,
  judge_cost_usd        NUMERIC(10,6),
  judge_decision        TEXT CHECK (judge_decision IN ('pass','fix','reject')),
  splitter_model        TEXT,
  splitter_tokens_in    INT,
  splitter_tokens_out   INT,
  splitter_cost_usd     NUMERIC(10,6),
  splitter_parts        INT,
  validator_violations  JSONB,
  total_cost_usd        NUMERIC(10,6),
  total_tokens_in       INT,
  total_tokens_out      INT,
  outcome               TEXT NOT NULL DEFAULT 'in_progress'
                          CHECK (outcome IN ('success','judge_reject','validator_error','pipeline_error','in_progress')),
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_runs_tenant_started_idx ON public.pipeline_runs (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_conv_idx ON public.pipeline_runs (conversation_id);

CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN ('phase_change','outcome_applied','outcome_removed')),
  from_value      TEXT,
  to_value        TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('motor','manual','rule','system_hook')),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_events_tenant_time_idx ON public.pipeline_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_events_conv_idx ON public.pipeline_events (conversation_id);

CREATE TABLE IF NOT EXISTS public.prompt_block_versions (
  id              BIGSERIAL PRIMARY KEY,
  prompt_block_id BIGINT NOT NULL REFERENCES public.prompt_blocks(id) ON DELETE CASCADE,
  version_number  INT NOT NULL,
  content         TEXT NOT NULL,
  changed_by      BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary  TEXT,
  was_applied     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (prompt_block_id, version_number)
);
CREATE INDEX IF NOT EXISTS prompt_block_versions_block_idx ON public.prompt_block_versions (prompt_block_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.prompt_block_drafts (
  id            BIGSERIAL PRIMARY KEY,
  block_key     TEXT NOT NULL,
  tenant_id     BIGINT REFERENCES public.tenants(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  base_version  INT NOT NULL,
  owner_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prompt_block_drafts_unique
  ON public.prompt_block_drafts (block_key, COALESCE(tenant_id, -1), owner_user_id);

DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.prompt_block_drafts;
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.prompt_block_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pipeline_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_block_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_block_drafts    ENABLE ROW LEVEL SECURITY;
