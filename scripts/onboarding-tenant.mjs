// scripts/onboarding-tenant.mjs
// ONBOARDING comunidad: renombra el tenant demo (id=1, sembrado por
// packages/db/seeds/00-vega-hogar.ts) a TU inmobiliaria. Idempotente.
//
// ⚠ NO toca `tenants.slug` ('vega-hogar'): es la clave de idempotencia del
// seed — renombrarlo permitiría duplicar el tenant en un re-seed.
// ⚠ NO relocaliza el catálogo demo: las 35 properties siguen siendo de
// barrios de Valencia (datos de práctica). Tu voz/identidad sí cambia
// (prompts vía apps/motor/prompts/source/agencia-vega.md + Cerebro).
//
// Uso: node scripts/onboarding-tenant.mjs --name "Inmo García" --city "Málaga"
//        [--brand-color "#0B5FFF"] [--founded 2015] [--mark-onboarded]

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? (process.argv[i + 1] ?? '') : '';
}
const name = arg('--name').trim();
const city = arg('--city').trim();
const brandColor = arg('--brand-color').trim();
const founded = Number(arg('--founded')) || null;
const markOnboarded = process.argv.includes('--mark-onboarded');

if (!name || !city) {
  console.error('Uso: node scripts/onboarding-tenant.mjs --name "Inmo García" --city "Málaga" [--brand-color "#0B5FFF"] [--founded 2015] [--mark-onboarded]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL falta en .env.local');
  process.exit(1);
}

const settingsPatch = { city };
if (brandColor) settingsPatch.brand_color = brandColor;
if (founded) settingsPatch.founded = founded;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const { rows: t } = await db.query(
    `UPDATE public.tenants
        SET name = $1,
            settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb
      WHERE id = 1
      RETURNING id, slug, name, settings`,
    [name, JSON.stringify(settingsPatch)],
  );
  if (t.length === 0) {
    console.error("FATAL: tenant id=1 no existe. ¿Ejecutaste el seed demo? (packages/db/seeds/00-vega-hogar.ts)");
    process.exit(1);
  }
  console.log(`✓ tenant renombrado → "${t[0].name}" · settings=${JSON.stringify(t[0].settings)}`);

  const { rows: o } = await db.query(
    `UPDATE public.offices SET city = $1 WHERE tenant_id = 1 RETURNING id, name, city`,
    [city],
  );
  for (const office of o) console.log(`✓ office "${office.name}" → city=${office.city}`);

  if (markOnboarded) {
    await db.query(`UPDATE public.tenants SET onboarded_at = now() WHERE id = 1`);
    console.log('✓ tenant marcado como onboarded');
  }
} finally {
  await db.end();
}

console.log('');
console.log('NOTA: el catálogo demo (35 inmuebles) sigue siendo de Valencia — son datos');
console.log('de práctica. La VOZ de tu agente se personaliza en el prompt de agencia');
console.log('(apps/motor/prompts/source/agencia-vega.md antes del primer publish, o');
console.log('después vía panel /admin/cerebro).');
