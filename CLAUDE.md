# CLAUDE.md — Vega Hogar

Reglas operativas para Claude Code cuando trabajes en este repo.

---

## Qué es esto

Sistema centralizado (panel Next.js 16) + agente comercial IA (motor Fastify) sobre una
inmobiliaria española ficticia, **Vega Hogar Inmobiliaria** (Valencia, 1998). Construido
fase a fase con una comunidad de formación (los SOPs de `docs/sops/` son el diario de
construcción). Doble propósito: formativo + showcase de la vertical Fyzon Inmobiliaria.

**¿Primera vez aquí?** Si no existe `.env.local` en la raíz, ofrece el onboarding: invoca
la skill **`onboarding-comercial`** (o sigue `ONBOARDING.md`) — monta el sistema completo
sobre el Supabase del usuario y personaliza el agente con SU inmobiliaria.

---

## Estructura del monorepo

```
apps/
  panel/                # Next.js 16 + Tailwind 4 + shadcn/ui → Vercel
  motor/                # Fastify 5 + Node 22 → Docker (VPS)
packages/
  db/                   # Prisma + cliente Supabase + migraciones + seeds
  agent-pipeline/       # 3-LLM Generator/Judge/Splitter
  prompt-composer/      # ensambla system prompt desde prompt_blocks (cache two-point)
  channel-adapters/     # WhatsApp (YCloud + mock) + voz (futuro)
  composio-actions/     # Meta Ads vía Composio (futuro)
  shared-validator/     # Guardrails V00-V19
docs/
  architecture.md
  inmobiliaria-ficticia.md
  sops/                 # 1 SOP por fase (diario de construcción)
scripts/                # setup BD, seeds, onboarding, smokes, auditorías RLS
docker-compose.yml      # motor + redis local
```

---

## Reglas no negociables

1. **Service role Supabase solo en motor**. `SUPABASE_SERVICE_ROLE_KEY` jamás entra al panel
   ni al browser. Panel usa `NEXT_PUBLIC_SUPABASE_ANON_KEY` + RLS + matriz de permisos.
2. **Toda tabla con `tenant_id` lleva RLS estricto**: `ENABLE ROW LEVEL SECURITY` + policies
   para SELECT/INSERT/UPDATE/DELETE. Gate: `node scripts/test-rls-anon-leaks.mjs` = 42/42.
   Anti-patrón conocido: nunca una policy `FOR ALL` junto a un SELECT scoped por fila.
3. **Stack canónico cerrado**. Next.js 16 + Tailwind 4 + Supabase + Prisma + Fastify + Docker
   + Redis + Claude API. No introducir alternativas (Drizzle, Hono, Express, Vapi/Retell)
   sin decisión explícita del propietario del proyecto.
4. **Un agente IA con dos flujos internos** (no multi-agent router). Detecta intención
   comprador/inquilino vs vendedor/arrendador en el primer turno y activa la rama.
5. **Canales del agente**: WhatsApp (YCloud + driver mock) + voz custom (futuro).
   NO email, NO web chat.
6. **Regla 9 — prompts del agente, BD como fuente de verdad**. Los prompts se editan vía el
   editor del panel `/admin/cerebro` (borrador → publicar → snapshot en
   `prompt_block_versions`). El markdown source del motor (`apps/motor/prompts/source/` +
   `pnpm prompts:build-seed`) es **seed-si-placeholder**: publica UNA vez sobre bloques
   vírgenes y NUNCA pisa lo publicado por la UI. No editar `prompt_blocks` a mano por SQL.
7. **Seguridad — reglas duras** (§10):
   - Verificación HMAC de webhooks con `*_WEBHOOK_VERIFY_MODE` (`disabled|warn|enforce`);
     **`enforce` obligatorio en producción**.
   - `safeLogBody()` en todos los logs de payloads (nunca loggear tokens en claro).
   - `timingSafeEqual` para comparar tokens/firmas — nunca `===`.
   - Funciones `SECURITY DEFINER` con `SET search_path = public, pg_temp` +
     `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`.
   - URLs externas que entren del usuario → `assertHttpsUrl`.
8. **Cifras conservadoras en datos demo** — nada inflado que no aguante escrutinio.
9. **El agente NO tasa ni negocia**: recopila datos, agenda visita técnica humana, y las
   contraofertas solo las registra y escala.

---

## Decisiones técnicas cerradas

| Ítem | Valor |
|---|---|
| Node | 22 LTS (`.nvmrc`) |
| Package manager | pnpm@10.33 + Turborepo |
| ORM / DB | Prisma + Supabase Postgres |
| Auth panel | Supabase magic link SSR + password |
| Cache/queue | Redis (ioredis) — debounce + dedup |
| HTTP server motor | Fastify 5 |
| AI | Anthropic Claude (pipeline 3-LLM; modelos en `llm_configs`) |
| WhatsApp BSP | YCloud (+ driver mock para desarrollo/formación) |
| Agenda | Cal.com v2 (webhooks HMAC; `visits` = verdad, Cal.com = espejo) |
| Deploy panel | Vercel |
| Deploy motor | Docker Compose (VPS) |
| Tests | Vitest |

---

## Comandos frecuentes

```bash
pnpm install                                # instala todo el monorepo
pnpm dev                                    # turbo dev (panel + motor)
pnpm --filter @vega-hogar/panel dev         # solo panel → localhost:3000
pnpm --filter @vega-hogar/motor dev         # solo motor → localhost:3010
pnpm typecheck && pnpm lint && pnpm build   # gates
pnpm test                                   # vitest en todos los packages

docker compose up --build                   # motor + redis locales
curl localhost:3010/health                  # smoke del motor

# BD (contra TU Supabase, .env.local):
node scripts/db-apply-migrations.mjs
node scripts/db-apply-policies.mjs
node scripts/test-rls-anon-leaks.mjs        # auditoría RLS (42/42)

# Golden path end-to-end (motor + redis arriba, MOTOR_CRON_ENABLED=true):
node scripts/golden-path-smoke.mjs          # + --cleanup al terminar
```

---

## Variables de entorno

Plantilla canónica: `.env.example` (por fases). Personal: `.env.local` (gitignored) +
`apps/panel/.env.local` (Next.js no lee el de la raíz). Setup guiado: `ONBOARDING.md`.

---

## Anti-jugadas (NO hacer)

**Técnicas**: NO bot scripted (el agente es Claude con tool use real) · NO multi-agent
router · NO email como canal · NO tasación IA · NO negociación libre del agente · NO
cambiar el stack canónico sin decisión explícita.

**Dominio**: NO rent-to-rent/vacacional/venta a extranjeros · NO inflar cifras demo ·
NO tono juvenil con hype — la voz base es tradicional cercana (cada instalación define
la suya en su bloque de agencia).

**Operativa Claude**: NO añadir Express si existe Fastify · NO introducir paquetes
nuevos sin conversación previa · NO crear `.md` de análisis no pedidos · NO bypass de
hooks pre-commit (`--no-verify`) · preparar cambios y revisar diff antes de commitear.

---

## Cuando arranques una sesión en este repo

1. Leer este `CLAUDE.md` completo.
2. Si no hay `.env.local` → ofrecer el onboarding (skill `onboarding-comercial` / `ONBOARDING.md`).
3. Leer el SOP de la fase en la que se trabaje (`docs/sops/`) — son el contexto real de
   cada módulo del sistema.
4. Si vas a tocar el motor: `apps/motor/src/services/process-debounced.ts` es el núcleo;
   los webhooks viven en `apps/motor/src/routes/` (mock, ycloud, calcom).
