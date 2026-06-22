import type { DynamicContext, Track } from './types.js';

/**
 * Interpola placeholders del bloque cacheable `core_v1_base`.
 * Soporta `{{current_phase_focus|fallback}}`. Defensivo: si no hay valor → fallback (nunca deja `{{...}}`).
 */
export function interpolateCorePlaceholders(
  text: string,
  vars: { currentPhaseFocus?: string | null },
): string {
  const focus = vars.currentPhaseFocus?.trim() || null;
  return text.replace(/\{\{current_phase_focus(?:\|([^}]*))?\}\}/g, (_, fallback) =>
    focus ? focus : (fallback ?? ''),
  );
}

/**
 * Interpola `priority="{{phaseN_priority|reference}}"` en las etiquetas `<phaseN>` de
 * `core_v1_base`. Solo la fase ACTIVA queda `priority="active"`; el resto cae a su
 * fallback (típicamente `reference`). Vega usa fases 0..7 (catálogo `phases`).
 * Coste ≈ 0 tokens: baja la atención del modelo sobre las fases inactivas sin excluirlas.
 */
export function interpolatePhasePriorities(text: string, currentPhase: number): string {
  const valid = Number.isInteger(currentPhase) && currentPhase >= 0 && currentPhase <= 7;
  return text.replace(/\{\{phase([0-7])_priority(?:\|([^}]*))?\}\}/g, (_, n, fallback) => {
    if (valid && parseInt(n, 10) === currentPhase) return 'active';
    return fallback ?? 'reference';
  });
}

const INTENT_LABEL: Record<Track, string> = {
  buyer: 'comprador / inquilino',
  seller: 'vendedor / propietario',
  shared: 'sin determinar (detéctala en este turno)',
};

function renderLeadContact(c: { fullName: string | null; email: string | null }): string {
  const nameLine =
    c.fullName && c.fullName.trim()
      ? `- Nombre: **${c.fullName.trim()}** ✓ (ya en BD, no lo vuelvas a pedir)`
      : `- Nombre: **FALTA** — pídeselo antes de agendar la visita`;
  const emailLine =
    c.email && c.email.trim()
      ? `- Email: **${c.email.trim()}** ✓ (ya en BD)`
      : `- Email: **FALTA** — opcional para WhatsApp, pídelo solo si hace falta`;
  return `${nameLine}\n${emailLine}`;
}

/**
 * Construye el bloque sintético `dynamic_context` (FUERA de cache) a partir de los datos
 * del turno. Devuelve null si no hay nada que inyectar (evita enviar bloques vacíos a la API).
 *
 * `availableProperties = []` (array vacío) = "se buscó y no hubo resultados" → instrucción anti-alucinación.
 * `availableProperties = null/undefined` = "no se buscó este turno" → no se incluye sección de inmuebles.
 */
export function renderDynamicContextBlock(dc: DynamicContext | undefined): string | null {
  if (!dc) return null;
  const lines: string[] = [];

  if (dc.currentDateLabel) lines.push(`**Fecha de hoy:** ${dc.currentDateLabel}`);
  if (dc.leadIntent) lines.push(`**Intención del lead:** ${INTENT_LABEL[dc.leadIntent]}`);
  if (dc.leadContact) lines.push(renderLeadContact(dc.leadContact));

  if (Array.isArray(dc.availableProperties)) {
    if (dc.availableProperties.length > 0) {
      lines.push(
        '',
        '### Inmuebles disponibles para proponer (SOLO este turno)',
        'Propón ÚNICAMENTE inmuebles de esta lista, citándolos por su ID. NO inventes ni cites inmuebles fuera de ella.',
      );
      for (const p of dc.availableProperties) {
        const reason = p.matchReason ? ` — _${p.matchReason}_` : '';
        lines.push(
          `- **[ID ${p.id}]** ${p.title} · ${p.neighborhood} · ${p.rooms} hab · ${p.m2} m² · ${p.priceLabel}${reason}`,
        );
      }
    } else {
      lines.push(
        '',
        '### Inmuebles disponibles',
        'No hay inmuebles que encajen con sus criterios ahora mismo. Sigue cualificando o gestiona expectativas; **NUNCA inventes inmuebles**.',
      );
    }
  }

  if (dc.availableSlots && dc.availableSlots.length > 0) {
    lines.push('', '### Disponibilidad para agendar visita');
    for (const s of dc.availableSlots) lines.push(`- ${s.humanLabel}  (${s.iso})`);
  }

  if (lines.length === 0) return null;
  return `# CONTEXTO DINÁMICO (solo este turno — no lo memorices)\n\n${lines.join('\n')}`;
}
