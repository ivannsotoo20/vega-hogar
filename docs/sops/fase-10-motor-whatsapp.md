# SOP · Fase 10 — Motor texto + WhatsApp + Cal.com + Keywords (port SETTER→Vega)

> **Estado**: 🟡 EN EJECUCIÓN (arrancada 2026-06-11). Branch `checkpoint/fase-10` (desde `checkpoint/fase-09`).
> **Plan de sesión**: `~/.claude/plans/retomamos-vega-hogar-c-users-sotob-comer-jazzy-fountain.md`.
> **Plan maestro**: `~/.claude/plans/para-seguir-avanzando-con-proud-patterson.md` §6 (F10), §5 (tablas F4), §10 #1 (A/B).
> **Origen del port**: `C:\Users\sotob\setters_ia` (`apps/motor-agente` + `packages/*`, ~85% reusable).
> **Fases previas**: F4 (24 tablas del motor + RLS + seed) · F9 (Cerebro + Regla 9 BD-como-verdad).

---

## 1. Context

F10 es el **bloque prioritario declarado**: portar el motor conversacional 3-LLM de SETTER, re-domainizado a
"comercial inmobiliario" (flujo dual comprador/vendedor, decisión C5), y conectarlo al panel por WhatsApp. Es
el salto de "panel con seed" a "panel con tráfico" (mock ahora, real al activar).

El motor (`apps/motor`, :3010) **usa `SUPABASE_SERVICE_ROLE_KEY`** (bypassa RLS) — al contrario que el panel
(regla 2). Hoy es esqueleto (solo `/health`). Los 4 packages son **stubs**; `prompt-composer` **no existe**.
El schema operativo se cerró en F4 → **F10 = cero-migración** salvo `018` (enum `cal_com`).

**F10 es la fase más grande del proyecto**: ~6000 ln portadas en 2 apps + 4 packages + 1 nuevo + integración
Cal.com + panel. Se ejecuta partida en **F10a/F10b/F10c** con **STOP-for-OK por checkpoint**, nunca de golpe.

### Hechos verificados contra el código real (read-only, 2026-06-11) — CONTRATO DE MAPEO (S0)

**Estado del destino (Vega):**
| Hecho | Valor |
|---|---|
| `apps/motor` | Esqueleto: `index.ts`, `server.ts`, `config/env.ts` (solo NODE_ENV/PORT/LOG_LEVEL), `routes/health.ts`. SIN services/lib/tests |
| Deps a instalar en motor | `@anthropic-ai/sdk`, `ioredis`, `@supabase/supabase-js` |
| Packages | `agent-pipeline`/`channel-adapters`/`shared-validator`/`composio-actions` = STUBS; **`prompt-composer` NO existe** |
| `packages/db` | REAL: `createSupabaseClient(url,key)` + `getPrisma()`. **NO existe `database.types.ts`** (deuda F10; script `supabase:gen-types` ya en package.json) |
| Infra | docker-compose (motor+redis) OK · `.env.example` documenta ANTHROPIC/CREDENTIALS/WHATSAPP_PROVIDER=mock/YCLOUD/REDIS/SUPABASE/MOTOR_INTERNAL_URL/INTERNAL_STATS_TOKEN |
| `integration_accounts` | EXISTE: `credentials_encrypted` (AES-GCM) + `webhook_secret` (HMAC) + `provider` (enum) + `connection_config` |
| Tabla `channels` | **NO existe** (Vega usa enum `channel_type`) → `lead-ingest` se reescribe sin ella |
| `test-rls-anon-leaks` | **42 tablas** (debe seguir 42/42; motor=service-role no afecta RLS) |
| `apps/motor/prompts/` | **NO existe** (Regla 9 seed por crear) |

**Diferencias de columnas (SETTER → Vega) — SQL soldado a reescribir:**
| Concepto | SETTER (origen) | Vega (real) |
|---|---|---|
| Fase en conversación | `phase_number` | **`current_phase`** INT |
| Cita agendada | `call_scheduled_at` | **`appointment_scheduled_at`** |
| Link agenda enviado | `is_call_scheduling_link_sent` | **`is_scheduling_link_sent`** |
| Rol del mensaje | columna `source` (lead/ai/human) | **columna `role`** (enum `message_role`: lead/agent/human/system) |
| Cola salida (tiempo) | `run_at` | **`scheduled_for`** |
| Cola salida (contenido) | `body`/`payload`/`part_index` | **`message`** + `message_type` (enum) + `triggered_by` TEXT CHECK |
| Outbox mock | `body`/`to_phone`/`lead_id` | **`parts`** JSONB array (phone por join conv→lead; sin to_phone/lead_id) |
| Comercial en visita | `assigned_user_id` | **`comercial_user_id`** |
| Precio inmueble | `price` único | **`price_eur`** (sale) + **`monthly_rent_eur`** (rent) |
| Zona | `zone` | **`neighborhood`** |
| Superficie | `area`/`m2` | **`m2_built`** |
| Habitaciones | `bedrooms` | **`rooms`** |
| Operación | `operation` | **`type`** (enum `property_type`: sale/rent) |
| Referencia inmueble | `reference` | **(no existe columna)** |
| FK autoría/asignación | UUID `auth.users` | **`users.id` BIGINT** |

**Enums Vega (valores exactos):**
- `lead_intent`: buyer, tenant, seller, landlord, unknown
- `conversation_status`: active, qualified, disqualified, handoff, paused → **coincide 1:1 con la tool** (sin remapeo)
- `handoff_cause`: A_agenda, B_derivacion, C_descualificado, D_espera, E_error → **reusar tal cual**
- `message_role`: lead, agent, human, system (la IA escribe `agent`; SETTER usaba `ai`/`trainer`)
- `channel_type`: whatsapp, voice, web_form, meta_ads, other
- `schedule_status`: pending, processing, sent, failed, cancelled · `schedule_message_kind`: message, follow_up, resource
- `property_type`: sale, rent · `property_status`: available, reserved, sold, rented, inactive
- `integration_provider`: ycloud, zadarma, elevenlabs, deepgram, composio, meta_ads, ghl → **+`cal_com` (migr 018)**
- `automation_keywords.type`: CHECK (bienvenida, lm, inbound, wa_open); columna **`pattern`** (no `keyword`); **sembrada vacía**

**Seed actual (`seed-engine.mjs`):** 13 phases duales (intent_track buyer/seller/shared, number 0-7) · 10 tenant_labels
sistema · 3 llm_configs (generator/judge/splitter, todos `claude-haiku-4-5`, api_key NULL) · tenant_configs
(debounce_window_seconds=25, timezone Europe/Madrid, max_messages 22) · tenant_followup_config (9-21h, max 3,
intervalos 24/72/168) · **3 prompt_blocks placeholder** `-- PENDIENTE F10 --` (`core_v1_base` shared sort 0,
`agencia_vega` tenant1 sort 5, `output_contract_v1` shared sort 100). NO siembra automation_keywords/followup_templates/tenant_tokens.

---

## 2. Decisiones cerradas (Fase 10, con Iván 2026-06-11)

1. **D1 · Opción A — inyección pre-pipeline (RAG)** (cierra decisión abierta #1). El motor busca inmuebles/slots
   ANTES del pipeline e inyecta el top-N en el system prompt (`{{available_properties}}`/`{{available_slots}}`,
   FUERA de cache). Conserva cache two-point + coste + latencia. **Es RAG, no árbol scripted** → honra anti-jugada #1.
   Construido tras interfaz `AgentTool` para evolucionar a B (tool-loop) en F12+ sin reescribir.
2. **D2 · DESCARTAR GHL** (CRM + mensajería) + ManyChat. Canales del agente = WhatsApp + voz. Columnas `ghl_*` latentes.
3. **D3 · Cal.com** como agenda (reemplaza calendarios GHL del plan). `visits`=verdad; Cal.com=espejo/disponibilidad.
   Servicios de calendario de SETTER re-domainizados GHL→Cal.com. **Codeado + mock-verificado + go-live gated**. Migr `018` (+`cal_com`).
4. **D4 · F10 termina en mock-verificado + YCloud/Cal.com codeados**. Drivers reales + HMAC + seguridad dura
   testeados (Vitest) pero NO en vivo. **Go-live (deploy VPS + cuentas + plantillas) = gate externo posterior.**
   El motor NO se despliega a prod en F10.
5. **D5 · Panel = simulador mock + habilitar composer**. Composer de `/conversations` (`role=human`, anon+RLS, prod-safe)
   + viewer read-only de `mock_whatsapp_outbox`. El simulador que dispara el motor es harness LOCAL (no feature de prod).

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| **S0** — Branch + SOP + contrato + DEUDA S10 | 🟡 EN CURSO | branch creada; SOP redactado; contrato congelado (§1); DEUDA S10 pendiente toggles Supabase |
| **F10a — Cimientos (S1–S9)** | 🟢 CÓDIGO LISTO | S1-S9 ✅ (typecheck 8/8 + tests 38) · pendiente checkpoint: health smoke + anon-leaks 42/42 + commit OK Iván |
| S1 — env.ts zod | ✅ | supabase/anthropic/redis/whatsapp/calcom/seguridad; drop GHL/ManyChat/Trigger |
| S2 — deps motor | ✅ | @anthropic-ai/sdk@0.73, ioredis, @supabase/supabase-js, helmet, cors |
| S3 — lib supabase service-role + redis + health | ✅ | cliente tipado + health checks supabase/redis + helmet/cors |
| S4 — libs neutras | ✅ | 12 libs (logger, anthropic, redis, crypto, log-redact, timing-safe-bearer, webhook-verify, ai-pause, debounce-buffer, phone-to-timezone, timezone-label, tracking-uuid) |
| S5 — database.types.ts | ✅ | generado vía PAT (management API, read-only); db re-exporta `Database` + tipa createSupabaseClient |
| S6 — crear prompt-composer | ✅ | package nuevo: types/interpolate/builder/index; cache two-point + `dynamic_context` fuera de cache; typecheck verde |
| S7 — agent-pipeline re-domain | ✅ | respond_as_inmobiliario (4 required: message_raw/conversation_status/phase_decision 0..7/detected_intent; + proposed_property_ids, proposed_visit_slot, is_tasation_visit, contraoferta_registrada, handoff_reason; maxLength din 310-1150) + types `InmobiliarioToolOutput` + generator (composePrompt API nueva, dynamicContext) + judge (guardrails re-domain V11′) + splitter (whatsapp/voice) + history (columna `role`: lead→user, agent/human/system→assistant; func pura) + cost + llm-call-log (cliente tipado, Json) + pipeline (V19 injected/proposed; retry V17). Cliente `SupabaseClient<Database>`. typecheck verde + **29 tests** (tool-schema + history 4 roles) |
| S8 — shared-validator | ✅ | V00-V19 + types + index + detect-addressing; **V11′ invertida** + **V19 anti-alucinación**; typecheck verde |
| S9 — channel-adapters | ✅ | ycloud transporte (api-client `ycloudSendText` + types zod + parser inbound + templates) copia fiel + abstracción Vega `whatsapp/` (interface `OutboundWhatsApp {tenantId, conversationId, toPhone, parts}` + driver `ycloud` [loop parts→sendDirectly] + driver `mock` [INSERT `mock_whatsapp_outbox`: parts JSONB, status=pending, SIN phone] + factory `createWhatsAppAdapter` por WHATSAPP_PROVIDER). Deps: zod + @supabase/supabase-js + @vega-hogar/db. typecheck verde + **9 tests** (factory→mock/ycloud, mock insert, ycloud fetch-mock, parseYCloudInbound) |
| **F10b — Núcleo vs mock (S10–S18)** | 🟡 EN CURSO | **Bloque 1 ✅** (`8163838`) · **Bloque 2 ✅** (S15/S16/S17 código; seed pendiente OK) · falta Bloque 3 (S18 golden path + panel) |
| S10 — services neutros | ✅ | pipeline-runs (sin multimodal) + pipeline-stats + llm-models (carga llm_configs). enrich-media/personalize diferidos (lean) |
| S11 — history role-mapping | ✅ | hecho en S7 (`rowsToConversationMessages` + test 4 roles); consumido por S13 |
| S12 — lead-ingest sin channels | ✅ | reescrito: upsert por (tenant,phone), getOrCreateConversation, insertInboundMessage(role=lead), resolveTenantByToken. Test idempotencia ✓ |
| S13 — process-debounced (NÚCLEO) | ✅ | re-domain completo (gates+RAG+pipeline+POST mapeo §1: status 1:1, auto-promote, razonamiento, visits, handoff, pipeline_events, salida mock). Recortes lean (GHL/trainer_prefs/multimodal/notif/mirror). Tests unitarios; integración=Bloque 3 |
| S14 — agent-tools + mock outbox | ✅ | buscar-inmuebles (ranking+relax) + consultar-disponibilidad (mock) + agendar-visita/tasacion (visits+round-robin+re-valida) + escalar + comercial-resolver + outbound-sender (V19 array). Tests ✓ |
| S15 — webhook-mock-whatsapp | ✅ | `POST /webhooks/whatsapp-mock/:tenant_token` → resolveTenantByToken → lead-ingest → classifyInbound (source) → debounce (redis). HMAC log; safeLogBody. Smoke=Bloque 3 |
| S16 — scheduler/cadencia mock | ✅ | `cron-scheduler.ts` debounce-tick (gated `MOTOR_CRON_ENABLED`, OFF por defecto) → process-debounced; `runDebounceTick` testeado (DI). Cola `message_schedules`/outbound-tick diferidos a F10c (lean) |
| S17 — labels + seed keywords | ✅ | labels apply-label + apply-system-labels (re-domain Vega, wired en núcleo); keywords.ts (classifyInbound). Seed: `automation_keywords`(9) + `tenant_tokens` mock — **código listo, ejecución pendiente OK de Iván**. evaluate-text-rules diferido (lean) |
| S18 — golden path e2e + panel | ⏳ 🔴 | composer + outbox viewer |
| **F10c — Canal real gated (S19–S22)** | ⏳ | |
| S19 — YCloud real + welcome-template | ⏳ 🔴 | |
| S20 — Cal.com + webhook + migr 018 | ⏳ 🔴 | 42/42 |
| S21 — seguridad dura | ⏳ 🔴 | HMAC enforce flag + cron OFF |
| S22 — prompts Regla 9 | ⏳ 🔴 | seed-si-placeholder |
| **S23 — Cierre** | ⏳ 🔴 | verificación + promote panel + memoria |

> **Gate base (G)** repetido al cierre de cada sub-bloque: `pnpm typecheck && lint && build` verdes + `vitest run`
> (motor) + `curl :3010/health` 200 + `node scripts/test-rls-anon-leaks.mjs` **42/42**. 🔴 = STOP obligatorio de Iván.

---

## 4. Sub-pasos detallados

### S0 — Branch + SOP + contrato + DEUDA S10 (🔴 OK del contrato)
- `git checkout -b checkpoint/fase-10` desde `checkpoint/fase-09` (✅ hecho).
- Redactar este SOP + congelar contrato de mapeo (§1) (✅).
- **DEUDA S10 (invites E2E, decisión Iván F9)**: requiere pasos manuales de Iván en Supabase
  (**Authentication → Enable sign-ups = ON** + **Email confirmation = OFF**). Luego verificar E2E: admin invita →
  copia enlace → registro incógnito → `claim_invite` crea `public.users` → dashboard por rol; reuso→usado;
  email distinto→mismatch. Round-trip de members por UI. **No bloquea el motor** (cubierto a nivel SQL por
  `test-rls-invites`/`test-rls-members-writes`). STOP hasta toggles de Iván.

### F10a — Cimientos compilables
- **S1** Ampliar `apps/motor/src/config/env.ts` (zod fail-fast): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY, REDIS_URL, WHATSAPP_PROVIDER (mock|ycloud), CALENDAR_PROVIDER (mock|calcom), YCLOUD_API_BASE/KEY,
  YCLOUD_WEBHOOK_VERIFY_MODE, CALCOM_API_BASE/KEY, CALCOM_WEBHOOK_VERIFY_MODE, CREDENTIALS_ENCRYPTION_KEY,
  INTERNAL_STATS_TOKEN, MOTOR_INTERNAL_URL, LEAD_FORM_VERIFY_MODE. Gate G.
- **S2** Instalar en `apps/motor`: `@anthropic-ai/sdk`, `ioredis`, `@supabase/supabase-js`. ⚠ lockfile → daemon.
- **S3** `lib/supabase.ts` (service-role vía `@vega-hogar/db` `createSupabaseClient`; **assert build-time:
  service-role nunca importable desde panel**) + `lib/redis.ts` (ioredis + `tryClaimDedupKey`) + checks en `/health`.
- **S4** Libs neutras (copiar + rename `@fyzon/*`→`@vega-hogar/*`): logger, crypto (AES-GCM), log-redact (`safeLogBody`),
  webhook-verify (HMAC), timing-safe-bearer (`isValidBearer`/`timingSafeEqual`), anthropic (singleton),
  debounce-buffer (redis queue), phone-to-timezone, timezone-label, tracking-uuid, transcribe-audio (Groq),
  describe-image (Claude vision), ai-pause (`isAiPausedFromDb` con 'infinity'), touch-integration, integration-credentials.
- **S5 🔴** `database.types.ts`: `pnpm --filter @vega-hogar/db supabase:gen-types` (requiere `DIRECT_URL` real).
  **STOP**: confirmar con Iván que DIRECT_URL apunta a la BD correcta; revisar diff antes de aceptar.
- **S6** Crear `packages/prompt-composer/` (package.json + src builder/interpolate/types/index). Cache two-point:
  bp tras `core_v1_base` (cacheado) + bp tras `output_contract_v1` (prefix invariante). **Bloque sintético
  `dynamic_context` FUERA de cache** (corrige bug SETTER de interpolar dinámico dentro del CORE cacheado).
  Placeholders: `{{available_properties}}`, `{{available_slots}}`, `{{current_date}}`, `{{lead_intent}}`,
  `{{lead_contact_status}}` (en dynamic_context, no cacheado) + `{{current_phase_focus}}`, `{{phaseN_priority}}`
  (en CORE, estable por fase/track). Registrar workspace + dep en motor. Gate G.
- **S7** `agent-pipeline` (copiar + re-domain): `tool-definition.ts` → `respond_as_inmobiliario` (§4.2 del plan;
  required `[message_raw, conversation_status, phase_decision, detected_intent]`; phase 0..7; nuevos
  `detected_intent`/`proposed_property_ids`/`proposed_visit_slot`/`is_tasation_visit`/`contraoferta_registrada`;
  maxLength dinámico 310-1150) · `generator.ts` (`RESPOND_AS_INMOBILIARIO_TOOL_NAME`) · `judge.ts` (system prompt
  inmobiliario) · `splitter.ts` (copiar) · `history.ts` (mapeo `role` lead→user, agent/human/system→assistant) ·
  `types.ts` (`InmobiliarioToolOutput`) · `cost.ts`/`llm-call-log.ts` (copiar/adaptar `summarize*`). Gate G + test schema tool.
- **S8** `shared-validator` V00-V18 (copiar) + **V11′** (invertido: precio del inmueble PERMITIDO; bloquea
  comisión/honorarios + datos del propietario, fase-independiente) + **V19** (anti-alucinación:
  `proposed_property_ids ⊆ injectedPropertyIds`, severity=error) + V07/V15 thresholds inmobiliarios + V10 stub rename.
  Tests por validador (especialmente V11′ y V19). Gate G.
- **S9** `channel-adapters`: copiar `ycloud/*` (api-client, parser, whatsapp, templates, types) + crear
  `whatsapp/mock.ts` (send → `mock_whatsapp_outbox.parts`) + `whatsapp/factory.ts` (por `WHATSAPP_PROVIDER`). Gate G + test factory→mock.
- **🔴 CHECKPOINT F10a + commit** `feat(fase-10a): cimientos motor (env+supabase+redis+packages+pipeline+validators+adapters)`.

### F10b — Núcleo contra mock
- **S10** Services neutros: `pipeline-runs.ts`, `pipeline-stats.ts`, `enrich-media-messages.ts`,
  `personalize-followup.ts`. Tests.
- **S11 🔴** `history.ts` (función pura role-mapping): lead→user; agent/human/system→assistant; orden cronológico;
  separa último bloque inbound. Test de las 4 variantes de role + orden.
- **S12 🔴** `lead-ingest.ts` **reescrito SIN tabla channels**: upsert directo a `leads` (enum `channel_type`,
  clave `@@unique(tenant_id,phone)`), set `tracking_uuid`, `intent`, FK autoría `users.id` BIGINT; upsert
  `conversations`; INSERT inbound `conversation_messages(role='lead')`. Test idempotencia (mismo phone 2× = 1 lead).
- **S13 🔴🔴** `process-debounced.ts` (NÚCLEO, ~873 ln): re-domain completo (§4.1 del plan). Mapeos de columna
  (current_phase, appointment_scheduled_at, is_scheduling_link_sent, role); updates de razonamiento (columnas
  homónimas en conversations); handoff_cause enum; auto-promote por source. **Revisión línea-a-línea de cada
  `.update()`**. Test integración con cliente Anthropic mockeado recorriendo el flujo sobre conv sembrada.
- **S14 🔴** `services/agent-tools/` (agnósticas de canal): `buscar_inmuebles` (query properties+lead_preferences,
  ranking SQL, relax cascada, soft-delete, top-N), `consultar_disponibilidad_comercial` (mock provider),
  `agendar_visita`/`agendar_tasacion` (write `visits`, comercial round-robin oficina, re-valida slot),
  `escalar_a_humano`. + `outbound-sender.ts` + mock outbox (`parts` JSONB, **phone por join conv→lead**, sin
  to_phone/lead_id). **V19: injectedPropertyIds siempre array (nunca undefined)**. Tests.
- **S15 🔴** `routes/webhook-mock-whatsapp.ts` (`POST /webhooks/whatsapp-mock/:tenant_token`): parse → lead-ingest →
  debounce (redis) → process-debounced. HMAC en modo `log`; `safeLogBody` en logs. Smoke POST → fila messages + outbox.
- **S16** `scheduler.ts` + cadencia (mock, **cron OFF por defecto**): `scheduled_for`, `message`, `message_type`,
  `triggered_by`, `schedule_status`. Test insert+procesa contra mock.
- **S17 🔴** Labels (5 archivos services/labels → etiquetas inmobiliarias del seed) + **seed idempotente
  `automation_keywords`** (tabla ya existe, **NO migración**; patrón guard del seed-engine) + keywords routing. Tests.
- **S18 🔴** **GOLDEN PATH e2e contra mock** (§5 verificación). Panel: habilitar composer de `/conversations`
  (`role=human`, server action anon+RLS) + viewer read-only `mock_whatsapp_outbox`. Smoke MCP.
- **🔴 CHECKPOINT F10b + commit** `feat(fase-10b): núcleo motor vs mock + golden path + panel composer/outbox`.

### F10c — Código de canal real (gated, NO va a prod)
- **S19 🔴** `channel-adapters/ycloud` real (api-client/templates) + `send-welcome-template.ts` (re-domain
  conversation_source) + factory real. Tests con HTTP mock.
- **S20 🔴** Cal.com: `lib/calcom-client.ts` (slots, create-booking, cancel/reschedule) + provider abstraction
  (mock|calcom) + `routes/webhook-calcom.ts` (HMAC `x-cal-signature`) + `appointment-applier` (booking events →
  update `visits`/conversation). **Migración `018_calcom_provider.sql`** (ALTER TYPE `integration_provider` ADD
  VALUE `cal_com`, AISLADA) + `node scripts/db-apply-migrations.mjs --only 018_calcom_provider.sql` + re-run
  `test-rls-anon-leaks` 42/42. Tests con HTTP mock.
- **S21 🔴** Seguridad dura (CLAUDE.md §10): HMAC `enforce` en prod vía `*_WEBHOOK_VERIFY_MODE` (default warn/log),
  `assertHttpsUrl` para URLs externas, `timingSafeEqual` (nunca `===`), SECURITY DEFINER con `search_path`+REVOKE
  (si toca func). `auto-followup-cron.ts` **vivo pero OFF por defecto** (feature flag). Tests de rechazo de firma inválida.
- **S22 🔴** Prompts Regla 9: crear `apps/motor/prompts/source/{core-v1,agencia-vega,output-contract}.md` (contenido
  real del agente Vega: voz tradicional cercana, flujo dual, anti-jugadas) + script `prompts:build-seed`
  (**seed-si-placeholder**: UPDATE solo si content == `-- PENDIENTE F10 --` y sin versión + INSERT version v1).
  Test: contenido ya publicado NO se sobreescribe.
- **🔴 CHECKPOINT F10c + commit** `feat(fase-10c): canal real codeado gated (ycloud + cal.com + seguridad + prompts)`.

### S23 — Cierre (🔴 STOP para OK + promote del panel)
- Verificación total (§5) + `grep` 0 `service-role` en `apps/panel/src`. `git add` selectivo, mostrar diff,
  **OK de Iván**, commit final `feat(fase-10): motor texto + whatsapp (mock+ycloud) + cal.com + pipeline 3-LLM +
  keywords + followups`. Push. Deploy panel (preview por rama) → **PROMOVER a prod**
  `vercel promote <url> --scope ivans-projects-63b5f517 --yes` + smoke (`/`, `/conversations`, `/login`). **El motor
  NO se despliega a prod en F10** (go-live diferido). Actualizar memoria (`fase_10_completada.md` + MEMORY.md) +
  checkmarks del SOP. Daemon `backup` puede racear; **no `--force`**.

---

## 5. Validación end-to-end (criterios de cierre)

**Golden path mock** (`WHATSAPP_PROVIDER=mock`, `CALENDAR_PROVIDER=mock`, HMAC=log, cron OFF, fixtures idempotentes):
1. `POST :3010/webhooks/whatsapp-mock` → `conversation_messages(role=lead)`.
2. debounce redis → process-debounced → `pipeline_runs` abierto.
3. pipeline 3-LLM → `respond_as_inmobiliario`; V00-V18+V11′+V19 pasan; run cerrado + `pipeline_events`.
4. `conversations` (current_phase, status, razonamiento) + labels.
5. si propone slot → `visits` (comercial_user_id + appointment_scheduled_at).
6. `mock_whatsapp_outbox(parts JSONB, status=pending)`, phone por join.
7. Panel `/conversations/[id]` muestra lead + agente + outbox viewer.

**Por gate**: typecheck + lint + build verdes; `vitest run` (motor) verde; `/health` 200; `test-rls-anon-leaks`
**42/42**; **0 `service-role` en `apps/panel/src`**. **Seed pristino** al cerrar (revertir writes de prueba).

**Garantía no-prod**: mock no abre BSP/Cal.com; HMAC `log`/`warn` sin secreto real; cron OFF; ningún driver real
ejercitado en vivo; writes solo a tablas existentes con fixtures de un tenant de prueba; el motor NO se despliega.

---

## 6. Riesgos
1. **`process-debounced` UPDATE mal mapeado** (🔴) → contrato §1 + `database.types` tipa updates + test integración + revisión línea-a-línea (S13).
2. **`lead-ingest` sin channels → duplicados** (🔴) → reescribir desde cero + test idempotencia (`@@unique tenant,phone`) (S12).
3. **`history` role-mapping invertido** (🔴) → función pura + test 4 roles + orden (S11).
4. **mock outbox `parts`/phone-por-join mal** (🟠) → validar parts[] + test join conv→lead→phone (S14).
5. **Canal real/cron spamea prod** (🔴) → todo en F10c gated; cron OFF; sin deploy del motor en F10.
6. **Regla 9 violada (seed pisa publicado)** (🔴) → seed-si-placeholder + test no-sobreescribe (S22).
7. **V11 no invertido → niega precios** (🟠) → test V11′ explícito (S8).
8. **V19 ausente → alucina inmueble** (🔴) → V19 error-level + injectedPropertyIds siempre array (S8/S14).
9. **Carrera de slot (double-booking)** (🟠) → re-validar slot en agendar_visita + degradar anti-zombie (S14).
10. **service-role fuga al panel** (🔴) → service-role SOLO en motor + assert + 42/42 cada gate (S3).
11. **Cal.com nueva dep / migración enum** (🟠) → abstracción mock|calcom; 018 aislada; go-live gated (S20).
12. **Daemon `backup` racea commit** (🟠) → sub-pasos atómicos compilables; no `--force`.

---

## 7. Pasos manuales de Iván (externos)
1. **S0 (DEUDA S10)**: Supabase → **Enable sign-ups = ON** + **Email confirmation = OFF** (para el E2E de invites).
2. **S5**: confirmar `DIRECT_URL` apunta a la BD correcta antes de generar tipos.
3. **Go-live (POSTERIOR a F10, no bloquea cierre)**: cuenta YCloud + plantilla WA aprobada en Meta + secret HMAC ·
   cuenta Cal.com + API key + webhook secret · deploy motor a VPS Contabo (Docker) · pasar `*_VERIFY_MODE` a `enforce`.

---

**Próximo paso (continuación)**: **🔴 CHECKPOINT F10a** — código de cimientos LISTO (S1-S9 ✅). Para cerrar el
checkpoint con OK de Iván: (a) `vitest run` motor [aún sin tests; llega en F10b] · (b) `curl :3010/health` 200
[requiere motor+redis locales + env real] · (c) `node scripts/test-rls-anon-leaks.mjs` = **42/42** [read-only;
S7/S9 no tocan tablas ni RLS → garantizado] · (d) `git add` selectivo + diff + **commit con OK de Iván**
(`feat(fase-10a): cimientos motor (env+supabase+redis+packages+pipeline+validators+adapters)`). Estado al cortar:
F10a con **S1-S9 ✅** (typecheck 8/8 verde + 38 tests: 29 agent-pipeline + 9 channel-adapters). Todo **sin
commitear**; Supabase intacto (S5 fue introspección read-only vía PAT, ya en `.env.local`); motor sin desplegar.
Daemon `backup` puede racear → **no `--force`**.

S9 ✅ COMPLETADO (ycloud transporte + abstracción `whatsapp/` + factory): ver fila S9 en §3.

S7 ✅ COMPLETADO (10 archivos `packages/agent-pipeline/src/*` + package.json + vitest.config + 2 tests):
- `tool-definition.ts` → `respond_as_inmobiliario` (required: message_raw, conversation_status[1:1 con
  conversations.status], phase_decision **0..7**, detected_intent buyer|seller|unknown; + proposed_property_ids,
  proposed_visit_slot, is_tasation_visit, contraoferta_registrada, handoff_cause[enum existente], handoff_reason,
  razonamiento estructurado). maxLength din 310-1150. Quitado `proposed_booking_slot`/GHL/rango 1..7.
- `history.ts` → ⚠ mapea columna `role` (lead/agent/human/system): lead→user; agent/human/system→assistant
  (Vega usa `role`+`created_at`, NO `source`/`sent_at`). Función pura `rowsToConversationMessages` + test 4 roles + orden.
- `generator.ts` → `composePrompt(supabase, {tenantId, currentPhase, currentPhaseFocus, cacheStrategy, cacheTtl,
  dynamicContext})` (API NUEVA del composer, S6); tool_choice forzado; `validateInmobiliarioOutput`.
  `judge.ts` (guardrails re-domain alineados a V11′: precio del inmueble permitido, comisión/propietario bloqueado;
  `coachSummary`→`agencySummary`) · `splitter.ts` (canal whatsapp|voice) · `cost.ts` (copia).
- `llm-call-log.ts` → INSERT `llm_calls` con columnas Vega exactas, cliente `SupabaseClient<Database>` + payloads `Json`.
  `pipeline.ts` → orquestador + `validateMessage` pasando `injectedPropertyIds`(de validationContext o fallback a
  `dynamicContext.availableProperties`) + `proposedPropertyIds` (V19); retry V17 conservado. Scope `@fyzon/*`→`@vega-hogar/*`.
- Deps añadidas: `@anthropic-ai/sdk@^0.73`, `@vega-hogar/{prompt-composer,shared-validator,db}@workspace:*`,
  `@supabase/supabase-js@^2.103.3` + `vitest@^2.1.9` (tsconfig ya NodeNext).
- **Verificado**: typecheck verde (agent-pipeline + db/prompt-composer/shared-validator/motor sin regresión) + **29 tests** (tool-schema + history role-mapping).

Tras S9: **checkpoint F10a** (gate completo: typecheck/lint/build + `vitest run` motor + `curl :3010/health` +
`test-rls-anon-leaks` 42/42 + commit con OK de Iván). Cero cambios en Supabase y cero commits sin OK explícito de Iván.
