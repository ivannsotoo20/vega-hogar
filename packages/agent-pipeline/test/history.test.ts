import { describe, it, expect } from 'vitest';
import { rowsToConversationMessages, type HistoryRow } from '../src/history.js';

/**
 * ⚠ Adaptación DB clave: Vega usa la columna `role` (enum message_role:
 * lead/agent/human/system), NO `source`. Mapeo:
 *   lead → 'user' ; agent | human | system → 'assistant'.
 */
describe('rowsToConversationMessages — role mapping (los 4 roles)', () => {
  it('mapea los 4 roles: lead→user; agent/human/system→assistant', () => {
    const rows: HistoryRow[] = [
      { id: 1, content: 'hola, busco piso', role: 'lead', created_at: '2026-06-22T10:00:00.000Z' },
      { id: 2, content: 'claro, ¿qué zona?', role: 'agent', created_at: '2026-06-22T10:00:05.000Z' },
      { id: 3, content: 'te llamo yo, soy Marta', role: 'human', created_at: '2026-06-22T10:00:10.000Z' },
      { id: 4, content: 'conversación reasignada', role: 'system', created_at: '2026-06-22T10:00:15.000Z' },
    ];
    const out = rowsToConversationMessages(rows);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant', 'assistant']);
    expect(out[0]!.content).toBe('hola, busco piso');
    expect(out[1]!.content).toBe('claro, ¿qué zona?');
  });

  it('ordena cronológicamente por created_at aunque lleguen desordenadas', () => {
    const rows: HistoryRow[] = [
      { id: 30, content: 'tercero', role: 'lead', created_at: '2026-06-22T10:02:00.000Z' },
      { id: 10, content: 'primero', role: 'lead', created_at: '2026-06-22T10:00:00.000Z' },
      { id: 20, content: 'segundo', role: 'agent', created_at: '2026-06-22T10:01:00.000Z' },
    ];
    const out = rowsToConversationMessages(rows);
    expect(out.map((m) => m.content)).toEqual(['primero', 'segundo', 'tercero']);
  });

  it('desempata por id cuando created_at coincide', () => {
    const ts = '2026-06-22T10:00:00.000Z';
    const rows: HistoryRow[] = [
      { id: 2, content: 'b', role: 'agent', created_at: ts },
      { id: 1, content: 'a', role: 'lead', created_at: ts },
    ];
    const out = rowsToConversationMessages(rows);
    expect(out.map((m) => m.content)).toEqual(['a', 'b']);
  });

  it('excluye el mensaje indicado por excludeMessageId', () => {
    const rows: HistoryRow[] = [
      { id: 1, content: 'previo', role: 'lead', created_at: '2026-06-22T10:00:00.000Z' },
      { id: 2, content: 'último del lead (disparador)', role: 'lead', created_at: '2026-06-22T10:00:05.000Z' },
    ];
    const out = rowsToConversationMessages(rows, { excludeMessageId: 2 });
    expect(out).toHaveLength(1);
    expect(out[0]!.content).toBe('previo');
  });

  it('ignora mensajes con content vacío o null (audios sin transcripción)', () => {
    const rows: HistoryRow[] = [
      { id: 1, content: '   ', role: 'lead', created_at: '2026-06-22T10:00:00.000Z' },
      { id: 2, content: null, role: 'lead', created_at: '2026-06-22T10:00:05.000Z' },
      { id: 3, content: 'mensaje real', role: 'agent', created_at: '2026-06-22T10:00:10.000Z' },
    ];
    const out = rowsToConversationMessages(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.content).toBe('mensaje real');
    expect(out[0]!.role).toBe('assistant');
  });

  it('incluye timestampMs derivado de created_at', () => {
    const rows: HistoryRow[] = [
      { id: 1, content: 'hola', role: 'lead', created_at: '2026-06-22T10:00:00.000Z' },
    ];
    const out = rowsToConversationMessages(rows);
    expect(out[0]!.timestampMs).toBe(new Date('2026-06-22T10:00:00.000Z').getTime());
  });
});
