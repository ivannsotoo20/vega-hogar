import { describe, it, expect } from 'vitest';
// @ts-expect-error — script .mjs sin tipos; importamos las funciones puras.
import { shouldPublish, parseFrontmatter } from '../../../scripts/build-prompts-seed.mjs';

describe('shouldPublish (guard Regla 9)', () => {
  it('publica si es placeholder y NO hay versiones', () => {
    expect(shouldPublish('-- PENDIENTE Fase 10 (markdown source + prompts:build-seed) --', false)).toBe(true);
    expect(shouldPublish('  -- PENDIENTE algo --  ', false)).toBe(true);
  });
  it('NO publica si ya hay contenido real (publicado/editado vía Cerebro)', () => {
    expect(shouldPublish('# Quién eres\nEres un agente…', false)).toBe(false);
  });
  it('NO publica si el bloque ya tiene versiones (aunque el content pareciese placeholder)', () => {
    expect(shouldPublish('-- PENDIENTE --', true)).toBe(false);
  });
  it('maneja content nulo/vacío', () => {
    expect(shouldPublish(null, false)).toBe(false);
    expect(shouldPublish('', false)).toBe(false);
  });
});

describe('parseFrontmatter', () => {
  it('extrae meta (block_key, tenant_id null/number, sort_order) y content', () => {
    const raw = '---\nblock_key: core_v1_base\ntenant_id: null\nsort_order: 0\n---\n# Cuerpo\nlínea';
    const { meta, content } = parseFrontmatter(raw);
    expect(meta.block_key).toBe('core_v1_base');
    expect(meta.tenant_id).toBeNull();
    expect(meta.sort_order).toBe(0);
    expect(content).toBe('# Cuerpo\nlínea');
  });
  it('tenant_id numérico se parsea a number', () => {
    const raw = '---\nblock_key: agencia_vega\ntenant_id: 1\nsort_order: 5\n---\ncontenido';
    const { meta } = parseFrontmatter(raw);
    expect(meta.tenant_id).toBe(1);
  });
  it('lanza si no hay frontmatter', () => {
    expect(() => parseFrontmatter('sin frontmatter')).toThrow(/frontmatter/);
  });
});
