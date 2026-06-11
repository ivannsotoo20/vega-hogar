-- 016_prompt_versions_admin_insert.sql
-- =============================================================================
-- CEREBRO (Fase 9) — habilita el PUBLISH del editor de prompts desde el panel.
--
-- Decisión F9 #1/#1b (Iván): PUBLICAR YA con BD-como-fuente-de-verdad (modelo
-- SETTER). El editor del panel (anon+RLS, admin) publica un borrador haciendo:
--   1) snapshot en prompt_block_versions (nueva versión), y
--   2) UPDATE de prompt_blocks (contenido + version).
-- El markdown source del motor (F10) pasa a ser artefacto downstream / seed-si-
-- vacío que NO pisa lo publicado por la UI (Regla 9 reescrita en F9/S11).
--
-- Problema que resuelve: prompt_block_versions solo tenía
-- `prompt_block_versions_select` (admin). NO había policy de escritura para el rol
-- `authenticated`, así que el panel NO podía insertar el snapshot de versión (el
-- motor sí, con service_role, que bypassa RLS). Esta migración añade el INSERT.
--
-- Diseño:
--   · INSERT per-command (NO FOR ALL) → no toca el SELECT (lección F8: un FOR ALL
--     se OR-a con el SELECT y puede sobre-exponer; aquí evitamos el patrón).
--   · WITH CHECK admin + `prompt_block_id IN (SELECT id FROM prompt_blocks)`: el
--     subquery está él mismo filtrado por la RLS de prompt_blocks (admin + tenant
--     propio/shared), así que un admin solo puede versionar bloques que puede ver.
--   · APPEND-ONLY: no se añade UPDATE ni DELETE → el histórico de versiones es
--     inmutable desde el panel.
--
-- Nota sobre prompt_blocks_modify (FOR ALL): se DEJA como está. A diferencia del
-- bug F8 de visits, su predicado es IDÉNTICO al de prompt_blocks_select (admin +
-- tenant propio/shared), así que el OR consigo mismo no sobre-expone NADA → es un
-- FOR ALL benigno conocido. No se divide (sería churn sin delta de seguridad).
--
-- Idempotente (DROP IF EXISTS + CREATE). Espejo en packages/db/policies/09-pipeline.sql.
-- =============================================================================

DROP POLICY IF EXISTS prompt_block_versions_admin_insert ON public.prompt_block_versions;
CREATE POLICY prompt_block_versions_admin_insert ON public.prompt_block_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND prompt_block_id IN (SELECT id FROM public.prompt_blocks)
  );
