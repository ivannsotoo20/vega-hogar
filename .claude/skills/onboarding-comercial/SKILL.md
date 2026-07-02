---
name: onboarding-comercial
description: >-
  Onboarding completo del proyecto Vega Hogar — de repo recién clonado a TU
  comercial IA personalizado corriendo en local (Supabase propio + motor 3-LLM +
  panel + smoke verde). USAR cuando el usuario diga "configura mi comercial",
  "onboarding", "monta mi inmobiliaria", "personaliza el agente", "setup
  inicial", "empezar con el proyecto", o cuando se detecte una primera sesión en
  este repo SIN .env.local en la raíz.
---

# Onboarding Comercial IA — de Vega Hogar a TU inmobiliaria

Guías al usuario (miembro de la comunidad) desde el clon del repo hasta su propio
comercial IA funcionando en local, personalizado con la voz de SU inmobiliaria.
Trabaja por fases, valida cada paso antes de seguir, y usa un tono cercano — es
su primera experiencia con el sistema.

La versión humana de esta guía está en `ONBOARDING.md` (raíz) — si el usuario
prefiere leer, apúntale ahí. Los dos flujos son equivalentes.

## Fase 0 — Detección de estado (SIEMPRE primero)

Comprueba qué hay hecho antes de proponer nada (todos los pasos son idempotentes —
retoma donde se quedó, nunca repitas lo completado):

1. ¿Existe `.env.local` en la raíz? ¿Y `apps/panel/.env.local`? Comprueba solo
   PRESENCIA de las claves (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `DATABASE_URL`, `ANTHROPIC_API_KEY`, `MOTOR_CRON_ENABLED`) — **JAMÁS imprimas
   sus valores**.
2. ¿BD migrada? `node scripts/db-list-tables.mjs` (debe listar ~42 tablas).
3. ¿Tenant demo sembrado? ¿`prompt_blocks` aún en placeholder `-- PENDIENTE`?
4. ¿Motor/panel arrancan? ¿Smoke ya pasó alguna vez?

## Fase 1 — Prerrequisitos (guiar, NO ejecutar por él)

El usuario crea SUS cuentas — tú solo le dices dónde y qué copiar:

- **Node 22** (`.nvmrc`) + **pnpm 10.33** (`corepack enable && corepack prepare pnpm@10.33.0 --activate`).
- **Supabase**: New project (región EU). De **Settings → API**: `Project URL`,
  `anon key`, `service_role key`. De **Connect → Session pooler**: URI puerto
  **5432** → va en `DATABASE_URL` **y** `DIRECT_URL` (la conexión directa es
  solo-IPv6 y falla en muchas redes; el transaction pooler 6543 rompe las
  migraciones multi-statement). Passwords con símbolos → percent-encoding.
- **Anthropic**: console.anthropic.com → API key + saldo mínimo (~5 USD; cada
  smoke cuesta ~0,02 USD).
- **Docker Desktop** (opcional): solo evita instalar Redis a mano.

Config de ficheros (el usuario pega SUS claves con su editor — ver seguridad):

- `.env.local` raíz desde `.env.example` + **añadir `MOTOR_CRON_ENABLED=true`**.
  `CREDENTIALS_ENCRYPTION_KEY` e `INTERNAL_STATS_TOKEN` se dejan **vacías** (si
  se rellenan a medias, el motor hace fail-fast: 64-hex / ≥16 chars).
- `apps/panel/.env.local` (⚠ obligatorio, Next.js NO lee el de la raíz) con:
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Fase 2 — La ENTREVISTA (una pregunta cada vez, conversacional)

Recoge la identidad de su inmobiliaria (usa AskUserQuestion o conversación natural):

1. **Nombre comercial** de tu inmobiliaria y **ciudad**.
2. **Zonas/barrios** donde trabajáis.
3. ¿**Venta, alquiler o ambos**? ¿Captáis también propietarios que venden?
4. **Año de fundación y tamaño** (nº oficinas/equipo) — para la identidad.
5. **Tono**: ¿cercano-tradicional, moderno-directo o premium? ¿Tuteo o usted? ¿Emojis?
6. **Nombre del agente IA** (cómo se presenta por WhatsApp) y horario de atención.
7. **Líneas rojas**: qué NUNCA debe decir (además de las obligatorias). Si duda,
   defaults seguros.
8. **Diferencial**: ¿qué os hace distintos? (la frase que diría un cliente contento).

## Fase 3 — Generar el prompt del tenant

Reescribe `apps/motor/prompts/source/agencia-vega.md` con las respuestas:

- **Frontmatter INTACTO en sus keys**: `block_key: agencia_vega` · `tenant_id: 1` ·
  `sort_order: 5` (solo actualiza `description`). Cambiar `block_key` rompe el publish.
- Cuerpo `<agencia>…</agencia>` con las 3 secciones canónicas del original:
  - `# {Nombre inmobiliaria}` — identidad: ciudad, año, tamaño, ADN.
  - `# Cómo hablamos (voz {marca})` — 4-6 bullets de tono derivados de la entrevista.
  - `# Qué cuidamos especialmente` — sus líneas rojas + **SIEMPRE mantener las
    obligatorias**: nunca comisiones/honorarios/datos del propietario; la tasación
    y la negociación las cierra una persona del equipo; derivar con naturalidad.
- **Muestra el resultado y pide OK explícito** antes de escribir el fichero.
- ⚠ ORDEN CRÍTICO: esto va ANTES de `pnpm prompts:build-seed`. El guard
  (Regla 9, seed-si-placeholder) publica UNA sola vez; después la voz se itera
  vía panel `/admin/cerebro`, no re-editando el markdown.

## Fase 4 — Ejecución ordenada (verifica el output de cada paso)

```bash
pnpm install                                                # 1. deps
node scripts/db-apply-migrations.mjs                        # 2. tablas 001-018
node scripts/db-apply-policies.mjs                          # 3. RLS
pnpm --filter @vega-hogar/motor exec tsx ../../packages/db/seeds/00-vega-hogar.ts   # 4. tenant demo (¡ANTES que 5 y 6!)
node scripts/seed-permissions-matrix.mjs                    # 5. matriz permisos (exige tenant 1)
node scripts/seed-engine.mjs                                # 6. motor (phases/labels/keywords/placeholders)
# 7. ← AQUÍ va la Fase 3 (personalizar agencia-vega.md)
pnpm prompts:build-seed                                     # 8. publicar prompts (una vez)
node scripts/onboarding-tenant.mjs --name "..." --city "..."       # 9. renombrar tenant
node scripts/onboarding-admin.mjs --email ... --password ...       # 10. TU admin
```

Levantar (dos rutas):
- **Con Docker**: `docker compose up --build` (motor+redis) + en otra terminal
  `pnpm --filter @vega-hogar/panel dev`.
- **Sin Docker**: Redis local (`docker run -p 6379:6379 redis:7-alpine`, o
  Memurai/WSL en Windows) + `pnpm --filter @vega-hogar/motor dev` + panel dev.

Verificar: `curl http://localhost:3010/health` → `{"status":"ok",...}`.

## Fase 5 — Verificación final (la prueba de fuego)

```bash
node scripts/golden-path-smoke.mjs            # inbound mock → 3-LLM → respuesta (~$0.02)
node scripts/golden-path-smoke.mjs --cleanup  # deja el seed pristino
```

Debe salir `OK ✅ golden path completo` con la respuesta en LA VOZ de su
inmobiliaria. Después: login en `http://localhost:3000/login` con **email +
password** (pestaña password — el magic link NO funciona el primer día: el SMTP
integrado de Supabase solo envía a miembros del proyecto). Tour: `/conversations`
(la conversación del smoke + outbox mock + composer), `/leads`, `/properties`
(35 inmuebles demo de Valencia — datos de práctica, avísale), `/admin/cerebro`
(donde itera la voz a partir de ahora).

Si el smoke sale `INCOMPLETO ⚠`: casi siempre es cron OFF (`MOTOR_CRON_ENABLED`
no está en `.env.local`) o `ANTHROPIC_API_KEY` sin saldo — mira los logs del motor.

## Qué esta skill NO hace (seguridad — no negociable)

- NO crea la cuenta/proyecto Supabase ni la cuenta Anthropic (identidad del usuario).
- NO acepta claves pegadas en el chat: si el usuario pega una API key o el
  service_role en la conversación, avísale de ROTARLA y de ponerla directamente
  en `.env.local` con su editor.
- NO imprime valores de `.env.local` (solo "presente/ausente"). NO lo commitea
  (está gitignored).
- NO desactiva RLS, NO toca policies, NO usa service_role en código del panel
  (regla 2 del proyecto).
- NO elige la password del admin: la teclea el usuario como argumento del script.
- NO apunta JAMÁS a una BD que no sea el proyecto Supabase del propio usuario.
