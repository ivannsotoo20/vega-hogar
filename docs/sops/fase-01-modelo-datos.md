# SOP — Fase 1 · Modelo de datos Supabase v1

> **Objetivo**: dejar el schema PostgreSQL de Vega Hogar operativo en Supabase con
> 16 tablas core + RLS estricto por rol + seed verosímil del tenant Vega Hogar.
>
> **Duración estimada**: 2 sesiones largas (puede dividirse en 2 días).
> **Plan maestro**: _plan de sesión del autor (archivo local, no versionado en el repo)_.
> **Memoria runtime**: _memoria local del autor (no versionada en el repo)_ (IDs Supabase/Vercel).

---

## 1. Context

Fase 0 dejó el monorepo + Supabase `zppltoimgdhojnlzzopz` provisionado con schema `public`
vacío de tablas y la función `rls_auto_enable()` + event trigger `ensure_rls` operativos
(auto-habilitan RLS en cada `CREATE TABLE`).

Fase 1 construye el modelo de datos sobre el que se apoyan todas las features. Decisión de
scope (2026-05-25): **subset adaptado de 16 tablas** = core operativo + `prompt_blocks`
(Fase 6 lo necesitará) + `integration_accounts` (Fase 5 lo necesitará). Las tablas de
publicidad (Fase 12), captación vendedores avanzada (Fase 11) y oportunidades quedan para
sus fases respectivas.

---

## 2. Decisiones cerradas (no se discuten)

| # | Decisión | Valor |
|---|---|---|
| C1 | Naming en BD | `snake_case` |
| C2 | Naming en TS/Prisma | `camelCase` (Prisma mapea con `@map`) |
| C3 | IDs | `BIGSERIAL` (estilo setters_ia, más legible que UUID) |
| C4 | Multi-tenant | `tenant_id BIGINT NOT NULL` en TODA tabla operativa desde V1 |
| C5 | Auth | tabla `users` con `auth_user_id UUID REFERENCES auth.users(id)` |
| C6 | Roles | enum `user_role` en columna `users.role` (NO tabla separada) |
| C7 | Timestamps | `created_at` + `updated_at` con `DEFAULT now()` + trigger `set_updated_at()` |
| C8 | Soft delete | solo en `properties` y `leads` (resto hard delete) |
| C9 | RLS | toda tabla con `tenant_id` lleva RLS estricto, policy por rol |
| C10 | Service role | solo motor lee/escribe con service_role; panel usa anon + RLS |
| C11 | Cascade FKs | `ON DELETE CASCADE` desde `tenants` hacia abajo (borrar tenant = borrar todo) |
| C12 | rls_auto_enable | aprovechado — solo escribimos policies, RLS habilita solo |
| C13 | Migration tool | Prisma Migrate (`prisma migrate dev --create-only` → revisar SQL → aplicar) |
| C14 | Seed | TS script con `tsx` + cliente Supabase service_role en `packages/db/seeds/` |

---

## 3. Las 16 tablas del subset adaptado

### Grupo A — Identidad y multi-tenant (4 tablas)

#### `tenants`
- `id BIGSERIAL PK`
- `slug VARCHAR(50) UNIQUE NOT NULL` (`vega-hogar`)
- `name VARCHAR(120) NOT NULL` (`Vega Hogar Inmobiliaria`)
- `settings JSONB DEFAULT '{}'::jsonb` (preferencias admin)
- `created_at TIMESTAMPTZ DEFAULT now()`
- `updated_at TIMESTAMPTZ DEFAULT now()`
- RLS: solo admins ven tenants; nadie lee otros tenants (filtro `id = current_tenant()`).

#### `users`
- `id BIGSERIAL PK`
- `auth_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `email VARCHAR(255) NOT NULL`
- `full_name VARCHAR(120) NOT NULL`
- `phone VARCHAR(30)` (opcional, E.164)
- `role user_role NOT NULL` (enum)
- `active BOOLEAN NOT NULL DEFAULT true`
- timestamps
- UNIQUE (tenant_id, email)
- INDEX (tenant_id, role)
- RLS: usuario ve a usuarios de su tenant; admin escribe.

#### `offices`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `slug VARCHAR(50) NOT NULL` (`ruzafa`, `campanar`)
- `name VARCHAR(120) NOT NULL`
- `address TEXT NOT NULL`
- `city VARCHAR(80) NOT NULL DEFAULT 'Valencia'`
- `phone VARCHAR(30)`
- `active BOOLEAN NOT NULL DEFAULT true`
- timestamps
- UNIQUE (tenant_id, slug)

#### `user_office_assignments`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `office_id BIGINT NOT NULL REFERENCES offices(id) ON DELETE CASCADE`
- `is_primary BOOLEAN NOT NULL DEFAULT false`
- timestamps
- UNIQUE (user_id, office_id)
- Permite que un user esté asignado a varias oficinas (`asistente_captador` cross-oficina).

### Grupo B — Inmuebles (3 tablas)

#### `properties`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `office_id BIGINT NOT NULL REFERENCES offices(id)` (oficina responsable)
- `type property_type NOT NULL` (enum: `sale`/`rent`)
- `status property_status NOT NULL DEFAULT 'available'` (enum)
- `title VARCHAR(200) NOT NULL`
- `description TEXT`
- `price_eur NUMERIC(12,2) NOT NULL` (venta) / `monthly_rent_eur` para rent — uno u otro según type
- `monthly_rent_eur NUMERIC(10,2)` (alquiler — null si type=sale)
- `m2_built INTEGER NOT NULL`
- `m2_useful INTEGER`
- `rooms INTEGER NOT NULL DEFAULT 0`
- `bathrooms INTEGER NOT NULL DEFAULT 0`
- `year_built INTEGER`
- `neighborhood VARCHAR(100) NOT NULL` (Ruzafa, Russafa, Benimaclet, …)
- `address_short TEXT` (calle + número aproximado)
- `features JSONB DEFAULT '{}'::jsonb` (ascensor, terraza, garaje, trastero, AA, calefacción, …)
- `assigned_to_user_id BIGINT REFERENCES users(id)` (comercial responsable, opcional)
- `deleted_at TIMESTAMPTZ` (soft delete)
- timestamps
- INDEX (tenant_id, status, type), INDEX (tenant_id, neighborhood), INDEX (tenant_id, deleted_at)

#### `property_photos`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE`
- `url TEXT NOT NULL`
- `caption VARCHAR(200)`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ DEFAULT now()`
- INDEX (property_id, sort_order)

#### `property_owners`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE`
- `full_name VARCHAR(120) NOT NULL`
- `phone VARCHAR(30)` (E.164)
- `email VARCHAR(255)`
- `notes TEXT`
- timestamps
- RLS: solo `admin` y `director_*` ven owners (info sensible).

### Grupo C — Leads (3 tablas)

#### `leads`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `office_id BIGINT REFERENCES offices(id)` (asignación de oficina, opcional al inicio)
- `assigned_to_user_id BIGINT REFERENCES users(id)` (comercial round-robin, opcional al inicio)
- `channel channel_type NOT NULL` (enum: `whatsapp`/`voice`/`web_form`/`meta_ads`/`other`)
- `external_id VARCHAR(120)` (id del canal — wamid, call_id, form_id)
- `full_name VARCHAR(120)`
- `phone VARCHAR(30) NOT NULL` (E.164 — clave de identificación)
- `email VARCHAR(255)`
- `intent lead_intent NOT NULL DEFAULT 'unknown'` (enum: `buyer`/`tenant`/`seller`/`landlord`/`unknown`)
- `status lead_status NOT NULL DEFAULT 'new'` (enum)
- `current_phase INTEGER NOT NULL DEFAULT 0` (0-7 según flujo)
- `source_notes TEXT`
- `deleted_at TIMESTAMPTZ` (soft delete)
- timestamps
- UNIQUE (tenant_id, phone) — un teléfono = un lead por tenant
- INDEX (tenant_id, status), INDEX (tenant_id, assigned_to_user_id, status), INDEX (tenant_id, intent)

#### `lead_preferences`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE`
- `type property_type NOT NULL` (sale/rent)
- `neighborhoods TEXT[] DEFAULT '{}'` (array de barrios deseados)
- `price_min_eur NUMERIC(12,2)`
- `price_max_eur NUMERIC(12,2)`
- `rooms_min INTEGER`
- `m2_min INTEGER`
- `features_required JSONB DEFAULT '{}'::jsonb`
- `urgency VARCHAR(20)` (urgent/3-6m/no_rush)
- `motives TEXT`
- timestamps
- UNIQUE (lead_id, type)

#### `lead_property_interest`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE`
- `property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE`
- `status VARCHAR(20) NOT NULL DEFAULT 'interested'` (interested/visited/offered/rejected)
- `notes TEXT`
- timestamps
- UNIQUE (lead_id, property_id)

### Grupo D — Conversaciones (3 tablas)

#### `conversations`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE`
- `channel channel_type NOT NULL`
- `current_phase INTEGER NOT NULL DEFAULT 0`
- `status conversation_status NOT NULL DEFAULT 'active'`
- `emotion VARCHAR(40)`
- `goal TEXT`
- `urgency VARCHAR(20)`
- `next_action TEXT`
- `general_context TEXT` (resumen autoactualizado por agente)
- `ai_paused_until TIMESTAMPTZ`
- `last_message_at TIMESTAMPTZ`
- timestamps
- INDEX (tenant_id, status, last_message_at DESC)
- UNIQUE (tenant_id, lead_id, channel) — una conv por canal por lead

#### `conversation_messages`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE`
- `role message_role NOT NULL` (lead/agent/human)
- `content TEXT NOT NULL`
- `audio_url TEXT` (para mensajes de voz)
- `external_msg_id VARCHAR(120)` (wamid, etc.)
- `metadata JSONB DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ DEFAULT now()`
- INDEX (conversation_id, created_at)

#### `message_schedules`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE`
- `step_number INTEGER NOT NULL` (1, 2, 3 de la cadencia)
- `channel channel_type NOT NULL`
- `scheduled_for TIMESTAMPTZ NOT NULL`
- `status VARCHAR(20) NOT NULL DEFAULT 'pending'` (pending/sent/cancelled/failed)
- `sent_at TIMESTAMPTZ`
- `error_message TEXT`
- timestamps
- INDEX (status, scheduled_for) WHERE status = 'pending'

### Grupo E — Visitas (1 tabla)

#### `visits`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE`
- `property_id BIGINT REFERENCES properties(id)` (puede ser null para visitas técnicas tasación)
- `comercial_user_id BIGINT NOT NULL REFERENCES users(id)`
- `scheduled_for TIMESTAMPTZ NOT NULL`
- `status visit_status NOT NULL DEFAULT 'scheduled'`
- `outcome_notes TEXT`
- `lead_feedback TEXT`
- `is_tasation BOOLEAN NOT NULL DEFAULT false` (visita técnica tasación vendedor)
- timestamps
- INDEX (tenant_id, comercial_user_id, scheduled_for)
- INDEX (tenant_id, status, scheduled_for)

### Grupo F — Agente IA (1 tabla, dejada vacía hasta Fase 6)

#### `prompt_blocks`
- `id BIGSERIAL PK`
- `tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE` (NULL = shared)
- `block_key VARCHAR(80) NOT NULL` (`core_inmobiliario_base`, `coach_vega_hogar`, …)
- `content TEXT NOT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `version INTEGER NOT NULL DEFAULT 1` (schema version v1, v2, …)
- timestamps
- UNIQUE (tenant_id, block_key, version) WHERE is_active = true

### Grupo G — Sistema (1 tabla, dejada vacía hasta Fase 5)

#### `integration_accounts`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `provider integration_provider NOT NULL` (enum: `ycloud`/`zadarma`/`elevenlabs`/`deepgram`/`composio`/`meta_ads`)
- `display_name VARCHAR(120) NOT NULL`
- `connection_config JSONB NOT NULL DEFAULT '{}'::jsonb` (datos no sensibles)
- `credentials_encrypted JSONB` (AES-256-GCM, blob `{"blob":"v1:iv:ct:tag"}`)
- `webhook_secret TEXT` (para HMAC verify)
- `active BOOLEAN NOT NULL DEFAULT true`
- `last_webhook_at TIMESTAMPTZ`
- timestamps
- UNIQUE (tenant_id, provider, display_name)

---

## 4. Enums (10)

```sql
CREATE TYPE user_role AS ENUM (
  'admin', 'director_general', 'director_oficina', 'comercial', 'asistente_captador'
);

CREATE TYPE property_type AS ENUM ('sale', 'rent');

CREATE TYPE property_status AS ENUM (
  'available', 'reserved', 'sold', 'rented', 'inactive'
);

CREATE TYPE lead_intent AS ENUM (
  'buyer', 'tenant', 'seller', 'landlord', 'unknown'
);

CREATE TYPE lead_status AS ENUM (
  'new', 'contacted', 'qualified', 'scheduled_visit',
  'visited', 'offer_made', 'closed_won', 'closed_lost', 'cold'
);

CREATE TYPE channel_type AS ENUM (
  'whatsapp', 'voice', 'web_form', 'meta_ads', 'other'
);

CREATE TYPE conversation_status AS ENUM (
  'active', 'qualified', 'disqualified', 'handoff', 'paused'
);

CREATE TYPE visit_status AS ENUM (
  'scheduled', 'done', 'noshow', 'cancelled', 'rescheduled'
);

CREATE TYPE message_role AS ENUM ('lead', 'agent', 'human');

CREATE TYPE integration_provider AS ENUM (
  'ycloud', 'zadarma', 'elevenlabs', 'deepgram', 'composio', 'meta_ads'
);
```

---

## 5. Estrategia RLS por rol

5 roles del enum `user_role`. Función helper en SQL:

```sql
-- Devuelve el tenant_id del usuario autenticado
CREATE OR REPLACE FUNCTION current_tenant()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Devuelve el rol del usuario autenticado
CREATE OR REPLACE FUNCTION current_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;
```

Patrón estándar de policy por tabla con `tenant_id`:

```sql
-- SELECT: ven todos los users del tenant
CREATE POLICY <tabla>_select ON <tabla>
FOR SELECT TO authenticated
USING (tenant_id = current_tenant());

-- INSERT: solo admin + director_*
CREATE POLICY <tabla>_insert ON <tabla>
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = current_tenant()
  AND current_role() IN ('admin', 'director_general', 'director_oficina')
);

-- UPDATE: idem, escalado por tabla
-- DELETE: solo admin (default)
```

**Excepciones por tabla** (documentadas en cada policy file):
- `property_owners` → SELECT solo `admin` y `director_*` (info sensible)
- `users` → admin escribe; director_oficina solo escribe a users de su oficina
- `prompt_blocks` → SELECT `admin` + service_role; INSERT/UPDATE solo `admin`
- `integration_accounts` → idem (datos sensibles)
- `conversations.assigned_to` → comercial solo lee leads asignados a él

---

## 6. Estrategia de seed (Vega Hogar tenant)

**Script**: `packages/db/seeds/00-vega-hogar.ts` ejecutable con `tsx`.

**Contenido**:
- 1 tenant: `vega-hogar` con slug + name + settings ejemplo
- 2 offices: Ruzafa (Calle Cuba 47) + Campanar (Av. del Cid 132)
- 10 users con `auth.users` correspondientes:
  - 1 admin (Iván — `sotobautistaivan@gmail.com`)
  - 1 director_general (María Vega ficticia)
  - 2 directores_oficina (uno por sede)
  - 6 comerciales (3 por sede, nombres valencianos)
  - 1 asistente_captador cross-oficina
- 35 properties:
  - 21 sale (60%) + 14 rent (40%)
  - Barrios reales Valencia con precios verosímiles por zona
  - 3-5 fotos stock (URLs públicas Unsplash) por propiedad
  - 1 propietario ficticio por propiedad (info en `property_owners`)
- 20 leads en mix de fases:
  - 5 new, 6 contacted, 4 qualified, 3 scheduled_visit, 2 visited
  - Mix intent: 8 buyer, 4 tenant, 5 seller, 2 landlord, 1 unknown
  - Teléfonos +34 6XX XXX XXX ficticios
- 12 conversations (subset de leads con histórico WhatsApp)
- 5 visits programadas próximas

**Cifras conservadoras (DEC-007)**:
- Precios venta Valencia: 1.500-4.500 €/m² según zona (Ruzafa más caro, Patraix más barato)
- Precios alquiler: 8-16 €/m²/mes
- M² rangos verosímiles: 45-180 m² piso, sin chalets de 500m²
- Nada de "pisos de lujo" en mainstream

---

## 7. Sub-pasos (checklist)

### 1.0 — SOP fase-01-modelo-datos.md
- [x] Documento creado con decisiones cerradas + 16 tablas + enums + RLS strategy + seed plan.

### 1.1 — Schema Prisma completo
- [ ] Definir 16 modelos en `packages/db/prisma/schema.prisma` con `@map` para snake_case.
- [ ] Definir 10 enums.
- [ ] FKs + índices.
- [ ] Trigger `set_updated_at()` como `Unsupported("TRIGGER")` o doc note (Prisma no maneja triggers — los añadimos vía SQL en migration manual).

### 1.2 — Prisma generate
- [ ] `pnpm --filter @vega-hogar/db prisma:generate` → genera cliente y tipos.
- [ ] Aprobar build script de `@prisma/client` (Fase 0 dejó pending).

### 1.3 — Primera migration SQL
- [ ] `prisma migrate dev --name init_schema --create-only` para SQL sin aplicar.
- [ ] Revisar SQL. Añadir manualmente (Prisma no genera):
  - Helper functions `current_tenant()` y `current_role()`.
  - Trigger `set_updated_at()`.
  - Cualquier ajuste de RLS no expresable en Prisma.
- [ ] Ya el `ensure_rls` event trigger se encarga de habilitar RLS en cada CREATE TABLE.

### 1.4 — Aplicar migration a Supabase (REQUIERE OK Iván)
- [ ] Mostrar SQL final.
- [ ] `prisma migrate dev` o ejecutar SQL directo vía `scripts/db-apply-migration.mjs`.
- [ ] Verificar 16 tablas + 10 enums + 2 funciones helper creadas.
- [ ] Verificar RLS habilitado en TODAS las tablas (con `pg_class.relrowsecurity`).

### 1.5 — RLS policies
- [ ] Crear `packages/db/policies/01-helpers.sql` con `current_tenant()` + `current_role()` (idempotente, IF NOT EXISTS).
- [ ] 1 archivo por tabla en `packages/db/policies/NN-<tabla>.sql` con SELECT/INSERT/UPDATE/DELETE.
- [ ] Casos especiales documentados con comentarios.

### 1.6 — Aplicar RLS policies (REQUIERE OK Iván)
- [ ] Script `scripts/db-apply-policies.mjs` que ejecuta los .sql en orden.
- [ ] Verificar con `SELECT polname, polrelid::regclass FROM pg_policy ORDER BY polrelid, polname`.

### 1.7 — Audit script test-rls-anon-leaks.mjs
- [ ] Portar de setters_ia adaptado a vega-hogar.
- [ ] Conecta con `SUPABASE_ANON_KEY` (no service_role).
- [ ] Intenta SELECT * en cada tabla con tenant_id.
- [ ] Debe devolver 0 rows en TODAS (auth.uid() es null → current_tenant() es null → filtro falla cerrado).
- [ ] Falla con exit 1 si alguna tabla devuelve rows.

### 1.8 — Seed data Vega Hogar
- [ ] `packages/db/seeds/00-vega-hogar.ts` con tsx.
- [ ] Usar service_role (bypass RLS).
- [ ] Crear `auth.users` mediante Supabase Auth Admin API (NO directo a auth.users — Supabase la gestiona).
- [ ] Datos: 1 tenant + 2 offices + 10 users + 35 properties + ~100 photos + 35 owners + 20 leads + ~12 preferences + ~12 conversations + ~5 visits.

### 1.9 — Aplicar seed (REQUIERE OK Iván)
- [ ] `tsx packages/db/seeds/00-vega-hogar.ts`.
- [ ] Imprimir conteos por tabla al final.

### 1.10 — Verification end-to-end
- [ ] `pnpm typecheck` verde.
- [ ] `node scripts/test-rls-anon-leaks.mjs` → 0 rows en todas las tablas con anon key. Exit 0.
- [ ] `node scripts/db-list-tables.mjs` → 16 tablas + 10 enums + funciones helper visibles.
- [ ] Conteos seed correctos.

### 1.11 — Branch checkpoint/fase-01 (REQUIERE OK Iván)
- [ ] `git checkout -b checkpoint/fase-01`.
- [ ] Commit con summary.
- [ ] Push tras OK.
- [ ] Actualizar memoria con `fase_01_completada.md`.

---

## 8. Criterios de aceptación (todos deben pasar)

1. 16 tablas creadas en Supabase, RLS habilitado en todas.
2. 10 enums creados.
3. 2 funciones helper `current_tenant()` + `current_role()` operativas.
4. Policies escritas por tabla cubriendo SELECT/INSERT/UPDATE/DELETE.
5. `test-rls-anon-leaks.mjs` pasa: anon key NO accede a ningún dato con tenant_id.
6. Seed aplicado: 1 tenant + 10 users + 2 offices + 35 properties + 20 leads + ~12 conversations + ~5 visits.
7. `pnpm typecheck` verde.
8. Branch `checkpoint/fase-01` pusheado.

---

## 9. Riesgos específicos de Fase 1

| Riesgo | Mitigación |
|---|---|
| Prisma no expresa triggers/funciones helper | Añadirlos manualmente al SQL de migration. Documentar en SOP. |
| Supabase Auth Admin API para crear `auth.users` complejo | Usar `supabase.auth.admin.createUser({email, ...})` desde script con service_role. |
| RLS policies con bugs sutiles (filtros incompletos) | Audit script obligatorio + revisar policy de cada tabla en code review. |
| `auth.uid()` returns NULL para anon → policy con filtro `current_tenant() = X` → false → 0 rows | OK, este es el comportamiento deseado (anon no debe leer). |
| Seed rompe RLS al usar service_role mal | Service_role bypassa RLS. Si seed falla, ver explicitamente el error SQL. |

---

## 10. Próximo paso

Fase 2 — Auth panel + 5 roles + matriz de permisos configurable. Magic Link SSR del panel
con redirección a dashboard según rol. Builds sobre las helpers `current_tenant()` y
`current_role()` definidas aquí.
