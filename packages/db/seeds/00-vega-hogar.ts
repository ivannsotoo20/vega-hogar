// packages/db/seeds/00-vega-hogar.ts
// Seed del tenant Vega Hogar Inmobiliaria. Usa SUPABASE_SERVICE_ROLE_KEY
// (bypass RLS) + Auth Admin API para crear auth.users.
//
// Cifras conservadoras (DEC-007): precios verosímiles por zona Valencia,
// nada de pisos de lujo inflados.
//
// Ejecución idempotente: si el tenant 'vega-hogar' ya existe, aborta sin
// duplicar. Para re-seedar, borrar el tenant manualmente primero.
//
// Uso: tsx packages/db/seeds/00-vega-hogar.ts

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// 0) Idempotencia: abortar si tenant ya existe
// ---------------------------------------------------------------------------
{
  const { data: existing } = await sb.from('tenants').select('id, slug').eq('slug', 'vega-hogar').maybeSingle();
  if (existing) {
    console.log(`[seed] tenant 'vega-hogar' ya existe (id=${existing.id}). Aborta.`);
    console.log('       Para re-seedar: DELETE FROM tenants WHERE slug = \'vega-hogar\' CASCADE.');
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// 1) Tenant
// ---------------------------------------------------------------------------
console.log('[seed] 1/9 → tenant');
const { data: tenant, error: tErr } = await sb
  .from('tenants')
  .insert({
    slug: 'vega-hogar',
    name: 'Vega Hogar Inmobiliaria',
    settings: { city: 'Valencia', founded: 1998, brand_color: '#5C6F44' },
  })
  .select()
  .single();
if (tErr || !tenant) throw new Error(`tenant insert failed: ${tErr?.message}`);
const tenantId = tenant.id as number;
console.log(`       tenant.id = ${tenantId}`);

// ---------------------------------------------------------------------------
// 2) Offices
// ---------------------------------------------------------------------------
console.log('[seed] 2/9 → offices');
const { data: offices, error: oErr } = await sb
  .from('offices')
  .insert([
    {
      tenant_id: tenantId,
      slug: 'ruzafa',
      name: 'Oficina Ruzafa',
      address: 'Calle Cuba 47',
      city: 'Valencia',
      phone: '+34963335501',
    },
    {
      tenant_id: tenantId,
      slug: 'campanar',
      name: 'Oficina Campanar',
      address: 'Av. del Cid 132',
      city: 'Valencia',
      phone: '+34963895502',
    },
  ])
  .select();
if (oErr || !offices) throw new Error(`offices insert failed: ${oErr?.message}`);
const ruzafaId = offices.find((o) => o.slug === 'ruzafa')!.id as number;
const campanarId = offices.find((o) => o.slug === 'campanar')!.id as number;
console.log(`       ruzafa=${ruzafaId}, campanar=${campanarId}`);

// ---------------------------------------------------------------------------
// 3) Users (auth.users + public.users) — 11 personas (1 admin + 10 operativas)
// ---------------------------------------------------------------------------
console.log('[seed] 3/9 → users (auth.users + public.users)');
const PEOPLE = [
  { email: 'sotobautistaivan@gmail.com', name: 'Iván Soto',           role: 'admin',              office: null },
  { email: 'maria.vega@vegahogar.es',    name: 'María Vega Sanchis',   role: 'director_general',   office: null },
  { email: 'carles.beneyto@vegahogar.es',name: 'Carles Beneyto Marí',  role: 'director_oficina',   office: 'ruzafa'   },
  { email: 'pilar.ferrer@vegahogar.es',  name: 'Pilar Ferrer Llopis',  role: 'director_oficina',   office: 'campanar' },
  { email: 'joan.mari@vegahogar.es',     name: 'Joan Marí Tortosa',    role: 'comercial',          office: 'ruzafa'   },
  { email: 'nuria.sanchis@vegahogar.es', name: 'Núria Sanchis Bonet',  role: 'comercial',          office: 'ruzafa'   },
  { email: 'vicent.tortosa@vegahogar.es',name: 'Vicent Tortosa Alandí',role: 'comercial',          office: 'ruzafa'   },
  { email: 'empar.alandi@vegahogar.es',  name: 'Empar Alandí Carbonell',role: 'comercial',         office: 'campanar' },
  { email: 'andreu.llopis@vegahogar.es', name: 'Andreu Llopis Beneyto',role: 'comercial',          office: 'campanar' },
  { email: 'teresa.carbonell@vegahogar.es',name:'Teresa Carbonell Ferrer',role:'comercial',        office: 'campanar' },
  { email: 'salva.bonet@vegahogar.es',   name: 'Salva Bonet Marí',     role: 'asistente_captador', office: null       },
] as const;

const userIdsByEmail = new Map<string, number>();

for (const p of PEOPLE) {
  // 3a) auth.users via Admin API
  const tempPassword = `VegaHogar${Math.random().toString(36).slice(2, 12)}!`;
  const { data: au, error: aErr } = await sb.auth.admin.createUser({
    email: p.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: p.name, role: p.role },
  });
  if (aErr || !au.user) throw new Error(`auth.user ${p.email} failed: ${aErr?.message}`);

  // 3b) public.users
  const { data: u, error: uErr } = await sb
    .from('users')
    .insert({
      auth_user_id: au.user.id,
      tenant_id: tenantId,
      email: p.email,
      full_name: p.name,
      role: p.role,
      active: true,
    })
    .select()
    .single();
  if (uErr || !u) throw new Error(`public.user ${p.email} failed: ${uErr?.message}`);
  userIdsByEmail.set(p.email, u.id as number);
  console.log(`       ${p.role.padEnd(20)} ${p.name.padEnd(28)} ${u.id}`);
}

// ---------------------------------------------------------------------------
// 4) user_office_assignments
// ---------------------------------------------------------------------------
console.log('[seed] 4/9 → user_office_assignments');
const assignments: Array<{ tenant_id: number; user_id: number; office_id: number; is_primary: boolean }> = [];
for (const p of PEOPLE) {
  const userId = userIdsByEmail.get(p.email)!;
  if (p.role === 'asistente_captador') {
    // Cross-oficina: asignado a las 2
    assignments.push({ tenant_id: tenantId, user_id: userId, office_id: ruzafaId, is_primary: true });
    assignments.push({ tenant_id: tenantId, user_id: userId, office_id: campanarId, is_primary: false });
  } else if (p.office === 'ruzafa') {
    assignments.push({ tenant_id: tenantId, user_id: userId, office_id: ruzafaId, is_primary: true });
  } else if (p.office === 'campanar') {
    assignments.push({ tenant_id: tenantId, user_id: userId, office_id: campanarId, is_primary: true });
  }
  // admin + director_general no se asignan a oficina concreta
}
const { error: aaErr } = await sb.from('user_office_assignments').insert(assignments);
if (aaErr) throw new Error(`assignments failed: ${aaErr.message}`);
console.log(`       ${assignments.length} asignaciones`);

// ---------------------------------------------------------------------------
// 5) Properties — 35 (21 sale + 14 rent) en barrios reales Valencia
// ---------------------------------------------------------------------------
console.log('[seed] 5/9 → properties');

const NEIGHBORHOODS = {
  ruzafa:        { office: 'ruzafa',   sale_per_m2: [4000, 5500], rent_per_m2: [14, 18] },
  benimaclet:    { office: 'ruzafa',   sale_per_m2: [2500, 3300], rent_per_m2: [10, 13] },
  el_carmen:     { office: 'ruzafa',   sale_per_m2: [3500, 4500], rent_per_m2: [13, 16] },
  eixample:      { office: 'ruzafa',   sale_per_m2: [3800, 4800], rent_per_m2: [13, 17] },
  algiros:       { office: 'ruzafa',   sale_per_m2: [2500, 3200], rent_per_m2: [9,  12] },
  cabanyal:      { office: 'ruzafa',   sale_per_m2: [2800, 3800], rent_per_m2: [11, 14] },
  campanar:      { office: 'campanar', sale_per_m2: [2200, 2900], rent_per_m2: [8,  11] },
  patraix:       { office: 'campanar', sale_per_m2: [2000, 2700], rent_per_m2: [8,  11] },
  ciudad_jardin: { office: 'campanar', sale_per_m2: [2300, 3000], rent_per_m2: [9,  12] },
  malilla:       { office: 'campanar', sale_per_m2: [1800, 2500], rent_per_m2: [7,  10] },
} as const;

const UNSPLASH = [
  'https://images.unsplash.com/photo-1568605114967-8130f3a36994',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb',
  'https://images.unsplash.com/photo-1416331108676-a22ccb276e35',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858',
  'https://images.unsplash.com/photo-1513584684374-8bab748fbf90',
];

const PROPERTIES_SEED = [
  // Ruzafa office area
  { type: 'sale', n: 'ruzafa',        title: 'Piso reformado en Ruzafa con terraza', m2: 95,  rooms: 3, baths: 2, year: 2018, feats: { terrace: true, lift: true, ac: true } },
  { type: 'sale', n: 'ruzafa',        title: 'Ático luminoso en Ruzafa',             m2: 78,  rooms: 2, baths: 1, year: 2005, feats: { lift: true, ac: true } },
  { type: 'sale', n: 'ruzafa',        title: 'Piso reformado calle Cádiz',           m2: 105, rooms: 3, baths: 2, year: 1965, feats: { lift: true } },
  { type: 'rent', n: 'ruzafa',        title: 'Alquiler Ruzafa 2 hab amueblado',      m2: 65,  rooms: 2, baths: 1, year: 2010, feats: { furnished: true, lift: true } },
  { type: 'rent', n: 'ruzafa',        title: 'Apartamento estudio Ruzafa',           m2: 48,  rooms: 1, baths: 1, year: 2015, feats: { furnished: true } },
  { type: 'sale', n: 'el_carmen',     title: 'Piso histórico Carmen 90 m²',          m2: 90,  rooms: 2, baths: 1, year: 1920, feats: { unique: 'edificio histórico' } },
  { type: 'sale', n: 'el_carmen',     title: 'Vivienda con vistas catedral',         m2: 110, rooms: 3, baths: 2, year: 2008, feats: { views: true } },
  { type: 'rent', n: 'el_carmen',     title: 'Alquiler Carmen 1 hab para parejas',   m2: 55,  rooms: 1, baths: 1, year: 2012, feats: { furnished: true } },
  { type: 'sale', n: 'eixample',      title: 'Piso modernista L\'Eixample',          m2: 130, rooms: 4, baths: 2, year: 1925, feats: { unique: 'fachada modernista', lift: true } },
  { type: 'sale', n: 'eixample',      title: 'Vivienda calle Colón',                 m2: 95,  rooms: 3, baths: 2, year: 1970, feats: { lift: true, ac: true } },
  { type: 'rent', n: 'eixample',      title: 'Alquiler L\'Eixample 3 hab familiar',  m2: 110, rooms: 3, baths: 2, year: 1990, feats: { lift: true, furnished: false } },
  { type: 'sale', n: 'benimaclet',    title: 'Casa Benimaclet zona universitaria',   m2: 85,  rooms: 3, baths: 1, year: 1980, feats: {} },
  { type: 'sale', n: 'benimaclet',    title: 'Piso reformado Benimaclet',            m2: 70,  rooms: 2, baths: 1, year: 1975, feats: { lift: true } },
  { type: 'rent', n: 'benimaclet',    title: 'Alquiler estudiantes Benimaclet',      m2: 60,  rooms: 3, baths: 1, year: 1985, feats: { furnished: true } },
  { type: 'rent', n: 'benimaclet',    title: 'Habitaciones Benimaclet 4 hab',        m2: 110, rooms: 4, baths: 2, year: 1995, feats: { furnished: true } },
  { type: 'sale', n: 'algiros',       title: 'Piso Algirós tranquilo',               m2: 80,  rooms: 3, baths: 1, year: 1985, feats: { lift: true } },
  { type: 'sale', n: 'algiros',       title: 'Vivienda Algirós con garaje',          m2: 95,  rooms: 3, baths: 2, year: 2000, feats: { garage: true, lift: true } },
  { type: 'rent', n: 'algiros',       title: 'Alquiler Algirós 2 hab',               m2: 70,  rooms: 2, baths: 1, year: 1995, feats: {} },
  { type: 'sale', n: 'cabanyal',      title: 'Casa típica Cabanyal',                 m2: 75,  rooms: 2, baths: 1, year: 1930, feats: { unique: 'casa de pescador' } },
  { type: 'sale', n: 'cabanyal',      title: 'Vivienda reformada Cabanyal',          m2: 95,  rooms: 3, baths: 2, year: 2020, feats: { ac: true, terrace: true } },
  { type: 'rent', n: 'cabanyal',      title: 'Alquiler Marítim cerca playa',         m2: 65,  rooms: 2, baths: 1, year: 2015, feats: { furnished: true } },

  // Campanar office area
  { type: 'sale', n: 'campanar',      title: 'Piso familiar Campanar',               m2: 105, rooms: 3, baths: 2, year: 1995, feats: { lift: true, garage: true } },
  { type: 'sale', n: 'campanar',      title: 'Vivienda Campanar con trastero',       m2: 90,  rooms: 3, baths: 2, year: 2002, feats: { lift: true, storage: true } },
  { type: 'sale', n: 'campanar',      title: 'Piso reformado Campanar',              m2: 85,  rooms: 3, baths: 1, year: 1980, feats: { lift: true } },
  { type: 'rent', n: 'campanar',      title: 'Alquiler Campanar 3 hab familiar',     m2: 100, rooms: 3, baths: 2, year: 1998, feats: { furnished: false, lift: true } },
  { type: 'sale', n: 'patraix',       title: 'Casa Patraix amplia',                  m2: 130, rooms: 4, baths: 2, year: 1985, feats: { garage: true } },
  { type: 'sale', n: 'patraix',       title: 'Piso Patraix con terraza',             m2: 95,  rooms: 3, baths: 2, year: 1990, feats: { terrace: true, lift: true } },
  { type: 'sale', n: 'patraix',       title: 'Vivienda Patraix bajo precio',         m2: 75,  rooms: 2, baths: 1, year: 1975, feats: {} },
  { type: 'rent', n: 'patraix',       title: 'Alquiler Patraix económico',           m2: 70,  rooms: 2, baths: 1, year: 1980, feats: {} },
  { type: 'sale', n: 'ciudad_jardin', title: 'Casa Ciudad Jardín con jardín',        m2: 165, rooms: 4, baths: 3, year: 2000, feats: { garden: true, garage: true } },
  { type: 'sale', n: 'ciudad_jardin', title: 'Piso reformado Ciudad Jardín',         m2: 100, rooms: 3, baths: 2, year: 2010, feats: { lift: true, ac: true } },
  { type: 'rent', n: 'ciudad_jardin', title: 'Alquiler Ciudad Jardín 3 hab',         m2: 95,  rooms: 3, baths: 2, year: 2005, feats: { lift: true } },
  { type: 'sale', n: 'malilla',       title: 'Piso Malilla obra nueva',              m2: 90,  rooms: 3, baths: 2, year: 2024, feats: { ac: true, lift: true, garage: true } },
  { type: 'sale', n: 'malilla',       title: 'Vivienda Malilla con trastero',        m2: 80,  rooms: 3, baths: 1, year: 2022, feats: { storage: true, lift: true } },
  { type: 'rent', n: 'malilla',       title: 'Alquiler Malilla 2 hab nuevo',         m2: 70,  rooms: 2, baths: 1, year: 2023, feats: { furnished: true, lift: true } },
] as const;

const comercialUserIds = PEOPLE
  .filter((p) => p.role === 'comercial')
  .map((p) => userIdsByEmail.get(p.email)!);

const propertyRows = PROPERTIES_SEED.map((p, idx) => {
  const nb = NEIGHBORHOODS[p.n];
  const officeId = nb.office === 'ruzafa' ? ruzafaId : campanarId;
  const [minSale, maxSale] = nb.sale_per_m2;
  const [minRent, maxRent] = nb.rent_per_m2;

  // Precio determinista (no random) basado en m2 + posición media del rango
  const pricePerM2 = (minSale + maxSale) / 2;
  const rentPerM2 = (minRent + maxRent) / 2;

  return {
    tenant_id: tenantId,
    office_id: officeId,
    type: p.type,
    status: 'available' as const,
    title: p.title,
    description: `${p.title} en zona ${p.n}. ${p.m2} m². Ref. VH${(idx + 1).toString().padStart(3, '0')}.`,
    price_eur: p.type === 'sale' ? Math.round(p.m2 * pricePerM2) : null,
    monthly_rent_eur: p.type === 'rent' ? Math.round(p.m2 * rentPerM2) : null,
    m2_built: p.m2,
    rooms: p.rooms,
    bathrooms: p.baths,
    year_built: p.year,
    neighborhood: p.n,
    address_short: `Zona ${p.n}, Valencia`,
    features: p.feats,
    assigned_to_user_id: comercialUserIds[idx % comercialUserIds.length],
  };
});

const { data: properties, error: pErr } = await sb.from('properties').insert(propertyRows).select();
if (pErr || !properties) throw new Error(`properties insert failed: ${pErr?.message}`);
console.log(`       ${properties.length} properties (21 sale + 14 rent esperadas)`);

// ---------------------------------------------------------------------------
// 6) property_photos (3 por property)
// ---------------------------------------------------------------------------
console.log('[seed] 6/9 → property_photos');
const photoRows = properties.flatMap((prop, idx) => [
  { tenant_id: tenantId, property_id: prop.id, url: `${UNSPLASH[idx % UNSPLASH.length]}?w=800&fm=jpg`, caption: 'Fachada',     sort_order: 0 },
  { tenant_id: tenantId, property_id: prop.id, url: `${UNSPLASH[(idx + 1) % UNSPLASH.length]}?w=800&fm=jpg`, caption: 'Salón', sort_order: 1 },
  { tenant_id: tenantId, property_id: prop.id, url: `${UNSPLASH[(idx + 2) % UNSPLASH.length]}?w=800&fm=jpg`, caption: 'Cocina', sort_order: 2 },
]);
const { error: phErr } = await sb.from('property_photos').insert(photoRows);
if (phErr) throw new Error(`photos failed: ${phErr.message}`);
console.log(`       ${photoRows.length} photos`);

// ---------------------------------------------------------------------------
// 7) property_owners (1 por property)
// ---------------------------------------------------------------------------
console.log('[seed] 7/9 → property_owners');
const OWNER_NAMES = [
  'Josep Tortosa', 'Amparo Sanchis', 'Vicent Beneyto', 'María Llopis', 'Empar Ferrer',
  'Andreu Carbonell', 'Núria Bonet', 'Joan Marí', 'Pilar Alandí', 'Salva Vega',
  'Teresa Soler', 'Carles Albert', 'Concepción Mira', 'Ramon Pasqual', 'Inmaculada Roca',
];
const ownerRows = properties.map((prop, idx) => ({
  tenant_id: tenantId,
  property_id: prop.id,
  full_name: OWNER_NAMES[idx % OWNER_NAMES.length],
  phone: `+346${(10000000 + idx * 1000).toString().slice(0, 8)}`,
  email: null,
  notes: null,
}));
const { error: owErr } = await sb.from('property_owners').insert(ownerRows);
if (owErr) throw new Error(`owners failed: ${owErr.message}`);
console.log(`       ${ownerRows.length} owners`);

// ---------------------------------------------------------------------------
// 8) Leads (20) — mix fases + intent
// ---------------------------------------------------------------------------
console.log('[seed] 8/9 → leads + preferences');

const LEADS_SEED: Array<{
  name: string; phone: string; channel: 'whatsapp' | 'voice' | 'web_form' | 'meta_ads';
  intent: 'buyer' | 'tenant' | 'seller' | 'landlord' | 'unknown';
  status: 'new' | 'contacted' | 'qualified' | 'scheduled_visit' | 'visited';
  office: 'ruzafa' | 'campanar' | null;
}> = [
  // 5 new
  { name: 'Sergio Pérez',     phone: '+34611111001', channel: 'whatsapp', intent: 'buyer',  status: 'new',             office: null },
  { name: 'Marta Gil',        phone: '+34611111002', channel: 'meta_ads', intent: 'seller', status: 'new',             office: null },
  { name: 'David Hernández',  phone: '+34611111003', channel: 'whatsapp', intent: 'tenant', status: 'new',             office: null },
  { name: 'Lucía Martín',     phone: '+34611111004', channel: 'web_form', intent: 'buyer',  status: 'new',             office: null },
  { name: 'Antonio López',    phone: '+34611111005', channel: 'voice',    intent: 'unknown',status: 'new',             office: null },
  // 6 contacted
  { name: 'Beatriz García',   phone: '+34611111006', channel: 'whatsapp', intent: 'buyer',  status: 'contacted',       office: 'ruzafa'   },
  { name: 'Pablo Ruiz',       phone: '+34611111007', channel: 'whatsapp', intent: 'seller', status: 'contacted',       office: 'campanar' },
  { name: 'Carmen Vidal',     phone: '+34611111008', channel: 'meta_ads', intent: 'buyer',  status: 'contacted',       office: 'ruzafa'   },
  { name: 'Roberto Sanz',     phone: '+34611111009', channel: 'whatsapp', intent: 'tenant', status: 'contacted',       office: 'ruzafa'   },
  { name: 'Isabel Domingo',   phone: '+34611111010', channel: 'voice',    intent: 'seller', status: 'contacted',       office: 'campanar' },
  { name: 'Francisco Reyes',  phone: '+34611111011', channel: 'whatsapp', intent: 'landlord',status: 'contacted',      office: 'campanar' },
  // 4 qualified
  { name: 'Elena Cabrera',    phone: '+34611111012', channel: 'whatsapp', intent: 'buyer',  status: 'qualified',       office: 'ruzafa'   },
  { name: 'Daniel Morán',     phone: '+34611111013', channel: 'web_form', intent: 'seller', status: 'qualified',       office: 'campanar' },
  { name: 'Cristina Ortega',  phone: '+34611111014', channel: 'meta_ads', intent: 'tenant', status: 'qualified',       office: 'ruzafa'   },
  { name: 'Javier Tomás',     phone: '+34611111015', channel: 'whatsapp', intent: 'buyer',  status: 'qualified',       office: 'campanar' },
  // 3 scheduled_visit
  { name: 'Patricia Núñez',   phone: '+34611111016', channel: 'whatsapp', intent: 'buyer',  status: 'scheduled_visit', office: 'ruzafa'   },
  { name: 'Manuel Esteve',    phone: '+34611111017', channel: 'meta_ads', intent: 'seller', status: 'scheduled_visit', office: 'campanar' },
  { name: 'Rocío Fernández',  phone: '+34611111018', channel: 'whatsapp', intent: 'landlord',status: 'scheduled_visit',office: 'campanar' },
  // 2 visited
  { name: 'Andrés Rivas',     phone: '+34611111019', channel: 'whatsapp', intent: 'buyer',  status: 'visited',         office: 'ruzafa'   },
  { name: 'Mónica Verdú',     phone: '+34611111020', channel: 'web_form', intent: 'tenant', status: 'visited',         office: 'ruzafa'   },
];

const leadRows = LEADS_SEED.map((l, idx) => ({
  tenant_id: tenantId,
  office_id: l.office === 'ruzafa' ? ruzafaId : l.office === 'campanar' ? campanarId : null,
  assigned_to_user_id:
    l.status === 'new' || l.status === 'contacted'
      ? null
      : comercialUserIds[idx % comercialUserIds.length],
  channel: l.channel,
  full_name: l.name,
  phone: l.phone,
  intent: l.intent,
  status: l.status,
  current_phase: ['new', 'contacted', 'qualified', 'scheduled_visit', 'visited'].indexOf(l.status),
}));

const { data: leads, error: lErr } = await sb.from('leads').insert(leadRows).select();
if (lErr || !leads) throw new Error(`leads insert failed: ${lErr?.message}`);
console.log(`       ${leads.length} leads`);

// 8b) lead_preferences — solo para algunos buyers/tenants
const buyerLeads = leads.filter((l) => ['buyer', 'tenant'].includes(l.intent));
const prefRows = buyerLeads.slice(0, 10).map((lead) => ({
  tenant_id: tenantId,
  lead_id: lead.id,
  type: lead.intent === 'buyer' ? 'sale' : 'rent',
  neighborhoods: ['ruzafa', 'eixample', 'benimaclet'],
  price_min_eur: lead.intent === 'buyer' ? 150000 : null,
  price_max_eur: lead.intent === 'buyer' ? 280000 : null,
  rooms_min: 2,
  m2_min: 60,
  features_required: { lift: true },
  urgency: '3-6m',
  motives: lead.intent === 'buyer' ? 'Inversión + uso personal' : 'Cambio por trabajo',
}));
const { error: prErr } = await sb.from('lead_preferences').insert(prefRows);
if (prErr) throw new Error(`prefs failed: ${prErr.message}`);
console.log(`       ${prefRows.length} preferences`);

// ---------------------------------------------------------------------------
// 9) Conversations + messages + visits (subset realista)
// ---------------------------------------------------------------------------
console.log('[seed] 9/9 → conversations + messages + visits');

// 12 conversations — los 12 leads con status >= contacted
const convLeads = leads.filter((l) => l.status !== 'new').slice(0, 12);
const convRows = convLeads.map((l) => ({
  tenant_id: tenantId,
  lead_id: l.id,
  channel: l.channel,
  current_phase: l.current_phase,
  status: 'active' as const,
  emotion: 'neutral',
  goal: l.intent === 'buyer' ? 'Encontrar vivienda compra' : l.intent === 'seller' ? 'Vender inmueble' : 'Encontrar alquiler',
  urgency: '3-6m',
  next_action: l.status === 'visited' ? 'Esperar feedback' : 'Cualificar más',
  general_context: `Lead ${l.full_name} (${l.intent}) en fase ${l.status}.`,
  last_message_at: new Date().toISOString(),
}));
const { data: convs, error: cErr } = await sb.from('conversations').insert(convRows).select();
if (cErr || !convs) throw new Error(`conversations failed: ${cErr?.message}`);
console.log(`       ${convs.length} conversations`);

// ~3 mensajes por conversación
const msgRows: Array<{
  tenant_id: number;
  conversation_id: number;
  role: 'lead' | 'agent' | 'human';
  content: string;
}> = [];
for (const c of convs) {
  msgRows.push(
    { tenant_id: tenantId, conversation_id: c.id, role: 'lead',  content: 'Hola, estoy interesado en información.' },
    { tenant_id: tenantId, conversation_id: c.id, role: 'agent', content: 'Hola, encantado de ayudarte. ¿Buscas comprar, alquilar o vender?' },
    { tenant_id: tenantId, conversation_id: c.id, role: 'lead',  content: 'Quiero información sobre pisos disponibles.' },
  );
}
const { error: mErr } = await sb.from('conversation_messages').insert(msgRows);
if (mErr) throw new Error(`messages failed: ${mErr.message}`);
console.log(`       ${msgRows.length} messages`);

// 5 visits — los 3 scheduled_visit + 2 visited
const visitLeads = leads.filter((l) => ['scheduled_visit', 'visited'].includes(l.status));
const visitRows = visitLeads.map((l, idx) => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + (l.status === 'visited' ? -3 : 7));
  return {
    tenant_id: tenantId,
    lead_id: l.id,
    property_id: properties[idx % properties.length].id,
    comercial_user_id: l.assigned_to_user_id || comercialUserIds[0],
    scheduled_for: futureDate.toISOString(),
    status: l.status === 'visited' ? ('done' as const) : ('scheduled' as const),
    outcome_notes: l.status === 'visited' ? 'Visita realizada. Lead muestra interés.' : null,
    is_tasation: l.intent === 'seller' || l.intent === 'landlord',
  };
});
const { error: vErr } = await sb.from('visits').insert(visitRows);
if (vErr) throw new Error(`visits failed: ${vErr.message}`);
console.log(`       ${visitRows.length} visits`);

// ---------------------------------------------------------------------------
// Resumen final
// ---------------------------------------------------------------------------
console.log('\n[seed] === Resumen Vega Hogar ===');
const tables = ['tenants', 'users', 'offices', 'user_office_assignments',
  'properties', 'property_photos', 'property_owners',
  'leads', 'lead_preferences', 'lead_property_interest',
  'conversations', 'conversation_messages', 'message_schedules',
  'visits', 'prompt_blocks', 'integration_accounts'];
for (const t of tables) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log(`  ${t.padEnd(30)} ${count}`);
}

console.log('\n[seed] DONE.');
