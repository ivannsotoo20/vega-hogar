/**
 * Helpers de presentación para `/leads` (puros, sin React → server y client).
 * Voz Vega Hogar: español, tradicional cercano, sin hype.
 */

import type { LeadIntent, LeadStatus } from '@/lib/lead-list-query';

export const INTENT_LABEL: Record<LeadIntent, string> = {
  buyer: 'Comprador',
  tenant: 'Inquilino',
  seller: 'Vendedor',
  landlord: 'Arrendador',
  unknown: 'Sin definir',
};

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

// Variantes del Badge de Vega.
export function intentBadgeVariant(intent: LeadIntent): BadgeVariant {
  switch (intent) {
    case 'buyer':
      return 'accent';
    case 'tenant':
      return 'outline';
    case 'seller':
      return 'success';
    case 'landlord':
      return 'warning';
    default:
      return 'ghost';
  }
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Cualificado',
  scheduled_visit: 'Visita agendada',
  visited: 'Visitado',
  offer_made: 'Oferta',
  closed_won: 'Ganado',
  closed_lost: 'Perdido',
  cold: 'Frío',
};

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  voice: 'Voz',
  web_form: 'Formulario',
  meta_ads: 'Meta Ads',
  other: 'Otro',
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

export function intentLabel(intent: string): string {
  return INTENT_LABEL[intent as LeadIntent] ?? intent;
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as LeadStatus] ?? status;
}

/** Iniciales para el avatar (máx. 2). */
export function initials(name: string | null | undefined): string {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Fecha corta determinista (zona Europe/Madrid → mismo string en SSR y cliente,
 * evita hydration mismatch). Ej.: "12 may 2026".
 */
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

/** Importe en euros, sin decimales si es entero. */
export function formatEur(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}
