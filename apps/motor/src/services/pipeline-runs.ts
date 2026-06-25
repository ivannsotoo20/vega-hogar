import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@vega-hogar/db';
import type { PipelineOutput, PipelineStageMetric } from '@vega-hogar/agent-pipeline';
import { logger } from '../lib/logger.js';

/**
 * Helpers para escribir filas en `pipeline_runs` (observabilidad del pipeline 3-LLM).
 *
 * Patrón:
 *   const run = await startPipelineRun(supabase, { tenantId, conversationId });
 *   try {
 *     const out = await runPipeline(...);
 *     await completePipelineRun(supabase, { id: run.id, output: out, startedAtMs });
 *   } catch (err) {
 *     await failPipelineRun(supabase, { id: run.id, startedAtMs, error: err, outcome });
 *     throw err;
 *   }
 *
 * Las escrituras son best-effort: si fallan, loggean pero NO interrumpen el
 * pipeline (la observabilidad nunca debe romper la operación).
 *
 * Nota Vega vs SETTER: `pipeline_runs` de Vega NO tiene columnas `multimodal_*`
 * (audio/imagen diferido por lean) → se omiten.
 */

export interface StartedRun {
  id: number;
  correlationId: string;
}

export type PipelineRunOutcome =
  | 'success'
  | 'judge_reject'
  | 'validator_error'
  | 'pipeline_error';

export async function startPipelineRun(
  supabase: SupabaseClient<Database>,
  params: { tenantId: number; conversationId: number },
): Promise<StartedRun> {
  const correlationId = randomUUID();
  try {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .insert({
        tenant_id: params.tenantId,
        conversation_id: params.conversationId,
        correlation_id: correlationId,
        outcome: 'in_progress',
      })
      .select('id')
      .single();
    if (error || !data) {
      logger.error({ err: error?.message }, '[pipeline-runs] startPipelineRun INSERT failed (non-fatal)');
      return { id: 0, correlationId };
    }
    return { id: Number(data.id), correlationId };
  } catch (err) {
    logger.error({ err }, '[pipeline-runs] startPipelineRun unexpected error (non-fatal)');
    return { id: 0, correlationId };
  }
}

export async function completePipelineRun(
  supabase: SupabaseClient<Database>,
  params: {
    id: number;
    output: PipelineOutput;
    startedAtMs: number;
    outcome?: PipelineRunOutcome;
  },
): Promise<void> {
  if (params.id === 0) return; // INSERT inicial falló; nada que actualizar.
  const { id, output, startedAtMs } = params;
  const outcome = params.outcome ?? 'success';
  const durationMs = Date.now() - startedAtMs;

  const stage = (role: PipelineStageMetric['role']) => output.stages.find((s) => s.role === role);
  const gen = stage('generator');
  const judge = stage('judge');
  const split = stage('splitter');

  try {
    const { error } = await supabase
      .from('pipeline_runs')
      .update({
        ended_at: new Date().toISOString(),
        duration_ms: durationMs,
        generator_model: gen?.model ?? null,
        generator_tokens_in: gen ? totalTokensIn(gen) : null,
        generator_tokens_out: gen?.usage.tokensOut ?? null,
        generator_cost_usd: gen?.usage.costUsd ?? null,
        judge_model: judge?.model ?? null,
        judge_tokens_in: judge ? totalTokensIn(judge) : null,
        judge_tokens_out: judge?.usage.tokensOut ?? null,
        judge_cost_usd: judge?.usage.costUsd ?? null,
        judge_decision: output.judge.decision,
        splitter_model: split?.model ?? null,
        splitter_tokens_in: split ? totalTokensIn(split) : null,
        splitter_tokens_out: split?.usage.tokensOut ?? null,
        splitter_cost_usd: split?.usage.costUsd ?? null,
        splitter_parts: output.parts.length,
        validator_violations:
          output.validator.violations.length > 0
            ? (output.validator.violations as unknown as Json)
            : null,
        total_cost_usd: output.totals.costUsd ?? 0,
        total_tokens_in: output.totals.tokensInTotal,
        total_tokens_out: output.totals.tokensOutTotal,
        outcome,
      })
      .eq('id', id);
    if (error) {
      logger.error({ err: error.message }, '[pipeline-runs] completePipelineRun UPDATE failed (non-fatal)');
    }
  } catch (err) {
    logger.error({ err }, '[pipeline-runs] completePipelineRun unexpected error (non-fatal)');
  }
}

export async function failPipelineRun(
  supabase: SupabaseClient<Database>,
  params: {
    id: number;
    startedAtMs: number;
    outcome: Exclude<PipelineRunOutcome, 'success'>;
    error: unknown;
  },
): Promise<void> {
  if (params.id === 0) return;
  const { id, startedAtMs, outcome, error } = params;
  const errorMessage = error instanceof Error ? error.message : String(error);
  try {
    const { error: updErr } = await supabase
      .from('pipeline_runs')
      .update({
        ended_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAtMs,
        outcome,
        error_message: errorMessage.slice(0, 2000),
      })
      .eq('id', id);
    if (updErr) {
      logger.error({ err: updErr.message }, '[pipeline-runs] failPipelineRun UPDATE failed (non-fatal)');
    }
  } catch (err) {
    logger.error({ err }, '[pipeline-runs] failPipelineRun unexpected error (non-fatal)');
  }
}

/**
 * Clasifica un Error en un outcome semántico para `pipeline_runs.outcome`.
 * `runPipeline` lanza dos clases conocidas (Judge reject, Validator error);
 * cualquier otra cosa cae en `pipeline_error`. Los prefijos coinciden con los
 * mensajes que lanza `@vega-hogar/agent-pipeline`.
 */
export function classifyPipelineError(err: unknown): Exclude<PipelineRunOutcome, 'success'> {
  if (!(err instanceof Error)) return 'pipeline_error';
  const msg = err.message;
  if (msg.startsWith('Judge rejected message:')) return 'judge_reject';
  if (msg.startsWith('Validator V00-V19 found unrecoverable errors after Judge:')) {
    return 'validator_error';
  }
  return 'pipeline_error';
}

function totalTokensIn(stage: PipelineStageMetric): number {
  return stage.usage.tokensInUncached + stage.usage.tokensInCacheRead + stage.usage.tokensInCacheWrite;
}
