# SOP · GO-LIVE del Motor — Vega Hogar (deploy real WhatsApp + Cal.com)

> **Estado**: 🟡 EN EJECUCIÓN (arrancada 2026-06-29). Branch `checkpoint/go-live-motor` (desde `checkpoint/fase-10`).
> **Plan de sesión**: _plan de sesión del autor (archivo local, no versionado en el repo)_ (aprobado 2026-06-29).
> **Fase previa**: F10 (motor code-complete + gated; canal real YCloud/Cal.com escrito pero OFF).
> **Reabre conscientemente D4** (F10 terminaba en mock-verificado). Absorbe el hardening de prod que el roadmap reservaba a F14.

---

## 1. Context

El motor conversacional (`apps/motor`, Fastify 5, :3010) está **code-complete pero GATED y sin desplegar**:
canal real (YCloud, Cal.com v2 con HMAC, seguridad dura §10) escrito detrás de flags
(`*_PROVIDER=mock`, `*_WEBHOOK_VERIFY_MODE=warn`, `MOTOR_CRON_ENABLED=false`). 100 tests, anon-leaks 42/42,
migr 018 aplicada. El **panel ya está en producción** (Vercel).

**Objetivo**: motor en producción real en el VPS Contabo, recibiendo y respondiendo WhatsApp de verdad (YCloud) y
agendando en Cal.com de verdad, con seguridad dura en `enforce` y golden path real verificado end-to-end.

### Hallazgos de auditoría (read-only, 2026-06-29) que condicionan el plan
- ✅ **RESUELTO en G2 (2026-07-02)**: la ruta de webhook YCloud entrante real (`POST /webhooks/ycloud/:tenant_token`)
  no existía — solo el mock. Implementada en `apps/motor/src/routes/webhook-ycloud.ts` (HMAC + ingest + dedup con
  release-on-failure + E.164), registrada en `server.ts`, 14+ tests.
- ✅ **Cal.com production-ready en `enforce`**: `POST /webhooks/calcom/:token`, HMAC `x-cal-signature-256` +
  `timingSafeEqual`, booking → handoff `A_agenda` + pausa IA + espejo `calendar_appointments`. Solo falta config en BD.
- ✅ **Saliente YCloud + seguridad §10** (`safeLogBody`, `timingSafeEqual`, crypto AES-256-GCM, `assertEncryptionKey`): listos.
- 🟠 **Infra greenfield**: `docker-compose.yml` con `NODE_ENV=development` hardcodeado + sin healthcheck del motor;
  `/health` siempre 200 aunque esté degradado; sin reverse proxy/TLS/CI/scripts de deploy; `Dockerfile` corre `tsx`.

### Decisiones de Iván (2026-06-29)
- Prereqs **YCloud / Cal.com / VPS / ANTHROPIC listos** (la plantilla Meta se trata aparte).
- **Inbound-first**: el lead escribe primero → la aprobación de plantilla por Meta **sale de la ruta crítica**.
  Bienvenida proactiva + `followup_templates` + trigger = **fuera de scope**.
- **Cloudflare Tunnel** (sin abrir puertos en el VPS; servicio `cloudflared` en el compose).
- **Sentry diferido a F14** (go-live lean con logs pino estructurados).

---

## 2. Decisiones cerradas (go-live, con Iván 2026-06-29)

1. **D-GL1 · Inbound-first**. Primera conversación = el lead escribe al número Vega (ventana 24h abierta);
   el agente responde libre. Sin plantilla Meta en ruta crítica. Construir SOLO la ruta YCloud entrante.
2. **D-GL2 · Cloudflare Tunnel** como ingress + TLS. `cloudflared` corre como servicio del compose; el edge
   Cloudflare termina TLS; `cloudflared → motor:3010` es tráfico interno. Sin puertos abiertos en el VPS.
3. **D-GL3 · Sentry diferido a F14**. Observabilidad de este go-live = logs pino a stdout + `/health`.
4. **D-GL4 · Mantener `tsx` en runtime** (lo que usa el repo en todos lados; mínimo riesgo). Compilar a `dist/`
   queda como mejora opcional futura, no en este go-live.
5. **D-GL5 · Secretos en VPS** = fichero `.env` root-owned `chmod 600` fuera de git (el compose ya usa `env_file`).

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| **G0** — Branch + SOP | 🟢 EN CURSO | branch `checkpoint/go-live-motor` creada; este SOP redactado |
| **G1** — Smoke LOCAL con Claude real | 🟢 HECHO (2026-07-02) | Motor vía `tsx` (SIN Docker) + Redis userspace en WSL; golden path **VERDE** con Claude real ($0.021, conv→fase 2, outbox poblado) |
| **G2** — Webhook YCloud entrante real (código) | 🟢 HECHO (2026-07-02) | `routes/webhook-ycloud.ts` (HMAC enforce/warn + parse + dedup release-on-failure + ZodError→400/resto→500 + E.164) + registro + tests. Commits `acc3e17` + fixes auditoría |
| **G3** — 🔴 Hardening infra prod (código) | ⬜ PENDIENTE | `/health` 503 + `docker-compose.prod.yml` + `cloudflared` + `.env.production.example` |
| **G4** — 🔴🔴 Config secretos + BD | ⬜ PENDIENTE (Iván + OK) | `.env` VPS + named tunnel + `integration_accounts`/`calendar_accounts`/`tenant_tokens` + webhooks en dashboards |
| **G5** — 🔴🔴 Deploy VPS + flags | ⬜ PENDIENTE (Iván) | `compose up -d` + flags `ycloud`/`calcom`/cron/enforce + `/health` 200 público |
| **G6** — 🔴🔴 Smoke en vivo golden path real | ⬜ PENDIENTE (Iván) | WhatsApp real ida/vuelta + webhook Cal.com mueve conv + logs sin secretos |
| **G7** — 🔴 Cierre | ⬜ PENDIENTE | runbook + memoria + commits con OK + push |

> **Gate base (G)** en los sub-pasos de código: `pnpm typecheck && lint && build` + `vitest run` (motor) +
> `node scripts/test-rls-anon-leaks.mjs` **42/42**. 🔴 = STOP obligatorio de Iván.

---

## 4. Sub-pasos detallados

### G0 — Branch + SOP
- `git checkout -b checkpoint/go-live-motor` desde `checkpoint/fase-10` (✅).
- Redactar este SOP (✅). No toca prod ni Supabase.

### G1 — 🔴 Smoke LOCAL con Claude real (validar el cerebro antes de exponer)
Entorno de Iván (Claude no tiene Docker/clave). Providers en **mock**, ANTHROPIC **real**.
- Rellenar `ANTHROPIC_API_KEY` en `.env.local`.
- `MOTOR_CRON_ENABLED=true docker compose up --build`.
- `node scripts/golden-path-smoke.mjs` → verde: pipeline 3-LLM responde, `mock_whatsapp_outbox` poblado,
  conversación avanza, `pipeline_runs.outcome=success`. Luego `--cleanup` (seed pristino).
- **STOP-OK**. Si el cerebro falla aquí, se arregla antes de cualquier deploy.

### G2 — 🔴 Webhook YCloud entrante real (código)
- `apps/motor/src/routes/webhook-ycloud.ts` → `POST /webhooks/ycloud/:tenant_token`, espejo de mock+calcom:
  1. `resolveTenantByToken(supabase, token, 'ycloud_webhook')`.
  2. `webhook_secret` de `integration_accounts` (provider ycloud) → `verifyYCloudSignature({rawBody, signatureHeader, secret})`
     según `YCLOUD_WEBHOOK_VERIFY_MODE` (enforce → 401).
  3. `parseYCloudInbound(body, tenantId)` → status update → **ack 200 sin procesar**; inbound → `lead-ingest`
     (upsert lead+conv, `insertInboundMessage role='lead'`) → `enqueueDebounce` (redis).
  4. **Dedup redis** `ycloud:{tenantId}:{wamid}` (TTL ~600s).
  5. `safeLogBody` en todo log. Sin `===`.
- Registrar en `apps/motor/src/server.ts`.
- **Validación E.164** ligera en `lead-ingest`/`normalizePhone` (gap de auditoría).
- Tests vitest: firma válida / inválida-warn / inválida-enforce→401 / status-update→ack / inbound crea lead+mensaje+encola / dedup.
- **Gate G + STOP-OK + commit** `feat(go-live): webhook ycloud inbound real (HMAC + ingest + dedup)`.

### G3 — 🔴 Hardening infra prod (código, sin desplegar)
- `routes/health.ts`: **503** si algún check falla (mantener payload).
- `docker-compose.prod.yml` (override): `motor` NODE_ENV=production + LOG_LEVEL=info + sin publicar 3010 al host +
  restart unless-stopped + healthcheck (`curl -f .../health`); servicio `cloudflared` (`tunnel run`, `TUNNEL_TOKEN`,
  depends_on motor healthy).
- `Dockerfile`: limpiar el paso `build` desperdiciado (mantener `tsx`).
- `.env.production.example` (set de prod; `.env` real nunca se commitea).
- **Gate**: `typecheck` + `docker compose -f ... -f docker-compose.prod.yml config` válido + build de imágenes (sin `up`).
- **STOP-OK + commit** `chore(go-live): compose.prod + cloudflared + healthcheck 503 + dockerfile`.

### G4 — 🔴🔴 Config secretos + BD (gated; requiere cuentas + OK de cada write)
- **VPS** `.env` root:600 (service_role, ANTHROPIC, CREDENTIALS_ENCRYPTION_KEY [`openssl rand -hex 32`],
  YCLOUD_API_KEY, YCLOUD_BUSINESS_PHONE, TUNNEL_TOKEN, REDIS_URL=redis://redis:6379).
- **Cloudflare** (Iván: cuenta + dominio en Cloudflare + hostname, p.ej. `motor.vegahogar.es`): named tunnel →
  ruta public hostname → `http://motor:3010` → copiar `TUNNEL_TOKEN`.
- **Supabase** (con OK; vía script `scripts/seed-integration-accounts.mjs` — **a crear en G4**, cifra + inserta, revisar RETURNING):
  - `tenant_tokens` purpose `ycloud_webhook` (tenant 1).
  - `integration_accounts` provider `ycloud`: `credentials_encrypted` (api_key) + `webhook_secret` + `connection_config {business_phone}`.
  - `integration_accounts` provider `cal_com`: `credentials_encrypted` (api_key) + `webhook_secret`.
  - `calendar_accounts` provider `cal_com`: `external_calendar_id`=eventTypeId, `is_default=true`, `is_active=true`.
- **YCloud dashboard**: webhook → `https://<hostname>/webhooks/ycloud/<token>` + secret → BD.
- **Cal.com dashboard**: webhook → `https://<hostname>/webhooks/calcom/<token>` + secret → BD, eventos
  `BOOKING_CREATED/REQUESTED/RESCHEDULED/CANCELLED`.
- Re-run `test-rls-anon-leaks` 42/42 tras los inserts. **STOP-OK.**

### G5 — 🔴🔴 Deploy VPS + flags
- `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` en el VPS.
- Flags: `WHATSAPP_PROVIDER=ycloud`, `CALENDAR_PROVIDER=calcom`, `MOTOR_CRON_ENABLED=true`,
  `YCLOUD_WEBHOOK_VERIFY_MODE=enforce`, `CALCOM_WEBHOOK_VERIFY_MODE=enforce`.
- Verificar `curl https://<hostname>/health` 200 público + contenedores/healthchecks/cron OK. **STOP-OK.**

### G6 — 🔴🔴 Smoke en vivo golden path real
- WhatsApp real → webhook YCloud (HMAC enforce) → ingest → cron → pipeline 3-LLM (Claude real) → respuesta YCloud
  → lead recibe en su WhatsApp.
- Cal.com real → webhook (firma enforce) → conv a `handoff` `A_agenda` → verificar en panel `/conversations`.
- Auditar logs **sin secretos** + cron corriendo + dedup. Rollback probado. **STOP-OK.**

### G7 — 🔴 Cierre
- Completar §6 Runbook + memoria (`go_live_motor_completada.md` + MEMORY.md) + checkmarks.
- `git add` selectivo + diff + **OK Iván** + commit(s) + push. **Nunca `--force`.**

---

## 5. Validación end-to-end (criterios de cierre)

- **Por gate de código (G2/G3)**: `pnpm typecheck && lint && build` + `vitest run` (motor) + `test-rls-anon-leaks` **42/42**.
- **Smoke local (G1)**: `golden-path-smoke.mjs` verde con Claude real (providers mock).
- **Deploy (G5)**: `/health` 200 público por HTTPS; contenedores + healthchecks + cron OK.
- **Smoke en vivo (G6)**: WhatsApp real ida/vuelta + webhook Cal.com mueve la conversación + logs sin secretos.

---

## 6. Runbook

### 6.1 Arranque LOCAL sin Docker (MVP academia — validado 2026-07-02)
Cuando Docker Desktop no puede levantar (GUI no engancha, sesión no interactiva), el motor corre igual con
un Redis local + el motor por `tsx`. Requisitos: `pnpm install` hecho + `.env.local` con `ANTHROPIC_API_KEY` y
`MOTOR_CRON_ENABLED=true` (`CREDENTIALS_ENCRYPTION_KEY` e `INTERNAL_STATS_TOKEN` son **opcionales** — vacías OK;
si se rellenan deben ser válidas: 64-hex / ≥16 chars).

Redis sin Docker: en Windows, Memurai o Redis dentro de WSL. Si tampoco hay sudo en WSL, se puede extraer en
modo usuario (`cd ~ && apt-get download redis-server redis-tools libjemalloc2 liblzf1 && for f in *.deb; do
dpkg -x "$f" root; done` + lanzar `LD_LIBRARY_PATH=~/root/usr/lib/x86_64-linux-gnu ~/root/usr/bin/redis-server
--port 6379 --bind 0.0.0.0 --protected-mode no --save ""`). Para levantar todo:
```powershell
# 1) Redis (dejar la terminal abierta): tu redis local en :6379 (Memurai / WSL / userspace)
# 2) Motor (otra terminal, desde la raíz del repo):
pnpm --filter @vega-hogar/motor dev
# 3) Verificar:
curl http://localhost:3010/health          # -> {"status":"ok","checks":{"redis":true,"supabase":true}}
node scripts/golden-path-smoke.mjs         # golden path 3-LLM (Claude real); luego --cleanup
```
Parar: cerrar ambas terminales (o Ctrl-C). No es un despliegue de producción — es ejecución local para demo/MVP.

### 6.2 Producción (se completa en G7 tras el deploy real)
> Pendiente: comandos de deploy/redeploy en VPS, rollback (flags a mock / `compose down` / ruta del tunnel OFF),
> troubleshooting de webhooks (firma inválida, 401 enforce, dedup), rotación de secretos, lectura de logs.

---

## 7. Riesgos

1. **Webhook YCloud mal portado** (🔴) → espejo fiel de mock+calcom + tests firma/ack/dedup + smoke en vivo (G2/G6).
2. **HMAC enforce rechaza tráfico legítimo** (🔴) → si hace falta, `warn` primero en G5 para validar firmas reales,
   luego `enforce`; rawBody bien capturado (content-type parser de `server.ts`).
3. **Cloudflare Tunnel altera el body** (🟠) → no lo hace; HMAC sobre `request.rawBody`. Confirmar en smoke.
4. **Secreto/credencial fuga en logs** (🔴) → `safeLogBody` auditado en vivo (G6).
5. **service-role fuera del motor** (🔴) → `.env` solo en VPS; nada en el panel (Vercel).
6. **Cron spamea / double-booking** (🟠) → debounce + dedup + re-valida slot en `agendar_visita`. Cron solo ON en prod.
7. **E.164 mal formado → YCloud rechaza** (🟠) → validación en `lead-ingest` (G2).
8. **Daemon `backup` racea el commit** (🟠) → sub-pasos atómicos; **nunca `--force`**.

---

## 8. Pasos manuales de Iván (externos)

- **G1**: rellenar `ANTHROPIC_API_KEY` en `.env.local` + correr el smoke local.
- **G4**: cuenta Cloudflare + dominio en Cloudflare + hostname · named tunnel (token) · YCloud webhook + secret ·
  Cal.com webhook + secret + eventTypeId · `.env` en VPS (`chmod 600`).
- **G5**: `docker compose ... up -d` en el VPS (o guiado por SSH).
- **G6**: enviar el WhatsApp real de prueba desde un móvil.

---

## 9. Fuera de scope (otras fases)

Bienvenida proactiva + plantilla Meta + seed `followup_templates` · `FOLLOWUP_CRON` (sin implementar) · voz (F12) ·
Meta Ads (F13) · dashboard KPIs (F11) · Sentry/CI (F14) · compilar el motor a `dist/`.
