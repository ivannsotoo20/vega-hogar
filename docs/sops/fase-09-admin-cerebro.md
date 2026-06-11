# SOP · Fase 09 — Admin agencia + Cerebro (`/admin/*` + `/settings/*`)

> **Estado**: 🟡 EN EJECUCIÓN (arrancada 2026-06-11). Branch `checkpoint/fase-09` (desde `checkpoint/fase-08`).
> **Plan maestro**: `~/.claude/plans/para-seguir-avanzando-con-proud-patterson.md` (§9 F9, §5/§6 prompts, §7 admin/settings, §10).
> **Plan de sesión**: `~/.claude/plans/retomamos-vega-hogar-c-users-sotob-comer-purring-beacon.md`.
> **Fases previas**: F2 auth/permisos · F3 shim auth/shell · F4 tablas operativas (prompt_blocks/_versions/_drafts) · F5/F7/F8 (patrones anon+RLS a replicar).

---

## 1. Context

Con 7 módulos operativos cerrados (`/leads`, `/labels`, `/conversations`, `/pipeline`, `/properties`,
`/visits`, `/captacion`), F9 construye la **capa de administración de agencia + el Cerebro (editor de
prompts)** — el último bloque del panel antes de conectar el motor (F10). Reemplaza 4 stubs
`EnConstruccion` (`/admin/dashboard`, `/admin/tenants`, `/admin/admins`, `/admin/cerebro`) + el catch-all
de `/settings`, y añade gestión de miembros e invitaciones sobre el auth magic-link SSR existente.

**F9 es más grande que F8**: dos migraciones Supabase (016 RLS de versiones de prompt; 017 tabla
`pending_invites` + función `SECURITY DEFINER claim_invite`), un flujo de auth público (aceptar
invitación), y un **cambio de doctrina** (Regla 9). Se ejecuta en una rama con **STOP-for-OK por
checkpoint**, nunca de golpe.

### Hechos verificados contra el código real (read-only, 2026-06-11)

| Hecho | Valor | Implicación |
|---|---|---|
| RLS `prompt_blocks` | `select` (admin+tenant) + `modify` FOR ALL (**mismo predicado**) | Sin sobre-exposición (≠ bug F8 visits). admin puede UPDATE prompt_blocks |
| RLS `prompt_block_versions` | **solo** `select` (admin); **sin escritura `authenticated`** | El panel NO puede insertar versiones → **migración 016** habilita publish |
| RLS `prompt_block_drafts` | `select` + `modify` FOR ALL (admin+tenant) | Borradores ya escribibles por admin (autosave) |
| RLS `users` | SELECT self∨tenant · INSERT/UPDATE admin/dg · DELETE admin | Members: editar rol/activo viable sin service-role; usuario recién registrado (rol NULL) **no puede auto-insertarse** → `claim_invite` SECURITY DEFINER |
| RLS `offices`/`user_office_assignments` | SELECT tenant · modify admin/dg | Asignar oficina a miembro viable anon+RLS |
| RLS `tenants` | SELECT = `id=current_tenant()` (solo el propio) | `/admin/tenants` muestra **solo Vega**; cross-tenant diferido |
| Migración / policy slots | migrations→015 · policies→12-calendar | **016/017** y **13-invites.sql** libres |
| pgcrypto | `gen_random_bytes` es default de columna viva (mig 009) | pgcrypto instalado → `digest()` disponible (smoke en S8) |
| Seed prompt_blocks | 3 filas placeholder: `core_v1_base`(NULL), `agencia_vega`(t1), `output_contract_v1`(NULL), todo `-- PENDIENTE F10 --` | El Cerebro edita estos placeholders |
| Permisos matriz | `admin.cerebro.edit`/`admin.tenants.manage`/`admin.users.view`/`admin.users.invite`/`integrations.view` ya existen | **No hay keys nuevas que sembrar** |
| Sin `database.types.ts` / sin prompt-composer / sin `apps/motor/prompts/source/` | (todo F10) | Cerebro sin `previewComposed` ni escritura `.md`; selects de una línea |

---

## 2. Decisiones cerradas (Fase 9)

**Con Iván (2026-06-11)**:
1. **D1 · Cerebro = PUBLICAR YA** (#1). Editor completo borrador→publicar→snapshot que **escribe
   `prompt_blocks`** desde la UI.
2. **D1b · BD-como-fuente-de-verdad (modelo SETTER)** (#1b). **Se reescribe la Regla 9** del CLAUDE.md +
   `anti_jugadas`. El markdown del motor (F10) será artefacto downstream / seed-si-vacío que **NO pisa**
   lo publicado por UI. Requiere **migración 016** (policy admin INSERT en `prompt_block_versions`).
3. **D2 · Admin = shell + 1 tenant** (#2). dashboard + tenants(read-only Vega) + admins(list+toggle).
   **Difiere**: creación de tenants, RLS cross-tenant, ScopeSwitcher (hasta que exista un 2º tenant real).
4. **D3 · Invites por email (tabla + magic-link)** (#3) → **migración 017** (`pending_invites`).
5. **D3b · Entrega = enlace copiable** (#3b, sin email automático). El invitado se auto-registra
   (`supabase.auth.signUp` anon) + `claim_invite` (SECURITY DEFINER) crea su `public.users`. **Cero
   service-role en panel.**
6. **D5 · Settings v1 = Profile + Members + Integrations(info)** (#5). Difiere setup wizard, preferences,
   followup-templates, calendars a sus fases.

**Resueltas por la matriz F2/F3 (gating, #4)**:
- Páginas de agencia (`/admin/dashboard|tenants|admins|cerebro`): `requireRole('admin')` + render-guard
  `if (!profile.isAgencyAdmin) redirect('/dashboard?error=forbidden')`.
- `/admin/permisos`: sin cambios.
- `/settings` + `/settings/profile`: `requireRole('comercial')`. `/settings/members` + `/settings/integrations`:
  `requireRole(['admin','director_general'])`.
- Acciones de escritura: invites/members gated admin/dg; `setAgencyAdmin` admin-only; `createInvite`
  anti-escalada (`rol invitado ≤ rol del invitador`). RLS = última línea.

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| S0 — Branch + SOP + F8.1 + checks | ✅ | branch creada; SOP redactado; **F8.1 commiteado `d156e4e`**; slots/pgcrypto OK |
| S1 — Cerebro capa de datos | ✅ | `cerebro-list-query.ts` + `actions/cerebro.ts` (8 acciones); typecheck verde |
| S2 — Migración 016 (FILES) | ✅ STOP-OK | `016_*.sql` + sync `09-pipeline.sql` + `test-rls-cerebro.mjs` (OK Iván) |
| S3 — Aplicar 016 + probes | ✅ | 016 aplicada; **cerebro probe verde + anon-leaks 41/41** (ROLLBACK, seed pristino) |
| S4 — Cerebro UI | ✅ | `components/cerebro/*` + rutas; **smoke MCP end-to-end** (lista→autosave→publish c/auto-baseline→restaurar), 0 errores consola, seed revertido a pristino |
| S5 — Admin shell | ✅ | dashboard (KPIs 20/12/35…) + tenants(ro Vega + create disabled) + admins (11 miembros + toggle `setAgencyAdmin`); smoke MCP, 0 errores |
| S6 — Settings | ✅ | dispatch en `[[...slug]]` (índice/profile/integrations + fallback) + `actions/profile.ts`; smoke MCP (sin ManyChat), 0 errores |
| S7 — Migración 017 (FILES) | ✅ STOP-OK | `schema.prisma` `PendingInvite` + `017_*.sql` (tabla + `claim_invite` SECURITY DEFINER, `extensions.digest` qualified); prisma generate ✅ (OK Iván) |
| S8 — Aplicar 017 + RLS + probes | ✅ | 017 aplicada; `13-invites.sql` aplicada; **anon-leaks 42/42 · invites ✓ · members-writes ✓** (ROLLBACK, seed pristino) |
| S9 — Invites + Members + accept-invite | ✅ | `invites.ts` (createInvite/list/revoke/resend) + members writes (role/active/oficina) + `accept-invite/*` (signUp+claim browser) + middleware; typecheck/lint/build verdes; render+invite-link smoke OK, 0 errores, invite de prueba borrado |
| S10 — Verificación total | ✅ (con deuda) | probes ✅ (anon-leaks 42/42, cerebro, invites, members) + typecheck/lint/build ✅ + visual MCP por módulo ✅ (cerebro publish/restore en vivo, admin, settings, members render + invite-link, accept-invite render). **DEUDA S10 (decisión Iván 2026-06-11): E2E real de invitación (signUp+claim) DIFERIDO** — requiere Supabase signups ON + confirm OFF; el flujo está cubierto a nivel SQL por `test-rls-invites` (claim_invite email-match/mismatch/expired/revoked/used). Round-trip de escritura de miembros por UI también diferido (cubierto por `test-rls-members-writes`). |
| S11 — Doctrina Regla 9 | ✅ | Regla 9 reescrita a BD-como-verdad en CLAUDE.md repo + `anti_jugadas.md` (ítem 15) |
| S12 — Commit + promote (⚠ STOP) | 🟡 | commit `feat(fase-09)` + push + alias + PROMOTE + smoke + memoria |

---

## 4. Sub-pasos detallados

### S0 — Branch + SOP + F8.1 + checks de BD (read-only)
- `git checkout -b checkpoint/fase-09` desde `checkpoint/fase-08` (✅ hecho; F8.1 arrastrado al árbol).
- Redactar este SOP (espejo de `fase-08-captacion-visitas.md`) (✅).
- Verificar slots 016/017 + `13-invites.sql` libres (✅) y pgcrypto/`digest` (✅ transitivo; smoke S8).
- **F8.1 (seguimiento de F8)**: `listAssignableMembers()` en `lib/actions/members.ts` + wiring en
  `components/visits/visits-layout.tsx` + `scripts/test-visit-assignable-members.mjs` +
  `scripts/qa-set-password.mjs`. **STOP-OK** → commit `feat(fase-08.1): filtro de comerciales asignables
  por oficina en /visits (espejo RLS 015)`.

### S1 — Cerebro capa de datos (TS, anon+RLS)
- **`lib/cerebro-list-query.ts`** (puro, sin I/O): `BlockScope='shared'|'tenant'`; `BlockListRow`
  (`id, blockKey, tenantId, scope, sortOrder, isActive, version, hasDraft, updatedAt`); `BlockDetail`
  (`block, activeContent, draft:{content,baseVersion,updatedAt}|null, latestVersionNumber`); `VersionRef`
  (`id, versionNumber, changedAt, changeSummary, wasApplied, changedBy`); `deriveScope(tenantId)`.
- **`lib/actions/cerebro.ts`** (`'use server'`; header doctrina como `visits.ts`; gate `eff.role==='admin'`
  + `isAgencyAdmin`; selects literales de una línea):
  - `BLOCK_SELECT='id, tenant_id, block_key, content, sort_order, is_active, version, created_at, updated_at'`
  - `VERSION_SELECT='id, prompt_block_id, version_number, content, changed_by, changed_at, change_summary, was_applied'`
  - `DRAFT_SELECT='id, block_key, tenant_id, content, base_version, owner_user_id, created_at, updated_at'`
  - `listBlocks()` (order sort_order; 2ª query drafts del owner → Set `${block_key}|${tenant_id??-1}` para hasDraft).
  - `getBlockDetail(blockKey, tenantId|null)` (bloque activo `.maybeSingle()` con `.is('tenant_id',null)`/`.eq` +
    última versión + draft del owner; branching `is null` vs `eq` = `IS NOT DISTINCT FROM`).
  - `listVersions(promptBlockId, limit=20)` · `loadVersionContent(versionId)`.
  - `saveDraft({blockKey,tenantId,content,baseVersion})` — **upsert manual** (SELECT por
    block_key+owner+tenant → UPDATE o INSERT; PostgREST upsert no usa el índice COALESCE). owner=eff.userId.
  - `discardDraft({blockKey,tenantId})` (0 filas = benigno).
  - **`publishDraft({blockKey,tenantId,changeSummary})`** — el flujo: (a) cargar draft (no → `no_draft`);
    (b) cargar bloque activo; (c) si existe: conflict-check `draft.base_version!==block.version` →
    `version_conflict`; INSERT version (`version_number=block.version+1`, content, changed_by, was_applied=true);
    UPDATE prompt_blocks (content, version, updated_at) con **deny=0-filas** → `denied`; (d) si no existe:
    INSERT bloque + version v1; (e) DELETE draft. `revalidatePath('/admin/cerebro'`+`'/admin/cerebro/[blockKey]')`.
    **Sin .md, sin previewComposed.**
  - `restoreVersion({versionId})` — forward restore (nueva versión con contenido viejo; mismo write-path que publish-c).
- `pnpm --filter @vega-hogar/panel typecheck` verde (reads ya funcionan; publish fallará hasta 016 — OK).

### S2 — Migración 016 + sync policy (FILES, no aplicar) · ⚠ STOP-OK
- `packages/db/migrations/016_prompt_versions_admin_insert.sql` (idempotente, sin BEGIN/COMMIT propio):
  ```sql
  DROP POLICY IF EXISTS prompt_block_versions_admin_insert ON public.prompt_block_versions;
  CREATE POLICY prompt_block_versions_admin_insert ON public.prompt_block_versions
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() = 'admin'
               AND prompt_block_id IN (SELECT id FROM public.prompt_blocks));
  ```
  APPEND-ONLY (sin UPDATE/DELETE). Comentario: `prompt_blocks_modify` FOR-ALL es benigno (predicado==SELECT) → no se divide.
- Espejo del bloque en `packages/db/policies/09-pipeline.sql` (tras `prompt_block_versions_select`).
- Escribir `scripts/test-rls-cerebro.mjs` (clon de `test-rls-visits-writes.mjs`).
- **STOP**: Iván revisa SQL + el flujo publish.

### S3 — Aplicar 016 + probes · ⚠ STOP
- `node scripts/db-apply-migrations.mjs --only 016_prompt_versions_admin_insert.sql` (tras OK).
- `node scripts/test-rls-cerebro.mjs` verde (admin lee 3 + INSERT version + draft RW/discard; no-admin deny;
  publish simulado allow admin / deny no-admin).
- `node scripts/test-rls-anon-leaks.mjs` (regresión; sin tabla nueva aún).
- **STOP**: adjuntar output.

### S4 — Cerebro UI (`components/cerebro/*` + rutas)
- `cerebro-block-list.tsx` (badges scope/version/borrador; link a `[blockKey]?tenant=shared|1`).
- `block-editor.tsx` (re-domain de `prompt-block-editor.tsx`: textarea markdown + autosave debounced→saveDraft +
  badge borrador + dropdown versiones→loadVersionContent + diff opcional + AlertDialog "Publicar"→publishDraft +
  "Descartar borrador" + "Restaurar versión"). `useTransition` + sonner.
- `cerebro-layout.tsx` + `format.ts` opcional.
- `app/(app)/admin/cerebro/page.tsx` (lista; reemplaza stub) + `app/(app)/admin/cerebro/[blockKey]/page.tsx`
  (`?tenant`). Gate `requireRole('admin')` + `if(!isAgencyAdmin) redirect`.
- Smoke visual MCP: autosave → publish → versión nueva → restaurar.

### S5 — Admin shell
- `admin/dashboard/page.tsx`: KPIs read-only del tenant (`count:'exact',head:true` sobre leads/conversations/
  properties/visits/users activos). Gate agencia. Pure read (helper `lib/agency-kpis.ts`).
- `admin/tenants/page.tsx`: `select('id, slug, name, is_active, onboarded_at, created_at')` → solo Vega;
  card read-only + stats; "Nueva inmobiliaria" **deshabilitado** + explicación. Pure read.
- `admin/admins/page.tsx`: lista `users WHERE is_agency_admin=true`; toggle. Nueva acción en
  `lib/actions/members.ts`: `setAgencyAdmin({userId,isAgencyAdmin})` (gate admin; guards: no auto-quitar, no
  último agency-admin; deny=0-filas). `components/admin/admins-client.tsx`.
- Probe focalizado del toggle (append a un probe de identidad o `test-rls-admins.mjs`).
- `pnpm typecheck`.

### S6 — Settings (restructure rutas)
- `settings/page.tsx` (index, cards Perfil/Miembros/Integraciones por rol). Mantener `[[...slug]]` como
  fallback `EnConstruccion` para hrefs aún no construidos.
- `settings/profile/page.tsx` + `lib/actions/profile.ts`: **lectura** de la propia fila + **cambiar password**
  (`auth.updateUser({password})`) + opcional **nombre para mostrar** en `auth user_metadata`
  (`updateUser({data:{full_name}})`). **No** escribe `public.users.full_name`. Gate `requireRole('comercial')`.
- `settings/integrations/page.tsx`: read-only informativa (catálogo GHL/YCloud/Meta del enum
  `IntegrationProvider`, **sin ManyChat**, badge "config real en F10/F13"); opcional leer
  `integration_accounts` (vacío hoy). Gate admin/dg.
- `pnpm typecheck`.

### S7 — Migración 017 + Prisma (FILES, no aplicar) · ⚠ STOP-OK
- `schema.prisma`: model `PendingInvite` (+ relaciones inversas en Tenant/User/Office). Índice parcial
  único `pending_invites_active_uq` = SQL-only (no expresable en Prisma; nota en cabecera de la migración).
- `packages/db/migrations/017_pending_invites.sql`:
  - Tabla `pending_invites` (per-command RLS, **sin DELETE**): `id, tenant_id(FK CASCADE), email CITEXT,
    role user_role, office_id(FK SET NULL), invited_by(FK users RESTRICT), token_hash TEXT (UNIQUE),
    expires_at, accepted_at, accepted_user_id(FK SET NULL), revoked_at, created_at`. Índice parcial único
    `(tenant_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL`. `ENABLE ROW LEVEL SECURITY`.
  - **`claim_invite(p_token text)`** SECURITY DEFINER, `SET search_path=public,pg_temp`: valida
    `encode(digest(p_token,'sha256'),'hex')` por índice hash; rechaza revoked/expired; **EMAIL_MISMATCH** si
    `invite.email <> auth.email()`; CAS sobre `accepted_at`; INSERT `public.users` + opcional
    `user_office_assignments`; idempotente si la fila ya existe. `REVOKE EXECUTE FROM PUBLIC, anon` +
    `GRANT EXECUTE TO authenticated`.
- `pnpm --filter @vega-hogar/db prisma:generate` (sin tocar BD).
- **STOP**: Iván revisa el SQL (tabla + función) + el diff de Prisma.

### S8 — Aplicar 017 + RLS + probes · ⚠ STOP
- `node scripts/db-apply-migrations.mjs --only 017_pending_invites.sql` (tras OK).
- Escribir `packages/db/policies/13-invites.sql` (SELECT/INSERT/UPDATE admin/dg; INSERT WITH CHECK
  `invited_by IN (SELECT id FROM users WHERE auth_user_id=auth.uid())`; **sin DELETE, sin FOR ALL**).
  `node scripts/db-apply-policies.mjs`.
- Smoke `SELECT digest('x','sha256')` (confirma pgcrypto).
- Añadir `'pending_invites'` a `scripts/test-rls-anon-leaks.mjs` (**tabla #42**).
- `scripts/test-rls-invites.mjs` (admin/dg INSERT/SELECT/revoke allow; do/comercial deny; `invited_by` ajeno
  deny; cross-tenant deny; `claim_invite`: email-match→created+fila users; wrong-email→EMAIL_MISMATCH;
  expired/revoked/used→error; anon→fail).
- `scripts/test-rls-members-writes.mjs` (admin/dg UPDATE users role/active allow; comercial/do deny;
  uoa INSERT/DELETE admin/dg allow, comercial deny).
- Las 3 verdes (anon-leaks **42/42**). **STOP**: adjuntar output.

### S9 — Invites + Members + accept-invite (código)
- `lib/actions/invites.ts`: `createInvite({email,role,officeId?})` (gate dg+; anti-escalada `rol≤eff.role`;
  token `crypto.randomBytes(32).toString('base64url')`, guarda `sha256` hash, devuelve **raw una vez** +
  `acceptUrl` vía `getOrigin()`; 23505→`ALREADY_ACTIVE`; deny=0-filas), `listInvites`, `revokeInvite`,
  `resendInvite` (revoke+nuevo). **Nunca loggear raw/url.**
- `lib/actions/members.ts` (+): `updateMemberRole`, `toggleMemberActive`, `assignMemberOffice`,
  `unassignMemberOffice` (gate admin/dg; guards: no auto-desactivar, no degradar último admin; deny=0-filas).
- `app/accept-invite/{page,AcceptInviteForm,actions}.tsx` (FUERA de `(app)`; espejo `PasswordLoginForm`):
  `signUp` anon → `acceptInviteAction` → `supabase.rpc('claim_invite',{p_token})` → reload `/dashboard`.
- **Editar `apps/panel/src/middleware.ts`**: añadir `/accept-invite` a `ALWAYS_PUBLIC_PATHS`.
- `components/settings/{members-section,members-client,copy-link-dialog}.tsx`. "Invitar miembro" →
  `createInvite` → diálogo copia-enlace. Dispatch en `settings/[[...slug]]` o `settings/members/page.tsx`
  (confirmar resolución sin colisión con el catch-all).
- `pnpm typecheck`/`lint`/`build`.

### S10 — Verificación total · ⚠ STOP
- Probes: `test-rls-anon-leaks` **42/42** + `test-rls-cerebro` + `test-rls-invites` + `test-rls-members-writes`
  + `test-rls-roles` (si existe) verdes.
- `pnpm --filter @vega-hogar/panel typecheck|lint|build` + `grep` 0 `service-role` en `apps/panel/src`.
- **Visual MCP** (login admin → `/director/dashboard`): `/admin/cerebro` (publish + restore en vivo),
  `/admin/dashboard` KPIs, `/admin/tenants` (Vega ro), `/admin/admins` (toggle con guards), `/settings/profile`
  (password; org fields ro para no-admin), `/settings/integrations` (info), `/settings/members` (editar rol/oficina).
  Comercial QA: `/admin/*` redirige; `/settings/profile` ro.
- **E2E invite** (tras pasos manuales Supabase de Iván: signups ON, confirm OFF): admin crea invite → copia
  enlace → incógnito signUp → claim → dashboard correcto; reuso→usado; email distinto→mismatch.
- **Seed pristino**: revertir todo write de prueba (drafts/versions/prompt_blocks content; users de prueba;
  invites) con `pg`; confirmar 3 prompt_blocks placeholder intactos, 0 versions, seed users original.

### S11 — Doctrina Regla 9 · ⚠ STOP-OK
- Reescribir **Regla 9** en `CLAUDE.md` (repo) + memoria `anti_jugadas.md` al modelo BD-como-verdad
  (markdown del motor F10 = downstream / seed-si-vacío; NO clobber). **Con OK explícito de Iván.**

### S12 — Commit + promote (⚠ STOP para OK)
- `git add` selectivo, mostrar diff, **OK de Iván**, commit `feat(fase-09): admin agencia + cerebro —
  /admin/{dashboard,tenants,admins,cerebro} + /settings + invites (migr 016/017) + reescritura Regla 9`,
  push. Verificar deploy alias `vega-hogar-panel-git-checkpoint-fase-09-…vercel.app`. **PROMOVER**:
  `vercel promote <url> --scope ivans-projects-63b5f517 --yes`. Smoke `https://vega-hogar-panel.vercel.app`
  (`/`, `/admin/tenants`, `/admin/cerebro`, `/settings`, `/login`). Actualizar memoria
  (`fase_09_completada.md` + MEMORY.md) + checkmarks del SOP. Daemon `backup` puede racear; **no `--force`**.

---

## 5. Validación end-to-end (criterios de cierre)
- typecheck + lint + build verdes; **0 `service-role` en `apps/panel/src`**.
- **Cerebro**: lista 3 bloques; autosave borrador; publish → versión + UPDATE prompt_blocks; restaurar
  versión; `version_conflict` manejado. `test-rls-cerebro` verde.
- **Admin**: dashboard KPIs; tenants = Vega ro; admins toggle con guards.
- **Settings**: profile (password self-service; org fields ro no-admin); integrations info.
- **Invites/Members**: crear invite (enlace copiable) → aceptar (signUp+claim) crea `public.users` con rol
  correcto; email-mismatch/expired/reuse rechazados; editar rol/oficina/activo (admin/dg). Probes verdes.
- **`test-rls-anon-leaks` 42/42** (única tabla nueva = `pending_invites`).
- **Seed pristino**.

## 6. Riesgos
1. **Reabrir Regla 9** (doctrina no-negociable) → reescribir CLAUDE.md + memoria con OK; F10 trata markdown
   como downstream (seed-si-vacío), no clobber.
2. **Flujo público de invites** (token/SECURITY DEFINER/self-signup) → §10: hash-only, email-match, CAS,
   REVOKE/GRANT, `getOrigin`; depende de ajustes Supabase de Iván (signups ON, confirm OFF, `NEXT_PUBLIC_SITE_URL`).
3. **Subtileza RLS de profile** (no auto-edit de `users.full_name`) → password + auth-metadata; sin nueva policy.
4. **Deny RLS = 0 filas** (no 42501) → `.select()` posterior en todo write (publish, members, setAgencyAdmin).
5. **Doble migración + tamaño** → STOP-for-OK por checkpoint; se puede pausar entre mitades
   (Cerebro+Admin+Settings ↔ Invites) sin romper.
6. **`/accept-invite` y el signOut `no_profile`** → añadir a `ALWAYS_PUBLIC_PATHS` (el invitado tiene sesión
   sin `public.users` hasta el claim).
7. **Daemon `backup`** racea el commit de cierre (como F4/F6/F7/F8). No `--force`.

---

## 7. Pasos manuales de Iván (Supabase) — antes de la E2E de invites (S10)
1. **Authentication → Enable signups = ON** (sin esto `signUp` falla).
2. **Email confirmation = OFF** (v1: claim síncrono; ON requiere variante `/accept-invite/continue`, diferida).
3. **`NEXT_PUBLIC_SITE_URL`** correcto por entorno (mitigado por `getOrigin()` de `headers()`).
4. (Solo variante confirm-ON) Redirect URLs incluyen el dominio Vercel `/auth/callback`.

---

**Próximo paso**: S0 — commit F8.1 con OK de Iván, luego S1 (capa de datos del Cerebro). Cero cambios en
Supabase y cero commits sin OK explícito.
