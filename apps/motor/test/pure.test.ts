import { describe, it, expect } from 'vitest';
import { computeAutoPromotedPhase } from '../src/services/process-debounced.js';
import { classifyPipelineError } from '../src/services/pipeline-runs.js';
import { aggregatePipelineRuns, type PipelineRunRow } from '../src/services/pipeline-stats.js';
import { buildPhaseFocusInstruction } from '../src/lib/phase-focus.js';
import { consultarDisponibilidad } from '../src/services/agent-tools/consultar-disponibilidad.js';

describe('computeAutoPromotedPhase', () => {
  it('auto-promueve F1→F2 si source es clasificada y el generator no subió', () => {
    expect(computeAutoPromotedPhase({ currentPhase: 1, generatorPhase: 1, conversationSource: 'bienvenida' })).toBe(2);
    expect(computeAutoPromotedPhase({ currentPhase: 0, generatorPhase: 0, conversationSource: 'inbound' })).toBe(2);
  });
  it('respeta al generator si ya sube ≥2', () => {
    expect(computeAutoPromotedPhase({ currentPhase: 1, generatorPhase: 4, conversationSource: 'lm' })).toBe(4);
  });
  it('no auto-promueve sin source clasificada', () => {
    expect(computeAutoPromotedPhase({ currentPhase: 1, generatorPhase: 1, conversationSource: null })).toBe(1);
    expect(computeAutoPromotedPhase({ currentPhase: 1, generatorPhase: 1, conversationSource: 'otra' })).toBe(1);
  });
  it('no auto-promueve si ya pasó de F1', () => {
    expect(computeAutoPromotedPhase({ currentPhase: 3, generatorPhase: 1, conversationSource: 'bienvenida' })).toBe(1);
  });
});

describe('classifyPipelineError', () => {
  it('mapea los prefijos de error del pipeline de Vega', () => {
    expect(classifyPipelineError(new Error('Judge rejected message: foo'))).toBe('judge_reject');
    expect(
      classifyPipelineError(new Error('Validator V00-V19 found unrecoverable errors after Judge: V19')),
    ).toBe('validator_error');
    expect(classifyPipelineError(new Error('network down'))).toBe('pipeline_error');
    expect(classifyPipelineError('not an error')).toBe('pipeline_error');
  });
});

describe('aggregatePipelineRuns', () => {
  it('agrega coste, outcomes y latencias', () => {
    const rows: PipelineRunRow[] = [
      { outcome: 'success', duration_ms: 100, total_cost_usd: 0.01, generator_cost_usd: 0.006, judge_cost_usd: 0.002, splitter_cost_usd: 0.002, total_tokens_in: 1000, total_tokens_out: 200, splitter_parts: 2, judge_decision: 'pass' },
      { outcome: 'success', duration_ms: 300, total_cost_usd: 0.02, generator_cost_usd: 0.012, judge_cost_usd: 0.004, splitter_cost_usd: 0.004, total_tokens_in: 2000, total_tokens_out: 400, splitter_parts: 3, judge_decision: 'fix' },
      { outcome: 'judge_reject', duration_ms: 50, total_cost_usd: 0.005, generator_cost_usd: 0.005, judge_cost_usd: 0, splitter_cost_usd: 0, total_tokens_in: 500, total_tokens_out: 0, splitter_parts: null, judge_decision: 'reject' },
    ];
    const agg = aggregatePipelineRuns(rows);
    expect(agg.totalRuns).toBe(3);
    expect(agg.byOutcome).toEqual({ success: 2, judge_reject: 1 });
    expect(agg.byJudgeDecision).toEqual({ pass: 1, fix: 1, reject: 1 });
    expect(agg.cost.totalUsd).toBeCloseTo(0.035, 6);
    expect(agg.tokens.inTotal).toBe(3500);
    expect(agg.tokens.outTotal).toBe(600);
    expect(agg.splitterParts.avg).toBe(2.5);
  });
  it('maneja el set vacío', () => {
    const agg = aggregatePipelineRuns([]);
    expect(agg.totalRuns).toBe(0);
    expect(agg.latencyMs.p50).toBeNull();
    expect(agg.splitterParts.avg).toBeNull();
  });
});

describe('buildPhaseFocusInstruction', () => {
  it('da instrucción por (fase, track) y difiere buyer/seller', () => {
    expect(buildPhaseFocusInstruction(4, 'buyer')).toContain('inmuebles');
    expect(buildPhaseFocusInstruction(5, 'seller')).toContain('tasación');
    expect(buildPhaseFocusInstruction(0, 'shared')).toBeTruthy(); // shared cae a buyer table
  });
  it('fase fuera de rango cae a F0', () => {
    expect(buildPhaseFocusInstruction(99, 'buyer')).toBe(buildPhaseFocusInstruction(0, 'buyer'));
  });
});

describe('consultarDisponibilidad (mock)', () => {
  it('devuelve N slots futuros en días hábiles', async () => {
    const slots = await consultarDisponibilidad({ count: 4 });
    expect(slots).toHaveLength(4);
    for (const s of slots) {
      const ms = Date.parse(s.iso);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThan(Date.now());
      const day = new Date(ms).getDay(); // día local (los slots saltan fin de semana local)
      expect(day === 0 || day === 6).toBe(false);
      expect(s.humanLabel.length).toBeGreaterThan(0);
    }
  });
});
