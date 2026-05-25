# CLAUDE.md — Vega Hogar

Reglas operativas para Claude Code cuando trabajes en este repo. Complemento (no reemplazo)
de `~/.claude/CLAUDE.md` global y de la memoria del proyecto en
`~/.claude/projects/C--Users-sotob-comercial-inmobiliaria/memory/`.

---

## Qué es esto

Sistema centralizado tipo Fyzon Type 1 (panel Next.js 16) + agente comercial IA tipo Type 2
(motor Fastify) sobre una inmobiliaria española ficticia, **Vega Hogar Inmobiliaria**
(Valencia, 1998). Construcción conjunta con la comunidad de formación en 12-15 fases
(~6-8 meses). Doble propósito: formativo + showcase para la vertical Fyzon Inmobiliaria.

**Plan maestro**: `~/.claude/plans/vamos-a-hacer-un-flickering-marble.md` (aprobado 2026-05-21).
**Plan de la fase actual**: `~/.claude/plans/arrancamos-fase-0-del-quiet-zebra.md`.
**Memoria del proyecto**: `~/.claude/projects/C--Users-sotob-comercial-inmobiliaria/memory/MEMORY.md`.

---

## Estructura del monorepo

```
apps/
  panel/                # Next.js 16 + Tailwind 4 + shadcn/ui → Vercel
  motor/                # Fastify 5 + Node 22 → VPS Contabo
packages/
  db/                   # Prisma + cliente Supabase
  agent-pipeline/       # 3-LLM Generator/Judge/Splitter
  channel-adapters/     # WhatsApp (YCloud + mock) + voz Zadarma
  composio-actions/     # Meta Ads vía Composio
  shared-validator/     # Guardrails V0-V16
docs/
  architecture.md
  inmobiliaria-ficticia.md
  sops/                 # 1 SOP por fase
docker-compose.yml      # motor + redis local
turbo.json
pnpm-workspace.yaml
tsconfig.base.json
```

---

## Reglas no negociables

1. **Constructor por fases con validación de Iván**. Cada fase = 1 SOP + 1 clase + branch
   `checkpoint/fase-NN`. No avanzar sin OK explícito. No entregar todo de golpe.
2. **Service role Supabase solo en motor**. `SUPABASE_SERVICE_ROLE_KEY` jamás entra al panel
   ni al browser. Panel usa `NEXT_PUBLIC_SUPABASE_ANON_KEY` + RLS + matriz de permisos.
3. **Toda tabla con `tenant_id` lleva RLS estricto** (Fase 1+). `ENABLE ROW LEVEL SECURITY`
   + policies para SELECT/INSERT/UPDATE/DELETE (o `FOR ALL` que cubra los 4).
4. **Stack canónico cerrado**. Next.js 16 + Tailwind 4 + Supabase + Prisma + Fastify + Docker
   + Redis + Claude API. No proponer alternativas (Drizzle, Hono, Vapi, Retell) sin reabrir
   explícitamente con Iván — son anti-jugadas declaradas.
5. **Un agente IA con dos flujos internos** (decisión C5). No multi-agent router con
   sub-agentes. Detecta intención comprador/inquilino vs vendedor/arrendador en el primer
   turno y activa rama correspondiente.
6. **Canales del agente**: WhatsApp (YCloud) + voz custom (Zadarma + ElevenLabs + STT).
   NO email, NO web chat, NO Vapi/Retell (decisiones C8 + voz custom).
7. **Cifras conservadoras en seed data** (DEC-007). Nada de cifras inflacionadas que no
   aguanten escrutinio.
8. **Cero commits sin OK de Iván**. Preparar cambios, revisar diff, esperar approval.
   Nunca `--no-verify` salvo petición explícita.
9. **Editar prompts del agente** (cuando exista, Fase 6+): siempre via markdown source en
   `apps/motor/prompts/source/` + script `prompts:build-seed` + snapshot en
   `prompt_block_versions`. Nunca tocar `prompt_blocks` directo en BD.
10. **Seguridad — reglas duras** (cuando entren las features, Fase 13):
    - HMAC verify de webhooks en `enforce` en producción.
    - `safeLogBody()` en todos los logs (nunca loggear payloads raw con tokens).
    - `timingSafeEqual` para comparar tokens — nunca `===`.
    - Funciones `SECURITY DEFINER` con `SET search_path = public, pg_temp` y
      `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`.
    - URLs externas que entren del usuario → `assertHttpsUrl`.

---

## Decisiones técnicas cerradas

| Ítem | Valor |
|---|---|
| Node | 22 LTS (`.nvmrc`) |
| Package manager | pnpm@10.33 + Turborepo |
| ORM | Prisma |
| DB | Supabase Postgres (eu-central-1 Frankfurt) |
| Auth panel | Supabase magic link SSR |
| Cache/queue | Redis (ioredis) |
| HTTP server motor | Fastify 5 |
| AI | Anthropic Claude (Haiku 4.5 default, Sonnet 4.6 para tareas complejas) |
| WhatsApp BSP | YCloud (mismo que setters_ia) + driver mock para alumnos |
| Voz PSTN | Zadarma (España) + ElevenLabs (TTS) + Deepgram/Whisper (STT, decisión Fase 8) |
| Ads | Meta Marketing API vía Composio (`@composio/core@^0.10.0` — NO el deprecated `composio-core`) |
| Deploy panel | Vercel (preview deployments por rama) |
| Deploy motor | VPS Contabo + Docker Compose (Fase 5+) |
| Tests | Vitest |

**shadcn/ui — pendiente de inicialización**: la versión mayo 2026 de `shadcn@latest init`
exige preset interactivo (Nova/Vega/Maia/Lyra/Mira/Luma/Sera/Custom) sin flags non-interactive
estables. Iván lo lanza manualmente en Fase 2 cuando empiece a construir componentes reales
del panel (`/login`, `/dashboard`). Mientras tanto la landing usa la paleta Vega Hogar
directo desde `globals.css` (tokens `brand-*`).

---

## Comandos frecuentes

```bash
pnpm install                                # instala todo el monorepo
pnpm dev                                    # turbo dev (panel + motor en paralelo)
pnpm --filter @vega-hogar/panel dev         # solo panel → localhost:3000
pnpm --filter @vega-hogar/motor dev         # solo motor → localhost:3010
pnpm typecheck                              # tsc --noEmit en todo
pnpm test                                   # vitest en todos los packages
pnpm build                                  # turbo build

docker compose up --build                   # motor + redis locales
curl localhost:3010/health                  # smoke del motor

# DB (desde Fase 1):
pnpm --filter @vega-hogar/db prisma:generate
pnpm --filter @vega-hogar/db prisma:migrate:dev
```

---

## Variables de entorno

Plantilla canónica: `.env.example`. Personal: `.env.local` (gitignored). Iván lo rellena
con credenciales reales. Las variables se introducen por fase — `.env.example` documenta
en qué fase aplica cada bloque.

---

## Doctrina del proyecto

### Anti-jugadas (NO hacer, ver `~/.claude/projects/.../anti_jugadas.md`)

**Técnicas**:
- NO bot WhatsApp scripted (el agente es Claude con tool use real).
- NO multi-agent router.
- NO email como canal del agente.
- NO tasación IA (recopila datos y agenda visita técnica humana).
- NO negociación libre del agente (solo registra contraoferta y escala).
- NO Vapi/Retell.
- NO cambio de stack canónico sin reabrir con Iván.

**Dominio**:
- NO rent-to-rent, alquileres vacacionales ni venta a extranjeros.
- NO inflar cifras en seed data.
- NO sobreproducción de contenido orgánico (web Vega Hogar limpia).
- NO copiar tono New School juvenil. Voz Vega Hogar = tradicional cercana sin hype.

**Proceso**:
- NO entregar todo de golpe — checkpoints por fase.
- NO modificar doctrina prompt sin sincronizar markdown source.
- NO commits sin OK Iván.
- NO bypass de hooks pre-commit.

---

## Cuando arranques una sesión en este repo

1. Leer este `CLAUDE.md` completo.
2. Leer la memoria del proyecto: `~/.claude/projects/C--Users-sotob-comercial-inmobiliaria/memory/MEMORY.md`.
3. Leer el plan de la fase actual: `~/.claude/plans/arrancamos-fase-0-del-quiet-zebra.md` (o
   el que corresponda).
4. Leer el SOP de la fase actual en `docs/sops/fase-NN-*.md`.
5. Si vas a tocar el motor, consultar también `~/.claude/setters_ia/CLAUDE.md` (modelo ~85%
   reutilizable, especialmente para Fase 6 — pipeline 3-LLM).
6. Si vas a tocar Composio / Meta Ads, consultar el daily summary
   `~/.claude/skills/_daily-summaries/2026-05-20.md` (patrón Día 3 Fyzon RUS).

---

## Qué NO hacer (operativa Claude)

- No añadir Express si existe Fastify.
- No introducir paquetes adicionales (Drizzle, Knex, otras libs HTTP) sin conversación previa.
- No crear `.md` de análisis o "cómo va el proyecto" si Iván no los pide — está la memoria
  y el plan maestro.
- No hacer commits sin que Iván los pida. Preparamos cambios, Iván revisa, Iván aprueba.
- No tocar `~/.claude/CLAUDE.md` global ni la memoria sin pedir.
- No proponer "limpiezas" o "refactors" colaterales en la misma sesión que una feature.
