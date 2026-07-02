# SOP · Fase 03 — Cimientos del port (shim auth + shell + rebrand)

> **Estado**: ✅ CERRADA · branch `checkpoint/fase-03`. Ejecutada 2026-06-02.
> **Plan maestro**: _plan de sesión del autor (archivo local, no versionado en el repo)_ (giro de port SETTER→Vega).
> **Fase previa**: `fase-02-auth-roles.md` (cerrada 2026-05-27, branch `checkpoint/fase-02`).
> **Branch a crear**: `checkpoint/fase-03`.

---

## 1. Context

El plan maestro pivota: en vez de construir cada feature desde cero, se adapta el SaaS de
SETTER IA dentro de Vega Hogar. **Fase 3 es el prerequisito duro** de todo el port: sin la capa
de adaptación de auth, el shell del panel y el rebrand, ninguna sección portada (leads, pipeline,
conversaciones) compila contra el modelo de Vega.

Fase 3 **no porta ninguna sección operativa todavía** — deja el panel con un *shell* navegable
(sidebar inmobiliario + topbar + tema claro/oscuro) cuyos enlaces llevan a los dashboards stub
actuales. Es andamiaje: la "casa" donde luego entran los muebles (F5-F11).

Los cuatro costes reales del port (plan maestro §3) se atacan aquí en su raíz:
1. **RLS no se copia** → en F3 no se tocan policies de datos (eso es F4); solo migración aditiva
   de 2 columnas que no afectan RLS existente.
2. **Service-role prohibido en panel** → se establece la doctrina: NO se porta
   `lib/supabase/service-role.ts` de SETTER; el shim usa anon+RLS.
3. **Identidad UUID vs BigInt** → el shim `getEffectiveTenant()` lee `users` (BigInt id +
   `auth_user_id` UUID), no `profiles`, y expone ambos ids.
4. **Acoplamiento acción↔schema** → no aplica aún (no se portan acciones en F3).

---

## 2. Decisiones cerradas (Fase 3)

1. **Shim de auth sobre `users`, anon + RLS**. Se crean `lib/auth/effective-tenant.ts` y
   `lib/auth/require-tenant-role.ts` con la API que las acciones de SETTER esperan, pero leyendo
   `public.users` (no `profiles`) vía `createSupabaseServerClient()` (anon, RLS). **No se porta
   `service-role.ts`.** El contexto expone `{ userId (BigInt), authUserId (UUID), tenantId, role
   (Vega), isAgencyAdmin, isImpersonating, email }`.
2. **Mapeo de roles SETTER → Vega** (congelado para todo el port):

   | SETTER | Vega | Jerarquía |
   |---|---|---|
   | `is_agency_admin` | flag nuevo `users.is_agency_admin` (independiente del rol) | — |
   | `owner` | `director_general` | 4 |
   | `admin` (tenant) | `director_oficina` | 3 |
   | `viewer` | `comercial` / `asistente_captador` | 2 |
   | — | `admin` (super-rol Vega del tenant) | 5 |

   El shim `requireTenantRoleAtLeast({ minRole: 'owner'|'admin'|'viewer' })` traduce el
   vocabulario SETTER a `ROLE_HIERARCHY` de Vega. `admin` (5) de Vega siempre pasa.
3. **Impersonación de agencia: mecánica sí, cross-tenant no (todavía)**. Se porta el hook de
   impersonación (cookie + `resolveEffectiveTenantId`) pero **sin** policy RLS cross-tenant —
   eso llega en F4/F9. En F3 el agency-admin opera sobre su propio tenant. La cookie de
   impersonación se nombra `vega_impersonate_tenant_id`, **sin** `domain` (un solo dominio, no
   `.fyzon.es`).
4. **`VegaLogo` tipográfico, no binario**. Componente React (wordmark Playfair "Vega Hogar" +
   icono hoja de `lucide-react`, p.ej. `Sprout`/`Leaf`), variantes `mark`|`full`. Coherente con
   la anti-jugada de no sobreproducir. Si Iván quiere un logo gráfico, lo provee como asset.
5. **Sin hostname routing**. No se porta el `classifyHost` admin.fyzon/panel.fyzon. Un dominio;
   el gating `/admin/*` se hace con `is_agency_admin` + `requireRole` por page.
6. **Componentes UI: copiar los estándar shadcn faltantes** (16), dejar los 2 custom de SETTER
   (`collapsible-card`, `enforcement-badge`) para cuando se necesiten (settings/preferences, F9).
7. **Deps F3 mínimas**: añadir solo `motion` (lo usa el shell `AnimatedPageShell`).
   `@dnd-kit/*` (F6), `recharts` (F11) y `@anthropic-ai/sdk` (F10) entran en su fase.
8. **`dynamic = 'force-dynamic'`** en el layout del grupo `(app)` (usa `cookies()`).
9. **Reestructurar rutas autenticadas bajo grupo `(app)/`** para que el shell (sidebar) las
   envuelva. `/login`, `/auth/*`, `/logout` y la landing `/` quedan fuera del grupo (sin sidebar).

---

## 3. Estado del SOP (sub-pasos)

| Sub-paso | Estado | Resumen |
|---|---|---|
| S0 — Branch + esqueleto | ✅ | `checkpoint/fase-03` desde `checkpoint/fase-02` |
| S1 — Deps panel | ✅ | `pnpm add motion` en `apps/panel` |
| S2 — Componentes UI shadcn (16) | ✅ | sidebar, sheet, dialog, dropdown-menu, select, tabs, table, badge, separator, skeleton, switch, slider, textarea, tooltip, alert-dialog, collapsible |
| S3 — Migración `users.is_agency_admin` + `tenants.onboarded_at` | ✅ | Prisma + `migrations/005_*` + regenerar + verify |
| S4 — Shim auth (effective-tenant + require-tenant-role) | ✅ | sobre `users`, anon+RLS, mapeo de roles |
| S5 — Extender middleware (prefijos nuevos) | ✅ | añadir rutas del panel a `PROTECTED_PREFIXES` |
| S6 — Shell `(app)/` + sidebar + topbar + VegaLogo + providers | ✅ | mover rutas auth-gated al grupo `(app)` |
| S7 — Rebrand tokens `globals.css` (sidebar + charts) | ✅ | oliva/terracota en light y dark |
| S8 — Ampliar matriz de permisos + seed | ✅ | keys nuevas en `permissions.ts` + `seed-permissions-matrix.mjs` |
| S9 — Verificación (typecheck/lint/build + verify + nav manual) | ✅ | shell navegable, sin service-role en panel |
| S10 — Commit + push | ✅ | `feat(fase-03): cimientos del port …` |

---

## 4. Sub-pasos detallados

### S0 — Branch + esqueleto
```bash
git checkout checkpoint/fase-02
git pull --ff-only origin checkpoint/fase-02   # si aplica
git checkout -b checkpoint/fase-03
```

### S1 — Dependencias del panel
```bash
pnpm --filter @vega-hogar/panel add motion
```
Solo `motion` (shell). NO añadir dnd-kit/recharts/anthropic todavía (sus fases). `radix-ui`,
`next-themes`, `sonner`, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`,
`tw-animate-css` ya están en `apps/panel/package.json`.

### S2 — Componentes UI shadcn faltantes (16)
Vega tiene 5 (`button, card, input, label, sonner`). Portar/generar los 16 estándar que el shell
y futuras secciones necesitan, en `apps/panel/src/components/ui/`:
`sidebar, sheet, dialog, dropdown-menu, select, tabs, table, badge, separator, skeleton, switch,
slider, textarea, tooltip, alert-dialog, collapsible`.

Estrategia: `pnpm dlx shadcn@latest add <comp>` (preset `radix-vega` ya configurado) y, donde el
componente de SETTER tenga ajustes propios, alinear contra
`C:\Users\sotob\setters_ia\apps\panel\components\ui\<comp>.tsx`. Verificar que usan los tokens
(`bg-sidebar`, `text-sidebar-foreground`, etc.) y no colores hardcodeados. **Diferir**
`collapsible-card` y `enforcement-badge` (custom SETTER) hasta F9.

### S3 — Migración aditiva: `users.is_agency_admin` + `tenants.onboarded_at`
- `packages/db/prisma/schema.prisma`: `User { isAgencyAdmin Boolean @default(false) @map("is_agency_admin") }`, `Tenant { onboardedAt DateTime? @map("onboarded_at") }`.
- `packages/db/migrations/005_agency_onboarding.sql` (idempotente, sin `BEGIN/COMMIT` propio):
  ```sql
  ALTER TABLE public.users   ADD COLUMN IF NOT EXISTS is_agency_admin BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
  -- Iván (id=1) como agency admin del showcase:
  UPDATE public.users SET is_agency_admin = true WHERE email = 'sotobautistaivan@gmail.com';
  ```
- Aplicar: `node scripts/db-apply-migrations.mjs --only 005_agency_onboarding.sql`.
- **RLS**: columnas aditivas; no se crean policies nuevas en F3 (las policies de `users`/`tenants`
  de Fase 1 siguen válidas). La impersonación cross-tenant (que sí necesitaría policy) se difiere.
- `pnpm --filter @vega-hogar/db prisma:generate`. Ampliar `scripts/db-verify-schema.mjs` con las
  2 columnas. Actualizar `lib/auth/types.ts` (`UserProfile.isAgencyAdmin: boolean`).

### S4 — Shim de auth (corazón de F3)
En `apps/panel/src/lib/auth/`:
- `effective-tenant.ts` → `getEffectiveTenant(): Promise<EffectiveContext | null>`. Reusa
  `getCurrentUser()` (ya cacheado, lee `users`). Devuelve `{ userId: number, authUserId: string,
  tenantId: number, role: UserRole, isAgencyAdmin: boolean, isImpersonating: boolean, email }`.
  Anon + RLS. La resolución de tenant efectivo: por defecto `profile.tenantId`; si
  `isAgencyAdmin` y hay cookie de impersonación válida, ese tenant (hook listo, cross-tenant real
  en F4/F9).
- `require-tenant-role.ts` → `requireTenantRole`, `requireTenantRoleAtLeast({ minRole })`,
  `requireAgencyAdmin()`, clase `AuthError` (códigos `UNAUTHENTICATED`, `PROFILE_NOT_FOUND`,
  `PROFILE_INACTIVE`, `FORBIDDEN_ROLE_REQUIRED`, `FORBIDDEN_AGENCY_ADMIN_REQUIRED`). Traduce
  `owner/admin/viewer` (vocabulario SETTER) → `ROLE_HIERARCHY` de Vega (§2.2). Para server
  actions devuelve/lanza `AuthError` (las acciones SETTER lo capturan); para pages se sigue
  usando `requireRole()` de Vega (redirect). Coexisten.
- `impersonate.ts` → cookie `vega_impersonate_tenant_id` (httpOnly, sin domain) +
  `resolveEffectiveTenantId({ profileTenantId, isAgencyAdmin })`. En F3 solo respeta la cookie si
  `isAgencyAdmin`; sin policy cross-tenant, leer otro tenant lo bloquea RLS (esperado hasta F4).
- **NO** crear `service-role.ts` en el panel (doctrina regla 2).

### S5 — Extender middleware
`apps/panel/src/middleware.ts`: ampliar `PROTECTED_PREFIXES` con las rutas del panel portado.
Quedaría:
```ts
const PROTECTED_PREFIXES = [
  '/dashboard', '/director', '/oficina', '/comercial', '/admin',
  '/conversations', '/leads', '/pipeline', '/properties',
  '/captacion', '/visits', '/keywords', '/labels', '/calendars', '/settings',
];
```
El resto del middleware (redirect por rol en `/dashboard` exacto, gating `active`/`no_profile`)
se mantiene intacto. El grupo `(app)` no aparece en la URL, así que los prefijos son las rutas
reales.

### S6 — Shell `(app)/` + sidebar + topbar + providers + VegaLogo
- **Reestructurar**: mover `app/dashboard`, `app/director`, `app/oficina`, `app/comercial`,
  `app/admin` → bajo `app/(app)/`. `/login`, `/auth/*`, `/logout`, `/` (landing) quedan fuera.
  Los imports usan alias `@/` → el move no rompe imports. El middleware no cambia (route group
  no afecta URL).
- **`app/(app)/layout.tsx`** (nuevo, `dynamic = 'force-dynamic'`): valida sesión vía
  `getEffectiveTenant()` (redirect `/login` si null), monta `<SidebarProvider>` + `<AppSidebar>`
  + `<SidebarInset>` con topbar (`SidebarTrigger`, `ThemeToggle`, `UserMenu`, `ScopeSwitcher` si
  `isAgencyAdmin`) + `<AnimatedPageShell>{children}`.
- **`app/layout.tsx`** (root): añadir `<ThemeProvider>` (next-themes, `attribute="class"`,
  `defaultTheme="light"`) y `<TooltipProvider>` envolviendo `{children}`. Mantener fuentes +
  `<Toaster>`.
- **`components/app-sidebar.tsx`** (re-domain del de SETTER): nav inmobiliario:
  - Principal: Dashboard (`/dashboard`), Conversaciones (`/conversations`), Leads (`/leads`),
    Pipeline (`/pipeline`), Inmuebles (`/properties`), Captación (`/captacion`), Visitas
    (`/visits`).
  - Grupo Automatización: Etiquetas (`/labels`), Palabras clave (`/keywords`).
  - Grupo Agenda: Calendarios (`/calendars`).
  - Grupo Ajustes: Perfil, Integraciones, Equipo, Preferencias (`/settings/*`).
  - Grupo Agencia (solo `isAgencyAdmin`): `/admin/dashboard`, `/admin/tenants`, `/admin/admins`,
    `/admin/cerebro`. Y `/admin/permisos` (existente Vega).
  - Visibilidad de items por rol + `permissions_matrix`. Props adaptadas a contexto Vega
    (`tenantName`, `userEmail`, `role`, `isAgencyAdmin`).
  - En F3 los enlaces a secciones aún-no-portadas pueden apuntar a una page stub "En construcción
    (Fase N)" para no romper navegación.
- **Portar providers** (rebrand de scope): `theme-provider.tsx`, `theme-toggle.tsx`,
  `user-menu.tsx`, `scope-switcher.tsx`, `impersonate-banner.tsx`, `animated-page-shell.tsx` →
  `src/components/`. `user-menu` hace logout vía el `POST /logout` existente.
- **`components/branding/vega-logo.tsx`** (nuevo, tipográfico): wordmark "Vega Hogar" en
  `font-serif` (Playfair) + icono hoja oliva; variantes `mark`|`full`.

### S7 — Rebrand de tokens en `globals.css`
Completar la paleta del shell (hoy `--sidebar-*`/`--chart-*` en gris; dark `--sidebar-primary`
en azul heredado). Propuesta (ajustable visualmente), reutilizando los `--color-*` de marca:

`:root` (light):
```css
--sidebar: var(--color-blanco-roto);
--sidebar-foreground: var(--color-negro-suave);
--sidebar-primary: var(--color-oliva);
--sidebar-primary-foreground: var(--color-crema);
--sidebar-accent: var(--color-crema-dark);
--sidebar-accent-foreground: var(--color-oliva-dark);
--sidebar-border: oklch(0.9 0.01 90);
--sidebar-ring: var(--color-oliva);
--chart-1: var(--color-oliva);
--chart-2: var(--color-terracota);
--chart-3: var(--color-oliva-light);
--chart-4: var(--color-terracota-light);
--chart-5: #c9a86a; /* dorado tierra */
```
`.dark`: `--sidebar` oliva muy oscuro / negro suave, `--sidebar-primary: var(--color-oliva-light)`
(corrige el azul `oklch(0.488 0.243 264.376)`), charts en variantes claras de la misma paleta.

### S8 — Ampliar matriz de permisos + seed
- `lib/auth/permissions.ts` → añadir a `PERMISSION_KEYS`: `conversations.view`,
  `conversations.reply`, `pipeline.view`, `pipeline.move`, `captacion.view`, `labels.manage`,
  `keywords.manage`, `agent.pause`, `agent.handoff`, `settings.integrations.edit`,
  `admin.cerebro.edit`, `admin.tenants.manage`.
- `scripts/seed-permissions-matrix.mjs` → mapear las keys nuevas a los 5 roles (criterio:
  `admin`/`director_general` casi todo; `director_oficina` gestión de oficina; `comercial`/
  `asistente_captador` view + reply de lo suyo; keys `admin.*` solo `admin`). Re-ejecutar
  (idempotente, upsert).
- Verificar: `node scripts/test-rls-anon-leaks.mjs` sigue 17/17 (no se añaden tablas en F3).

### S9 — Verificación
```bash
pnpm --filter @vega-hogar/panel typecheck   # verde
pnpm --filter @vega-hogar/panel lint        # verde
pnpm --filter @vega-hogar/panel build       # verde, rutas dinámicas
node scripts/db-verify-schema.mjs           # + is_agency_admin + onboarded_at
```
Manual: arrancar `pnpm --filter @vega-hogar/panel dev`, login, comprobar que el **shell**
renderiza (sidebar inmobiliario + topbar + toggle claro/oscuro), que la navegación lleva a los
dashboards/stubs, y que el tema oscuro ya no muestra el azul del sidebar. Grep de seguridad: 0
ocurrencias de `service-role`/`SERVICE_ROLE` en `apps/panel/src`.

### S10 — Commit + push
```bash
pnpm typecheck && pnpm --filter @vega-hogar/panel build
git add <archivos específicos de F3>
git commit -m "feat(fase-03): cimientos del port — shim auth + shell + rebrand"
git push -u origin checkpoint/fase-03
```
(Commit solo con OK explícito de Iván — regla 8.)

---

## 5. Validación end-to-end (criterios de cierre)

- `typecheck` + `lint` + `build` verdes en panel.
- `db-verify-schema.mjs` valida las 2 columnas nuevas; `test-rls-anon-leaks.mjs` sigue 17/17.
- Shell navegable: sidebar inmobiliario, topbar con tema claro/oscuro, rutas protegidas redirigen
  a `/login` sin sesión.
- `getEffectiveTenant()` devuelve contexto correcto (incl. `isAgencyAdmin` para Iván).
- Cero `service-role` en `apps/panel/src`.
- Branding: sidebar y charts en paleta Vega (sin azul residual en dark).

---

## 6. Riesgos y notas

- **Move de rutas a `(app)/`**: verificar que el middleware (redirect `/dashboard` por rol) sigue
  operativo tras el route group (no debería cambiar — el grupo no altera la URL).
- **`force-dynamic`** obligatorio en `(app)/layout.tsx` (cookies) — lección Fase 2, si falta el
  build peta en prerender.
- **Drift de tokens shadcn**: al `shadcn add`, puede reescribir `globals.css`/`components.json`.
  Revisar diff y preservar los `--color-*` de marca + el mapeo `@theme inline`.
- **Shim sin reescribir acciones**: en F3 no hay acciones portadas; el shim solo provee contexto
  + autorización. El uso real (y su des-service-role) se valida al portar cada módulo (F5+).
- **Impersonación**: cross-tenant real depende de policy RLS (F4). En F3 leer otro tenant lo
  bloquea RLS — comportamiento esperado, no bug.

---

**Cierre (2026-06-02)**: S0–S10 ejecutados. Build 24 rutas + TypeScript verde · RLS anon 17/17 ·
schema 63/0 · cero `service-role` en el panel · matriz de permisos 150 filas (30×5).

Desviaciones del plan: (1) ScopeSwitcher + banner de impersonación diferidos a F9 (el
cross-tenant real depende de la policy RLS de F4); (2) `settings.integrations.edit` no añadido —
duplicaba `integrations.edit`; (3) `db-verify-schema.mjs` no ampliado con las 2 columnas nuevas
(deuda menor). Verificación visual en runtime pendiente de Iván.

**Próximo paso**: Fase 4 — convergencia del modelo de datos del port (tablas operativas de
SETTER en Prisma + RLS reescrito al patrón Vega + tipos Supabase generados).
