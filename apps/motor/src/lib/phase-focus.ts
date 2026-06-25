/**
 * Instrucción focal corta de la fase activa (0..7) del flujo dual comprador/vendedor.
 * El composer la interpola en `{{current_phase_focus}}` de `core_v1_base`. Estable
 * por (fase, track) → puede ir dentro del bloque cacheado.
 *
 * Nota: hasta que los prompts reales aterricen (S22/F10c), `core_v1_base` es un
 * placeholder sin `{{current_phase_focus}}`, así que esta cadena no se interpola
 * todavía (no-op). Se construye ya para no reescribir el núcleo después.
 */

export type Track = 'buyer' | 'seller' | 'shared';

const BUYER_FOCUS: Record<number, string> = {
  0: 'Apertura: saluda con cercanía y detecta si el lead quiere comprar/alquilar o vender.',
  1: 'Conexión: confirma la intención del lead y crea confianza sin presionar.',
  2: 'Descubrimiento: zona, presupuesto, tipo de operación, nº de habitaciones y plazos.',
  3: 'Cualificación: confirma encaje (zona/presupuesto realistas) antes de proponer.',
  4: 'Propuesta: presenta 1-2 inmuebles del catálogo que encajen y explica el porqué.',
  5: 'Visita: propón fecha/hora concreta de visita de los slots disponibles.',
  6: 'Confirmación: confirma el slot elegido y los datos del lead (nombre, email).',
  7: 'Cierre: visita agendada; resume y deriva al comercial. No reabras la conversación.',
};

const SELLER_FOCUS: Record<number, string> = {
  0: 'Apertura: saluda con cercanía y detecta si el lead quiere vender/alquilar su inmueble.',
  1: 'Conexión: confirma que quiere vender o poner en alquiler y crea confianza.',
  2: 'Descubrimiento: tipo de inmueble, zona, características y motivo de la venta.',
  3: 'Cualificación: confirma que el inmueble entra en nuestro ámbito de captación.',
  4: 'Datos de captación: recoge los datos clave del inmueble (sin tasar tú: lo hace un técnico).',
  5: 'Tasación: propón fecha/hora de visita técnica de tasación de los slots disponibles.',
  6: 'Confirmación: confirma el slot de la tasación y los datos del propietario-lead.',
  7: 'Cierre: tasación agendada; resume y deriva al comercial. No reabras la conversación.',
};

export function buildPhaseFocusInstruction(currentPhase: number, track: Track): string {
  const table = track === 'seller' ? SELLER_FOCUS : BUYER_FOCUS;
  return table[currentPhase] ?? table[0]!;
}
