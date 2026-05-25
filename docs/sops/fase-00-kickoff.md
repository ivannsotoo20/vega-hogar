# SOP — Fase 0 · Kickoff técnico

> **Objetivo único**: dejar el repo creado, monorepo skeleton funcionando en local,
> Supabase + Vercel provisionados, documentación inicial coherente y branch
> `checkpoint/fase-00`. Cero features funcionales todavía.
>
> **Duración estimada**: 1 semana.
> **Plan operativo**: `~/.claude/plans/arrancamos-fase-0-del-quiet-zebra.md`.
> **Plan maestro**: `~/.claude/plans/vamos-a-hacer-un-flickering-marble.md`.

---

## Pre-decisiones cerradas

| # | Decisión | Valor |
|---|---|---|
| D1 | Nombre repo GitHub | `vega-hogar` (en cuenta `ivannsotoo20`) |
| D2 | Scope pnpm packages | `@vega-hogar/<pkg>` |
| D3 | Naming Vercel proyecto | `vega-hogar-panel` |

---

## Sub-pasos (checklist)

### 0.1 — Pre-decisiones
- [x] D1/D2/D3 confirmados con Iván vía AskUserQuestion.

### 0.2 — Skeleton del monorepo en local (cero credenciales)
- [x] `package.json` raíz (privado, pnpm workspaces, scripts turbo).
- [x] `pnpm-workspace.yaml` (`apps/*` + `packages/*`).
- [x] `turbo.json` (pipeline build/dev/typecheck/test + globalEnv).
- [x] `tsconfig.base.json` (strict, ES2023, NodeNext).
- [x] `.gitignore` (node_modules, .env.local, .next, dist, .turbo, .vercel).
- [x] `.nvmrc` → `22`.
- [x] `.prettierrc.json`.
- [x] Estructura `apps/{panel,motor}` + `packages/{db,agent-pipeline,channel-adapters,composio-actions,shared-validator}` + `docs/sops` + `scripts`.

### 0.3 — apps/panel (Next.js 16 + Tailwind 4 + shadcn/ui + paleta Vega Hogar)
- [x] `pnpm dlx create-next-app@latest apps/panel ...` (con `--src-dir`, `--turbopack`, `--skip-install`).
- [x] Renombrar a `@vega-hogar/panel` + añadir `typecheck` script + `transpilePackages` en `next.config.ts`.
- [x] Paleta Vega Hogar aplicada a `src/app/globals.css` (CSS vars + Tailwind 4 `@theme inline`).
- [x] Fonts Playfair Display + Inter vía `next/font/google` en `layout.tsx`.
- [x] `metadata` actualizada a "Vega Hogar Inmobiliaria".
- [x] Landing placeholder `src/app/page.tsx` con paleta visible y badge "Fase 0".
- [x] Borrado del `.git`, `AGENTS.md`, `CLAUDE.md` y `pnpm-workspace.yaml` internos generados por el scaffold.
- [ ] **Diferido a Fase 2**: `shadcn@latest init`. Razón: la versión actual (mayo 2026) pide
  preset interactivo entre "Nova / Vega / Maia / Lyra / Mira / Luma / Sera / Custom" sin
  flags non-interactive estables. Sin TTY (entorno Claude Code o CI), bloquea. Iván lo
  ejecuta manualmente cuando entremos a Fase 2 y elige preset directamente. Mientras tanto,
  la landing placeholder ya usa la paleta Vega Hogar sin necesidad de componentes shadcn.

### 0.4 — apps/motor (Fastify 5 + Node 22 + /health)
- [x] `package.json` `@vega-hogar/motor` con Fastify 5, `@fastify/sensible`, pino, tsx, zod.
- [x] `tsconfig.json` extendiendo `tsconfig.base.json`.
- [x] `src/config/env.ts` con zod validation (NODE_ENV, PORT, LOG_LEVEL).
- [x] `src/server.ts` factory Fastify + sensible + healthRoutes.
- [x] `src/index.ts` boot + listen + graceful shutdown (SIGTERM/SIGINT).
- [x] `src/routes/health.ts` → `GET /health` retorna `{ status, service, env, uptime_ms, timestamp }`.
- [x] Puerto default `3010` (no `3001`) para no chocar con motor-rus de fyzon-rus que ya escucha en `:3001` en local.
- [x] `Dockerfile` multi-stage Node 22 alpine.
- [x] `.dockerignore`.

### 0.5 — Packages stubs
- [x] `packages/db` con `prisma/schema.prisma` (solo generator + datasource, sin modelos) + `src/index.ts` con `createSupabaseClient`.
- [x] `packages/agent-pipeline/src/index.ts` placeholder (Fase 6).
- [x] `packages/channel-adapters/src/index.ts` placeholder (Fase 5 + 8).
- [x] `packages/composio-actions/src/index.ts` placeholder (Fase 12).
- [x] `packages/shared-validator/src/index.ts` placeholder + `ValidationRule` type (Fase 6).
- [x] `package.json` + `tsconfig.json` por package.

### 0.6 — docker-compose.yml raíz
- [x] Servicio `motor` (build apps/motor + env_file .env.local + depends_on redis).
- [x] Servicio `redis` (redis:7-alpine + healthcheck + volume persistente).

### 0.7 — Documentación inicial
- [x] `README.md` (visión + cómo arrancar + roadmap 15 fases).
- [x] `CLAUDE.md` raíz (biblia técnica — modelo setters_ia adaptado).
- [x] `docs/architecture.md` (diagrama + integraciones + flujos + modelo datos resumen).
- [x] `docs/inmobiliaria-ficticia.md` (lore Vega Hogar completo).
- [x] `docs/sops/fase-00-kickoff.md` (este documento).
- [x] `.env.example` completo (todas las vars agrupadas por fase, sin valores).

### 0.7b — Verificación local end-to-end (pre-credenciales)
- [ ] `pnpm install` en raíz pasa sin error.
- [ ] `pnpm typecheck` en verde para todos los workspaces.
- [ ] `pnpm --filter @vega-hogar/panel dev` arranca en localhost:3000 con landing Vega Hogar.
- [ ] `pnpm --filter @vega-hogar/motor dev` arranca en localhost:3010 con `/health` 200.
- [ ] `docker compose up --build` arranca motor + redis y `/health` sigue verde.
- [ ] ~~shadcn init~~ → diferido a Fase 2 (ver razón arriba).

### 0.8 — Repo GitHub (REQUIERE OK Iván)
- [ ] `gh auth status` → confirma login como `ivannsotoo20`.
- [ ] `gh repo create ivannsotoo20/vega-hogar --private --description "..."`.
- [ ] `git init` + `git add .` + primer commit `chore: initial monorepo skeleton (Phase 0)` (mostrar diff antes).
- [ ] `git remote add origin https://github.com/ivannsotoo20/vega-hogar.git`.
- [ ] `git branch -M main` + `git push -u origin main`.

### 0.9 — Supabase proyecto (REQUIERE OK Iván)
- [ ] Crear proyecto `vega-hogar` en https://supabase.com/dashboard, region `eu-central-1` Frankfurt, Free.
- [ ] Capturar 5 vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`.
- [ ] Configurar Auth → Email Magic Link activo, Site URL `http://localhost:3000`, redirects `http://localhost:3000/**`.
- [ ] Pegar vars en `.env.local` (gitignored).
- [ ] **NO** aplicar schema (es Fase 1).

### 0.10 — Vercel proyecto (REQUIERE OK Iván)
- [ ] Verificar Vercel CLI instalado (`npm i -g vercel` si no).
- [ ] `vercel link` desde `apps/panel` → proyecto nuevo `vega-hogar-panel` en team `ivans-projects-63b5f517`.
- [ ] Variables Vercel production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] `vercel --prod` → deploy preview.

### 0.11 — Branch checkpoint + commit final (REQUIERE OK Iván)
- [ ] `git checkout -b checkpoint/fase-00`.
- [ ] Verificar `.env.local` no stageado.
- [ ] Commit semántico mostrado a Iván antes de ejecutar.
- [ ] `git push -u origin checkpoint/fase-00` tras OK.
- [ ] Actualizar memoria del proyecto con `fase_00_completada.md` (URLs, IDs, commit hash).

---

## Criterios de aceptación (todos deben pasar)

1. `pnpm install` sin error.
2. `pnpm typecheck` verde.
3. `pnpm --filter @vega-hogar/panel dev` → landing Vega Hogar visible en localhost:3000.
4. `pnpm --filter @vega-hogar/motor dev` → `curl localhost:3001/health` → `{ status: "ok", service: "vega-hogar-motor", ... }`.
5. `docker compose up --build` → motor + redis arrancan, `/health` sigue verde.
6. URL preview Vercel muestra la landing Vega Hogar.
7. `gh repo view ivannsotoo20/vega-hogar --web` muestra branch `checkpoint/fase-00`.

---

## Decisiones que quedan abiertas (no bloquean Fase 0)

- Subdominio prod definitivo (Fase 14).
- Proveedor STT exacto: Deepgram vs Whisper Realtime vs Gladia (Fase 8).
- Si Meta Marketing API se hace real o mockeada (Fase 12).
- Si se contrata Sentry o se monta logging propio (Fase 14).
- Si se construye una landing pública de Vega Hogar para demos externos (fase extra opcional).

---

## Próximo paso tras cerrar Fase 0

Nueva sesión: **Fase 1 — Modelo de datos Supabase v1**. Leer `docs/sops/fase-01-modelo-datos.md`
(a redactar) + memoria del proyecto + plan maestro.
