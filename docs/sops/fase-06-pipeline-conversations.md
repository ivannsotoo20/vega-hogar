# SOP · Fase 06 — Pipeline + Conversaciones + Etiquetas

> **Estado**: ✅ EJECUTADO Y VERIFICADO (2026-06-08). Commit `5ce05df` en `checkpoint/fase-06`.
> **Plan maestro**: `~/.claude/plans/para-seguir-avanzando-con-proud-patterson.md` (§7, F6).
> **Plan de sesión**: `~/.claude/plans/retomamos-vega-hogar-c-users-sotob-comer-deep-locket.md`.
> **Fases previas**: F3 cimientos · F4 datos · F5 `/leads` (patrón a replicar).
> **Branch**: `checkpoint/fase-06` (desde `checkpoint/fase-05`).

---

## 1. Context

Con `/leads` operativo (F5), F6 porta las **3 secciones restantes** del panel de SETTER para
dejar el panel navegable de extremo a extremo **sin motor todavía** (datos seed/mock; el tráfico
real llega en F10):

- **`/pipeline`** — kanban **dual comprador/vendedor**; mover card actualiza `conversations.current_phase`.
- **`/conversations`** — viewer: lista + thread (`conversation_messages`) + composer **deshabilitado**
  (envío real = F10) + toggles **pausa IA** (`ai_paused_until`) y **handoff** (`is_handoff_to_human`).
- **`/labels`** — CRUD del catálogo `tenant_labels` (gestores: admin/director_general, `labels.manage`).

**Simplificación heredada de F5**: la RLS de F4 ya filtra visibilidad por rol (comercial → solo sus
leads; director_oficina → su oficina; admin/dg/asistente → tenant). El panel es **anon+RLS** y NO
replica ese filtrado a mano. La matriz de permisos (keys ya sembradas en F3) gobierna los affordances UI.

---

## 2. Decisiones cerradas (Fase 6)

1. **Anon + RLS en todas las acciones** (`createSupabaseServerClient`, regla 2). NUNCA service-role
   en el panel. El shim de F3 (`requireTenantRoleAtLeast`) autoriza escrituras; la RLS filtra filas.
2. **Kanban = Fases + outcomes** (decisión Iván): columnas de fase F0–F7 arrastrables → `current_phase`;
   además 5 columnas terminales de resultado que aplican **etiquetas-outcome** (reusa `applyLabel`).
3. **Histórico de funnel = sí** (decisión Iván): F6 añade **migración 014 + policy INSERT acotada**
   en `pipeline_events` (`authenticated`, `source='manual'`, `event_type='phase_change'`, conversación
   visible). Cada arrastre de fase registra histórico. **Único cambio de BD de F6 → checkpoint duro de OK.**
   Los outcomes NO escriben evento (su registro es `conversation_labels.applied_at`).
4. **Reglas de etiquetas diferidas** (decisión Iván): `/labels` hace solo CRUD del catálogo
   `tenant_labels`. El editor de `label_automation_rules` se difiere a F9/F10 (inerte sin motor).
5. **Asignación a nivel LEAD** (como F5): no se usa `conversations.assigned_user_id`. El inbox
   muestra/reasigna vía el lead (reuso `assignLead`). No hay key `conversations.assign`.
6. **Sin envío de mensajes** (F10): composer visible pero **deshabilitado** con tooltip "Fase 10".
   No se porta `sendManualMessage`.
7. **Re-domain de canal**: se usa el enum `channel` (whatsapp|voice|web_form|meta_ads|other). **No**
   se portan los filtros IG/FB/`direction`/tabla `channels` de SETTER. Panel ya limpio de ManyChat.
8. **`status` desacoplado del drag** en v1: mover card cambia solo `current_phase`. `status`
   (active/qualified/disqualified/handoff/paused) lo gobiernan los toggles handoff/pausa.
9. **Cursor keyset** `last_message_at DESC NULLS LAST, id DESC` (idéntico a F5) para el inbox.
   Kanban: fetch con cap (sin scroll infinito; necesita repartir por columnas), `log` si se supera.
10. **Joins desanidados** a 2 queries con `.in()` (lección F2/F5). `.select('literal de una línea')`.
    `dynamic='force-dynamic'` en las pages (cookies).

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| S0 — Branch + deps + constantes | ✅ | branch `checkpoint/fase-06`; `@dnd-kit/{core@6.3.1,sortable@10,utilities@3.2.2}`; `lib/pipeline-constants.ts` |
| S1 — BD: histórico de fase (⚠ STOP) | ✅ | **Desviación**: policy-only (sin migración 014 — `pipeline_events` ya existe). Policy `pipeline_events_manual_insert` en `policies/09-pipeline.sql`, aplicada con OK de Iván. Probe `test-rls-pipeline.mjs` verde |
| S2 — Etiquetas `/labels` | ✅ | `labels.ts` (listLabelsAdmin + create/update/delete, gate dg+) + 8 componentes. Reglas diferidas. Probe `test-rls-labels.mjs` verde |
| S3 — Conversaciones `/conversations` | ✅ | `conversation-list-query.ts` + `conversations.ts` (9 acciones) + 11 componentes + 2 rutas. Probe `test-rls-conversations-writes.mjs` verde |
| S4 — Pipeline `/pipeline` | ✅ | `pipeline.ts` (board+movePhase+apply/removeOutcome) + 6 componentes dnd-kit + ruta. Drag fase→current_phase(+evento), outcome→label. Probe `test-rls-pipeline.mjs` verde |
| S5 — ManyChat / canal | ✅ | Verificado: panel sin código ManyChat; no se portaron filtros IG/FB/`direction`/tabla `channels`; enum `channel` |
| S6 — Verificación | ✅ | typecheck/lint/build verdes · 4 probes RLS (pipeline/conversations/labels/anon-leaks 41/41) verdes · visual preview MCP (admin: /labels 10 system, /conversations 12 + thread + toggle pausa en vivo, /pipeline dual buyer+seller) · 0 errores consola |
| S7 — Commit | ✅ | commit `5ce05df` en `checkpoint/fase-06`, pusheado a origin (con OK de Iván) + memoria |

---

## 4. Sub-pasos detallados

### S0 — Branch + deps + constantes
- `git checkout -b checkpoint/fase-06` desde `checkpoint/fase-05` (✅ hecho; árbol limpio).
- Añadir a `apps/panel/package.json`: `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`,
  `@dnd-kit/utilities@^3.2.2` (única dep nueva; sin modifiers). `pnpm install` (root).
- Crear `apps/panel/src/lib/pipeline-constants.ts`:
  - `ColumnKey` = `f0..f7` ∪ `cancelled|no_show|recontact|bought|lost`.
  - `BUYER_PHASES` / `SELLER_PHASES` (nombres §catálogo) y `OUTCOME_COLUMNS` (bucket+label+color).
  - `COLUMN_COLORS` (fases oliva/terracota marca Vega; outcomes desde colores de system labels seed).
  - Helper `trackForIntent(intent)` → `'buyer' | 'seller'` (buyer/tenant→buyer; seller/landlord→seller;
    unknown→buyer por defecto).

**Catálogo dual** (coincide con `phases` seed, 13 filas):
- **Comprador** (buyer/tenant): F0 Pre-contacto · F1 Conexión · F2 Necesidad · F3 Cualificación ·
  F4 Puente · F5 Propuesta de visita · F6 Agenda de visita · F7 Cierre/Handoff.
- **Vendedor** (seller/landlord): F0 Pre-contacto · F1 Conexión · F2 Inmueble · F3 Cualificación ·
  F4 Puente · F5 Propuesta de tasación · F6 Agenda de tasación · F7 Cierre/Handoff.
- **Outcomes** (5, compartidas): Cancelada(`cancelled`) · No-show(`no_show`) · Recontactar(`recontact`) ·
  Cerrado/Ganado(`bought`) · Perdido(`lost`).

### S1 — BD: histórico de fase (⚠ CAMBIO DE BD — STOP para OK)
- `packages/db/migrations/014_pipeline_events_manual_insert.sql` + policy en `policies/09-pipeline.sql`:
  ```sql
  DROP POLICY IF EXISTS pipeline_events_manual_insert ON public.pipeline_events;
  CREATE POLICY pipeline_events_manual_insert ON public.pipeline_events
    FOR INSERT TO authenticated
    WITH CHECK (
      tenant_id = public.current_tenant()
      AND conversation_id IN (SELECT id FROM public.conversations)
      AND source = 'manual'
      AND event_type = 'phase_change'
    );
  ```
- **Mostrar el SQL exacto, PARAR y pedir OK.** Tras OK: `pnpm --filter @vega-hogar/db` →
  `db-apply-migrations` + `db-apply-policies`. No afecta a Prisma (policy pura).
- Probe inmediata (`test-rls-pipeline.mjs`): authenticated puede INSERT phase_change/manual en conv
  visible; DENEGADO (42501) outcome_applied, source=motor, otro tenant, conv no visible; SELECT solo admin/dg.

### S2 — Etiquetas (`apps/panel/src/lib/actions/labels.ts` + `components/labels/`)
- Extender `labels.ts` (ya tiene `listLabels` de F5): `listLabelsAdmin()` → `LabelAdminRow[]`
  (id, name, color, description, is_system, destination_bucket, pause/resume_ai_on_apply,
  auto_assign_to, **usage_count** via 2ª query a `conversation_labels` con `.in(label_id)`).
- `createLabel({name,color,description,destinationBucket,...})` · `updateLabel({labelId,patch})` ·
  `deleteLabel(labelId)`. Gate `requireTenantRoleAtLeast({minRole:'admin'})` (= director_general+,
  vocabulario shim) → coincide con RLS `tenant_labels` (admin/dg). System labels: `name`+`destination_bucket`
  inmutables; `is_system` no borrable (error claro). `revalidatePath('/labels')`.
- `components/labels/*`: `labels-layout` (server), `labels-list` (tabla: color chip, nombre, bucket,
  uso, editar/borrar), `add-label-dialog`, `edit-label-dialog` (sin tab reglas), `delete-label-dialog`,
  `color-picker` (input nativo + swatches de la paleta; sin dep), `system-badge`.
- Reemplazar stub `app/(app)/labels/page.tsx` (`listLabelsAdmin` + flag `canManage` por rol).

### S3 — Conversaciones (`lib/conversation-list-query.ts` + `lib/actions/conversations.ts` + `components/conversations/`)
- `conversation-list-query.ts` (tipos puros): `ConversationFilterParams` (q, channel-enum, aiState,
  handoff, unread, mine, labelIds), `ConversationListRow` (id, lead_id, lead_name, channel, status,
  current_phase, ai_paused_until, is_handoff_to_human, is_unread, is_blocked, last_message_at, labels[]),
  `ConvTabKey` (all/activos/handoff/pausados), `classifyConvTab`, `applyConvFilters`, parsers.
- `actions/conversations.ts` (anon+RLS):
  - `listConversationsPage({filters,cursor,limit})` → `{rows,nextCursor,hasMore}`. Query a
    `conversations` (keyset) + desanidar lead (nombre) y `conversation_labels` en 2 queries `.in()`.
  - `getConversationDetail(conversationId)` → conv + lead + `conversation_messages` (ASC) + notas + labels.
  - `togglePauseConversation({conversationId,paused})` — `ai_paused_until` = `'infinity'|null`. Gate `agent.pause` (todos).
  - `setConversationHandoff({conversationId,on,cause?,reason?})` — `is_handoff_to_human`+`handoff_*`. Gate `agent.handoff` (todos).
  - `setConversationUnread` / `setConversationBlocked` (block: gate director_oficina+).
  - `addConversationNote` / `listConversationNotes` — `conversation_notes` (author = shim).
  - apply/remove label — reuso `conversation_labels` + side-effects (`tenant_labels`).
  - **Sin `sendManualMessage`** (composer disabled).
- `components/conversations/*`: `conversation-layout` (server orquesta), `conversation-list-pane`
  (scroll infinito IntersectionObserver), `conversation-list-item`, `thread-pane` (burbujas por rol:
  lead izq, agent/human der, system centrado-muted; orden created_at,id), `thread-composer` (disabled +
  tooltip "Fase 10"), `ai-control-panel` (pausa + handoff toggles, indicadores), `conversation-topbar`.
  Reusar `components/leads/format.ts`.
- Rutas `app/(app)/conversations/page.tsx` (lista + Sheet `?selected=`) + `[id]/page.tsx` (deep-link).

### S4 — Pipeline (`lib/actions/pipeline.ts` + `components/pipeline/`)
- `actions/pipeline.ts`:
  - `listPipelineBoard({track,filters})` → `{columns: Record<ColumnKey,PipelineCard[]>, total}`. Fetch
    conversations (cap ~500, `log` si excede) + leads (nombre/intent) + outcome labels (2 queries `.in()`).
    Columna de una card = outcome label terminal si existe, si no `f{current_phase}`. Filtra por track
    (intent del lead).
  - `movePhase({conversationId,toPhase})` — gate `pipeline.move` (todos, RLS escopa). UPDATE
    `current_phase` + INSERT `pipeline_events` (phase_change, from/to, source='manual').
  - `applyOutcome({conversationId,bucket})` — reuso `applyLabel` con la system label de ese bucket
    (`bought` desambigua por intent: buyer/seller→"Comprado", tenant/landlord→"Alquilado") + exclusión
    mutua de otras outcome labels.
  - `removeOutcome({conversationId})` — quita las outcome labels.
- `components/pipeline/*`: `pipeline-layout` (server), `pipeline-board` (`DndContext` +
  `PointerSensor{distance:8}` + `useOptimistic`; `onDragEnd` ramifica fase vs outcome), `pipeline-column`
  (droppable), `pipeline-card` (`useSortable`, link a `/conversations?selected=id`, badges intent/fase/IA),
  `pipeline-card-overlay`, `pipeline-track-toggle` (Compradores/Vendedores).
- Reemplazar stub `app/(app)/pipeline/page.tsx`.

### S5 — ManyChat / canal
- Saneamiento/verificación: el panel Vega no tiene código ManyChat (grep limpio salvo docs + comentario
  en migración 012). NO portar de SETTER: filtros por canal IG/FB, `direction` inbound/outbound, tabla
  `channels`, `via_provider`. Conversations/pipeline usan el enum `channel`.

### S6 — Verificación (toda por Claude)
- `pnpm --filter @vega-hogar/panel typecheck|lint|build` verde.
- Probes RLS nuevas (sin password: `set_config` jwt claims + `SET LOCAL ROLE authenticated` + `ROLLBACK`):
  - `scripts/test-rls-pipeline.mjs` (policy INSERT + SELECT admin/dg + writes movePhase por rol).
  - `scripts/test-rls-conversations-writes.mjs` (columnas + pausa/handoff/unread/block/note/label por rol).
  - `scripts/test-rls-labels.mjs` (CRUD tenant_labels admin-dg sí / comercial no; system no borrable).
  - Ampliar `scripts/test-rls-anon-leaks.mjs` (sin tablas nuevas; 41/41 sigue).
- Visual: **preview MCP** (`preview_snapshot`/`preview_eval`, NO screenshot contra dev server por el WS
  de HMR) + **usuario QA temporal** (admin, GoTrue admin REST + `pg`, **BORRADO al acabar**): kanban dual
  (12 cards, drag fase→fase mueve columna + escribe evento, drag→outcome aplica label), inbox (thread 3
  msgs, pausa/handoff togglean en vivo), labels (crear/editar/borrar custom, system protegido). 0 errores consola.

### S7 — Commit
- `git add` selectivo, mostrar diff, **OK de Iván**, commit `feat(fase-06): pipeline + conversations +
  etiquetas — port anon+RLS`, push. Actualizar este SOP (checkmarks) + memoria (`fase_06_completada.md`
  + MEMORY.md). Nota daemon `backup` (puede racear el mensaje del commit).

---

## 5. Validación end-to-end (criterios de cierre)

- typecheck + lint + build verdes.
- `/pipeline`: kanban dual con las 12 conversaciones del seed repartidas; arrastrar entre fases mueve la
  card y persiste `current_phase` + escribe `pipeline_events`; arrastrar a outcome aplica la etiqueta.
- `/conversations`: lista + thread (3 msgs/conv) + composer disabled; pausa IA y handoff persisten en vivo.
- `/labels`: 10 system labels visibles (protegidas); crear/editar/borrar custom funciona; comercial no gestiona.
- 3 probes RLS nuevas verdes + `test-rls-anon-leaks` verde + 0 `service-role` en `apps/panel/src` (grep).
- Usuario QA temporal borrado.

---

## 6. Riesgos

1. **Drag manual de fase vs motor (F10)**: en F6 el panel gobierna `current_phase`; en F10 el motor también.
   Tensión consciente (showcase necesita control manual); propiedad se reconcilia en F10. No bloquea F6.
2. **Cliente untyped**: columnas no validadas en compilación → **probes RLS obligatorias** (mitigación F5).
   `.select()` siempre literal de una línea (si no, `GenericStringError`).
3. **Policy INSERT nueva = superficie de escritura**: acotada a manual/phase_change/conv-visible. Probe
   explícita de que NO permite otros event_type/source ni cross-tenant.
4. **`pipeline_events` SELECT solo admin/dg**: comercial inserta su evento pero no lee histórico (coherente
   F4). El kanban lee `current_phase`, no eventos.
5. **dnd-kit + RSC**: el board es client; el server solo orquesta. `useOptimistic` para UX; revertir en error.
6. **Daemon `backup`**: puede racear el commit de cierre (como F4). No reescribir si gana el mensaje.
7. **Asignación duplicada**: `conversations.assigned_user_id` existe pero NO se usa (asignación a nivel lead).

---

**Próximo paso tras validar este SOP**: ejecutar S0 (deps + constantes) y S1 (BD, con STOP de OK),
luego S2→S5 (módulos), S6 (verificación), S7 (commit con OK). Sin commits sin OK. Cero cambios en
Supabase sin confirmación.
