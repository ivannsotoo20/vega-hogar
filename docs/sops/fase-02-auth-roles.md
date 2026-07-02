# SOP · Fase 02 — Auth panel + 5 roles + matriz permisos

> **Estado**: CERRADA · branch `checkpoint/fase-02`.
> **Plan de implementación**: _plan de sesión del autor (archivo local, no versionado en el repo)_.
> **Fase previa**: `fase-01-modelo-datos.md` (cerrada 2026-05-25).
> **Inicio**: 2026-05-27.
> **Cierre**: 2026-05-27.

---

## 1. Context

Fase 0 dejó el monorepo + Vercel + Supabase + motor en marcha. Fase 1 sembró el
modelo de datos completo (16 tablas + 38 RLS + seed Vega Hogar). El panel desplegado
en `https://vega-hogar-panel.vercel.app` solo renderizaba una landing estática.

Fase 2 habilita login real con magic link Supabase SSR, gating por rol con middleware
+ helpers server-side, dashboards stub por rol, y matriz de permisos editable desde
admin. La fuente de verdad de seguridad sigue siendo RLS (Fase 1) — la matriz solo
controla visibilidad UI.

---

## 2. Decisiones cerradas

1. **Matriz permisos = tabla nueva `permissions_matrix` + UI editable `/admin/permisos`**.
   La matriz es UI-permission; RLS sigue siendo ground truth.
2. **shadcn init manual** con preset `radix-vega` (escala neutral). Paleta Vega
   mapeada por encima en `globals.css`.
3. **Routing híbrido**: middleware redirige por rol en `/dashboard`. Subpáginas
   verifican con `requireRole()` server-side.
4. **Magic link** (`signInWithOtp` con `shouldCreateUser:false`), no password.
5. **Sin layout grupal** `(authed)` en Fase 2 — llega en Fase 3 con sidebar real.
6. **Sin audit log** de la matriz en Fase 2 — diferido (requeriría service role).
7. **`export const dynamic = 'force-dynamic'`** en pages auth-gated (cookies
   impiden SSG).
8. **`Database` types Supabase** definidos a mano en `lib/auth/types.ts` con TODO.

---

## 3. Estado del SOP

Todos los sub-pasos cerrados:

| Sub-paso | Estado | Comentario |
|---|---|---|
| S0 — Branch + esqueleto SOP | ✅ | branch `checkpoint/fase-02` desde `main` (`abad22e`) |
| S1 — Vercel preview env + auto-deploy + SMTP | ⏳ MANUAL IVÁN | acciones UI fuera de alcance Claude |
| S2 — shadcn init + componentes | ✅ | preset `radix-vega` neutral + button/input/card/label/sonner |
| S3 — Capa Supabase SSR | ✅ | 3 archivos en `lib/supabase/` |
| S4 — Middleware raíz | ✅ | 2 fixes aplicados (preserve query + no_profile) |
| S5 — Helpers rol y permisos | ✅ | 4 archivos en `lib/auth/` |
| S6 — Rutas auth | ✅ | 5 archivos + 1 client toast |
| S7 — Dashboards stub | ✅ | 4 pages con `requireRole` |
| S8 — `permissions_matrix` SQL + seed | ✅ | migration 003 + policies 07 + 95 filas |
| S9 — UI `/admin/permisos` | ✅ | page + action + client con optimistic |
| S10 — Test E2E manual | ⏳ DEPENDE S1 | smoke local OK; E2E real necesita SMTP |
| S11 — Typecheck + commit + memoria | ✅ | `feat(fase-02): ...` |

---

## 4. Sub-pasos ejecutados

### S0 — Branch + esqueleto SOP

```bash
git checkout main
git pull --ff-only origin main
git checkout -b checkpoint/fase-02
```

### S1 — Vercel + Supabase Auth (manual Iván)

Tres acciones requeridas en UIs externas para validar S10 E2E real:
1. Vercel UI → Settings → Environment Variables → añadir
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en **Preview**.
2. Vercel UI → Settings → Git → activar deploys automáticos de ramas.
3. Supabase UI → Authentication → SMTP Settings → Sender Name:
   `INMOBILIARIA` → `Vega Hogar Inmobiliaria`.

### S2 — shadcn init

```bash
cd apps/panel
pnpm dlx shadcn@latest init       # → Radix · preset "Vega" (neutral)
pnpm dlx shadcn@latest add button input card label sonner
```

**Bug detectado y arreglado**: shadcn pisó `--background`/`--foreground` con OKLCH
neutro y rompió binding de fuentes con `--font-sans: var(--font-sans)`
(referencia circular). Fix en `globals.css`:
- `--background: var(--color-crema)`
- `--foreground: var(--color-negro-suave)`
- `--primary: var(--color-oliva)`
- `--primary-foreground: var(--color-crema)`
- `--accent: var(--color-terracota)`
- `--accent-foreground: var(--color-blanco-roto)`
- `--font-sans: var(--font-inter)`
- `--font-heading: var(--font-playfair)`

### S3 — Capa Supabase SSR

Archivos en `apps/panel/src/lib/supabase/`:
- `client.ts` — `createSupabaseBrowserClient()` (`createBrowserClient` anon).
- `server.ts` — `createSupabaseServerClient()` con `await cookies()`,
  sin `COOKIE_DOMAIN`.
- `middleware.ts` — helper `updateSession(request)` → `{ supabaseResponse, supabase, user }`.

### S4 — Middleware raíz

`apps/panel/src/middleware.ts`:
- `PROTECTED_PREFIXES = ['/dashboard', '/director', '/oficina', '/comercial', '/admin']`
- `AUTH_ONLY_PATHS = ['/login', '/auth/check-email']`
- `ALWAYS_PUBLIC_PATHS = ['/auth/callback', '/logout']`
- `/dashboard` exacto → redirect por rol vía query a `public.users`.
- `active=false` o `profile=null` → `signOut` + `/login?error={inactive|no_profile}`.
- **Fix #1**: preserva query string en redirect por rol (no pierde `?error=*`).
- **Fix #2**: user con cookie pero sin profile → signOut explícito.

### S5 — Helpers rol y permisos

`apps/panel/src/lib/auth/`:
- `types.ts` — `UserRole` + `ROLE_HIERARCHY` (admin 5 > director_general 4 >
  director_oficina 3 > comercial = asistente_captador 2) + `UserProfile`.
- `getCurrentUser.ts` — cacheado con `React.cache`. Devuelve `{ authUser, profile }`
  o `null`.
- `requireRole.ts` — redirige a `/login` si no auth, `/login?error=inactive` si
  inactivo, `/dashboard?error=forbidden` si rol insuficiente.
- `permissions.ts` — `getPermissionsForRole(role)` lee `permissions_matrix` con
  `React.cache`. `PERMISSION_KEYS` catálogo congelado. Comentario explícito
  "UI-only. RLS es la fuente de verdad".

### S6 — Rutas auth

- `app/login/page.tsx` — server + form a `requestMagicLinkAction`.
- `app/login/actions.ts` — `signInWithOtp({ shouldCreateUser: false })`,
  mensaje genérico (anti-enumeración).
- `app/login/LoginErrorToast.tsx` — client component que lee `?error=*` y
  dispara Sonner toast.
- `app/auth/check-email/page.tsx` — UI estática con email enmascarado.
- `app/auth/callback/route.ts` — GET handler que canjea code →
  `redirect('/dashboard')`. Anti-open-redirect en `next` param.
- `app/logout/route.ts` — POST handler `signOut()` + `/login`.
- `layout.tsx` — añadido `<Toaster richColors />` global.

### S7 — Dashboards stub

- `app/dashboard/page.tsx` — fallback `getCurrentUser` + redirect por rol.
- `app/director/dashboard/page.tsx` — `requireRole(['admin','director_general'])`.
- `app/oficina/dashboard/page.tsx` — `requireRole('director_oficina')` + query
  `user_office_assignments` → `offices` (2 queries, no join).
- `app/comercial/dashboard/page.tsx` — `requireRole(['comercial','asistente_captador'])`.

### S8 — `permissions_matrix`

```sql
-- migrations/003_permissions_matrix.sql
CREATE TABLE public.permissions_matrix (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role            public.user_role NOT NULL,
  permission_key  VARCHAR(80) NOT NULL,
  granted         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, permission_key)
);
```

Policies en `07-permissions-matrix.sql`:
- `pm_select` — SELECT TO authenticated → `tenant_id = current_tenant()`.
- `pm_admin_all` — FOR ALL → admin del tenant.

Seed con `scripts/seed-permissions-matrix.mjs` — 19 keys × 5 roles = 95 filas
mapeadas 1:1 a las 38 RLS de Fase 1.

Comandos aplicados:
```bash
node scripts/db-apply-migrations.mjs --only 003_permissions_matrix.sql
node scripts/db-apply-policies.mjs
node scripts/seed-permissions-matrix.mjs       # inserts=95 updates=0
node scripts/db-verify-schema.mjs              # 63 pases 0 fallos
node scripts/test-rls-anon-leaks.mjs           # 17/17 bloquean anon
```

### S9 — UI `/admin/permisos`

- `app/admin/permisos/page.tsx` — `requireRole('admin')`, carga matriz,
  renderiza con `<PermissionsClient>`.
- `app/admin/permisos/actions.ts` — `togglePermissionAction` con re-validación
  rol admin + upsert.
- `app/admin/permisos/PermissionsClient.tsx` — tabla `role × key` con
  checkboxes + `useTransition` optimistic + Sonner toasts.

### S10 — Test E2E (parcial)

**Smoke test local pasó**: `pnpm dev` arranca, build production verde con
11 rutas (`/`, `/login`, 4 dashboards, `/admin/permisos`, `/auth/callback`,
`/auth/check-email`, `/logout`, Proxy middleware).

**E2E real con magic link real bloqueado por S1**: enviar magic link requiere
SMTP sender "Vega Hogar Inmobiliaria" actualizado en Supabase Auth UI
(acción manual Iván). Test E2E completo se ejecuta cuando S1 esté cerrado.

Checklist E2E (para ejecución cuando S1 listo):
1. Visitar `/` sin sesión → redirect `/login`.
2. Pedir magic link con `sotobautistaivan@gmail.com`.
3. Email Gmail con sender **"Vega Hogar Inmobiliaria"**.
4. Click → `/auth/callback?code=...` → `/dashboard` → `/director/dashboard`.
5. Refrescar mantiene sesión.
6. Logout → `/login`.
7. Re-login → `/admin/permisos` → editar toggle → persistencia OK.
8. User `comercial` en `/admin/permisos` → `/dashboard?error=forbidden`.

### S11 — Cierre

```bash
pnpm --filter @vega-hogar/panel typecheck   # verde
pnpm --filter @vega-hogar/panel lint        # verde
pnpm --filter @vega-hogar/panel build       # 11 rutas, verde
git add <archivos específicos>
git commit -m "feat(fase-02): auth panel + 5 roles + matriz permisos editable"
git push -u origin checkpoint/fase-02
```

---

## 5. Validación end-to-end (criterios de cierre)

Cumplidos:
- `pnpm typecheck` verde en panel.
- `pnpm lint` verde en panel.
- `pnpm build` verde — 11 rutas, todas las auth-gated son `ƒ Dynamic`.
- `db-verify-schema.mjs` → 63 pases, 0 fallos.
- `test-rls-anon-leaks.mjs` → 17/17 tablas bloquean anon.
- Seed `permissions_matrix` → 95 filas (19 × 5).
- Memoria proyecto + MEMORY.md actualizados.

Pendiente (depende S1):
- E2E real magic link con sender "Vega Hogar Inmobiliaria".

---

## 6. Commit y push

Commit message:
```
feat(fase-02): auth panel + 5 roles + matriz permisos editable
```

Branch: `checkpoint/fase-02` → push a `origin`.

---

## 7. Hotfix RLS (post-cierre) — recursión infinita en helpers Fase 1

**Detectado**: 2026-05-28 durante el primer login real con password.

**Síntoma**: tras `signInWithPassword` exitoso (cookie OK, `auth.uid()` devuelve el
UUID correcto), el middleware no encuentra la row del user en `public.users` y
muestra toast "No encontramos tu perfil". Diagnóstico con script
`admin-verify-profile-link.mjs` reveló: la query desde anon+session lanza
`stack depth limit exceeded`.

**Causa raíz**: las helpers `current_tenant()` y `current_user_role()` (Fase 1)
fueron creadas como `SECURITY INVOKER` (default). Cuando un user autenticado
las llamaba:
1. Query interna `SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()`
2. Como INVOKER aplica permisos del invoker → RLS de users evaluada
3. Policy `users_select` evalúa `auth_user_id = auth.uid() OR tenant_id = current_tenant()`
4. Postgres no garantiza short-circuit en el OR → llama `current_tenant()` de nuevo
5. **Recursión infinita** → stack overflow

Invisible durante el seed Fase 1 porque service_role bypasea RLS.

**Fix aplicado**: `packages/db/migrations/004_fix_helpers_security_definer.sql`.
Helpers cambiadas a `SECURITY DEFINER` + `SET search_path = public, pg_temp` +
`REVOKE FROM PUBLIC, anon` + `GRANT TO authenticated, service_role`. La query
interna ahora corre con permisos del owner (postgres) → bypasea RLS → no
recursión.

**Verificación post-fix**:
- Script `admin-verify-profile-link.mjs` → `[public.users via anon + session] ✓ encontrado`.
- Login real en producción → `/director/dashboard` con header "Iván Soto · admin".

**Por qué no se detectó antes**: el script `test-rls-anon-leaks.mjs` solo prueba
acceso ANON sin sesión (esperado 0 rows). No prueba con sesión autenticada
porque eso requiere infraestructura más compleja. Recomendación Fase 3:
añadir test `test-rls-with-session.mjs` que use `signInWithPassword` para
validar que helpers + policies no entran en recursión.

---

## 8. Lecciones aprendidas

- **shadcn preset naming != marca cliente**: el preset "Vega" de shadcn referencia
  la estrella, paleta gris neutral, no la marca Vega Hogar. Mapear paleta cliente
  encima en `globals.css` siempre.
- **`shouldCreateUser:false` crítico en `signInWithOtp`**: el default `true` crea
  `auth.users` huérfanos si alguien escribe email no registrado.
- **`dynamic = 'force-dynamic'` en pages con `cookies()`**: Next 16 Turbopack
  hace SSG agresivo. Pages que usan auth + cookies tienen que marcarse explícito
  o el build falla en prerender.
- **Supabase JS joins**: inferencia de tipos falla a veces en relaciones N-1.
  Más seguro: 2 queries separadas con `in()` que un `select('rel(*)')`.
- **`middleware.ts` deprecado en Next 16**: renombrar a `proxy.ts` cuando se
  pueda asumir Next 17. Sigue funcionando con warn.
- **Constructor por fases con checkpoint humano funciona**: el classifier
  bloqueó dos veces SQL/env vars sin OK explícito, evitando acciones
  irreversibles. CLAUDE.md regla 8 (OK explícito) probó su valor.
