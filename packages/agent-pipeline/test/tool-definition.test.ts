import { describe, it, expect } from 'vitest';
import {
  respondAsInmobiliarioTool,
  RESPOND_AS_INMOBILIARIO_TOOL_NAME,
  buildRespondAsInmobiliarioTool,
} from '../src/tool-definition.js';
import { validateInmobiliarioOutput } from '../src/generator.js';

describe('respondAsInmobiliarioTool schema', () => {
  it('exposes the expected name', () => {
    expect(respondAsInmobiliarioTool.name).toBe('respond_as_inmobiliario');
    expect(RESPOND_AS_INMOBILIARIO_TOOL_NAME).toBe('respond_as_inmobiliario');
  });

  it('declares the 4 required fields (incl. detected_intent)', () => {
    const schema = respondAsInmobiliarioTool.input_schema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toEqual([
      'message_raw',
      'conversation_status',
      'phase_decision',
      'detected_intent',
    ]);
  });

  it('exposes the new inmobiliario fields', () => {
    const schema = respondAsInmobiliarioTool.input_schema as {
      properties: Record<string, unknown>;
    };
    for (const key of [
      'detected_intent',
      'proposed_property_ids',
      'proposed_visit_slot',
      'is_tasation_visit',
      'contraoferta_registrada',
      'handoff_cause',
      'handoff_reason',
      'resources_to_send',
    ]) {
      expect(schema.properties).toHaveProperty(key);
    }
  });

  it('does NOT expose the dropped setter field proposed_booking_slot', () => {
    const schema = respondAsInmobiliarioTool.input_schema as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties).not.toHaveProperty('proposed_booking_slot');
  });

  it('phase_decision is integer 0..7 (dual track, 0=pre-cualificación)', () => {
    const schema = respondAsInmobiliarioTool.input_schema as {
      properties: { phase_decision: { type: string; minimum: number; maximum: number } };
    };
    expect(schema.properties.phase_decision.type).toBe('integer');
    expect(schema.properties.phase_decision.minimum).toBe(0);
    expect(schema.properties.phase_decision.maximum).toBe(7);
  });

  it('detected_intent enum is buyer|seller|unknown', () => {
    const schema = respondAsInmobiliarioTool.input_schema as {
      properties: { detected_intent: { enum: string[] } };
    };
    expect(schema.properties.detected_intent.enum).toEqual(['buyer', 'seller', 'unknown']);
  });
});

describe('buildRespondAsInmobiliarioTool — maxLength dinámico de message_raw', () => {
  function maxLen(tool: ReturnType<typeof buildRespondAsInmobiliarioTool>): number {
    const schema = tool.input_schema as { properties: { message_raw: { maxLength: number } } };
    return schema.properties.message_raw.maxLength;
  }

  it('cap default (4) → 1150', () => {
    expect(maxLen(buildRespondAsInmobiliarioTool())).toBe(1150);
  });
  it('maxParts=1 → 310', () => {
    expect(maxLen(buildRespondAsInmobiliarioTool({ maxParts: 1 }))).toBe(310);
  });
  it('maxParts=2 → 590', () => {
    expect(maxLen(buildRespondAsInmobiliarioTool({ maxParts: 2 }))).toBe(590);
  });
  it('maxParts=3 → 870', () => {
    expect(maxLen(buildRespondAsInmobiliarioTool({ maxParts: 3 }))).toBe(870);
  });
  it('maxParts=4 → 1150', () => {
    expect(maxLen(buildRespondAsInmobiliarioTool({ maxParts: 4 }))).toBe(1150);
  });
  it('export legacy equivale al cap default (4)', () => {
    expect(maxLen(respondAsInmobiliarioTool)).toBe(1150);
  });
});

describe('validateInmobiliarioOutput', () => {
  it('accepts a minimal valid payload (phase 0, intent unknown)', () => {
    const out = validateInmobiliarioOutput({
      message_raw: 'Hola, ¿en qué zona de Valencia buscas?',
      conversation_status: 'active',
      phase_decision: 0,
      detected_intent: 'unknown',
    });
    expect(out.message_raw).toContain('zona');
    expect(out.conversation_status).toBe('active');
    expect(out.phase_decision).toBe(0);
    expect(out.detected_intent).toBe('unknown');
  });

  it('accepts phase 7 (cierre post-agenda)', () => {
    const out = validateInmobiliarioOutput({
      message_raw: 'Confirmado, te esperamos.',
      conversation_status: 'handoff',
      phase_decision: 7,
      detected_intent: 'buyer',
      handoff_cause: 'A_agenda',
    });
    expect(out.phase_decision).toBe(7);
    expect(out.handoff_cause).toBe('A_agenda');
  });

  it('rejects empty message_raw', () => {
    expect(() =>
      validateInmobiliarioOutput({
        message_raw: '',
        conversation_status: 'active',
        phase_decision: 1,
        detected_intent: 'buyer',
      }),
    ).toThrow(/empty `message_raw`/);
  });

  it('rejects invalid conversation_status', () => {
    expect(() =>
      validateInmobiliarioOutput({
        message_raw: 'hola',
        conversation_status: 'closed',
        phase_decision: 1,
        detected_intent: 'buyer',
      }),
    ).toThrow(/invalid conversation_status/);
  });

  it('rejects out-of-range phase_decision (-1 and 8)', () => {
    expect(() =>
      validateInmobiliarioOutput({
        message_raw: 'hola',
        conversation_status: 'active',
        phase_decision: -1,
        detected_intent: 'buyer',
      }),
    ).toThrow(/invalid phase_decision/);
    expect(() =>
      validateInmobiliarioOutput({
        message_raw: 'hola',
        conversation_status: 'active',
        phase_decision: 8,
        detected_intent: 'buyer',
      }),
    ).toThrow(/invalid phase_decision/);
  });

  it('rejects invalid / missing detected_intent', () => {
    expect(() =>
      validateInmobiliarioOutput({
        message_raw: 'hola',
        conversation_status: 'active',
        phase_decision: 1,
        detected_intent: 'tenant',
      }),
    ).toThrow(/invalid detected_intent/);
    expect(() =>
      validateInmobiliarioOutput({
        message_raw: 'hola',
        conversation_status: 'active',
        phase_decision: 1,
      }),
    ).toThrow(/invalid detected_intent/);
  });

  it('normaliza proposed_visit_slot (trim) y descarta vacío/no-string', () => {
    const ok = validateInmobiliarioOutput({
      message_raw: 'Te apunto el lunes 17h.',
      conversation_status: 'qualified',
      phase_decision: 6,
      detected_intent: 'buyer',
      proposed_visit_slot: '  2026-06-30T17:00:00+02:00  ',
    });
    expect(ok.proposed_visit_slot).toBe('2026-06-30T17:00:00+02:00');

    const empty = validateInmobiliarioOutput({
      message_raw: 'ok',
      conversation_status: 'active',
      phase_decision: 6,
      detected_intent: 'buyer',
      proposed_visit_slot: '   ',
    });
    expect(empty.proposed_visit_slot).toBeUndefined();
  });

  it('filtra proposed_property_ids a solo enteros', () => {
    const out = validateInmobiliarioOutput({
      message_raw: 'Tengo 2 opciones para ti.',
      conversation_status: 'active',
      phase_decision: 4,
      detected_intent: 'buyer',
      proposed_property_ids: [12, 'x', 7.5, 34, null],
    });
    expect(out.proposed_property_ids).toEqual([12, 34]);
  });

  it('parsea is_tasation_visit solo si es boolean', () => {
    const yes = validateInmobiliarioOutput({
      message_raw: 'Agendo la tasación.',
      conversation_status: 'qualified',
      phase_decision: 6,
      detected_intent: 'seller',
      is_tasation_visit: true,
    });
    expect(yes.is_tasation_visit).toBe(true);

    const no = validateInmobiliarioOutput({
      message_raw: 'ok',
      conversation_status: 'active',
      phase_decision: 6,
      detected_intent: 'seller',
      is_tasation_visit: 'true',
    });
    expect(no.is_tasation_visit).toBeUndefined();
  });

  it('drops invalid handoff_cause silently', () => {
    const out = validateInmobiliarioOutput({
      message_raw: 'hola',
      conversation_status: 'handoff',
      phase_decision: 7,
      detected_intent: 'buyer',
      handoff_cause: 'NOT_VALID',
    });
    expect(out.handoff_cause).toBeUndefined();
  });

  it('rejects non-object input', () => {
    expect(() => validateInmobiliarioOutput('nope')).toThrow();
    expect(() => validateInmobiliarioOutput(null)).toThrow();
  });
});
