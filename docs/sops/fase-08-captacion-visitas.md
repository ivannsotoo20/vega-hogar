# SOP · Fase 08 — Captación + Visitas (`/visits` + `/captacion`)

> **Estado**: ✅ EJECUTADO Y VERIFICADO (2026-06-10). Branch `checkpoint/fase-08` (desde `checkpoint/fase-07`), commit `d44e5bd`, promovido a producción.
> **Plan maestro**: _plan de sesión del autor (archivo local, no versionado en el repo)_ (§9 F8, §10.3, §4 AÑADIR, §7).
> **Plan de sesión**: _plan de sesión del autor (archivo local, no versionado en el repo)_.
> **Fases previas**: F5 `/leads` · F6 pipeline/conversations/labels · F7 `/properties` (patrones a replicar).

---

## 1. Context

Con cinco módulos operativos cerrados (`/leads`, `/labels`, `/conversations`, `/pipeline`, `/properties`),
F8 construye los **dos módulos del bucket "AÑADIR"** que cierran el ciclo comercial inmobiliario, sobre
**datos seed reales y SIN motor** (la captación automática, el form "Vende con nosotros" y la agenda IA
llegan en F10):

- **`/visits`** — módulo NUEVO sobre la tabla `visits` (existe desde F1). Listado master-detail (patrón
  F5/F7) + ficha (lead + inmueble + comercial + estado + notas + enlace cita de calendario) + transiciones
  de estado + reasignación.
- **`/captacion`** — **cockpit del funnel de VENDEDORES** (rama seller). NO duplica el kanban dual de F6:
  vista enfocada que agrega los leads `intent ∈ {seller, landlord}` por fase del track seller + las
  visitas técnicas de **tasación** + KPIs + accesos directos a `/pipeline?track=seller`, ficha de lead
  (F5) y alta de inmueble (F7).

**Anti-jugada de dominio (dura)**: NO tasación IA. El agente recopila datos y agenda una **visita técnica
de tasación HUMANA** (la valoración la hace una persona). `is_tasation=true` marca esas visitas; `/visits`
y `/captacion` reflejan ese modelo (la tasación es una visita agendada, no un cálculo).

### Hechos verificados contra la BD real (read-only probe 2026-06-10 + schema + seed)

| Hecho | Valor | Implicación |
|---|---|---|
| **`visits.is_tasation`** | **EXISTE** (boolean) en BD real | Modelo unificado viable — **CERO migración** |
| **`visits.calendar_appointment_id`** | EXISTE (bigint, nullable) | Enlace GHL solo-lectura v1 (null en todo el seed) |
| `visit_status` enum | `scheduled, done, noshow, cancelled, rescheduled` | Máquina de estados (S1) |
| Visitas seed | **5**: 3 `scheduled` (2 `is_tasation=true`) + 2 `done` (normales) | `/captacion` tendrá 2 tasaciones |
| Fechas de las visitas | **las 5 en el PASADO** (`future:0, past:5`) | Seed pone `scheduled_for` relativo; ha derivado → **tabs por ESTADO, no por reloj** |
| Leads por intent | buyer 8 · seller 5 · tenant 4 · landlord 2 · unknown 1 (20) | **7 leads seller/landlord** para `/captacion` |
| Leads exponen fase | `LeadListRow.current_phase` + `getMaxPhase()` + filtro `intents[]` | `/captacion` agrupa por fase reusando `lead-list-query.ts` |
| RLS `visits` | `05-visits.sql` (intacto) | admin/dg/**asistente_captador** ven todas · do su oficina · comercial solo las suyas |

**Diferencia clave vs F7**: F7 tuvo un cambio de BD (guard `014`). F8 **no necesitaba** tocar Supabase para
el modelo de datos (is_tasation ya existía)… **pero el probe de S6 destapó un bug RLS pre-existente de F1
en `visits`** (un comercial veía TODAS las visitas, no solo las suyas) → se aplicó la **migración `015`**
como checkpoint duro con OK de Iván (ver §7 abajo). Único toque a Supabase en F8.

---

## 2. Decisiones cerradas (Fase 8)

**Por hechos** (verificadas con probe):
1. **D1 · Modelo de captación = UNIFICADO** (plan §10.3): `leads.intent=seller/landlord` +
   `visits.is_tasation`. Sin tablas nuevas (`seller_leads`/`tasation_visits` diferidas).
2. **D2 · `is_tasation` ya existe → no se necesita migración para el MODELO DE DATOS.** (La migración
   `015` que sí se aplicó es un FIX de seguridad RLS descubierto en S6, no el modelo — ver §7.)

**Con Iván (2026-06-10)** — todas en la opción recomendada:
3. **D3 · `/captacion` = cockpit enfocado (Opción A)**: reúsa `listLeadsPage({intents:[seller,landlord]})`
   + `listVisitsPage({tasation})` + `SELLER_PHASES`, **sin dnd propio**; enlaza a `/pipeline?track=seller`.
   NO board propio (evita duplicar F6).
4. **D4a · `/visits` = list-pane + ficha (espejo F5/F7)**: NO vista calendario (respeta stack cerrado,
   regla 4). Temporalidad vía **tabs por estado** + filtro de rango de fechas.
5. **D4b · Fechas seed: NO tocar datos**: tabs por ESTADO. **F8 = CERO cambios de BD.** Seed pristino.
6. **D4c · Gating al crear visita = G2**: `comercial` solo se autoasigna (check explícito);
   `asistente_captador` puede asignar al comercial de campo **al crear una tasación**; do+ libre. Reasignar
   visita existente = **do+** (`visits.reassign`).
7. **D4d · Eliminar visita = NO hard-delete v1; usar `status=cancelled`** (preserva histórico; `visits` no
   tiene `deleted_at`).

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| S0 — Branch + SOP | ✅ | branch `checkpoint/fase-08` creada; este SOP redactado |
| S1 — Capa de datos (TS puro) | ✅ | `visit-list-query.ts` + `actions/visits.ts`; typecheck verde |
| S2 — Listado `/visits` | ✅ | `visits-format` + tabs/item/pane/filters + layout; stub reemplazado; typecheck verde |
| S3 — Ficha `/visits` | ✅ | detail-sheet + detail (máquina estados + reasignar + notas) + add-dialog + `[id]`; typecheck verde |
| S4 — `/captacion` cockpit | ✅ | cockpit + kpis + phase-board (read-only) + tasation-visits + page con gate; typecheck verde |
| S5 — Cruce F7 | ✅ | botón "Dar de alta inmueble" (do+, seller/landlord) en captación + ficha lead + apertura `?new=1` |
| S6 — Verificación | ✅ | **Probe destapó bug RLS F1 → migración 015 (OK Iván)**; `test-rls-visits-writes` verde; typecheck/lint/build verdes; anon-leaks 41/41; visual MCP (0 errores, seed pristino) |
| S7 — Commit (⚠ STOP) | ✅ | commit `d44e5bd` + push + deploy Ready + **PROMOVIDO a prod** + smoke (/ 200, /login 200, /visits·/captacion 307→login) + memoria |

---

## 4. Sub-pasos detallados

### S0 — Branch + SOP
- `git checkout -b checkpoint/fase-08` desde `checkpoint/fase-07` (✅ hecho; árbol limpio salvo daemon).
- Redactar este SOP (espejo de `fase-07-properties.md`).

### S1 — Capa de datos (`lib/visit-list-query.ts` + `lib/actions/visits.ts`)
- **`visit-list-query.ts`** (tipos puros, sin I/O — espejo de `property-list-query.ts`):
  - `VisitStatus = 'scheduled'|'done'|'noshow'|'cancelled'|'rescheduled'`; `VisitType='visit'|'tasation'`.
  - `VisitListRow`: `id, lead_id, property_id|null, comercial_user_id, scheduled_for, status,
    outcome_notes, lead_feedback, is_tasation, calendar_appointment_id, created_at, updated_at` +
    desanidados `lead {id, full_name, phone, intent}`, `property {id, title, neighborhood}|null`,
    `comercial {id, full_name, email}|null`.
  - `VisitTabKey = 'scheduled'|'done'|'tasations'|'all'` (por estado/tipo, NO por fecha).
  - `VisitFilterParams`: `q, statuses[], visitType('any'|'visit'|'tasation'), comercial('any'|'mine'|
    'unassigned'|<id>), viewerId, scheduledFrom, scheduledTo`.
  - Helpers `applyVisitFilters`, `rowsForVisitTab`, `visitTabCounts`; parsers `parseVisitTab`,
    `parseCsvStringList`, `parseVisitType`, `countActiveVisitFilters`.
- **`actions/visits.ts`** (`'use server'`, anon+RLS, NUNCA service-role). Copiar `authorizeWrite(minRole)`,
  `ActionResult<T>` y helpers de `properties.ts`. Literal de una línea:
  - `VISIT_SELECT = 'id, tenant_id, lead_id, property_id, comercial_user_id, scheduled_for, status, outcome_notes, lead_feedback, is_tasation, calendar_appointment_id, created_at, updated_at'`
  - **Lectura**: `listVisitsPage({filters,cursor,limit})` (viewer; keyset `scheduled_for DESC, id DESC`;
    `nextCursor` desde la última fila SQL **antes** de post-filtros JS; desanidado 2-query con `.in()` para
    lead/property/comercial); `getVisitDetail(id)` (viewer; principal `maybeSingle()` + `Promise.all`).
  - **Escritura** (gates exactos, matriz `[admin,dg,do,comercial,asistente]`):
    - `createVisit` → `authorizeWrite('viewer')`. **Check auto-asignación (D4c=G2)**: `comercial` ⇒ forzar
      `comercial_user_id=eff.userId`; `asistente_captador` ⇒ puede elegir comercial **si `is_tasation`**;
      do+ libre (validar destino en tenant + `active`, patrón `assignLead`).
    - `updateVisitStatus` → `authorizeWrite('viewer')`; valida transición; `.select('id')` tras UPDATE
      (deny RLS = 0 filas, no 42501).
    - `updateVisitNotes` → `authorizeWrite('viewer')` (outcome_notes/lead_feedback).
    - `reassignVisit` → **check explícito** `role ∈ {admin, director_general, director_oficina}`
      (`visits.reassign`; lección F7/O1).
  - Todas: `revalidatePath('/visits')` + `revalidatePath('/captacion')` + `'/leads'` si aplica.
  - **Máquina de estados**: `scheduled → done|noshow|cancelled|rescheduled` · `rescheduled →
    scheduled(nuevo scheduled_for)|cancelled` · `done|noshow|cancelled` terminales v1.
- `pnpm --filter @vega-hogar/panel typecheck` verde.

### S2 — Listado (`components/visits/*` + `app/(app)/visits/page.tsx`)
- `visits-format.ts`: `VISIT_STATUS_LABEL`, `statusBadgeVariant`, `visitTypeLabel(isTasation)`,
  `formatDateTime` determinista `Europe/Madrid`, reuso de helpers de leads.
- `visits-list-tabs.tsx` (Agendadas | Realizadas | Tasaciones | Todas + contadores),
  `visits-list-item.tsx` (fecha+hora, badge estado, badge Visita/Tasación, lead, inmueble, comercial),
  `visits-list-pane.tsx` (scroll infinito IntersectionObserver + cursor + dedupById),
  `visits-list-filters.tsx` (Collapsible + chips + debounce 250ms: estado/tipo/comercial/rango fechas/q),
  `visits-layout.tsx` (server; `Promise.all`(listVisitsPage + listMembers + getVisitDetail si selected) +
  flags `canCreate`(todos)/`canReassign`(do+) + `AddVisitDialog`).
- `app/(app)/visits/page.tsx`: quitar `<EnConstruccion>`; `dynamic='force-dynamic'` + parseo searchParams →
  `VisitFilterParams` + `<VisitsLayout>`. Sin `requireRole` de bloqueo (los 5 roles ven `/visits`).

### S3 — Ficha (`components/visits/*` + `app/(app)/visits/[id]/page.tsx`)
- `visit-detail-sheet.tsx` (Sheet open=detail!==null, cierra borrando `?selected`).
- `visit-detail.tsx`: cabecera + acciones gated (transición de estado, Reprogramar, Reasignar si
  `canReassign`, edición notas) con `editing`+`useTransition`+toast+`router.refresh`. Links a lead/inmueble.
  `calendar_appointment_id` solo-lectura.
- `add-visit-dialog.tsx` (espejo `add-property-dialog`): Select lead, Select inmueble (opcional), Select
  comercial (default `eff.userId`; forzado a "yo" si rol=comercial), datetime, switch `is_tasation`.
- `app/(app)/visits/[id]/page.tsx`: deep-link → `redirect('/visits?selected='+id)`.

### S4 — `/captacion` cockpit (Opción A)
- `captacion-cockpit.tsx` (server): `Promise.all([listLeadsPage({intents:[seller,landlord]}),
  listVisitsPage({visitType:'tasation', statuses:[scheduled,done]}), listMembers()])`. Calcula KPIs.
- `captacion-kpis.tsx`, `captacion-phase-board.tsx` (read-only, columnas `phasesForTrack('seller')`, cards
  no-arrastrables `getMaxPhase→phaseKey` con link a `/leads?selected=`, cabecera "Abrir en pipeline"),
  `captacion-tasation-visits.tsx` (lista de tasaciones con link a `/visits?selected=`).
- `app/(app)/captacion/page.tsx`: `dynamic='force-dynamic'` + gate
  `requireRole(['admin','director_general','director_oficina','asistente_captador'])` (= `captacion.view`;
  comercial excluido). Verificar firma/redirect de `requireRole`.

### S5 — Cruce con properties (F7)
- En `lead-detail.tsx` (solo `intent ∈ {seller,landlord}`) y en `captacion-phase-board.tsx`: botón "Dar de
  alta inmueble" → `/properties?new=1&fromLead=<leadId>`.
- En `properties-layout.tsx` + `add-property-dialog.tsx`: leer `?new=1` para abrir el dialog (apertura
  controlada). Único toque a F7; CERO lógica nueva. `revalidatePath('/leads')` ya existe.

### S6 — Verificación (toda por Claude)
- `scripts/test-rls-visits-writes.mjs` (espejo de `test-rls-properties-writes.mjs`; `txAs` + ROLLBACK;
  `expectWrite` rowCount===0 = deny):
  - **READS**: admin ve 5 · asistente_captador ve 5 · comercial **solo las suyas** · director_oficina su
    oficina. Columnas de `VISIT_SELECT` existen.
  - **WRITES**: INSERT permitido por RLS a todos (allow); auto-asignación es app-level (documentar);
    aislamiento tenant (insert cross-tenant deny).
- `pnpm --filter @vega-hogar/panel typecheck|lint|build` verde + `test-rls-anon-leaks.mjs` (**41/41**, F8 no
  añade tabla).
- Visual **preview MCP** (`preview_snapshot`/`preview_eval`/`preview_click` por `#id`; NO screenshot). Login
  admin → `/director/dashboard`. admin (`/visits` 5, tabs, ficha→transición en vivo + revertir, reasignar;
  `/captacion` 7 leads por fase + 2 tasaciones + KPIs + enlaces). comercial QA (`/visits` solo las suyas;
  `/captacion` redirige). 0 errores de consola.
- **Seed pristino**: revertir todo write de prueba; confirmar 5 visitas y estados originales con `pg`.

### S7 — Commit (⚠ STOP para OK)
- `git add` selectivo, mostrar diff, **OK de Iván**, commit `feat(fase-08): captación + visitas — /visits
  anon+RLS + /captacion cockpit seller + cruce alta inmueble`, push. Verificar deploy alias
  `vega-hogar-panel-git-checkpoint-fase-08-…vercel.app`. **PROMOVER**: `vercel promote <url> --scope
  <TU_SCOPE_VERCEL> --yes`. Smoke `https://vega-hogar-panel.vercel.app` (`/`, `/visits`, `/captacion`,
  `/login`). Actualizar memoria (`fase_08_completada.md` + MEMORY.md) + checkmarks del SOP. Daemon `backup`
  puede racear; NO `--force`.

---

## 5. Validación end-to-end (criterios de cierre)
- typecheck + lint + build verdes; 0 `service-role` en `apps/panel/src`.
- `/visits`: lista las 5 del seed; tabs por estado + filtros + scroll por cursor; ficha con transición de
  estado, reasignación (do+) y notas que persisten.
- `/captacion`: 7 leads seller/landlord por fase + 2 tasaciones + KPIs; comercial redirigido; enlaces OK.
- Cruce: "Dar de alta inmueble" desde lead seller abre el alta en `/properties`; sin romper F5/F7.
- `test-rls-visits-writes.mjs` verde (comercial solo ve las suyas) + `test-rls-anon-leaks` 41/41.
- Seed pristino. CERO cambios en Supabase.

## 6. Riesgos
1. **Cliente untyped** → `.select()` literal de una línea + probe RLS obligatoria (mitigación F5/F7).
2. **Fechas seed en el pasado** → tabs por estado (no por reloj); D4b cerrada (no se tocan datos).
3. **Agujero RLS de auto-asignación** (`visits_modify` no restringe `comercial_user_id`) → gate explícito
   en `createVisit`.
4. **Gating reassign vs create** → dos gates separados; no colapsarlos (lección F7/O1).
5. **Deny RLS = 0 filas, no 42501** → en update/reassign comprobar `.select()` posterior, no `error`.
6. **`/captacion` no debe oler a duplicado de `/pipeline`** → read-only + KPIs + tasaciones + cruce; el
   board arrastrable sigue siendo `/pipeline?track=seller` (enlazado).
7. **Daemon `backup`** puede racear el commit de cierre (como F4/F6/F7). No `--force` con daemon activo.

---

## 7. Hallazgo de seguridad RLS + fix (migración 015) — descubierto en S6

**Qué**: el probe `test-rls-visits-writes.mjs` detectó que un `comercial` veía **todas** las visitas del
tenant (no solo las suyas) y un `director_oficina` también (no solo su oficina). Bug **pre-existente de
F1**, no introducido por F8.

**Causa raíz** (verificada contra la BD real con `pg_policy`, no solo el archivo): `visits` tenía
`visits_select` (correctamente scoped) **y** `visits_modify` creada como **`FOR ALL`**. Una policy
`FOR ALL` también aplica a SELECT y, al combinarse con OR con las demás permisivas, su `USING` ancho
(tenant + los 5 roles) anulaba el scoping de `visits_select`. `leads` no sufría esto (usa policies
separadas por comando). **Escaneo de las ~30 tablas**: `visits` era la **única** con el combo `FOR ALL` +
SELECT deliberadamente restringido → blast radius aislado.

**Fix** (`migración 015`, decisión Iván = *fix + endurecer escrituras*): se sustituyó `visits_modify`
(FOR ALL) por `visits_insert` / `visits_update` / `visits_delete` con el **mismo predicado scoped que
`visits_select`** (admin/dg/asistente → todas; director_oficina → su oficina; comercial → solo las suyas).
Resultado: SELECT gobernado solo por `visits_select`, y escrituras tan acotadas como las lecturas (un
comercial no puede ni ver ni tocar/reasignar visitas ajenas; deny por USING / 42501 por WITH CHECK).
`visits_select` no se tocó. Sincronizado en `packages/db/policies/05-visits.sql` (fuente de verdad).

**Efecto colateral aceptado**: con el endurecimiento, el `director_oficina` solo escribe/asigna dentro de
su oficina. El `AddVisitDialog` ofrece todos los miembros del tenant, así que una asignación cross-oficina
por un do fallaría (toast de error). Papercut menor, comportamiento correcto; filtrar miembros por oficina
queda como mejora futura.

**Verificación post-fix**: probe verde — comercial ve 1 (la suya), do ve 2 (su oficina), admin/asistente
ven 5; deny de update ajeno (0 filas) y de asignar a otro (42501). anon-leaks 41/41 intacto.

---

**Próximo paso**: S7 — commit en `checkpoint/fase-08` con OK de Iván + push + deploy alias + **PROMOTE a
producción** + smoke + memoria. Sin commits sin OK explícito.
