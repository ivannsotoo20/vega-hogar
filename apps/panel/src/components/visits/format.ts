/**
 * Helpers de presentación para `/visits` (puros, sin React → server y client).
 * Voz Vega Hogar: español, tradicional cercano, sin hype.
 */

import type { VisitStatus } from '@/lib/visit-list-query';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'accent'
  | 'outline'
  | 'ghost'
  | 'link';

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: 'Agendada',
  done: 'Realizada',
  noshow: 'No asistió',
  cancelled: 'Cancelada',
  rescheduled: 'Reprogramada',
};

/** Intención del lead (para el contexto de la visita). */
export const INTENT_LABEL: Record<string, string> = {
  buyer: 'Comprador',
  tenant: 'Inquilino',
  seller: 'Vendedor',
  landlord: 'Arrendador',
  unknown: 'Sin definir',
};

export function statusLabel(status: string): string {
  return VISIT_STATUS_LABEL[status as VisitStatus] ?? status;
}

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status as VisitStatus) {
    case 'scheduled':
      return 'accent';
    case 'done':
      return 'success';
    case 'noshow':
      return 'destructive';
    case 'rescheduled':
      return 'warning';
    case 'cancelled':
      return 'ghost';
    default:
      return 'outline';
  }
}

export function visitTypeLabel(isTasation: boolean): string {
  return isTasation ? 'Tasación' : 'Visita';
}

export function visitTypeBadgeVariant(isTasation: boolean): BadgeVariant {
  return isTasation ? 'accent' : 'outline';
}

export function intentLabel(intent: string): string {
  return INTENT_LABEL[intent] ?? intent;
}

/**
 * Fecha + hora determinista (zona Europe/Madrid → mismo string en SSR y cliente).
 * Ej.: "12 may 2026, 17:30".
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });
}

/** Solo fecha corta determinista. Ej.: "12 may 2026". */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  });
}

/** `scheduled_for` (ISO timestamptz) → valor para un `<input type="datetime-local">`. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Construimos en hora local del navegador (es lo que el input espera).
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
