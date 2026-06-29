import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@vega-hogar/db';
import { runPipeline, loadConversationHistory } from '@vega-hogar/agent-pipeline';
import type { Track, AvailableProperty, AvailableSlot } from '@vega-hogar/prompt-composer';
import { isAiPausedFromDb } from '../lib/ai-pause.js';
import { buildPhaseFocusInstruction } from '../lib/phase-focus.js';
import { logger } from '../lib/logger.js';
import { loadLlmModels } from './llm-models.js';
import {
  classifyPipelineError,
  completePipelineRun,
  failPipelineRun,
  startPipelineRun,
} from './pipeline-runs.js';
import { buscarInmuebles } from './agent-tools/buscar-inmuebles.js';
import { consultarDisponibilidad } from './agent-tools/consultar-disponibilidad.js';
import { agendarVisita } from './agent-tools/agendar-visita.js';
import { escalarAHumano } from './agent-tools/escalar-a-humano.js';
import { applySystemLabels } from './labels/index.js';
import { sendAgentReply } from './outbound-sender.js';

/**
 * NÚCLEO del motor (re-domain de SETTER `process-debounced`). Del bloque inbound
 * del lead a la respuesta del agente, contra el driver MOCK (F10b, texto-lean).
 *
 * Recortes vs SETTER (decisiones del plan F10b): sin tabla `channels`, sin
 * `trainer_preferences` (defaults), sin GHL/booking, sin enriquecido multimodal,
 * sin notificación email (la resolución de comercial SÍ entra). Opción A / RAG:
 * busca inmuebles/slots ANTES del pipeline e inyecta en `dynamic_context`.
 */

export interface ProcessDebouncedDeps {
  supabase: SupabaseClient<Database>;
  anthropic: Anthropic;
}

export interface ProcessDebouncedResult {
  conversationId: number;
  parts: string[];
  totalCostUsd: number;
  totalLatencyMs: number;
  pipelineStatus: string;
  phase: number;
  correlationId?: string;
  skipped?: boolean;
  reason?: string;
}

/** Defaults (no hay `trainer_preferences` en Vega). */
const DEFAULT_AI_MESSAGES_PER_TURN: 1 | 2 | 3 | 4 = 4;
/** Fase mínima para buscar inmuebles (comprador) e inyectar slots (agenda). */
const BUYER_SEARCH_MIN_PHASE = 3;
const AGENDA_MIN_PHASE = 5;

/** Auto-promoción F0/F1→F2 cuando el lead responde a una conv outbound clasificada. */
export const AUTO_PROMOTE_SOURCES = new Set(['bienvenida', 'lm', 'inbound']);

export async function processDebounced(
  deps: ProcessDebouncedDeps,
  conversationId: number,
): Promise<ProcessDebouncedResult> {
  const { supabase, anthropic } = deps;

  const skip = (phase: number, reason: string): ProcessDebouncedResult => ({
    conversationId,
    parts: [],
    totalCostUsd: 0,
    totalLatencyMs: 0,
    pipelineStatus: 'skipped',
    phase,
    skipped: true,
    reason,
  });

  // 1. Cargar conversación.
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, tenant_id, lead_id, channel, current_phase, status, ai_paused_until, conversation_source, custom_fields')
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr) throw new Error(`processDebounced: ${convErr.message}`);
  if (!conv) throw new Error(`processDebounced: conversation ${conversationId} not found`);
  const tenantId = Number(conv.tenant_id);
  const currentPhase = Number(conv.current_phase) || 0;
  const convSource = (conv.conversation_source as string | null) ?? null;

  // 1.5. Gate IA pausada (handoff humano, pausa manual, etc.).
  if (isAiPausedFromDb((conv.ai_paused_until as string | null) ?? null)) {
    return skip(currentPhase, `IA pausada (ai_paused_until=${conv.ai_paused_until})`);
  }

  // 2. Cargar lead.
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, phone, full_name, email, intent, office_id, assigned_to_user_id, tracking_uuid')
    .eq('id', Number(conv.lead_id))
    .maybeSingle();
  if (leadErr) throw new Error(`processDebounced: lead lookup ${leadErr.message}`);
  if (!lead) throw new Error(`processDebounced: lead ${conv.lead_id} not found`);
  const leadId = Number(lead.id);
  const officeId = (lead.office_id as number | null) ?? null;
  const leadIntent = lead.intent;
  const track = trackFromIntent(leadIntent);

  // 4. Historial completo (mapea columna `role`: lead→user; agent/human/system→assistant).
  const allHistory = await loadConversationHistory(supabase, conversationId, { limit: 60 });
  if (allHistory.length === 0) return skip(currentPhase, 'no messages in conversation');

  // 5. Separar bloque inbound más reciente del lead.
  let lastAssistantIdx = -1;
  for (let i = allHistory.length - 1; i >= 0; i--) {
    if (allHistory[i]!.role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }
  const recentLeadMessages = allHistory.slice(lastAssistantIdx + 1).filter((m) => m.role === 'user');
  if (recentLeadMessages.length === 0) {
    return skip(currentPhase, 'no new lead messages since last assistant turn');
  }
  const userMessage = recentLeadMessages.map((m) => m.content).join('\n');
  const historyForPipeline = allHistory.slice(0, lastAssistantIdx + 1);

  // 6. Abrir pipeline_run (observabilidad).
  const startedAtMs = Date.now();
  const run = await startPipelineRun(supabase, { tenantId, conversationId });
  let runResolved = false;

  try {
    // 7. PRE-pipeline (Opción A / RAG, retrieval determinístico — NO decide contenido).
    let availableProperties: AvailableProperty[] | undefined;
    let injectedPropertyIds: number[] = [];
    if (track === 'buyer' && currentPhase >= BUYER_SEARCH_MIN_PHASE) {
      const found = await buscarInmuebles({ supabase, tenantId, leadId, topN: 6 });
      availableProperties = found.properties;
      injectedPropertyIds = found.ids;
    }
    let availableSlots: AvailableSlot[] | undefined;
    if (currentPhase >= AGENDA_MIN_PHASE && track !== 'shared') {
      availableSlots = await consultarDisponibilidad({ supabase, tenantId, officeId, isTasacion: track === 'seller' });
    }

    // 8. Modelos por etapa (de llm_configs) + compose + pipeline.
    const models = await loadLlmModels(supabase, tenantId);
    const leadContact = {
      fullName: (lead.full_name as string | null) ?? null,
      email: (lead.email as string | null) ?? null,
    };
    const pipelineOut = await runPipeline(
      { supabase, anthropic },
      {
        tenantId,
        conversationId,
        userMessage,
        currentPhase,
        history: historyForPipeline,
        models,
        aiMessagesPerTurnMax: DEFAULT_AI_MESSAGES_PER_TURN,
        currentPhaseFocus: buildPhaseFocusInstruction(currentPhase, track),
        dynamicContext: {
          currentDateLabel: currentDateLabel(),
          leadIntent: track,
          leadContact,
          availableProperties,
          availableSlots,
        },
        validationContext: {
          channel: 'whatsapp',
          injectedPropertyIds, // V19: siempre array (vacío si no se buscó).
          // Sin expectedAddressing (mirror/voz la fija el prompt; el composer Vega
          // no inyecta extraSystemSuffix) ni forbiddenPhrases (no hay config tenant).
        },
      },
    );

    const out = pipelineOut.generator.inmobiliarioOutput;

    // 9. POST-pipeline — captura de contacto del lead.
    const leadPatch: Database['public']['Tables']['leads']['Update'] = {};
    if (out.captured_lead_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.captured_lead_email)) {
      leadPatch.email = out.captured_lead_email;
      leadContact.email = out.captured_lead_email;
    }
    if (out.captured_lead_name) {
      leadPatch.full_name = out.captured_lead_name.slice(0, 120);
      leadContact.fullName = leadPatch.full_name;
    }
    // Intent detectado (si el lead aún era 'unknown').
    if (leadIntent === 'unknown' && out.detected_intent !== 'unknown') {
      leadPatch.intent = out.detected_intent; // buyer|seller ⊆ lead_intent.
    }
    if (Object.keys(leadPatch).length > 0) {
      const { error } = await supabase.from('leads').update(leadPatch).eq('id', leadId).eq('tenant_id', tenantId);
      if (error) logger.warn({ err: error.message, leadId }, '[process-debounced] leads patch failed (non-fatal)');
    }

    // 10. Agenda (si el lead confirmó slot) → visits. Conflicto → degradar (anti-zombie).
    let appointmentScheduledAt: string | null = null;
    let bookedVisit = false;
    let bookedIsTasation = false;
    if (out.proposed_visit_slot) {
      const isTasation = out.is_tasation_visit ?? track === 'seller';
      const propertyId = isTasation ? null : (out.proposed_property_ids?.[0] ?? null);
      const res = await agendarVisita({
        supabase,
        tenantId,
        leadId,
        slotIso: out.proposed_visit_slot,
        isTasation,
        propertyId,
        officeId,
        preferredUserId: (lead.assigned_to_user_id as number | null) ?? null,
        conversationId,
        leadName: leadContact.fullName,
        leadEmail: leadContact.email,
        leadTrackingUuid: (lead.tracking_uuid as string | null) ?? null,
      });
      if (res.ok) {
        appointmentScheduledAt = new Date(Date.parse(out.proposed_visit_slot)).toISOString();
        bookedVisit = true;
        bookedIsTasation = isTasation;
      } else {
        logger.warn({ conversationId, reason: res.reason }, '[process-debounced] agendarVisita no-ok → degradando');
        // Anti-zombie: si el LLM marcó handoff por agenda pero no se agendó, degradar.
        if (out.handoff_cause === 'A_agenda') {
          out.handoff_cause = undefined;
          out.conversation_status = 'active';
          if (out.phase_decision >= 7) out.phase_decision = 6;
        }
      }
    }

    // 11. UPDATE principal de conversations (status 1:1, fase auto-promote, razonamiento).
    const newPhase = computeAutoPromotedPhase({ currentPhase, generatorPhase: out.phase_decision, conversationSource: convSource });
    const newStatus = out.conversation_status; // 1:1 con el enum, SIN remapeo.
    const convPatch: Database['public']['Tables']['conversations']['Update'] = {
      current_phase: newPhase,
      status: newStatus,
      is_qualified: newStatus === 'qualified' ? true : null,
      current_context: out.user_summary ?? null,
      last_message_at: new Date().toISOString(),
    };
    if (out.emotion) convPatch.emotion = out.emotion;
    if (out.problem) convPatch.problem = out.problem;
    if (out.goal) convPatch.goal = out.goal;
    if (out.urgency) convPatch.urgency = out.urgency;
    if (out.next_action) convPatch.next_action = out.next_action;
    if (out.general_context) convPatch.general_context = out.general_context;
    if (out.general_motivation) convPatch.general_motivation = out.general_motivation;
    if (appointmentScheduledAt) {
      convPatch.appointment_scheduled_at = appointmentScheduledAt;
      convPatch.is_scheduling_link_sent = true;
    }
    if (out.contraoferta_registrada) {
      const existing = (conv.custom_fields ?? {}) as Record<string, Json>;
      convPatch.custom_fields = {
        ...existing,
        contraoferta_registrada: out.contraoferta_registrada,
        contraoferta_at: new Date().toISOString(),
      };
    }
    const { error: updErr } = await supabase.from('conversations').update(convPatch).eq('id', conversationId);
    if (updErr) logger.warn({ err: updErr.message, conversationId }, '[process-debounced] conversations update failed (non-fatal)');

    // 11.5. Handoff → escalar (resuelve comercial + marca handoff + pausa IA).
    if (newStatus === 'handoff') {
      await escalarAHumano({
        supabase,
        tenantId,
        conversationId,
        handoffCause: out.handoff_cause ?? null,
        handoffReason: out.handoff_reason ?? null,
        officeId,
        preferredUserId: (lead.assigned_to_user_id as number | null) ?? null,
      });
    }

    // 11.6. System labels (best-effort): Lead caliente / Cierre perdido / Visita agendada / Tasación pendiente.
    try {
      const labelsRes = await applySystemLabels({ supabase, tenantId, conversationId, status: newStatus, bookedVisit, isTasation: bookedIsTasation });
      if (labelsRes.errors.length > 0) logger.warn({ conversationId, errors: labelsRes.errors }, '[process-debounced] applySystemLabels errors');
    } catch (err) {
      logger.warn({ err, conversationId }, '[process-debounced] applySystemLabels threw (non-fatal)');
    }

    // 12. pipeline_events (cambios de fase/estado). Best-effort.
    await emitPipelineEvents({ supabase, tenantId, conversationId, fromPhase: currentPhase, toPhase: newPhase, fromStatus: conv.status, toStatus: newStatus });

    // 13. SALIDA (mock): outbox + conversation_messages(role='agent').
    await sendAgentReply({
      supabase,
      tenantId,
      conversationId,
      toPhone: (lead.phone as string | null) ?? null,
      parts: pipelineOut.parts,
    });

    // 14. Cerrar pipeline_run.
    await completePipelineRun(supabase, { id: run.id, output: pipelineOut, startedAtMs });
    runResolved = true;

    return {
      conversationId,
      parts: pipelineOut.parts,
      totalCostUsd: pipelineOut.totals.costUsd,
      totalLatencyMs: pipelineOut.totals.latencyMs,
      pipelineStatus: newStatus,
      phase: newPhase,
      correlationId: run.correlationId,
    };
  } catch (err) {
    if (!runResolved && run.id !== 0) {
      try {
        await failPipelineRun(supabase, { id: run.id, startedAtMs, outcome: classifyPipelineError(err), error: err });
      } catch (failErr) {
        logger.warn({ err: failErr }, '[process-debounced] failPipelineRun in catch threw');
      }
    }
    throw err;
  }
}

function trackFromIntent(intent: Database['public']['Enums']['lead_intent']): Track {
  if (intent === 'buyer' || intent === 'tenant') return 'buyer';
  if (intent === 'seller' || intent === 'landlord') return 'seller';
  return 'shared';
}

export function computeAutoPromotedPhase(args: {
  currentPhase: number;
  generatorPhase: number;
  conversationSource: string | null | undefined;
}): number {
  const { currentPhase, generatorPhase, conversationSource } = args;
  if (!conversationSource || !AUTO_PROMOTE_SOURCES.has(conversationSource)) return generatorPhase;
  if (currentPhase > 1) return generatorPhase;
  if (generatorPhase >= 2) return generatorPhase;
  return 2;
}

function currentDateLabel(): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

async function emitPipelineEvents(args: {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  conversationId: number;
  fromPhase: number;
  toPhase: number;
  fromStatus: Database['public']['Enums']['conversation_status'];
  toStatus: Database['public']['Enums']['conversation_status'];
}): Promise<void> {
  const { supabase, tenantId, conversationId, fromPhase, toPhase, fromStatus, toStatus } = args;
  const rows: Database['public']['Tables']['pipeline_events']['Insert'][] = [];
  if (toPhase !== fromPhase) {
    rows.push({ tenant_id: tenantId, conversation_id: conversationId, event_type: 'phase_change', from_value: String(fromPhase), to_value: String(toPhase), source: 'motor' });
  }
  if (toStatus !== fromStatus) {
    rows.push({ tenant_id: tenantId, conversation_id: conversationId, event_type: 'status_change', from_value: fromStatus, to_value: toStatus, source: 'motor' });
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from('pipeline_events').insert(rows);
  if (error) logger.warn({ err: error.message, conversationId }, '[process-debounced] pipeline_events insert failed (non-fatal)');
}
