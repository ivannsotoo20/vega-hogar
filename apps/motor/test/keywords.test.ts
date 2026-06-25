import { describe, it, expect } from 'vitest';
import { classifyInbound, type KeywordRow } from '../src/services/keywords.js';

const KWS: KeywordRow[] = [
  { pattern: 'comprar', type: 'inbound' },
  { pattern: 'vender', type: 'inbound' },
  { pattern: 'bienvenido', type: 'bienvenida' },
];

describe('classifyInbound', () => {
  it('matchea substring case-insensitive y devuelve el type', () => {
    expect(classifyInbound('Hola, quiero COMPRAR un piso', KWS)).toBe('inbound');
    expect(classifyInbound('me gustaría vender mi casa', KWS)).toBe('inbound');
  });
  it('devuelve el type del primer match en orden', () => {
    expect(classifyInbound('bienvenido, quiero comprar', KWS)).toBe('inbound'); // 'comprar' va antes en KWS
  });
  it('devuelve null si nada matchea o el texto está vacío', () => {
    expect(classifyInbound('hola qué tal', KWS)).toBeNull();
    expect(classifyInbound('', KWS)).toBeNull();
    expect(classifyInbound('cualquier cosa', [])).toBeNull();
  });
});
