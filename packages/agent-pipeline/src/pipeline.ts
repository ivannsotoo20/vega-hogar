import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { validateMessage, type ValidationContext, type ValidationResult } from '@vega-hogar/shared-validator';
import { runGenerator } from './generator.js';
import { runJudge } from './judge.js';
import { runSplitter } from './splitter.js';
import type { GeneratorInput, GeneratorOutput, GeneratorUsage } from './types.js';

interface RunPipelineDeps {
  supabase: SupabaseClient<Database>;
  anthropic: Anthropic;
}

export interface PipelineInput extends GeneratorInput {
  /** Para el validador V00-V19. El motor pasa aquí injectedPropertyIds (V19), canal, etc. */
  validationContext?: Partial<ValidationContext>;
  /**
   * Override de los modelos por etapa. El motor los carga de `llm_configs`
   * (3 filas: generator/judge/splitter) y los pasa por aquí.
   */
  models?: {
    generator?: string;
    judge?: string;
    splitter?: string;
  };
  /** Resumen de la agencia que recibe el Judge (voz, reglas; 1-2 frases). */
  agencySummary?: string;
}

export interface PipelineStageMetric {
  role: 'generator' | 'judge' | 'splitter';
  model: string;
  usage: GeneratorUsage;
  llmCallId?: number;
  notes?: string;
}

export interface PipelineOutput {
  /** Mensajes finales listos para enviar (1-4 partes). */
  parts: string[];
  /** Output completo del Generator (status, fase, intent, etc.). */
  generator: GeneratorOutput;
  /** Decisión del Judge. */
  judge: { decision: 'pass' | 'fix' | 'reject'; violations: string[]; reasoning?: string };
  /** Resultado del Validador V00-V19 sobre el texto post-Judge. */
  validator: ValidationResult;
  /** Stage metrics por etapa (incluye coste y latencia). */
  stages: PipelineStageMetric[];
  /** Totales agregados. */
  totals: {
    costUsd: number;
    latencyMs: number;
    tokensInTotal: number;
    tokensOutTotal: number;
  };
}

/**
 * Orquesta el pipeline completo:
 *   Generator (Haiku 4.5) → Judge (Haiku 4.5) → Validator (det. V00-V19) → Splitter (Haiku 4.5)
 *
 * Si Judge devuelve `reject`, la función lanza Error — el caller decide si
 * reintenta o hace handoff a humano.
 *
 * Si el Validator detecta `severity=error` post-Judge (incluye V11′ fuga de
 * comisión/propietario y V19 alucinación de inmueble), también lanza Error (red de
 * seguridad final — significa que ni el Generator ni el Judge captaron la violación).
 */
export async function runPipeline(
  deps: RunPipelineDeps,
  input: PipelineInput,
): Promise<PipelineOutput> {
  const startedAt = Date.now();
  const stages: PipelineStageMetric[] = [];

  // === 1. Generator ===
  const generatorOut = await runGenerator(deps, {
    ...input,
    model: input.models?.generator,
  });
  stages.push({
    role: 'generator',
    model: generatorOut.model,
    usage: generatorOut.usage,
    llmCallId: generatorOut.llmCallId,
  });

  // === 2. Judge ===
  const judgeOut = await runJudge(deps, {
    messageRaw: generatorOut.inmobiliarioOutput.message_raw,
    currentPhase: input.currentPhase,
    agencySummary: input.agencySummary,
    conversationContext: `Último mensaje del lead: "${input.userMessage.slice(0, 200)}"`,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    model: input.models?.judge,
  });
  stages.push({
    role: 'judge',
    model: input.models?.judge ?? 'claude-haiku-4-5',
    usage: judgeOut.usage,
    llmCallId: judgeOut.llmCallId,
    notes: `decision=${judgeOut.decision}; violations=${judgeOut.violations.length}`,
  });

  if (judgeOut.decision === 'reject') {
    throw new Error(
      `Judge rejected message: ${judgeOut.violations.join('; ')}. reasoning="${judgeOut.reasoning ?? ''}"`,
    );
  }

  const textAfterJudge = judgeOut.finalText;

  // === 3. Validator V00-V19 ===
  // V19 anti-alucinación: injectedPropertyIds = lo realmente inyectado en el system
  // prompt este turno. Fuente preferente: lo que el motor pasa explícito; fallback:
  // los ids de `dynamicContext.availableProperties` (que ES lo inyectado). SIEMPRE
  // array (nunca undefined) → si no se buscó, cualquier id propuesto es fantasma.
  const injectedPropertyIds =
    input.validationContext?.injectedPropertyIds ??
    input.dynamicContext?.availableProperties?.map((p) => p.id) ??
    [];
  const validatorCtx: ValidationContext = {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    currentPhase: generatorOut.inmobiliarioOutput.phase_decision,
    channel: input.validationContext?.channel ?? 'whatsapp',
    track: input.validationContext?.track,
    emojisWhitelist: input.validationContext?.emojisWhitelist ?? null,
    isFirstAssistantMessage:
      input.validationContext?.isFirstAssistantMessage ?? input.history.every((h) => h.role === 'user'),
    lastAssistantMessages: input.validationContext?.lastAssistantMessages ?? [],
    locale: input.validationContext?.locale,
    forbiddenPhrases: input.validationContext?.forbiddenPhrases,
    expectedAddressing: input.validationContext?.expectedAddressing,
    injectedPropertyIds,
    proposedPropertyIds: generatorOut.inmobiliarioOutput.proposed_property_ids ?? [],
  };
  const validatorOut = validateMessage(textAfterJudge, validatorCtx);

  // V17 retry logic. Si el output viola palabras prohibidas de la agencia,
  // reinvocamos el Generator una sola vez con instrucción explícita de reescribir.
  // Si tras retry V17 sigue → log incidente + degradación grácil (entregamos el
  // output del retry porque al menos lo intentó; si el retry falla por excepción,
  // entregamos el original). NO bloqueamos la conversación.
  let textForSplitter = textAfterJudge;
  const v17Violations = validatorOut.violations.filter((v) => v.ruleId === 'V17');
  if (v17Violations.length > 0 && (input.validationContext?.forbiddenPhrases?.length ?? 0) > 0) {
    const violatedWords = v17Violations
      .flatMap((v) => (v.match ?? '').split('|'))
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    const allForbidden = (input.validationContext?.forbiddenPhrases ?? []).join(', ');
    const retryHistory = [
      ...input.history,
      { role: 'user' as const, content: input.userMessage },
      { role: 'assistant' as const, content: textAfterJudge },
    ];
    const retryUserMessage =
      `[CORRECCIÓN AUTOMÁTICA DEL SISTEMA — NO ES MENSAJE DEL LEAD] ` +
      `Tu respuesta anterior contiene palabra(s) prohibida(s) por la agencia: ${violatedWords.join(', ')}. ` +
      `Reescribe TU ÚLTIMA respuesta SIN usar ninguna de las siguientes palabras prohibidas: ${allForbidden}. ` +
      `Mantén el mismo sentido, longitud aproximada, fase, estado y datos. NO menciones esta corrección al lead — ` +
      `el lead solo verá tu nueva respuesta limpia.`;

    try {
      const retryGen = await runGenerator(deps, {
        ...input,
        userMessage: retryUserMessage,
        history: retryHistory,
        model: input.models?.generator,
      });
      stages.push({
        role: 'generator',
        model: retryGen.model,
        usage: retryGen.usage,
        llmCallId: retryGen.llmCallId,
        notes: 'V17_retry',
      });
      const retryText = retryGen.inmobiliarioOutput.message_raw;
      const retryValidator = validateMessage(retryText, validatorCtx, { only: ['V17'] });
      if (retryValidator.violations.length === 0) {
        // Retry exitoso — usar el output reescrito para el Splitter.
        textForSplitter = retryText;
        generatorOut.inmobiliarioOutput.message_raw = retryText;
      } else {
        // Retry insistió en usar palabras prohibidas. Degradación grácil: entregamos
        // el retry de todos modos (mejor que el original — al menos lo intentó) y
        // loggeamos para revisar la doctrina de la agencia o las palabras.
        // eslint-disable-next-line no-console
        console.warn(
          `[pipeline] V17 retry still violates agency phrases (tenant=${input.tenantId}, conv=${input.conversationId}). ` +
            `Original violated: ${violatedWords.join(', ')}. Delivering retry output anyway.`,
        );
        textForSplitter = retryText;
        generatorOut.inmobiliarioOutput.message_raw = retryText;
      }
    } catch (err) {
      // El retry tiró excepción (network, tool no usada, etc). Degradación grácil:
      // entregamos el output ORIGINAL y loggeamos. La conversación no se bloquea.
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline] V17 retry threw (tenant=${input.tenantId}, conv=${input.conversationId}): ${err instanceof Error ? err.message : String(err)}. ` +
          `Delivering original output despite violation: ${violatedWords.join(', ')}.`,
      );
    }
  }

  if (validatorOut.hasErrors) {
    const errs = validatorOut.violations
      .filter((v) => v.severity === 'error')
      .map((v) => `${v.ruleId}: ${v.description}`)
      .join('; ');
    throw new Error(`Validator V00-V19 found unrecoverable errors after Judge: ${errs}`);
  }

  // === 4. Splitter ===
  const splitterOut = await runSplitter(deps, {
    finalText: textForSplitter,
    channel: validatorCtx.channel,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    model: input.models?.splitter,
    maxParts: input.aiMessagesPerTurnMax,
  });
  stages.push({
    role: 'splitter',
    model: input.models?.splitter ?? 'claude-haiku-4-5',
    usage: splitterOut.usage,
    llmCallId: splitterOut.llmCallId,
    notes: `parts=${splitterOut.parts.length}${splitterOut.fallback ? ' (fallback)' : ''}`,
  });

  // === Totals ===
  const totals = stages.reduce(
    (acc, s) => {
      acc.costUsd += s.usage.costUsd;
      acc.tokensInTotal += s.usage.tokensInUncached + s.usage.tokensInCacheRead + s.usage.tokensInCacheWrite;
      acc.tokensOutTotal += s.usage.tokensOut;
      return acc;
    },
    { costUsd: 0, latencyMs: Date.now() - startedAt, tokensInTotal: 0, tokensOutTotal: 0 },
  );
  totals.costUsd = Number(totals.costUsd.toFixed(6));

  return {
    parts: splitterOut.parts,
    generator: generatorOut,
    judge: {
      decision: judgeOut.decision,
      violations: judgeOut.violations,
      reasoning: judgeOut.reasoning,
    },
    validator: validatorOut,
    stages,
    totals,
  };
}
