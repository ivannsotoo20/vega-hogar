import type { AnthropicTool } from './types.js';

export const RESPOND_AS_INMOBILIARIO_TOOL_NAME = 'respond_as_inmobiliario';

/**
 * Holgura sobre `maxParts × 280` para acomodar separadores `\n\n` entre partes
 * consecutivas. 30 chars cubren hasta 10 separadores (3 chars c/u).
 */
const MESSAGE_RAW_HOLGURA_CHARS = 30;
const MAX_CHARS_PER_PART = 280;
const DEFAULT_MAX_PARTS: 1 | 2 | 3 | 4 = 4;

/**
 * Cap absoluto del `message_raw` por nivel de `aiMessagesPerTurnMax`:
 *   - cap=1 → 310 chars · cap=2 → 590 · cap=3 → 870 · cap=4 → 1150
 *
 * Es lo que el SCHEMA de Anthropic acepta como `maxLength`. El modelo recibe
 * además la directriz de longitud en el system prompt compuesto (output_contract).
 */
function computeMessageRawMaxLength(maxParts: 1 | 2 | 3 | 4): number {
  return maxParts * MAX_CHARS_PER_PART + MESSAGE_RAW_HOLGURA_CHARS;
}

/**
 * Construye la definición de la tool `respond_as_inmobiliario` con `maxLength`
 * dinámico del campo `message_raw` según el cap del tenant. Re-domain de
 * `respond_as_setter` (decisión C5: un agente, dos flujos comprador/vendedor):
 *  - `phase_decision` pasa a rango 0..7 (catálogo `phases` dual).
 *  - nuevos campos `detected_intent`, `proposed_property_ids`,
 *    `proposed_visit_slot`, `is_tasation_visit`, `contraoferta_registrada`,
 *    `handoff_reason`.
 *  - se elimina `proposed_booking_slot` (→ `proposed_visit_slot`) y la semántica GHL.
 *
 * El factory NO se memoiza — construir la tool es trivial (un object literal) y
 * se llama 1 vez por turno. Los system prompts sí se cachean (composer).
 */
export function buildRespondAsInmobiliarioTool(
  opts: { maxParts: 1 | 2 | 3 | 4 } = { maxParts: DEFAULT_MAX_PARTS },
): AnthropicTool {
  const maxLength = computeMessageRawMaxLength(opts.maxParts);
  return {
    name: RESPOND_AS_INMOBILIARIO_TOOL_NAME,
    description:
      'Genera el siguiente turno del agente comercial de Vega Hogar. Devuelve la respuesta al lead (message_raw), ' +
      'el resumen del lead, el estado de la conversación, la fase decidida tras el turno, la intención detectada ' +
      '(comprador/vendedor) y, opcionalmente, inmuebles propuestos, slot de visita confirmado, contraoferta a ' +
      'registrar, recursos a enviar y motivo de handoff. OBLIGATORIO usar esta tool en cada turno.',
    input_schema: {
      type: 'object',
      required: ['message_raw', 'conversation_status', 'phase_decision', 'detected_intent'],
      properties: {
        message_raw: {
          type: 'string',
          description:
            `Respuesta del agente al lead. Texto en lenguaje natural, voz tradicional cercana (sin hype). ` +
            `Si vas a enviar varios mensajes consecutivos, sepáralos con doble salto de línea (\\n\\n). El ` +
            `splitter posterior los particionará en burbujas de chat de 20-280 chars (máximo ${opts.maxParts} burbujas). ` +
            `NO incluyas placeholders [NOMBRE], [ZONA], etc. — sustitúyelos por los valores reales de la conversación ` +
            `y de los datos inyectados (inmuebles/slots).`,
          minLength: 1,
          maxLength,
        },
        user_summary: {
          type: 'string',
          description:
            'Resumen breve (1-2 frases) de lo que has entendido del lead en este turno. Se guarda en ' +
            'conversations.current_context para los siguientes turnos.',
          maxLength: 500,
        },
        conversation_status: {
          type: 'string',
          enum: ['active', 'qualified', 'disqualified', 'handoff', 'paused'],
          description:
            'Estado de la conversación tras este turno. ' +
            '`active`: sigue conversando. ' +
            '`qualified`: lead cualifica, pasa a propuesta/agenda. ' +
            '`disqualified`: lead no cualifica (fuera de zona/presupuesto/operación, o fuera de alcance). ' +
            '`handoff`: derivar a comercial humano (incluido tras visita/tasación agendada). ' +
            '`paused`: el lead pidió pausar (se reactivará cuando vuelva a escribir).',
        },
        phase_decision: {
          type: 'integer',
          minimum: 0,
          maximum: 7,
          description:
            'Fase del flujo tras este turno (catálogo dual comprador/vendedor). ' +
            '0: pre-cualificación / apertura. 1: conexión y detección de intención. ' +
            '2: descubrimiento de necesidades (zona, presupuesto, tipo de operación / motivo de venta). ' +
            '3: cualificación. 4: propuesta de inmuebles (comprador) o recogida de datos de captación (vendedor). ' +
            '5: propuesta de visita / tasación. 6: confirmación de agenda. 7: cierre post-agenda / handoff. ' +
            'NO retrocedas de fase salvo emergencia explícita.',
        },
        detected_intent: {
          type: 'string',
          enum: ['buyer', 'seller', 'unknown'],
          description:
            'Intención detectada del lead (decisión C5, detéctala en el primer turno posible). ' +
            '`buyer`: quiere COMPRAR o ALQUILAR (comprador/inquilino). ' +
            '`seller`: quiere VENDER o poner en ALQUILER su inmueble (vendedor/arrendador). ' +
            '`unknown`: aún no está claro. Activa la rama correspondiente del flujo dual.',
        },
        proposed_property_ids: {
          type: 'array',
          items: { type: 'integer' },
          description:
            'IDs de los inmuebles que propones al lead en este turno. SOLO IDs presentes en la lista de inmuebles ' +
            'inyectada en tu system prompt ({{available_properties}}). NUNCA inventes un ID que no esté en esa lista. ' +
            'Si no propones ninguno, omite el campo o devuelve [].',
        },
        proposed_visit_slot: {
          type: 'string',
          description:
            'Si el lead confirma EXPLÍCITAMENTE un slot de los que le propusiste, rellena con la fecha/hora EXACTA ' +
            'en ISO 8601 con offset, copiada literalmente del listado de slots de tu system prompt. Ejemplo: ' +
            '"2026-06-30T17:00:00+02:00". CUÁNDO RELLENAR: solo cuando el lead diga claramente "sí, ese me viene", ' +
            '"el lunes a las 17h va bien". CUÁNDO NO (omitir): si pregunta, duda, negocia o pide otro día. ' +
            'NO inventes slots — copia EXACTAMENTE uno de los disponibles. El motor agendará la visita/tasación al detectarlo.',
        },
        is_tasation_visit: {
          type: 'boolean',
          description:
            'True SOLO si la cita confirmada es una VISITA DE TASACIÓN (track vendedor: un técnico humano valora el ' +
            'inmueble del lead). False/omitir para una visita de comprador a un inmueble del catálogo. ' +
            'El agente NO tasa: recopila datos y agenda la visita técnica humana (anti-jugada).',
        },
        contraoferta_registrada: {
          type: 'string',
          description:
            'Si el lead plantea una CONTRAOFERTA o negocia precio, registra aquí el importe/condición que propone ' +
            '(texto libre, ej: "ofrece 295.000 € por el piso de Ruzafa"). El agente NO negocia libremente: registra ' +
            'la contraoferta y escala al comercial humano (anti-jugada). Omitir si no hay contraoferta.',
        },
        handoff_cause: {
          type: 'string',
          enum: ['A_agenda', 'B_derivacion', 'C_descualificado', 'D_espera', 'E_error'],
          description:
            'Solo si conversation_status == handoff. ' +
            'A_agenda: visita/tasación confirmada. B_derivacion: derivado a comercial por complejidad/negociación. ' +
            'C_descualificado: handoff tras descualificación que requiere intervención humana. ' +
            'D_espera: lead pidió pausar. E_error: error técnico que requiere intervención.',
        },
        handoff_reason: {
          type: 'string',
          description:
            'Motivo del handoff en texto libre (≤200 chars), complementa handoff_cause. Solo si hay handoff. ' +
            'No se envía al lead.',
          maxLength: 300,
        },
        reasoning: {
          type: 'string',
          description:
            'Razonamiento corto (≤200 chars) de por qué tomas esta decisión. NO se envía al lead. Solo para debug.',
          maxLength: 500,
        },
        // Razonamiento estructurado del Generator → columnas homónimas en
        // conversations. Opcionales (NULL si no se rellenan).
        emotion: {
          type: 'string',
          description: 'Emoción dominante del lead en este turno (1-4 palabras, ej: "ilusionado", "escéptico", "con prisa"). Opcional.',
          maxLength: 60,
        },
        problem: {
          type: 'string',
          description: 'Necesidad / problema concreto del lead (≤120 chars). Ej: "necesita 3 dormitorios cerca de un colegio en Ruzafa, presupuesto 280k". Opcional.',
          maxLength: 200,
        },
        goal: {
          type: 'string',
          description: 'Objetivo que el lead busca (≤120 chars). Ej: "comprar antes de septiembre por el cambio de cole de los hijos". Opcional.',
          maxLength: 200,
        },
        urgency: {
          type: 'string',
          description: 'Nivel de urgencia ("alta" / "media" / "baja") + 1 frase de contexto si aplica. Ej: "alta — su alquiler termina en 2 meses". Opcional.',
          maxLength: 120,
        },
        next_action: {
          type: 'string',
          description: 'Próximo paso del agente en el próximo turno (≤100 chars). Ej: "proponer 2 inmuebles de Ruzafa dentro de presupuesto". Opcional.',
          maxLength: 200,
        },
        general_context: {
          type: 'string',
          description: 'Contexto histórico acumulado del lead a lo largo de la conversación (≤300 chars, se acumula turno a turno). Diferente de current_context (turno actual). Opcional.',
          maxLength: 500,
        },
        general_motivation: {
          type: 'string',
          description: 'Motivación profunda / driver del lead (≤200 chars). Ej: "quiere dejar de pagar alquiler y tener algo propio". Opcional.',
          maxLength: 300,
        },
        captured_lead_name: {
          type: 'string',
          description:
            'Nombre real del lead capturado en ESTE turno. Rellenar solo si el lead acaba de darlo y ANTES faltaba ' +
            '(ves "Nombre: FALTA" en los datos del lead). Formato: "Nombre" o "Nombre Apellido". Si ya está en BD, NO rellenar. NO inventar.',
        },
        captured_lead_email: {
          type: 'string',
          description:
            'Email del lead capturado en ESTE turno. Rellenar solo si el lead acaba de darlo. Formato email válido ' +
            '(ej: "ana@example.com"). Si ya está guardado en BD, NO rellenar. NO inventar.',
        },
        resources_to_send: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Recursos sugeridos (dossiers, fichas, guías) por su clave/nombre tal como aparecen en tu contexto. Opcional.',
        },
      },
      additionalProperties: false,
    },
  };
}

/**
 * Export legacy de compatibilidad con consumidores que aún no propagan
 * `maxParts`. Equivale al cap por defecto (4 burbujas). Para enforce real del
 * cap dinámico, el caller debe usar `buildRespondAsInmobiliarioTool({ maxParts })`.
 */
export const respondAsInmobiliarioTool: AnthropicTool = buildRespondAsInmobiliarioTool();
