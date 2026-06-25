import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';

/**
 * Agregaciones sobre `pipeline_runs` para observabilidad (endpoint interno).
 *
 * Fetch crudo de las filas en la ventana → agregamos en JS. Suficiente para los
 * volúmenes esperados. La función pura `aggregatePipelineRuns` se testea con
 * fixtures sin tocar DB.
 */

export interface PipelineRunRow {
  outcome: string;
  duration_ms: number | null;
  total_cost_usd: number | null;
  generator_cost_usd: number | null;
  judge_cost_usd: number | null;
  splitter_cost_usd: number | null;
  total_tokens_in: number | null;
  total_tokens_out: number | null;
  splitter_parts: number | null;
  judge_decision: string | null;
}

export interface PipelineStatsAggregate {
  totalRuns: number;
  byOutcome: Record<string, number>;
  byJudgeDecision: Record<string, number>;
  cost: {
    totalUsd: number;
    avgUsdPerRun: number;
    generatorUsd: number;
    judgeUsd: number;
    splitterUsd: number;
  };
  latencyMs: {
    p50: number | null;
    p95: number | null;
    avg: number | null;
  };
  tokens: {
    inTotal: number;
    outTotal: number;
  };
  splitterParts: {
    avg: number | null;
  };
}

export function aggregatePipelineRuns(rows: PipelineRunRow[]): PipelineStatsAggregate {
  const byOutcome: Record<string, number> = {};
  const byJudgeDecision: Record<string, number> = {};
  let totalCost = 0;
  let generatorCost = 0;
  let judgeCost = 0;
  let splitterCost = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  const durations: number[] = [];
  const splitterPartsList: number[] = [];

  for (const r of rows) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
    if (r.judge_decision) {
      byJudgeDecision[r.judge_decision] = (byJudgeDecision[r.judge_decision] ?? 0) + 1;
    }
    if (r.total_cost_usd != null) totalCost += Number(r.total_cost_usd);
    if (r.generator_cost_usd != null) generatorCost += Number(r.generator_cost_usd);
    if (r.judge_cost_usd != null) judgeCost += Number(r.judge_cost_usd);
    if (r.splitter_cost_usd != null) splitterCost += Number(r.splitter_cost_usd);
    if (r.total_tokens_in != null) tokensIn += r.total_tokens_in;
    if (r.total_tokens_out != null) tokensOut += r.total_tokens_out;
    if (r.duration_ms != null) durations.push(r.duration_ms);
    if (r.splitter_parts != null) splitterPartsList.push(r.splitter_parts);
  }

  const totalRuns = rows.length;
  const avgUsdPerRun = totalRuns > 0 ? totalCost / totalRuns : 0;
  const partsAvg =
    splitterPartsList.length > 0
      ? splitterPartsList.reduce((a, b) => a + b, 0) / splitterPartsList.length
      : null;

  const sortedDurations = [...durations].sort((a, b) => a - b);
  const p50 = percentile(sortedDurations, 0.5);
  const p95 = percentile(sortedDurations, 0.95);
  const avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  return {
    totalRuns,
    byOutcome,
    byJudgeDecision,
    cost: {
      totalUsd: round6(totalCost),
      avgUsdPerRun: round6(avgUsdPerRun),
      generatorUsd: round6(generatorCost),
      judgeUsd: round6(judgeCost),
      splitterUsd: round6(splitterCost),
    },
    latencyMs: {
      p50,
      p95,
      avg: avgDuration != null ? Math.round(avgDuration) : null,
    },
    tokens: {
      inTotal: tokensIn,
      outTotal: tokensOut,
    },
    splitterParts: {
      avg: partsAvg != null ? Number(partsAvg.toFixed(2)) : null,
    },
  };
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil(p * sortedAsc.length) - 1);
  return sortedAsc[idx] ?? null;
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

/** Carga rows + agrega. Llamado por el endpoint interno de stats. */
export async function loadPipelineStats(
  supabase: SupabaseClient<Database>,
  params: { tenantId?: number; hours: number },
): Promise<PipelineStatsAggregate & { windowHours: number; tenantId: number | null }> {
  const since = new Date(Date.now() - params.hours * 3600 * 1000).toISOString();
  let query = supabase
    .from('pipeline_runs')
    .select(
      'outcome, duration_ms, total_cost_usd, generator_cost_usd, judge_cost_usd, splitter_cost_usd, total_tokens_in, total_tokens_out, splitter_parts, judge_decision',
    )
    .gte('started_at', since)
    .limit(10_000);
  if (params.tenantId != null) query = query.eq('tenant_id', params.tenantId);

  const { data, error } = await query;
  if (error) throw new Error(`pipeline-stats query failed: ${error.message}`);

  const rows = (data ?? []) as PipelineRunRow[];
  const aggregate = aggregatePipelineRuns(rows);
  return {
    ...aggregate,
    windowHours: params.hours,
    tenantId: params.tenantId ?? null,
  };
}
