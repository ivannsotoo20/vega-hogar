# SOP · Fase 05 — Leads inmobiliarios (`/leads`)

> **Estado**: ✅ EJECUTADO Y VERIFICADO (2026-06-03). Commit `feat(fase-05)` en `checkpoint/fase-05`.
> **Plan maestro**: _plan de sesión del autor (archivo local, no versionado en el repo)_ (§7, F5).
> **Fases previas**: F3 cimientos (`checkpoint/fase-03`) + F4 datos (`checkpoint/fase-04`).
> **Branch a crear**: `checkpoint/fase-05`.

---

## 1. Context

Con el prerequisito duro hecho (F3 shim auth + shell, F4 modelo de datos), F5 porta el **primer
módulo operativo del panel**: la sección de **contactos** de SETTER → **`/leads`** de Vega,
re-domainizada a leads inmobiliarios (intent comprador/vendedor) y **anon + RLS** (sin
service-role). Reemplaza el stub de F3.

**Simplificación clave**: las acciones de SETTER usan `getServiceRoleClient()` y filtran la
visibilidad por rol a mano. En Vega, la **RLS de `leads` (Fase 1) ya filtra por rol**
(`comercial` → solo sus leads asignados; `director_oficina` → su oficina; `admin`/
`director_general`/`asistente_captador` → según policy). Con anon+RLS, ese filtrado es
**automático** — el código no lo replica. La matriz de permisos (keys `leads.*`, ya sembradas en
F3) controla la visibilidad de los affordances UI.

---

## 2. Decisiones cerradas (Fase 5)

1. **Anon + RLS en todas las acciones** (`createSupabaseServerClient`, regla 2). NUNCA
   `getServiceRoleClient` en el panel. El shim de F3 (`requireTenantRole`/`requireTenantRoleAtLeast`)
   autoriza las escrituras; la RLS hace el filtrado de filas.
2. **Ruta `/leads`** (no `/contacts`). Reemplaza el stub de F3. Ficha en `/leads/[id]`.
3. **Re-domain de campos**: `full_name` (no first/last/username), `intent` (buyer/tenant/seller/
   landlord), `status` (enum inmobiliario). **Sin tabla `channels`**: el canal es el enum
   `channel` en `leads`/`conversations`. Sin `provider` ManyChat.
4. **Asignación a nivel LEAD** (`leads.assigned_to_user_id` BIGINT, ya existe en Fase 1), no por
   conversación como SETTER. `assignLead` escribe ahí.
5. **Cursor keyset** por `leads.last_message_at DESC NULLS LAST, id DESC` (Vega añadió
   `leads.last_message_at` en F4). Mismo patrón que SETTER.
6. **Tabs** re-domain: `Todos` · `Compradores` (intent buyer/tenant) · `Vendedores`
   (seller/landlord) · `Calientes` (label bucket `hot`) · `Cerrados` (status `closed_won`/
   `closed_lost` o labels `bought`/`lost`). Derivados en cliente.
7. **Ficha** con tabs inmobiliarios: **Datos** (editable: full_name, phone, email, intent,
   location) · **Preferencias** (`lead_preferences`: zonas, precio, m², habitaciones) ·
   **Inmuebles de interés** (`lead_property_interest`) · **Timeline** (`pipeline_events`) ·
   **Notas** (`conversation_notes`). Acciones: asignar, etiquetas (+ side-effects pausar/auto-
   asignar), pausar IA (`conversations.ai_paused_until`).
8. **GDPR conservado** (LOPD España): export + delete, solo `admin`/`director_general`, con
   borrado en cascada sobre tablas Vega.
9. **Sin envío de mensajes en F5**: `sendWelcomeFromPanel`/`manual-send` dependen del motor +
   YCloud → se difieren a F10. F5 es lectura + gestión. Pausar IA y etiquetar sí (solo updates
   de BD).
10. **Joins**: desanidar los `select('rel(*)')` problemáticos a 2 queries con `in()` (lección F2).
    `dynamic = 'force-dynamic'` en las pages (cookies).

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| S0 — Branch | ✅ | `checkpoint/fase-05` desde `checkpoint/fase-04` |
| S1 — Query utils | ✅ | `lib/lead-list-query.ts` re-domain (tipos puros + helpers `applyFilters`/`rowsForTab`/`leadTabCounts`) |
| S2 — Server actions leads | ✅ | `lib/actions/leads.ts` anon+RLS (8 acciones). Cursor keyset. Asignación a nivel lead. Verificado con `scripts/test-rls-leads-writes.mjs` (columnas + writes por rol) |
| S3 — GDPR | ✅ | `lib/actions/gdpr.ts`: export (acceso, dg+) + hard-delete (supresión, **admin-only**) en cascada FK. Verificado `scripts/test-rls-gdpr.mjs` |
| S4 — Componentes | ✅ | `components/leads/*` (9: layout/pane/item/filters/tabs/detail/sheet/gdpr/format) + helpers `listLabels`/`listMembers`. Sin deps nuevas (chips/inputs/iniciales) |
| S5 — Rutas | ✅ | `/leads/page.tsx` (reemplaza stub) + `/leads/[id]/page.tsx`. Verificación visual (preview MCP + QA temporal): admin ve 20 leads, tabs 20/12/7/0/0, ficha + 5 tabs, 0 errores consola |
| S6 — Permisos | ✅ | Matriz verificada: `leads.assign`=dofi+ y `agent.pause`=todos coinciden con el gating por rol. `leads.delete`=admin → borrado GDPR alineado a **admin-only** (export sigue dg+). Sin cambios BD. Matrix-driven en vivo → F9 |
| S7 — Verificación | ✅ | typecheck/lint/build verdes · 4 probes RLS (roles/writes/gdpr/anon) verdes · visual admin OK |
| S8 — Commit | ✅ | `feat(fase-05): leads inmobiliarios` (+ `fix(panel): lint react-hooks` aparte) |

---

## 4. Sub-pasos detallados

### S0 — Branch
`git checkout checkpoint/fase-04 && git checkout -b checkpoint/fase-05`.

### S1 — Query utils (`apps/panel/src/lib/lead-list-query.ts`)
Re-domain de `lead-list-query.ts` de SETTER. Tipos puros (testeables sin BD):
- `LeadFilterParams`: `q`, `intents[]` (buyer/tenant/seller/landlord), `statuses[]` (enum
  inmobiliario), `phases[]`, `assignee` (any/mine/unassigned/<userId BigInt>), `labelIds[]`,
  `aiState`, `createdFrom/To`, `lastMsgFrom/To/Never`. **Quitar**: channels/providers/triggers/
  handoffCauses de coaching.
- `LeadListRow`: `id`, `full_name`, `phone`, `email`, `location`, `intent`, `status`,
  `current_phase`, `assigned_to_user_id`, `last_message_at`, `created_at`, `conversations[]`
  (id, channel, status, current_phase, ai_paused_until, labels[]).
- Helpers: `getMaxPhase`, `getUniqueLabels`, `isLeadAiPaused`, `getAssignedSummary`,
  `classifyLeadTab(row)` (intent+status+labels → tab), `leadTabCounts`, `applyFilters` (post-fetch
  JS para labelIds/aiState). Cursor `{ lastMessageAt, id }`.

### S2 — Server actions (`apps/panel/src/lib/actions/leads.ts`)
Reescritura de `contacts.ts` a **anon+RLS** sobre el modelo Vega:
- `listLeadsPage({filters, cursor, limit})` → `{ rows, nextCursor, hasMore }`. Query a `leads`
  (+`conversations` desanidado con `in()` para labels/estado). Cursor keyset
  `last_message_at DESC NULLS LAST, id DESC`. Filtros SQL (intent, status, phase, fechas) + JS
  (labelIds, aiState). **RLS filtra por rol automáticamente** — no filtrar a mano.
- `getLeadDetail(leadId)` → `{ lead, preferences, propertyInterests, events, notes }`
  (`leads` + `lead_preferences` + `lead_property_interest`+`properties` + `pipeline_events` +
  `conversation_notes`).
- `updateLead({leadId, patch})` — campos full_name/phone/email/intent/location. `requireTenantRole({minRole:'admin'})` (vocabulario shim → director_oficina+). Valida email.
- `assignLead({leadId, userId|null})` — escribe `leads.assigned_to_user_id` (BIGINT). Verifica
  que el user es del tenant. `requireTenantRoleAtLeast({minRole:'admin'})`.
- `togglePauseLead({leadId, paused})` — `conversations.ai_paused_until = 'infinity'|null` para
  las conversaciones del lead.
- `applyLeadLabel`/`removeLeadLabel({leadId, labelId})` — `conversation_labels` (upsert/delete) +
  side-effects (`pause_ai_on_apply`/`resume_ai_on_apply`/`auto_assign_to` desde `tenant_labels`).
- `addLeadNote({leadId, content})` — `conversation_notes` en la conversación más reciente del lead;
  `author_user_id` = `users.id` del shim, `author_email`.
- `revalidatePath('/leads')` tras escrituras.

### S3 — GDPR (`apps/panel/src/lib/actions/gdpr.ts`)
- `exportLeadDataAction({leadId})` → JSON con lead + conversations + messages + notes + events +
  labels. Solo `admin`/`director_general` (`requireTenantRoleAtLeast({minRole:'owner'})`).
- `deleteLeadDataAction({leadId, confirmation})` → borrado en cascada (conversations, messages,
  labels, notes, pipeline_events; NULL en llm_calls/pipeline_runs). Soft-delete del lead
  (`deleted_at`) o hard delete. Solo `admin`. (anon+RLS: el borrado lo permite la policy de
  `leads_delete` de Fase 1 = solo admin. NO service-role.)

### S4 — Componentes (`apps/panel/src/components/leads/`)
Port de `components/contacts/*` con rebrand + re-domain:
- `leads-layout.tsx` (server, orquesta listLeadsPage + listLabels + listMembers),
  `leads-list-pane.tsx` (client, cursor load-more IntersectionObserver),
  `leads-list-item.tsx` (avatar, nombre, intent badge, fase, asignado, IA paused),
  `leads-list-filters.tsx` (grupos: búsqueda, intent, status, fase, asignación, etiquetas,
  fechas — sin canal/provider ManyChat), `leads-list-tabs.tsx` (§2.6),
  `lead-detail.tsx` (ficha, 5 tabs §2.7), `lead-detail-sheet.tsx`, `lead-gdpr-actions.tsx`.
- UI ya portada en F3 (Sheet, Table, Badge, Select, DropdownMenu, Dialog, Input). Sin dnd-kit.

### S5 — Rutas
- `app/(app)/leads/page.tsx` (reemplaza el stub `EnConstruccion`): parsea searchParams →
  `LeadFilterParams` + `selectedId`, renderiza `LeadsLayout`. `dynamic='force-dynamic'`.
- `app/(app)/leads/[id]/page.tsx`: `getLeadDetail` + permisos.

### S6 — Permisos
Verificar que la matriz tiene `leads.view_assigned/view_office/view_tenant/create/assign/delete`
(sembradas en Fase 2/3). Añadir `leads.gdpr` (export/delete) si se quiere granular; si no, usar
`leads.delete` para GDPR. Actualizar `permissions.ts` + seed si se añade key.

### S7 — Verificación
`pnpm --filter @vega-hogar/panel typecheck|lint|build` verde. Manual: `/leads` lista los 20 leads
del seed, filtros e intent funcionan, ficha abre con preferencias/inmuebles/notas, asignar y
pausar IA persisten. **RLS por rol**: con `test-rls-with-session` (si hay credenciales) o login
manual, confirmar que un `comercial` solo ve sus leads asignados y un `admin` ve todos.

### S8 — Commit
`feat(fase-05): leads inmobiliarios — /leads re-domain anon+RLS` (con OK de Iván).

---

## 5. Validación end-to-end (criterios de cierre)

- typecheck + lint + build verdes.
- `/leads` con datos reales del seed (20 leads), filtros por intent/status, cursor load-more.
- Ficha: datos editables, preferencias, inmuebles de interés, timeline, notas; asignar + pausar
  IA + etiquetar persisten.
- RLS por rol verificada (comercial ⊂ admin).
- Cero `service-role` en `apps/panel/src` (grep).

---

## 6. Riesgos

1. **Acoplamiento de `listContactsPage` al schema SETTER** → reescribir la query a columnas Vega;
   los *tipos de fila* (`LeadListRow`) son el contrato estable. Riesgo nº1, mitigar con tests del
   query util (S1) antes de la UI.
2. **Joins Supabase anidados inestables** (lección F2) → desanidar a 2 queries con `in()`.
3. **Confiar en RLS para visibilidad**: si la policy de `leads` de Fase 1 no cubre algún caso de
   rol, el panel mostraría de más/menos. Mitigar con `test-rls-with-session` (comercial vs admin).
4. **`force-dynamic`** en las pages (cookies) — si falta, build peta.
5. **Cursor con `last_message_at` NULL**: leads sin mensajes (NULLS LAST). Probar con seed (hay
   leads `new` sin conversación).
6. **GDPR delete**: destructivo. Confirmación por texto + solo admin + revalidate. No service-role
   (la policy `leads_delete` de Fase 1 ya restringe a admin).

---

**Próximo paso tras validar este SOP**: ejecutar S0 y avanzar (query utils → actions → componentes
→ rutas), parando para verificación antes del commit. Sin commits sin OK.
