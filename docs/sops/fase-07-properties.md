# SOP · Fase 07 — Catálogo de inmuebles (`/properties`)

> **Estado**: ✅ EJECUTADO Y VERIFICADO (2026-06-08). Branch `checkpoint/fase-07` (desde `checkpoint/fase-06`).
> **Plan maestro**: `~/.claude/plans/para-seguir-avanzando-con-proud-patterson.md` (§7, F7).
> **Plan de sesión**: `~/.claude/plans/retomamos-vega-hogar-c-users-sotob-comer-sequential-sundae.md`.
> **Fases previas**: F3 cimientos · F4 datos · F5 `/leads` · F6 pipeline/conversations/labels (patrón a replicar).

---

## 1. Context

Con el panel navegable de extremo a extremo (F5 `/leads` + F6 `/pipeline`/`/conversations`/`/labels`),
F7 construye el **primer módulo NUEVO del port**: el catálogo de inmuebles. **No es port de SETTER**
(no existe allí; está en el bucket "AÑADIR" del plan maestro §4). Se **construye nuevo** reutilizando
al 100% los patrones consolidados de F5/F6, contra **datos que ya existen** (seed F1):

- **`/properties`** — listado master-detail (list-pane F5) con thumbnail de foto principal, filtros
  (tipo/estado/barrio/precio/hab/m²/asignado) + cursor keyset, tabs por tipo/estado.
- **`/properties/[id]`** — ficha con tabs: **Datos** (edición inline gated), **Fotos** (galería URL),
  **Propietario** (`property_owners`, oculto a comercial por RLS), **Leads interesados**
  (`lead_property_interest`, cruce gestionable).
- **CRUD inmueble** gateado por la matriz: crear/editar/archivar (admin/dg/director_oficina);
  eliminar (soft-delete, admin) reforzado con guard de BD.

**Datos seed (F1, sin motor)**: 35 properties (21 venta + 14 alquiler en 10 barrios de Valencia) +
105 property_photos (Unsplash, 3/inmueble) + 35 property_owners. `lead_property_interest` existe pero
está **VACÍA** (F5 ya la lee en la ficha del lead en lectura).

**Simplificación heredada de F5/F6**: la RLS de F1 ya filtra visibilidad por rol; el panel es
**anon+RLS** y NO replica el filtrado a mano. La matriz de permisos (keys `properties.*` sembradas en
F3) gobierna los affordances UI.

---

## 2. Decisiones cerradas (Fase 7)

1. **Anon + RLS en todas las acciones** (`createSupabaseServerClient`, regla 2). NUNCA service-role
   en el panel. El shim de F3 (`authorizeWrite`/`requireTenantRoleAtLeast`) autoriza escrituras; la
   RLS filtra filas. Cliente **untyped** → `.select('literal de una línea')` + probes RLS obligatorias.
2. **Fotos v1 = URL** (decisión Iván): galería lee `property_photos.url` con `<img>` nativo; CRUD de
   fotos = inputs URL+caption contra `property_photos` por RLS existente. **CERO infra nueva, CERO
   `next.config`, CERO Storage.** Subida real a Supabase Storage diferida a fase posterior.
3. **Eliminar = soft-delete + guard de BD** (decisión Iván): se separan dos operaciones:
   - **Archivar** (`status`→sold/rented/inactive): cotidiano, director_oficina+, UPDATE protegido por RLS.
   - **Eliminar** (UPDATE `deleted_at`): admin-only por app-gate **+ reforzado con trigger de BD**
     (`enforce_property_softdelete_admin`, ver S2) → defensa en profundidad completa. RLS es por fila y
     no puede gatear una sola columna; por eso el guard es un trigger `BEFORE UPDATE`. **Único cambio
     de BD de F7 → checkpoint duro de OK.**
4. **Cruce lead↔inmueble = solo desde la ficha del inmueble** (decisión Iván): tab "Leads interesados"
   en `/properties/[id]` (ver+añadir+quitar+estado). **NO se tocan los componentes de F5**
   (`lead-detail.tsx` sigue mostrando intereses en lectura; refresca vía `revalidatePath('/leads')`).
5. **`office_id` en el alta = Select de oficina** (decisión Claude): `properties.office_id` es NOT NULL
   y el shim NO expone oficina (usuario↔oficina N:M vía `user_office_assignments`). Acción mínima
   `listOffices()` (espejo de `listMembers`) puebla un Select en el dialog de alta.
6. **Edición inline en la ficha** (no dialog de edición): ALTA = dialog; EDICIÓN = inline en
   `property-detail.tsx` (estado `editing`, como F5) para no duplicar el formulario grande.
7. **Cursor keyset** `created_at DESC, id DESC` (NOT NULL → sin rama NULLS; más simple que F5).
8. **Joins desanidados** a 2 queries con `.in()` (lección F2/F5): thumbnail de lista, leads del cruce.
   `dynamic='force-dynamic'` en las pages (cookies).
9. **Gating alineado a la RLS exacta** donde el shim no encaja (lección O1): propietarios
   (admin/dg/do/**asistente_captador**) y fotos (do+, más estricto que la RLS que deja comercial) usan
   checks de rol **explícitos**, no solo la jerarquía.

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| S0 — Branch + SOP | ✅ | branch `checkpoint/fase-07`; este SOP redactado |
| S1 — Capa de datos (TS puro) | ✅ | `property-list-query.ts` + `actions/properties.ts` + `actions/offices.ts`; typecheck verde |
| S2 — Guard BD soft-delete (⚠ STOP) | ✅ | migración `014` aplicada con OK de Iván (`db-apply-migrations --only`). Trigger `trg_property_softdelete_admin` activo |
| S3 — Listado `/properties` | ✅ | `format.ts` + tabs/item/pane/filters + layout; stub reemplazado. 35 inmuebles + thumbnails |
| S4 — Ficha + galería | ✅ | detail-sheet + detail (edición inline + archivar/eliminar) + add-dialog + gallery + `[id]/page.tsx` |
| S5 — Propietario + cruce | ✅ | owner-block (gated canViewOwners) + interest-block (buscador leads). Cruce bidireccional verificado |
| S6 — Verificación | ✅ | `test-rls-properties-writes.mjs` verde + typecheck/lint/build + anon-leaks 41/41 + visual MCP (0 errores). Seed pristino |
| S7 — Commit (⚠ STOP) | ✅ | commit en `checkpoint/fase-07` con OK de Iván + push + deploy alias + memoria |

---

## 4. Sub-pasos detallados

### S0 — Branch + SOP
- `git checkout -b checkpoint/fase-07` desde `checkpoint/fase-06` (✅ hecho; árbol limpio salvo daemon).
- Redactar este SOP (espejo de `fase-06`).

### S1 — Capa de datos (`lib/property-list-query.ts` + `lib/actions/properties.ts` + `lib/actions/offices.ts`)
- **`property-list-query.ts`** (tipos puros, sin I/O): `PropertyType`/`PropertyStatus` literales,
  `PropertyListRow` (id, type, status, title, price_eur, monthly_rent_eur, m2_built, rooms, bathrooms,
  neighborhood, assigned_to_user_id, created_at, thumbnailUrl), `PropertyPhotoRow`, `PropertyOwnerRow`,
  `PropertyInterestRow` (+ lead desanidado), `PropertyFilterParams`, `PropertyCursor` {createdAt,id},
  `PropertyTabKey` (all/sale/rent/available/reserved). Helpers `applyPropertyFilters`,
  `rowsForPropertyTab`, `propertyTabCounts`, `priceInRange`, parsers de searchParams (reusar el patrón
  de `lead-list-query.ts`: `one`, `parseCsv*`).
- **`actions/properties.ts`** (anon+RLS). Copiar `authorizeWrite(minRole)` de `leads.ts`. Literales:
  - `PROPERTY_SELECT = 'id, tenant_id, office_id, type, status, title, description, price_eur, monthly_rent_eur, m2_built, m2_useful, rooms, bathrooms, year_built, neighborhood, address_short, features, assigned_to_user_id, created_at, updated_at'`
  - `PHOTO_SELECT = 'id, property_id, url, caption, sort_order'`
  - `OWNER_SELECT = 'id, property_id, full_name, phone, email, notes, created_at, updated_at'`
  - `INTEREST_SELECT = 'id, lead_id, property_id, status, notes, created_at, updated_at'`
  - **Lectura**: `listPropertiesPage({filters,cursor,limit})` (viewer; keyset created_at/id; prefiltro
    SQL `deleted_at is null` + type/status/neighborhood/assignee/precio/rooms/m2 + `q` ilike; 2ª query
    thumbnails min sort_order; post-filtros JS features/precio-cruzado); `getPropertyDetail(id)` (viewer;
    property + Promise.all(photos, owners, interests) + 2ª query leads `.in('id', leadIds)`).
  - **Inmueble**: `createProperty` / `updateProperty` / `archiveProperty` → `authorizeWrite('admin')`
    (do+); validar type/status, `m2_built>0`, price↔type. `deleteProperty` → app-gate `eff.role==='admin'`
    + UPDATE `deleted_at=now()` (+ guard BD S2).
  - **Fotos**: `addPropertyPhoto`/`removePropertyPhoto`/`reorderPropertyPhotos` → gate do+; validar URL.
  - **Propietario**: `addPropertyOwner`/`updatePropertyOwner`/`removePropertyOwner` → check explícito
    `role ∈ {admin,director_general,director_oficina,asistente_captador}`.
  - **Interés**: `addPropertyInterest`/`removePropertyInterest`/`updatePropertyInterestStatus` →
    `authorizeWrite('viewer')`; upsert `onConflict:'lead_id,property_id'`;
    `revalidatePath('/properties/${id}')` + `/leads/${leadId}` + `/leads`.
- **`actions/offices.ts`** → `listOffices()` (`offices` → {id, name} por RLS; verificar SELECT en este paso).
- `pnpm --filter @vega-hogar/panel typecheck` verde.

### S2 — Guard BD soft-delete (⚠ CAMBIO DE BD — STOP para OK)
- `packages/db/migrations/014_property_softdelete_guard.sql` (idempotente):
  ```sql
  CREATE OR REPLACE FUNCTION public.enforce_property_softdelete_admin()
    RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
       AND public.current_user_role() <> 'admin' THEN
      RAISE EXCEPTION 'solo admin puede modificar deleted_at de properties'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END; $$;

  DROP TRIGGER IF EXISTS trg_property_softdelete_admin ON public.properties;
  CREATE TRIGGER trg_property_softdelete_admin
    BEFORE UPDATE ON public.properties
    FOR EACH ROW EXECUTE FUNCTION public.enforce_property_softdelete_admin();
  ```
- **Mostrar el SQL exacto, PARAR y pedir OK.** Tras OK:
  `node scripts/db-apply-migrations.mjs --only 014_property_softdelete_guard.sql`. No afecta a Prisma
  (Prisma no modela triggers). (Opcional) extender `db-verify-schema.mjs` para asertar el trigger.

### S3 — Listado (`components/properties/*` + `app/(app)/properties/page.tsx`)
- `format.ts`: `PROPERTY_TYPE_LABEL` (venta/alquiler), `PROPERTY_STATUS_LABEL` (disponible/reservado/
  vendido/alquilado/inactivo), `NEIGHBORHOOD_LABEL` ×10, `FEATURE_LABEL`, `statusBadgeVariant`,
  `priceOrRent`, `m2Label`, `roomsBathLabel`, reuso de `formatEur`/`formatShortDate` (patrón leads).
- `properties-list-tabs.tsx`, `properties-list-item.tsx` (`<img>` thumbnail + fallback `Building2`),
  `properties-list-pane.tsx` (scroll infinito IntersectionObserver + cursor + dedupById),
  `properties-list-filters.tsx` (chips + Collapsible, CERO popover/checkbox), `properties-layout.tsx`
  (server; `Promise.all`(listPropertiesPage + listMembers + getPropertyDetail si selected) + flags
  `canEdit`/`canDelete`/`canViewOwners`/`canManageInterest` por `ROLE_HIERARCHY`).
- Reemplazar `app/(app)/properties/page.tsx` (quitar `<EnConstruccion>`; `dynamic='force-dynamic'` +
  parseo searchParams + `<PropertiesLayout>`).

### S4 — Ficha + galería (`components/properties/*` + `app/(app)/properties/[id]/page.tsx`)
- `property-detail-sheet.tsx` (Sheet open=detail!==null, cierra borrando `selected`).
- `property-detail.tsx` (cabecera + badges + acciones gated + Tabs datos/fotos/propietario/leads;
  edición inline con `editing` + `run(fn,ok)` useTransition+toast+router.refresh(); botones Archivar
  do+ / Eliminar admin-only AlertDialog).
- `add-property-dialog.tsx` (alta, Dialog + useTransition + sonner; Select de oficina vía `listOffices`;
  obligatorios: title, type, status, price/rent según type, m2_built, neighborhood, office).
- `property-gallery.tsx` (fotos URL: `<img>` desde photos por sort_order; si canEdit: añadir URL+caption,
  borrar, reordenar).
- `app/(app)/properties/[id]/page.tsx` (deep-link espejo de `leads/[id]`).

### S5 — Propietario + cruce (`components/properties/*`)
- `property-owner-block.tsx` (SOLO se monta si `canViewOwners`; CRUD owners gated al set RLS).
- `property-interest-block.tsx` ("Leads interesados": lista con link a `/leads?selected=<id>` + alta vía
  **buscador inline** `listLeadsPage({filters:{q},limit:20})` + quitar + cambiar estado).
- Montar ambos en los tabs de `property-detail.tsx`.

### S6 — Verificación (toda por Claude)
- `scripts/test-rls-properties-writes.mjs` (espejo de `test-rls-leads-writes.mjs` + `expectWrite` de
  `test-rls-labels.mjs` que trata **rowCount===0 como deny**). `txAs` (`set_config` jwt claims + `SET
  LOCAL ROLE authenticated` + `ROLLBACK`). Casos:
  - **READS**: properties/photos (admin+comercial ven), **owners (admin ve, comercial 0 filas)**,
    interest, leads, users.
  - **WRITES**: createProperty do+ allow / comercial **deny**; updateProperty do+ allow; DELETE físico
    comercial **deny** / admin allow; **comercial UPDATE deleted_at → 42501 (trigger) / admin allow**;
    addPropertyPhoto do+ allow; addPropertyOwner do+ allow / comercial **deny**; addPropertyInterest
    comercial allow según lead visible.
- `pnpm --filter @vega-hogar/panel typecheck|lint|build` verde + re-correr `test-rls-anon-leaks.mjs` (41/41).
- Visual: **preview MCP** (`preview_snapshot`/`preview_eval`, NO screenshot por WS de HMR). Login `/login`
  PasswordLoginForm; admin `sotobautistaivan@gmail.com` → `/director/dashboard`. Comprobar admin (lista 35
  + thumbnails, filtros, tabs, ficha→galería 3 fotos, tab propietario, crear/quitar interés) y un
  comercial QA (ve lista, ficha SIN tab propietario, sin botones crear/editar/eliminar). 0 errores consola.
- **Seed pristino**: revertir todo write de prueba; confirmar con `pg` que las cifras del seed quedan intactas.

### S7 — Commit (⚠ STOP para OK)
- `git add` selectivo, mostrar diff, **OK de Iván**, commit `feat(fase-07): catálogo de inmuebles —
  /properties anon+RLS + cruce interés + guard soft-delete`, push. Actualizar este SOP (checkmarks) +
  memoria (`fase_07_completada.md` + MEMORY.md). Verificar deploy en alias
  `vega-hogar-panel-git-checkpoint-fase-07-…vercel.app`. Nota daemon `backup` (puede racear).

---

## 5. Validación end-to-end (criterios de cierre)

- typecheck + lint + build verdes.
- `/properties`: lista las 35 del seed con thumbnail; filtros (tipo/estado/barrio/precio/hab/m²/asignado)
  y tabs funcionan; scroll infinito por cursor.
- `/properties/[id]`: ficha con galería (3 fotos/inmueble), datos, propietario (oculto a comercial),
  leads interesados; crear/editar/archivar (do+) y eliminar (admin) funcionan y persisten.
- Cruce: añadir un lead interesado desde la ficha del inmueble aparece en la ficha del lead (F5) sin tocar F5.
- Guard BD: comercial no puede tocar `deleted_at` (42501); admin sí. Probe verde.
- `test-rls-properties-writes.mjs` verde + `test-rls-anon-leaks` 41/41 + 0 `service-role` en `apps/panel/src`.
- Seed pristino (writes de prueba revertidos).

---

## 6. Riesgos

1. **Cliente untyped**: columnas no validadas en compilación → **probes RLS obligatorias** (mitigación F5).
   `.select()` siempre literal de una línea (si no, `GenericStringError`).
2. **Guard BD = único toque a Supabase**: idempotente + `--only` + checkpoint duro + probe que lo valida
   (comercial deny 42501 / admin allow).
3. **Soft-delete app-gate vs RLS**: la RLS de UPDATE deja a comercial; el guard (trigger) cierra el hueco
   sobre `deleted_at`. Otros campos de un inmueble soft-borrado son editables por do+ (benigno: no se lista).
4. **Permisos owners/photos no encajan en el shim** (O1): checks de rol explícitos alineados a la RLS exacta.
5. **`office_id` NOT NULL** (O2): Select de oficina (`listOffices`); verificar `offices` SELECT RLS en S1.
6. **Fotos URL arbitrarias** (O5): `<img>` nativo (no next/image) para no restringir hosts; validar http/https.
   `eslint-disable` puntual si `no-img-element` molesta (NO tocar `next.config`).
7. **Daemon `backup`**: puede racear el commit de cierre (como F4/F6). No `--force` con daemon activo.

---

**Próximo paso tras validar este SOP**: ejecutar S1 (capa de datos, TS puro), luego S2 (BD, con STOP de
OK), S3→S5 (UI), S6 (verificación), S7 (commit con OK). Sin commits sin OK. Cero cambios en Supabase sin
confirmación.
