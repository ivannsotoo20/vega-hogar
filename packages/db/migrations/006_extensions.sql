-- =============================================================================
-- 006_extensions.sql — Extensiones para el port (Fase 4)
-- =============================================================================
-- vector  → embeddings de agent_knowledge (KB del agente, 1536 dims).
-- pg_trgm → búsqueda fuzzy en contenido de mensajes.
-- citext  → emails case-insensitive.
-- pgcrypto ya existe (Fase 1). Idempotente.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
