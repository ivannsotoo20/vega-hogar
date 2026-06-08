/**
 * Helpers de presentación específicos de `/conversations` (puros). Lo compartido
 * (intent, canal, iniciales, fechas) se reutiliza de `components/leads/format.ts`.
 */

export const CONV_STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  qualified: 'Cualificada',
  disqualified: 'Descartada',
  handoff: 'Derivada',
  paused: 'Pausada',
};

export function convStatusLabel(status: string): string {
  return CONV_STATUS_LABEL[status] ?? status;
}

/** Rol del mensaje en el thread → etiqueta y estilo de burbuja. */
export const ROLE_LABEL: Record<string, string> = {
  lead: 'Lead',
  agent: 'IA',
  human: 'Comercial',
  system: 'Sistema',
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}
