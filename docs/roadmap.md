# Hoja de ruta — Vega Hogar (port SETTER IA → Vega)

> Fuente única del plan de fases del **giro de "port"**: adaptar el SaaS de SETTER IA
> (`C:\Users\sotob\setters_ia`, ~85% reutilizable) dentro de Vega Hogar, re-domainizado a
> comercial inmobiliario (panel anon+RLS) + voz por ElevenLabs.
>
> - **Plan maestro (detalle arquitectónico)**: _plan de sesión del autor (archivo local, no versionado en el repo)_
> - **Memoria del proyecto**: _memoria local del autor (no versionada en el repo)_
> - **SOP por fase**: `docs/sops/fase-NN-*.md` · **Convención**: 1 fase = 1 branch `checkpoint/fase-NN` + 1 SOP + OK de Iván.

Leyenda: ✅ hecha · 🟡 en curso · ⬜ pendiente · 🔴 bloque prioritario.

---

## Estado actual

**F0–F5 ✅ cerradas, commiteadas y desplegadas** (preview Vercel por rama). Siguiente: **F6**.
El módulo `/leads` está operativo en producción (rama `checkpoint/fase-05`).

---

## Qué activa cada sección del panel (lo que declaran los stubs `EnConstruccion`)

| Sección del panel | Fase |
|---|---|
| **Leads** | ✅ F5 |
| Conversaciones · Pipeline · Etiquetas | F6 |
| Inmuebles | F7 |
| Visitas · Captación | F8 |
| Inmobiliarias · Resumen de agencia · Admins Fyzon · Ajustes · Calendarios | F9 |
| Cerebro (prompts) · Palabras clave | F10 |
| Dashboard (KPIs reales) | F11 |

---

## Roadmap de fases

| Fase | Estado | Activa en el panel | Entregable clave | Depende de |
|---|---|---|---|---|
| **F0** Kickoff técnico | ✅ | — | Repo + Supabase + Vercel + motor esqueleto | — |
| **F1** Modelo datos + RLS | ✅ | — | 16 tablas + 38 RLS + seed Vega | F0 |
| **F2** Auth + roles + matriz | ✅ | (login) | Magic-link SSR + 5 roles + matriz permisos | F1 |
| **F3** Cimientos del port | ✅ | (shell/nav) | Shim auth + grupo `(app)/` + sidebar + rebrand + 14 stubs | F2 |
| **F4** Modelo datos del port | ✅ | — | 24 tablas operativas de SETTER + RLS `current_tenant()` + seed (**41 tablas**) | F3 |
| **F5** Leads inmobiliarios | ✅ | **Leads** | `/leads` + `/leads/[id]`: 8 server actions anon+RLS (cursor keyset, asignación nivel lead) + GDPR + 9 componentes | F4 |
| **F6** Pipeline + Conversations | ⬜ | **Conversaciones · Pipeline · Etiquetas** | Kanban dual (mover card = `current_phase`/`status`) + viewer de conversaciones (lista+thread+composer mock, pausa IA/handoff) + CRUD `tenant_labels`. Sin motor → seed/mock. Quitar ManyChat. Dep: `@dnd-kit/*` | F5 |
| **F7** Catálogo inmuebles | ⬜ | **Inmuebles** | `/properties` + `/properties/[id]`: CRUD + fotos (Supabase Storage) + filtros + cruce `lead_property_interest` | F5 |
| **F8** Captación + Visitas | ⬜ | **Visitas · Captación** | Pipeline vendedores (fases tasación) + visitas (`is_tasation`, visita técnica humana) | F7 |
| **F9** Admin agencia | ⬜ | **Inmobiliarias · Resumen agencia · Admins · Ajustes · Calendarios** | Multi-tenant (tenants/admins/members/invites) + ScopeSwitcher + policy impersonación cross-tenant (diferida de F4) + settings/integraciones (sin ManyChat) | F5 |
| **F10** 🔴 Motor texto + WhatsApp | ⬜ | **Cerebro (prompts) · Palabras clave** | **Bloque prioritario.** Port motor 3-LLM + `agent-pipeline` + `shared-validator` + `prompt-composer` + WhatsApp (YCloud + driver mock) + webhooks + cadencia + keywords + editor de prompts. Genera `database.types.ts`. **Conecta el panel a tráfico real.** | F4, F6 |
| **F11** Dashboard real | ⬜ | **Dashboard** | KPIs inmobiliarios (recharts + widgets dnd-kit) con datos del motor + pipeline-metrics + alerts | F10 |
| **F12** Voz | ⬜ | (nuevo) | ElevenLabs Agents + Zadarma SIP + server tools + persistencia voz + paso "llamada T+1h" | F10 |
| **F13** Meta Ads | ⬜ | `/admin/ads` (nuevo) | `composio-actions` + campañas + atribución + lead-form Meta → lead vendedor | F10 |
| **F14** Hardening + entrega | ⬜ | — | Seguridad dura (HMAC enforce, `safeLogBody`, `timingSafeEqual`, SECURITY DEFINER) + CI/CD + E2E + audit + demo showcase | todas |

---

## Decisiones de orden

- **F6–F9 son secciones de panel construibles YA con datos seed** (no necesitan motor). Patrón
  replicable del de F5 (acciones anon+RLS, cursor keyset, joins desanidados, shim auth, gating por rol).
- **F10 (motor) es el bloque prioritario declarado**: es lo que pone el sistema *vivo* (WhatsApp real).
  El plan por defecto es **secuencial** (F6 → … → F10), pero se puede **adelantar F10** si se prioriza
  tráfico real antes que más UI. Decisión de Iván al arrancar cada fase.
- **Voz (F12) va después del texto (F10)** — prioridad declarada.

---

## Reglas transversales (resumen — detalle en `CLAUDE.md` del repo)

- Panel **SIEMPRE anon + RLS** (`createSupabaseServerClient`). NUNCA service-role en el panel.
- Cliente Supabase del panel **untyped** hasta F10 → validar columnas + writes por rol con
  `scripts/test-rls-*.mjs` (sin password). En `.select()` usar literales de una línea.
- 1 fase = branch `checkpoint/fase-NN` + SOP en `docs/sops/` + **OK explícito de Iván**. Cero commits
  y cero cambios en Supabase sin OK. Verificación completa por fase (typecheck/lint/build + probes RLS
  + visual con preview MCP + usuario QA temporal borrado al acabar).
