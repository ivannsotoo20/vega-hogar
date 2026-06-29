// scripts/build-prompts-seed.mjs
// F10c S22 — Publica el cerebro real del agente (markdown source → prompt_blocks),
// respetando la Regla 9: SOLO siembra si el bloque sigue siendo el placeholder
// `-- PENDIENTE …` y NO tiene versiones. Si Iván ya publicó/editó vía Cerebro,
// NO lo pisa (skip). El markdown source es "seed-si-placeholder / downstream",
// NUNCA la fuente de verdad (esa es la BD publicada por la UI).
//
// Uso: node scripts/build-prompts-seed.mjs   (o: pnpm prompts:build-seed)
// Read-only salvo el UPDATE prompt_blocks + INSERT prompt_block_versions cuando procede.

import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(__dirname, '..', 'apps', 'motor', 'prompts', 'source');

const FILES = ['core-v1-base.md', 'agencia-vega.md', 'output-contract-v1.md'];

/**
 * Guard de la Regla 9. Función pura (testeable). Publica SOLO si el contenido
 * actual en BD sigue siendo el placeholder y el bloque no tiene versiones aún.
 */
export function shouldPublish(currentDbContent, hasVersions) {
  if (hasVersions) return false;
  const c = (currentDbContent ?? '').trim();
  return c.startsWith('-- PENDIENTE');
}

/** Parsea frontmatter YAML mínimo (`---`) + devuelve { meta, content }. */
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error('build-prompts-seed: markdown sin frontmatter --- válido');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val === 'null') val = null;
    else if (/^-?\d+$/.test(val)) val = Number(val);
    meta[key] = val;
  }
  return { meta, content: m[2].trim() };
}

async function main() {
  loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let published = 0;
  let skipped = 0;
  try {
    for (const file of FILES) {
      const raw = readFileSync(path.join(SOURCE_DIR, file), 'utf8');
      const { meta, content } = parseFrontmatter(raw);
      const blockKey = meta.block_key;
      const tenantId = meta.tenant_id === null || meta.tenant_id === undefined ? null : Number(meta.tenant_id);

      const { rows } = await client.query(
        `SELECT id, content FROM public.prompt_blocks
         WHERE block_key = $1 AND tenant_id IS NOT DISTINCT FROM $2`,
        [blockKey, tenantId],
      );
      if (rows.length === 0) {
        console.warn(`[build-prompts-seed] ⚠ bloque ausente: ${blockKey} (tenant=${tenantId}) — ejecuta seed-engine antes`);
        skipped++;
        continue;
      }
      const block = rows[0];
      const { rows: vrows } = await client.query(
        'SELECT 1 FROM public.prompt_block_versions WHERE prompt_block_id = $1 LIMIT 1',
        [block.id],
      );
      const hasVersions = vrows.length > 0;

      if (!shouldPublish(block.content, hasVersions)) {
        console.log(`[build-prompts-seed] skip ${blockKey} (ya publicado/editado vía Cerebro — Regla 9)`);
        skipped++;
        continue;
      }

      await client.query('BEGIN');
      await client.query(
        'UPDATE public.prompt_blocks SET content = $1, updated_at = now() WHERE id = $2',
        [content, block.id],
      );
      await client.query(
        `INSERT INTO public.prompt_block_versions (prompt_block_id, version_number, content, was_applied, change_summary)
         VALUES ($1, 1, $2, true, 'Seed inicial F10c (markdown source)')`,
        [block.id, content],
      );
      await client.query('COMMIT');
      console.log(`[build-prompts-seed] published ${blockKey} (${content.length} chars) + version v1`);
      published++;
    }
    console.log(`[build-prompts-seed] OK · published=${published} skipped=${skipped}`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[build-prompts-seed] FATAL:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

// Solo ejecuta si se invoca directamente (permite importar shouldPublish en tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
