-- =============================================================================
-- 007_enums_new.sql — Enums nuevos del motor portado (Fase 4)
-- =============================================================================
-- Idempotente: cada CREATE TYPE envuelto en DO/EXCEPTION duplicate_object.
-- Estos enums NO se usan todavía (las tablas que los consumen vienen en 009+).
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.schedule_status AS ENUM ('pending','processing','sent','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_message_kind AS ENUM ('message','follow_up','resource');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.llm_role AS ENUM ('generator','judge','splitter','transcriber','embedder');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.llm_provider AS ENUM ('anthropic','openai','google','azure_openai','custom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.llm_call_status AS ENUM ('success','error','fallback');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.handoff_cause AS ENUM ('A_agenda','B_derivacion','C_descualificado','D_espera','E_error');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.resource_type AS ENUM ('pdf','video','image','audio','link','document','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.conversation_priority AS ENUM ('alta','media','baja');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.conversation_direction AS ENUM ('inbound','outbound','untagged');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_content_type AS ENUM ('text','audio','image','video','file','mixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;
