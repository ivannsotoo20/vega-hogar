# ONBOARDING — Tu comercial IA en local (60-90 min)

Guía para montar el sistema completo en tu máquina con **tu propio Supabase** y
**tu propia inmobiliaria**. Al final tendrás: panel funcionando, motor 3-LLM
respondiendo WhatsApp (simulado) con la voz de TU marca, y un smoke test verde.

> **Atajo recomendado**: abre este repo en **Claude Code** y dile
> *"configura mi comercial"* — la skill `onboarding-comercial` te lleva de la
> mano por todo esto (entrevista incluida). Esta guía es el mismo flujo en papel.

---

## 1. Qué vas a construir

```
WhatsApp (simulado) ──▶ apps/motor (Fastify)          apps/panel (Next.js 16)
      webhook            debounce Redis ─▶ pipeline      CRM: leads, pipeline,
                         3-LLM Claude (Generator →       conversaciones, inmuebles,
                         Judge → Splitter)               visitas, cerebro de prompts
                              │                                   │
                              └────────── Supabase (Postgres + Auth + RLS) ──────┘
```

El canal real de WhatsApp (YCloud) y Cal.com ya están codeados y gated por flags —
en local trabajas con el **driver mock** (no necesitas cuentas de BSP).

## 2. Prerrequisitos

| Qué | Dónde | Notas |
|---|---|---|
| Node.js 22 | nvm/fnm (`.nvmrc`) | `nvm use` |
| pnpm 10.33 | `corepack enable && corepack prepare pnpm@10.33.0 --activate` | |
| Cuenta Supabase | supabase.com → **New project** (región EU) | Gratis |
| API key Anthropic | console.anthropic.com | Saldo mínimo ~5 USD (cada smoke ≈ 0,02 USD) |
| Docker Desktop | docker.com | **Opcional** — solo te ahorra instalar Redis a mano |

**Claves de Supabase** (las necesitarás en el paso 3):
- **Settings → API**: `Project URL`, `anon (public) key`, `service_role key`.
- **Connect → Session pooler**: URI con puerto **5432** (¡no el transaction
  pooler 6543, rompe las migraciones; y la conexión directa es solo-IPv6!).

## 3. Variables de entorno (2 ficheros)

**a) `.env.local` en la raíz** — copia `.env.example` y rellena:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (⚠ jamás en el panel/browser) |
| `DATABASE_URL` y `DIRECT_URL` | URI del Session pooler (5432). Password con símbolos → percent-encoding |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `ANTHROPIC_API_KEY` | tu clave `sk-ant-...` |
| `MOTOR_CRON_ENABLED` | `true` (sin esto el motor no procesa mensajes) |

Deja **vacías** `CREDENTIALS_ENCRYPTION_KEY` e `INTERNAL_STATS_TOKEN` (si las
rellenas a medias el motor no arranca: exigen 64-hex / ≥16 chars).

**b) `apps/panel/.env.local`** — créalo (Next.js NO lee el de la raíz):

```env
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

## 4. Base de datos (5 comandos, en este orden)

```bash
pnpm install
node scripts/db-apply-migrations.mjs      # 42 tablas (migraciones 001-018)
node scripts/db-apply-policies.mjs        # RLS estricto por tenant
node scripts/seed-permissions-matrix.mjs  # matriz de permisos por rol
pnpm --filter @vega-hogar/motor exec tsx ../../packages/db/seeds/00-vega-hogar.ts  # tenant demo + 35 inmuebles + 20 leads
node scripts/seed-engine.mjs              # fases, labels, keywords, configs del motor
```

## 5. Personaliza tu agente (⚠ ANTES de publicar prompts)

Edita `apps/motor/prompts/source/agencia-vega.md`: **mantén el frontmatter tal
cual** (`block_key: agencia_vega`, `tenant_id: 1`, `sort_order: 5`) y reescribe
el cuerpo con TU inmobiliaria (identidad, voz, líneas rojas — conserva siempre:
nunca comisiones ni datos del propietario; tasación/negociación las cierra una
persona). Luego:

```bash
pnpm prompts:build-seed                   # publica los 3 bloques (UNA sola vez)
node scripts/onboarding-tenant.mjs --name "Tu Inmobiliaria" --city "Tu Ciudad"
```

> El publish funciona una sola vez (guard "seed-si-placeholder"): a partir de
> ahí la voz se edita desde el panel en `/admin/cerebro` (con versionado y
> rollback), no re-editando el markdown. Si publicaste sin personalizar, no
> pasa nada: edítala en el Cerebro.

> El catálogo demo (35 inmuebles) es de Valencia — son datos de práctica; tu
> agente los usará aunque tu inmobiliaria sea de otra ciudad.

## 6. Tu usuario admin

```bash
node scripts/onboarding-admin.mjs --email tu@email.com --password 'TuPass123!' --name "Tu Nombre"
```

Entra en `http://localhost:3000/login` con **email + password** (pestaña
password). El magic link NO funciona el primer día: el SMTP integrado de
Supabase solo envía a miembros del proyecto.

## 7. Arrancar

**Con Docker** (recomendado):
```bash
docker compose up --build                    # motor (:3010) + redis
pnpm --filter @vega-hogar/panel dev          # panel (:3000), otra terminal
```

**Sin Docker**: Redis por tu cuenta (`docker run -p 6379:6379 redis:7-alpine`,
o Memurai/WSL en Windows) y:
```bash
pnpm --filter @vega-hogar/motor dev
pnpm --filter @vega-hogar/panel dev
```

Comprueba: `curl http://localhost:3010/health` → `{"status":"ok", "checks":{"redis":true,"supabase":true}}`.

## 8. La prueba de fuego 🔥

```bash
node scripts/golden-path-smoke.mjs
```

Esto simula un WhatsApp entrante → debounce → pipeline 3-LLM (Claude real) →
respuesta en la voz de TU inmobiliaria → outbox mock. Debe terminar en
`OK ✅ golden path completo` (coste ≈ 0,02 USD). Después:

```bash
node scripts/golden-path-smoke.mjs --cleanup   # borra el lead de prueba
```

Y en el panel: `/conversations` (verás la conversación del smoke, el outbox mock
y el composer), `/leads`, `/properties`, `/admin/cerebro`.

## 9. Troubleshooting (los errores de verdad)

| Síntoma | Causa | Fix |
|---|---|---|
| Panel: `Missing NEXT_PUBLIC_SUPABASE_URL` | Falta `apps/panel/.env.local` | Paso 3b |
| Motor: `FATAL: invalid environment variables` | Var opcional rellena a medias | `CREDENTIALS_ENCRYPTION_KEY`/`INTERNAL_STATS_TOKEN` vacías o válidas (64-hex / ≥16) |
| Migraciones: `SASL` / timeout | `DATABASE_URL` con password sin percent-encode, o pooler equivocado | Session pooler 5432 |
| `seed-engine`: `FATAL: tenant id=1 not found` | Saltaste el seed demo | Paso 4, penúltimo comando |
| Smoke: HTTP 404 en el webhook | Falta el token mock | `node scripts/seed-engine.mjs` |
| Smoke: `INCOMPLETO ⚠` tras 45s | Cron OFF o Anthropic sin saldo | `MOTOR_CRON_ENABLED=true` en `.env.local` + revisa saldo; mira logs del motor |
| Login: magic link no llega | SMTP de Supabase limitado | Usa password (paso 6) |
| Motor no conecta a Redis | Redis no está arriba | Paso 7 |
| `prompts:build-seed`: skip 3 | Ya publicaste antes | Edita la voz en `/admin/cerebro` |
| pnpm pide "approve builds" | Allowlist de build scripts | Aprueba solo prisma/esbuild |

## 10. Y ahora qué

- **Itera la voz** de tu agente en `/admin/cerebro` (borrador → publicar → versionado).
- **Simula conversaciones** posteando al webhook mock (mira `scripts/golden-path-smoke.mjs`).
- **Explora los SOPs** en `docs/sops/` — el diario de construcción fase a fase del sistema.
- **Canal real**: el webhook YCloud + Cal.com ya están codeados (gated por flags
  `WHATSAPP_PROVIDER` / `CALENDAR_PROVIDER` / `*_WEBHOOK_VERIFY_MODE`) — conectarlos
  requiere cuentas reales y exponer el motor por HTTPS (ver `docs/sops/go-live-motor.md`).
