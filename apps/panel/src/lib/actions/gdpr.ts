'use server';

/**
 * F5 / S3 — Acciones GDPR/LOPD para `/leads` (derechos de acceso y supresión).
 *
 *  - **anon + RLS** (regla 2). NUNCA service-role. La RLS de Fase 1 ya restringe:
 *    `leads_delete` = solo `admin` / `director_general`; lecturas = managers ven
 *    todo el tenant.
 *  - Gate de aplicación: **director_general+** (`requireTenantRoleAtLeast({minRole:'owner'})`,
 *    nivel ≥ 4 → director_general y admin). Coincide con la policy `leads_delete`
 *    viva (admin + director_general) y con quién puede exportar todo el tenant.
 *  - **Supresión = HARD delete** (GDPR Art. 17, derecho de borrado real). Un único
 *    `DELETE FROM leads` dispara las reglas FK del esquema:
 *      · CASCADE → conversations (y sus messages, labels, notes, schedules,
 *        pipeline_events, mock_whatsapp_outbox), lead_preferences,
 *        lead_property_interest, visits.
 *      · SET NULL → llm_calls, pipeline_runs, voice_calls, calendar_appointments
 *        (auditoría/coste de-identificada, conservada — admisible bajo GDPR).
 *    Las cascadas FK corren como owner y bypassan la RLS de los hijos, así que no
 *    hace falta (ni se puede vía RLS) borrar cada tabla hija a mano.
 *
 *  Alternativa NO elegida: soft-delete (`leads.deleted_at`). No es supresión real
 *  (los datos permanecen) → no satisface el Art. 17. Si se prefiere por seguridad
 *  de demo, es un cambio de 2 líneas (UPDATE deleted_at en vez de DELETE).
 */

import { revalidatePath } from 'next/cache';

import { getEffectiveTenant, type EffectiveTenant } from '@/lib/auth/effective-tenant';
import { AuthError, requireTenantRoleAtLeast } from '@/lib/auth/require-tenant-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type GdprResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

type Row = Record<string, unknown>;

export interface LeadDataExport {
  exportedAt: string;
  lead: Row;
  preferences: Row[];
  propertyInterests: Row[];
  visits: Row[];
  conversations: Array<Row & { messages: Row[]; notes: Row[]; labels: Row[] }>;
  pipelineEvents: Row[];
}

function isValidLeadId(leadId: number): boolean {
  return Number.isFinite(leadId) && leadId > 0;
}

/** Gate GDPR base: sesión válida + director_general o superior (derecho de acceso). */
async function authorizeGdpr(): Promise<
  { ok: true; supabase: ServerClient; eff: EffectiveTenant } | { ok: false; error: string }
> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'UNAUTHENTICATED' };
  try {
    await requireTenantRoleAtLeast({ tenantId: eff.tenantId, minRole: 'owner' }); // director_general+
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.code };
    throw e;
  }
  const supabase = await createSupabaseServerClient();
  return { ok: true, supabase, eff };
}

const rows = (data: unknown): Row[] => (Array.isArray(data) ? (data as Row[]) : []);

// ---------------------------------------------------------------------------
// exportLeadDataAction — derecho de acceso (GDPR Art. 15): todos los datos del
// lead en un único JSON. Solo lectura, RLS acota.
// ---------------------------------------------------------------------------

export async function exportLeadDataAction(leadId: number): Promise<GdprResult<LeadDataExport>> {
  if (!isValidLeadId(leadId)) return { ok: false, error: 'invalid_leadId' };

  const auth = await authorizeGdpr();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) return { ok: false, error: leadErr.message };
  if (!lead) return { ok: false, error: 'not_found' };

  const [prefsRes, interestsRes, visitsRes, convRes] = await Promise.all([
    supabase.from('lead_preferences').select('*').eq('lead_id', leadId),
    supabase.from('lead_property_interest').select('*').eq('lead_id', leadId),
    supabase.from('visits').select('*').eq('lead_id', leadId),
    supabase.from('conversations').select('*').eq('lead_id', leadId),
  ]);

  const convRows = rows(convRes.data);
  const convIds = convRows.map((c) => Number(c.id));

  let messages: Row[] = [];
  let notes: Row[] = [];
  let labelLinks: Row[] = [];
  let pipelineEvents: Row[] = [];
  const labelDefs = new Map<number, Row>();

  if (convIds.length > 0) {
    const [msgRes, notesRes, labelRes, eventsRes] = await Promise.all([
      supabase.from('conversation_messages').select('*').in('conversation_id', convIds),
      supabase.from('conversation_notes').select('*').in('conversation_id', convIds),
      supabase.from('conversation_labels').select('*').in('conversation_id', convIds),
      supabase.from('pipeline_events').select('*').in('conversation_id', convIds),
    ]);
    messages = rows(msgRes.data);
    notes = rows(notesRes.data);
    labelLinks = rows(labelRes.data);
    pipelineEvents = rows(eventsRes.data);

    const labelIds = Array.from(new Set(labelLinks.map((l) => Number(l.label_id))));
    if (labelIds.length > 0) {
      const { data: tl } = await supabase.from('tenant_labels').select('*').in('id', labelIds);
      for (const t of rows(tl)) labelDefs.set(Number(t.id), t);
    }
  }

  const conversations = convRows.map((c) => {
    const cid = Number(c.id);
    return {
      ...c,
      messages: messages.filter((m) => Number(m.conversation_id) === cid),
      notes: notes.filter((n) => Number(n.conversation_id) === cid),
      labels: labelLinks
        .filter((l) => Number(l.conversation_id) === cid)
        .map((l) => ({ ...l, label: labelDefs.get(Number(l.label_id)) ?? null })),
    };
  });

  return {
    ok: true,
    data: {
      exportedAt: new Date().toISOString(),
      lead: lead as Row,
      preferences: rows(prefsRes.data),
      propertyInterests: rows(interestsRes.data),
      visits: rows(visitsRes.data),
      conversations,
      pipelineEvents,
    },
  };
}

// ---------------------------------------------------------------------------
// deleteLeadDataAction — derecho de supresión (GDPR Art. 17): HARD delete con
// confirmación. La cascada FK del esquema limpia los datos personales y
// de-identifica la auditoría. RLS leads_delete = admin/director_general.
// ---------------------------------------------------------------------------

export async function deleteLeadDataAction(input: {
  leadId: number;
  confirmation: string;
}): Promise<GdprResult<{ deletedLeadId: number }>> {
  if (!isValidLeadId(input.leadId)) return { ok: false, error: 'invalid_leadId' };
  // Confirmación explícita: el usuario teclea el id del lead (operación irreversible).
  if ((input.confirmation ?? '').trim() !== String(input.leadId)) {
    return { ok: false, error: 'confirmation_mismatch' };
  }

  const auth = await authorizeGdpr();
  if (!auth.ok) return auth;
  // Supresión (Art. 17) = SOLO admin (coincide con la matriz `leads.delete`=admin).
  // El export (acceso) sí lo permite director_general+; la supresión es más estricta.
  if (auth.eff.role !== 'admin') return { ok: false, error: 'FORBIDDEN_ROLE_REQUIRED' };
  const { supabase } = auth;

  const { data: deleted, error } = await supabase
    .from('leads')
    .delete()
    .eq('id', input.leadId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (rows(deleted).length === 0) return { ok: false, error: 'not_found' };

  revalidatePath('/leads');
  return { ok: true, data: { deletedLeadId: input.leadId } };
}
