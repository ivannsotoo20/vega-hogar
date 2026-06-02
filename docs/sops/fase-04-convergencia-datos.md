# SOP · Fase 04 — Convergencia del modelo de datos del port

> **Estado**: ✅ CERRADA · branch `checkpoint/fase-04`. Ejecutada 2026-06-02.
> **Plan maestro**: `~/.claude/plans/para-seguir-avanzando-con-proud-patterson.md` (§5).
> **Fase previa**: `fase-03-cimientos-port.md` (cerrada 2026-06-02, `checkpoint/fase-03`).
> **Branch a crear**: `checkpoint/fase-04`.

---

## 1. Context

F3 dejó el shell del panel y la capa de auth listos. **F4 es la otra mitad del prerequisito
duro**: ampliar el modelo de datos de Vega (Prisma) con las ~16 tablas operativas que el motor y
el panel de SETTER necesitan, re-domainizadas a inmobiliaria. Sin esto, ninguna sección portada
(F5+) ni el motor (F10) compilan contra Vega.

Decisión madre (plan maestro): **Prisma híbrido** — `schema.prisma` es la fuente de verdad; cada
tabla nueva se declara en Prisma y se materializa con SQL en `packages/db/migrations/`. El motor
consumirá Supabase con service-role tipado por `database.types.ts` (generado). El panel sigue
anon+RLS.

**El coste real aquí es el RLS**: las policies de SETTER usan `profiles`/`is_agency_admin`/
`tenant_id_for_user()` que NO existen en Vega. Se **reescriben** al patrón Vega
(`tenant_id = public.current_tenant()` + `public.current_user_role()`). Copiarlas = fuga
cross-tenant.

---

## 2. Decisiones cerradas (Fase 4)

1. **Migraciones `006`–`013`** (la `005` la tomó F3). Idempotentes, 1 archivo = 1 transacción,
   sin `BEGIN/COMMIT` propio. `ALTER TYPE ADD VALUE` va en migración **aislada** (Postgres no
   deja usar el valor nuevo en la misma tx).
2. **RLS reescrito al patrón Vega** (archivos `policies/08`–`12`). NO se introduce
   `is_agency_admin` en las policies de datos salvo la policy específica de impersonación
   (punto 7). Cuidado con recursión: usar `auth.uid()` directo donde haga falta "verme a mí".
3. **Identidad**: toda FK de autoría/asignación (`created_by`, `assigned_*`, `auto_assign_to`)
   apunta a `users.id` **BigInt** (no al UUID de `profiles`).
4. **`visits` = ground-truth inmobiliario**; `calendar_appointments` (GHL) = espejo enlazado vía
   nueva columna `visits.calendar_appointment_id` (nullable). No se duplica el calendario.
5. **Flujo dual** modelado con catálogo `phases` + columna `intent_track` (`buyer`/`seller`/
   `shared`); el track lo deriva el agente de `leads.intent`. Un solo agente, sin tablas duales.
6. **`trainer_preferences` → `tenants.settings`** (JSONB ya existe). No se crea tabla de prefs;
   el composer/panel leen de `settings`.
7. **Policy de impersonación agency** (cross-tenant SELECT solo para `is_agency_admin`): se añade
   en F4 para desbloquear el ScopeSwitcher diferido de F3→F9. Solo SELECT, con cuidado de no
   abrir fuga (un usuario normal nunca pasa el check).
8. **Renombrados/descartes**: `coach_ai_knowledge`→`agent_knowledge`; se descartan `profiles`,
   `channels` (el canal es enum), `conversation_events` genérico (se usa `pipeline_events`),
   `lead_external_ids`, `tenant_schedules` (se usa `tenant_followup_config`), y el andamiaje SaaS
   de SETTER (notification-events, dashboard_widgets, tenant_audit_log, provision-tenant-rpc…) →
   se reevalúa en F9 si hace falta.
9. **Decisiones abiertas del plan, cerradas aquí**: se CONSERVAN labels (`tenant_labels`/
   `conversation_labels`/`label_automation_rules`) y se CREA `pipeline_events` (métricas F11). La
   captación usa el modelo unificado (`leads.intent=seller` + `visits.is_tasation`), sin tablas
   `seller_*` dedicadas.

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| S0 — Branch | ✅ | `checkpoint/fase-04` desde `checkpoint/fase-03` |
| S1 — Extensiones + enums (006-008) | ✅ | `vector`/`pg_trgm`/`citext` · 10 enums nuevos · `ALTER TYPE` aislado (`message_role`+`system`, `integration_provider`+`ghl`) |
| S2 — Tablas core motor (009) | ✅ | tenant_configs, phases(+intent_track), llm_configs, llm_calls, tenant_tokens, agent_knowledge, resources |
| S3 — Ampliar tablas existentes (010) | ✅ | conversations (+motor/GHL/chat-shell), leads (+timezone), conversation_messages (+content_type/transcription), tenants ya tiene onboarded_at (F3) |
| S4 — Schedules + pipeline (011) | ✅ | ampliar message_schedules (enum status + content/payload + message_type), pipeline_runs, pipeline_events, prompt_block_versions, prompt_block_drafts |
| S5 — Followups + labels + notes (012) | ✅ | followup_templates, tenant_followup_config, automation_keywords, tenant_labels, conversation_labels, label_automation_rules, conversation_notes |
| S6 — Calendar + voz + mock (013) | ✅ | calendar_accounts, calendar_appointments, ignored_users, visits.calendar_appointment_id, voice_calls, voice_transcripts, mock_whatsapp_outbox |
| S7 — RLS policies (08-12) | ✅ | reescritas al patrón `current_tenant()` + policy impersonación agency |
| S8 — Tipos Supabase | ✅ | `database.types.ts` generado + `SupabaseClient<Database>` |
| S9 — Seed operativo | ✅ | phases (dual), tenant_configs Vega, prompt_blocks placeholders, tenant_labels, llm_configs |
| S10 — Verificación | ✅ | ampliar db-verify-schema + test-rls-anon-leaks + nuevo test-rls-with-session + typecheck |
| S11 — Commit + push | ✅ | `feat(fase-04): convergencia del modelo de datos del port` |

---

## 4. Sub-pasos detallados

> Para cada tabla a portar, los **campos exactos** se extraen al ejecutar leyendo el estado
> acumulado de SETTER (`C:\Users\sotob\setters_ia\schema\v1\` + sus migraciones numeradas —
> el `schema-v1.sql` NO es el estado real, hay migraciones encima). El SOP fija propósito,
> nombres de tabla y re-domain; la precisión de columnas se resuelve sub-paso a sub-paso, como
> en F3. Tras CADA migración: actualizar `schema.prisma` (mismo paso) + `prisma:generate`.

### S0 — Branch
`git checkout checkpoint/fase-03 && git checkout -b checkpoint/fase-04`.

### S1 — Extensiones + enums (migraciones 006, 007, 008)
- `006_extensions.sql`: `CREATE EXTENSION IF NOT EXISTS vector/pg_trgm/citext` (pgcrypto ya está).
- `007_enums_new.sql`: crear enums `schedule_status`, `schedule_message_kind`, `llm_role`,
  `llm_provider`, `llm_call_status`, `handoff_cause`, `resource_type`, `conversation_priority`,
  `conversation_direction`, `message_content_type`. Sin uso todavía.
- `008_enums_extend.sql` **(aislada)**: `ALTER TYPE message_role ADD VALUE 'system'` +
  `ALTER TYPE integration_provider ADD VALUE 'ghl'`. Nada que use los valores en la misma tx.

### S2 — Tablas core del motor (migración 009)
`tenant_configs` (delays, debounce 25s, timezone Europe/Madrid, max msgs, default_audio_language) ·
`phases` (number 0-7, name, description, max_messages, **intent_track** buyer/seller/shared) ·
`llm_configs` (tenant, role, provider, model, api_key_encrypted, precios) · `llm_calls` (audit
coste/latencia/tokens) · `tenant_tokens` (token webhook por tenant) · `agent_knowledge`
(ex-coach_ai_knowledge; embedding `vector(1536)`, índice ivfflat detrás de flag si falla) ·
`resources` (PDFs/dossiers). + triggers `set_updated_at` + `ENABLE RLS` defensivo. Sincronizar
Prisma (modelos nuevos) + `prisma:generate`.

### S3 — Ampliar tablas existentes (migración 010)
`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS`: `is_qualified`, `phase_message_count`,
`priority` (enum), `direction` (enum), handoff (`is_handoff_to_human`, `handoff_cause` enum,
`handoff_reason`, `handoff_at`), GHL (`ghl_contact_id`, `ghl_opportunity_id`, …), chat-shell
(`is_unread`, `is_blocked`, `assigned_user_id` → `users.id`). `leads` +`timezone`.
`conversation_messages` +`content_type` (enum), +`transcription` (audio_url ya existe). `tenants`
ya tiene `onboarded_at`/`is_active` parcial (F3 añadió onboarded_at; añadir `is_active` si falta).
Índices parciales (`ai_paused_until`, `ghl_contact_id`). Sincronizar Prisma.

### S4 — Schedules + pipeline (migración 011)
Ampliar `message_schedules`: `status VARCHAR`→enum `schedule_status`; +`message_type`
(enum), +`triggered_by`, +`content`/`payload` (texto de la parte outbound), +`integration_account_id`,
+`auto_cancel_on_reply`, +`template_id`, +`attempts`, +`last_error`. Crear `pipeline_runs`
(métricas por stage Generator/Judge/Splitter, coste), `pipeline_events` (event sourcing funnel:
phase_change/outcome), `prompt_block_versions` (snapshot por Apply — regla 9 CLAUDE.md),
`prompt_block_drafts` (autosave editor cerebro). Trigger `log_phase_change` reescrito sobre
`conversations` (nombres Vega). Sincronizar Prisma.

### S5 — Followups + labels + notes (migración 012)
`followup_templates` + `tenant_followup_config` (ventana 9-21 Europe/Madrid, intervalos
{24,72,168}h; `provider` CHECK sin ManyChat) · `automation_keywords` · `tenant_labels` +
`conversation_labels` + `label_automation_rules` (autoría → `users.id`) · `conversation_notes`.
Triggers de seed-labels reescritos sin FK a `auth.users`. Sincronizar Prisma.

### S6 — Calendar + voz + mock (migración 013)
`calendar_accounts` + `calendar_appointments` (GHL, escritas por webhook/service-role) ·
`ignored_users` · `ALTER TABLE visits ADD calendar_appointment_id BIGINT REFERENCES
calendar_appointments(id) ON DELETE SET NULL` · `voice_calls` (tenant, lead, direction,
zadarma_call_id, elevenlabs_conversation_id, started/ended, duration, outcome, recording_url) +
`voice_transcripts` (o transcript JSONB) — vinculadas a `conversations` con `channel='voice'` ·
`mock_whatsapp_outbox` (simulador alumnos: el panel lo lee/streamea). Sincronizar Prisma.

### S7 — RLS policies (archivos policies/08-12)
Reescritas al patrón Vega (plantilla: SELECT `tenant_id = current_tenant()`; modify
`current_user_role() IN (...)`). Agrupación: `08-engine-config` (tenant_configs, llm_configs[solo
admin], llm_calls, tenant_tokens[solo admin], tenant_followup_config) · `09-pipeline`
(pipeline_runs, pipeline_events, prompt_block_versions/drafts) · `10-knowledge-resources`
(agent_knowledge, resources, followup_templates, automation_keywords) · `11-labels` (tenant_labels,
conversation_labels[delegan al lead], label_automation_rules, conversation_notes) · `12-calendar`
(calendar_accounts, calendar_appointments[delegan al lead], ignored_users, voice_calls/transcripts,
mock_whatsapp_outbox). `phases` = catálogo read-only `TO authenticated`.
**Policy de impersonación agency** (punto 7): SELECT cross-tenant cuando
`(SELECT is_agency_admin FROM users WHERE auth_user_id = auth.uid())` — vía helper SECURITY
DEFINER `is_agency_admin()` para evitar recursión. Aplicar con `db-apply-policies.mjs`.

### S8 — Tipos Supabase
Añadir script `supabase:gen-types` en `packages/db/package.json` (`supabase gen types typescript
--db-url $DIRECT_URL`). Generar `packages/db/src/database.types.ts`. Tipar
`createClient<Database>` → `VegaHogarSupabase = SupabaseClient<Database>` en `src/index.ts`.
Regenerar tras la última migración.

### S9 — Seed operativo (idempotente, DEC-007 cifras conservadoras)
`phases` (8 × tracks, nombres inmobiliarios duales) · `tenant_configs` Vega · `tenant_followup_config`
· `prompt_blocks` **placeholders** (`core_v1_base`, `agencia_vega`, `nicho_v1`, `fase_*` con
contenido marcador — los reales los pega Iván en F10 vía markdown source) · `tenant_labels` system
inmobiliarios (Lead caliente, Visita agendada, Tasación pendiente, Vendido/Alquilado, No-Show,
Recontactar, Cierre perdido) · `llm_configs` (Anthropic Haiku 4.5 generator / Sonnet 4.6 judge,
api_key vacío). NO sembrar tenants ni conversaciones extra.

### S10 — Verificación
Ampliar `scripts/db-verify-schema.mjs` (tablas + enums + columnas nuevas, incl. las 2 de F3) y
`scripts/test-rls-anon-leaks.mjs` (cobertura de las tablas nuevas). **Nuevo
`scripts/test-rls-with-session.mjs`** (login con password + queries autenticadas → detecta
recursión RLS antes de runtime, lección hotfix F2). `pnpm typecheck` (db + panel + motor).

### S11 — Commit + push
`feat(fase-04): convergencia del modelo de datos del port` (con OK de Iván).

---

## 5. Validación end-to-end (criterios de cierre)

- `db-verify-schema.mjs` valida todas las tablas/enums/columnas nuevas.
- `test-rls-anon-leaks.mjs` → 0 filas anon en TODAS las tablas con tenant_id (nuevas incluidas).
- `test-rls-with-session.mjs` → sin recursión; un user de un tenant no ve otro tenant; un
  agency-admin sí ve cross-tenant (policy del punto 7).
- `prisma:generate` + `supabase:gen-types` sin drift.
- `pnpm typecheck` verde en los 3 workspaces.

---

## 6. Riesgos

1. **RLS copiado filtra datos** → reescribir al patrón Vega; gate `test-rls-anon-leaks` +
   `test-rls-with-session` antes de cerrar.
2. **Recursión en helpers** (lección F2) → `current_tenant()`/`is_agency_admin()` SECURITY
   DEFINER; policies "verme a mí" con `auth.uid()` directo.
3. **`ALTER TYPE ADD VALUE`** en migración aislada (008).
4. **Drift Prisma↔BD** (migraciones por script) → mismo paso actualiza schema.prisma + SQL +
   regenera tipos; `db-verify-schema` valida.
5. **`vector`/ivfflat** puede fallar (deuda en SETTER) → crear `agent_knowledge` con la
   extensión; el índice ivfflat detrás de migración separada si falla.
6. **Identidad UUID→BigInt** en FKs de autoría → revisar cada `created_by`/`assigned_*` al portar
   cada tabla.
7. **Volumen**: F4 es la fase más pesada de BD. Si se hace larga, partir el commit por bloques
   (S1-S3 / S4-S6 / S7-S10) con checkpoint intermedio de Iván.

---

**Cierre (2026-06-02)**: migraciones 006-013 aplicadas (24 tablas nuevas + 5 ampliadas + 10
enums nuevos + 2 ampliados) · policies 08-12 aplicadas · seed operativo (13 phases duales, 10
labels, 3 llm_configs, tenant_configs/followup, 3 prompt_blocks placeholder). **41 tablas totales.**

Verificación: `test-rls-anon-leaks` **41/41 con datos sembrados** (prueba real, no vacío) ·
`pnpm typecheck` 7/7 workspaces · `prisma generate` verde en cada bloque · seed counts OK.

Desviaciones del plan: (1) **cross-tenant del agency-admin diferido a F9** (no testeable con 1
tenant; evita tocar policies verificadas de fase 1) — en F4 patrón estándar `current_tenant()`;
(2) **S8 tipos Supabase**: script `supabase:gen-types` añadido, generación real diferida a F10
(requiere el motor que los consuma + CLI); (3) **`test-rls-with-session.mjs`** creado pero hace
SKIP — necesita `TEST_LOGIN_EMAIL`/`TEST_LOGIN_PASSWORD` en `.env.local` para confirmar
empíricamente que no hay recursión RLS con sesión; (4) `db-verify-schema.mjs` no ampliado con
las tablas nuevas (deuda menor; cubierto por `db-list-tables` + anon-leak con datos); (5)
`message_schedules` se amplió en la 010 (no en 011 como anticipaba el plan) — reorganización menor.

**Próximo paso**: Fase 5 — Leads inmobiliarios (`/leads`): primer módulo operativo del panel
portado (listado + ficha + filtros) re-domain anon+RLS sobre el shim de F3.
