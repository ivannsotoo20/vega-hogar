# Vega Hogar — Sistema centralizado + Agente comercial IA

> Sistema centralizado tipo Fyzon Type 1 (panel Next.js) + agente comercial IA tipo Type 2
> (motor Fastify) construidos **conjuntamente con la comunidad de formación** sobre una
> inmobiliaria española ficticia, **Vega Hogar Inmobiliaria** (Valencia, 1998).

**Doble propósito**:

1. **Formativo** — la comunidad ve el ciclo completo de construcción del stack canónico
   Fyzon (Next.js 16 + Supabase + Vercel + Fastify + VPS + Claude Agent SDK) en 12-15
   clases (~6-8 meses), siguiendo SOPs detallados con branches checkpoint por fase.
2. **Showcase vertical Fyzon Inmobiliaria** — skin in the game que la vertical inmobiliaria
   carece hoy. Cuando esté operativo será el caso demo verificable para vender la vertical.

**Plan maestro**: `~/.claude/plans/vamos-a-hacer-un-flickering-marble.md` (aprobado 2026-05-21).
**Fase actual**: Fase 0 — Kickoff técnico.

---

## Arquitectura (resumen ejecutivo)

```
┌──────────────────────────┐     ┌─────────────────────────┐
│ apps/panel (Next.js 16)  │     │ apps/motor (Fastify 5)  │
│ → Vercel                 │     │ → VPS Contabo + Docker  │
│ Tailwind 4 + shadcn/ui   │     │ Redis (cadencia)        │
└──────────┬───────────────┘     └────────────┬────────────┘
           │                                   │
           │           ┌───────────────────────┘
           │           │
           ▼           ▼
       ┌─────────────────────────┐
       │ Supabase (Postgres)     │
       │ Auth + Storage + RLS    │
       └─────────────────────────┘

Canales del agente: WhatsApp (YCloud BSP) + Voz (Zadarma + ElevenLabs + STT)
Ads: Meta Marketing API vía Composio
```

Detalle en [docs/architecture.md](docs/architecture.md).

---

## Cómo arrancar (Fase 0)

### Requisitos previos

- **Node.js 22 LTS** — controlado vía `.nvmrc`. Con `nvm` o `fnm`: `nvm use`.
- **pnpm 10.33+** — `corepack enable && corepack prepare pnpm@10.33.0 --activate`.
- **Docker Desktop** (opcional en Fase 0 — necesario desde Fase 5 para el motor).
- Cuenta GitHub, Supabase, Vercel — solo si vas a desplegar.

### Pasos

```bash
# 1. Instalar dependencias del monorepo
pnpm install

# 2. Copiar variables de entorno (rellenar manualmente lo que aplique)
cp .env.example .env.local

# 3. Verificar typecheck
pnpm typecheck

# 4. Arrancar el panel en dev
pnpm --filter @vega-hogar/panel dev
# → http://localhost:3000 (landing placeholder Vega Hogar)

# 5. Arrancar el motor en dev (otra terminal)
pnpm --filter @vega-hogar/motor dev
# → http://localhost:3010/health → { status: "ok", ... }
# (puerto 3010 para no chocar con otros motores Fyzon que usan :3001)

# 6. (Opcional) Stack motor + redis vía Docker
docker compose up --build
```

---

## Estructura del monorepo

```
vega-hogar/
├── apps/
│   ├── panel/                # Next.js 16 + Tailwind 4 + shadcn/ui → Vercel
│   └── motor/                # Fastify 5 + Node 22 → VPS Contabo
├── packages/
│   ├── db/                   # Prisma + cliente Supabase (Fase 1)
│   ├── agent-pipeline/       # 3-LLM Generator/Judge/Splitter (Fase 6)
│   ├── channel-adapters/     # WhatsApp (YCloud + mock) + voz Zadarma (Fase 5/8)
│   ├── composio-actions/     # Meta Ads vía Composio (Fase 12)
│   └── shared-validator/     # Guardrails V0-V16 (Fase 6)
├── docs/
│   ├── architecture.md
│   ├── inmobiliaria-ficticia.md   # lore Vega Hogar
│   └── sops/                       # 1 SOP por fase del roadmap
├── docker-compose.yml         # motor + redis local
├── turbo.json                 # pipeline build/dev/typecheck/test
├── tsconfig.base.json
├── pnpm-workspace.yaml
├── CLAUDE.md                  # biblia técnica del repo
└── README.md
```

---

## Roadmap (15 fases)

| Fase | Título | Duración |
|---|---|---|
| **00** | Kickoff técnico | 1 semana |
| 01 | Modelo de datos Supabase + RLS + seed | 2 sem |
| 02 | Auth panel + 5 roles + permisos | 1 sem |
| 03 | Catálogo inmuebles | 1-2 sem |
| 04 | Leads + visitas + asignación round-robin | 2 sem |
| 05 | Motor base + ingesta WhatsApp | 2 sem |
| 06 | Pipeline 3-LLM agente IA texto | 2-3 sem |
| 07 | Cualificación dual comprador + vendedor | 2 sem |
| 08 | Voz custom Zadarma + ElevenLabs | 3 sem |
| 09 | Cadencia multicanal 3 pasos | 2 sem |
| 10 | Notificaciones WhatsApp internas | 1 sem |
| 11 | Módulo captación vendedores + form web | 2 sem |
| 12 | Meta Ads vía Composio | 2-3 sem |
| 13 | Testing + hardening (RLS, HMAC, redaction) | 1-2 sem |
| 14 | CI/CD + observabilidad + deploy producción | 1-2 sem |
| 15 | Verification end-to-end + demo final | 1 sem |

Cada fase = 1 SOP en `docs/sops/` + 1 clase comunidad + branch `checkpoint/fase-NN`.
Detalle en `~/.claude/plans/vamos-a-hacer-un-flickering-marble.md`.

---

## Documentación clave

- [CLAUDE.md](CLAUDE.md) — biblia técnica del repo (reglas no negociables, comandos, qué NO hacer)
- [docs/architecture.md](docs/architecture.md) — diagrama + flujos
- [docs/inmobiliaria-ficticia.md](docs/inmobiliaria-ficticia.md) — lore Vega Hogar (sedes, equipo, catálogo, paleta)
- [docs/sops/fase-00-kickoff.md](docs/sops/fase-00-kickoff.md) — SOP de Fase 0 (este sub-paso)

---

## Licencia y autoría

Proyecto formativo de **Fyzon** (Iván Soto). Repo privado.
