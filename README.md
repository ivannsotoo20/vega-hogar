# Vega Hogar — Sistema centralizado + Agente comercial IA

> CRM inmobiliario (panel Next.js 16) + **agente comercial IA por WhatsApp** (motor
> Fastify + pipeline 3-LLM con Claude), construidos **fase a fase con una comunidad de
> formación** sobre una inmobiliaria española ficticia, **Vega Hogar Inmobiliaria**
> (Valencia, 1998).

**Estado**: MVP funcional. Panel completo (leads, pipeline, conversaciones, inmuebles,
visitas, captación, admin + cerebro de prompts) · motor conversacional 3-LLM operativo
contra el driver mock de WhatsApp · canal real (YCloud + Cal.com con HMAC) codeado y
gated por flags. 42 tablas con RLS estricto, 90+ tests.

---

## 🎓 Para la comunidad — monta TU comercial IA

Clona el repo y en **60-90 min** tienes el sistema corriendo en local con tu propio
Supabase y tu propia inmobiliaria (el agente habla con TU voz de marca):

```bash
git clone https://github.com/ivannsotoo20/vega-hogar.git && cd vega-hogar
```

**Camino recomendado**: abre el repo en **Claude Code** y di *"configura mi comercial"*
— la skill `onboarding-comercial` te entrevista y monta todo (BD, seeds, prompts
personalizados, tu usuario admin, smoke test).

**Camino manual**: sigue [ONBOARDING.md](ONBOARDING.md) paso a paso.

Necesitas: Node 22, pnpm 10.33, una cuenta Supabase (gratis) y una API key de Anthropic
(~5 USD de saldo; cada conversación de prueba cuesta ~0,02 USD). Docker opcional.
**No necesitas** cuentas de WhatsApp/YCloud ni Cal.com — en local se trabaja con el
driver mock.

> ⚠ Proyecto **formativo**: el catálogo demo (35 inmuebles de Valencia), los leads y el
> equipo son ficticios, con cifras conservadoras. Cada instalación usa SU Supabase y SUS
> claves — nada se comparte.

---

## Arquitectura (resumen ejecutivo)

```
┌──────────────────────────┐     ┌──────────────────────────────┐
│ apps/panel (Next.js 16)  │     │ apps/motor (Fastify 5)       │
│ → Vercel                 │     │ → Docker (VPS)               │
│ Tailwind 4 + shadcn/ui   │     │ Redis (debounce + dedup)     │
│ anon key + RLS           │     │ service_role (solo aquí)     │
└──────────┬───────────────┘     └────────────┬─────────────────┘
           │                                   │
           ▼                                   ▼
       ┌──────────────────────────────────────────┐
       │ Supabase (Postgres + Auth + RLS estricto)│
       └──────────────────────────────────────────┘

Flujo del agente:  WhatsApp (YCloud real o mock) → webhook → debounce Redis
  → pipeline 3-LLM (Generator → Judge → Splitter, guardrails V00-V19)
  → respuesta multi-burbuja + tools (buscar inmuebles, agendar visita, escalar)
Agenda: Cal.com v2 (webhooks HMAC; `visits` = verdad, Cal.com = espejo)
```

Detalle en [docs/architecture.md](docs/architecture.md).

---

## Estructura del monorepo

```
vega-hogar/
├── apps/
│   ├── panel/                # Next.js 16 + Tailwind 4 + shadcn/ui → Vercel
│   └── motor/                # Fastify 5 + Node 22 → Docker (VPS)
├── packages/
│   ├── db/                   # Prisma + cliente Supabase + migraciones + seeds
│   ├── agent-pipeline/       # 3-LLM Generator/Judge/Splitter
│   ├── prompt-composer/      # system prompt desde prompt_blocks (cache two-point)
│   ├── channel-adapters/     # WhatsApp (YCloud + mock)
│   ├── composio-actions/     # Meta Ads vía Composio (futuro)
│   └── shared-validator/     # Guardrails V00-V19
├── docs/
│   ├── architecture.md
│   ├── inmobiliaria-ficticia.md   # lore Vega Hogar
│   └── sops/                       # 1 SOP por fase — el DIARIO DE CONSTRUCCIÓN
├── scripts/                   # setup BD, seeds, onboarding, smokes, auditorías RLS
├── ONBOARDING.md              # guía: monta tu instancia en 60-90 min
├── CLAUDE.md                  # biblia técnica del repo
└── docker-compose.yml         # motor + redis local
```

---

## Cómo se construyó (fases reales)

Cada fase = 1 SOP en `docs/sops/` + branch `checkpoint/fase-NN` (los branches se
conservan como hitos de clase):

| Fase | Qué entró |
|---|---|
| 00 | Kickoff: monorepo, Supabase, Vercel, esqueletos |
| 01 | Modelo de datos (16 tablas) + RLS + seed Vega Hogar |
| 02 | Auth SSR magic-link/password + 5 roles + matriz de permisos |
| 03-04 | Port de la base SaaS: shell del panel, 24 tablas operativas del motor, RLS patrón `current_tenant()` |
| 05-08 | Módulos del panel: `/leads` (+GDPR), `/pipeline` + `/conversations`, `/properties`, `/visits` + `/captacion` |
| 09 | Admin agencia + **Cerebro** (editor de prompts con versionado) + invites |
| 10 | **Motor conversacional**: pipeline 3-LLM, webhooks (mock + YCloud + Cal.com), agent-tools, cron, seguridad HMAC |
| go-live | Webhook YCloud real + runbook local + onboarding comunidad (este MVP) |
| Futuro | Dashboard KPIs (F11) · Voz (F12) · Meta Ads (F13) · CI/CD + observabilidad (F14) |

---

## Comandos frecuentes

```bash
pnpm install                                # deps del monorepo
pnpm --filter @vega-hogar/panel dev         # panel → localhost:3000
pnpm --filter @vega-hogar/motor dev         # motor → localhost:3010
docker compose up --build                   # motor + redis vía Docker
pnpm typecheck && pnpm test                 # gates

node scripts/golden-path-smoke.mjs          # e2e: WhatsApp mock → 3-LLM → respuesta
node scripts/test-rls-anon-leaks.mjs        # auditoría RLS (42/42)
```

---

## Documentación clave

- [ONBOARDING.md](ONBOARDING.md) — monta tu instancia (comunidad)
- [CLAUDE.md](CLAUDE.md) — biblia técnica (reglas no negociables, comandos, anti-jugadas)
- [docs/architecture.md](docs/architecture.md) — diagrama + flujos
- [docs/inmobiliaria-ficticia.md](docs/inmobiliaria-ficticia.md) — lore Vega Hogar
- [docs/sops/](docs/sops/) — el diario de construcción, fase a fase

---

## Licencia y autoría

Proyecto formativo de **Fyzon** (Iván Soto), abierto a la comunidad de formación.
Los datos de la inmobiliaria son ficticios. Usa el código para aprender y para tu
propia instancia; no re-vendas el sistema tal cual sin permiso del autor.
