# Arquitectura — Vega Hogar

Vista de alto nivel del sistema y de los flujos básicos. Se va completando fase a fase.

---

## Componentes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Cliente final)                         │
│                                                                          │
│  Web pública Vega Hogar (opcional, Fase extra)                          │
│  - Landing inmobiliaria                                                  │
│  - Form "Vende con nosotros" (Fase 11)                                  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼ (lead nuevo)
┌─────────────────────────────────────────────────────────────────────────┐
│                       apps/motor (Fastify 5)                             │
│                       Deploy: VPS Contabo + Docker                       │
│                                                                          │
│  webhook-ycloud  ──┐                                                    │
│  webhook-meta    ──┤                                                    │
│  webhook-zadarma ──┼─→ lead-ingest → cadence-engine                     │
│  webhook-mock    ──┘            ↓                                       │
│                                  ↓                                       │
│                       agent-pipeline (3-LLM)                            │
│                       Generator → Judge → Splitter                      │
│                                  ↓                                       │
│                       outbound-sender → YCloud / Zadarma                │
│                                                                          │
│  + plugins/cron-scheduler  (cadencia 3 pasos + outbound tick)           │
│  + Redis (debounce + dedup)                                             │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ ↑
                           │ │
                           ▼ │
┌─────────────────────────────────────────────────────────────────────────┐
│                       Supabase (Postgres + Auth + Storage)               │
│                       Region: eu-central-1 Frankfurt                     │
│                                                                          │
│  tenants, users, properties, leads, conversations, visits,              │
│  seller_leads, campaigns, prompt_blocks, pipeline_runs, ...             │
│                                                                          │
│  RLS estricto en todas las tablas con tenant_id.                        │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ ↑
                           │ │ (anon key + RLS)
                           ▼ │
┌─────────────────────────────────────────────────────────────────────────┐
│                       apps/panel (Next.js 16)                            │
│                       Deploy: Vercel (preview por rama)                  │
│                                                                          │
│  /login                     magic link Supabase SSR                     │
│  /dashboard                 KPIs comercial                              │
│  /leads, /leads/:id         CRM + ficha + historial cross-canal         │
│  /properties, /properties/:id  catálogo + fotos                         │
│  /visits                    calendario                                  │
│  /captacion                 pipeline kanban vendedores                  │
│  /admin/permisos            matriz configurable                         │
│  /admin/asignacion-reglas                                                │
│  /admin/agente-ia           métricas + config coach                     │
│  /admin/ads                 campañas Meta + atribución                  │
│  /admin/simulator           simulador WhatsApp (modo mock)              │
│  /director/dashboard        KPIs consolidados                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Integraciones externas

| Servicio | Para qué | Fase | Provider |
|---|---|---|---|
| **YCloud** | WhatsApp BSP (inbound + outbound) | 5 | https://ycloud.com |
| **Zadarma** | Número PSTN España + SIP/WebSocket | 8 | https://zadarma.com |
| **ElevenLabs** | TTS voz española (streaming) | 8 | https://elevenlabs.io |
| **Deepgram / Whisper** | STT realtime (decisión exacta Fase 8) | 8 | — |
| **Composio** | Meta Marketing API (campañas Ads) | 12 | `@composio/core@^0.10.0` |
| **Meta App** | Custom OAuth para Composio Meta Ads | 12 | developers.facebook.com |
| **Anthropic Claude** | Inteligencia del agente (Haiku 4.5 default, Sonnet 4.6 tareas complejas) | 6 | https://anthropic.com |

---

## Flujos clave

### Flujo 1 — Comprador entra por WhatsApp (Fase 6+)

```
Lead WhatsApp → webhook YCloud → lead-ingest → debounce 25s Redis
  → agent-pipeline (Generator → Judge → Splitter)
  → tool respond_as_inmobiliario invoca buscar_inmuebles
  → 2-3 matches con fotos + agenda visita
  → outbound-sender → YCloud → lead
```

### Flujo 2 — Cadencia 3 pasos (Fase 9)

```
T0:   WhatsApp instantáneo
T+1h: Llamada Zadarma (si no respondió) → voice-orchestrator
        ↳ Zadarma SIP ↔ STT ↔ Claude (mismo agente) ↔ ElevenLabs TTS
T+24h, T+72h, T+7d: Recontacto WhatsApp
        ↳ Tras N reintentos sin respuesta → "frío" → comercial humano
```

### Flujo 3 — Captación vendedores vía Meta Ads (Fase 11 + 12)

```
Director crea campaña Meta "Vende tu piso Valencia" en panel /admin/ads
  → Composio → Meta Marketing API → campaña activa
  → Lead form Meta → webhook → lead vendedor en BD
  → Agente cualifica profundo (zona, m², estado, motivos, plazo, expectativa, situación legal)
  → Agenda visita técnica de tasación con Asistente/Captador
  → Captador valida + propone precio → vendedor acepta
  → Inmueble entra al catálogo + se asigna comercial
```

### Flujo 4 — Permisos configurables por rol (Fase 2)

```
Admin abre /admin/permisos → cambia visibilidad para rol "comercial"
  → permissions_matrix actualizada en Supabase
  → RLS policies leen la matriz para autorizar SELECT/INSERT/UPDATE
  → comercial recarga panel y ve solo lo que la matriz permite
```

---

## Modelo de datos (resumen — detalle en Fase 1)

Grupos de tablas:

- **Identidad y multi-tenant**: `tenants`, `users` (Supabase Auth), `user_roles`, `offices`,
  `user_office_assignments`.
- **Inmuebles**: `properties`, `property_photos`, `property_owners`.
- **Leads**: `leads`, `lead_preferences`, `lead_property_interest`.
- **Conversaciones**: `conversations`, `conversation_messages`, `message_schedules`.
- **Visitas**: `visits`.
- **Captación vendedores**: `seller_leads`, `tasation_visits`, `seller_opportunities`.
- **Publicidad**: `ad_accounts`, `campaigns`, `ad_sets`, `ads`, `creatives`, `ad_attribution`.
- **Agente IA**: `prompt_blocks`, `prompt_block_versions`, `pipeline_runs`.
- **Sistema y audit**: `integration_accounts`, `permissions_matrix`, `assignment_rules`.

Doctrina RLS: toda tabla con `tenant_id` lleva RLS estricto. Service role solo en motor.

---

## Despliegue (resumen)

| Componente | Entorno dev | Entorno prod |
|---|---|---|
| Panel | `pnpm --filter @vega-hogar/panel dev` (localhost:3000) | Vercel (preview por rama + prod) |
| Motor | `pnpm --filter @vega-hogar/motor dev` (localhost:3001) o `docker compose up` | VPS Contabo + Docker Compose |
| Supabase | Cloud (mismo proyecto) | Cloud (mismo proyecto) |
| Redis | `docker compose up redis` | VPS Contabo (mismo compose) |

CI/CD detallado en Fase 14.
