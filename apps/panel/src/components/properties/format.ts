/**
 * Helpers de presentación para `/properties` (puros, sin React → server y client).
 * Voz Vega Hogar: español, tradicional cercano, sin hype.
 */

import type { PropertyListRow, PropertyStatus, PropertyType } from '@/lib/property-list-query';

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

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  sale: 'Venta',
  rent: 'Alquiler',
};

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  available: 'Disponible',
  reserved: 'Reservado',
  sold: 'Vendido',
  rented: 'Alquilado',
  inactive: 'Inactivo',
};

/** Barrios sembrados (Fase 1). Orden estable para los filtros. */
export const NEIGHBORHOODS: string[] = [
  'ruzafa',
  'benimaclet',
  'el_carmen',
  'eixample',
  'algiros',
  'cabanyal',
  'campanar',
  'patraix',
  'ciudad_jardin',
  'malilla',
];

export const NEIGHBORHOOD_LABEL: Record<string, string> = {
  ruzafa: 'Ruzafa',
  benimaclet: 'Benimaclet',
  el_carmen: 'El Carmen',
  eixample: "L'Eixample",
  algiros: 'Algirós',
  cabanyal: 'Cabanyal',
  campanar: 'Campanar',
  patraix: 'Patraix',
  ciudad_jardin: 'Ciudad Jardín',
  malilla: 'Malilla',
};

/** Claves de `features` conocidas. El orden manda en la ficha y los filtros. */
export const FEATURE_KEYS: string[] = [
  'lift',
  'terrace',
  'ac',
  'heating',
  'garage',
  'parking',
  'storage',
  'garden',
  'pool',
  'balcony',
  'furnished',
  'views',
];

export const FEATURE_LABEL: Record<string, string> = {
  lift: 'Ascensor',
  terrace: 'Terraza',
  ac: 'Aire acondicionado',
  heating: 'Calefacción',
  garage: 'Garaje',
  parking: 'Parking',
  storage: 'Trastero',
  garden: 'Jardín',
  pool: 'Piscina',
  balcony: 'Balcón',
  furnished: 'Amueblado',
  views: 'Vistas',
};

export function typeLabel(type: string): string {
  return PROPERTY_TYPE_LABEL[type as PropertyType] ?? type;
}

export function statusLabel(status: string): string {
  return PROPERTY_STATUS_LABEL[status as PropertyStatus] ?? status;
}

export function neighborhoodLabel(neighborhood: string): string {
  return NEIGHBORHOOD_LABEL[neighborhood] ?? neighborhood;
}

export function featureLabel(feature: string): string {
  return FEATURE_LABEL[feature] ?? feature;
}

export function typeBadgeVariant(type: string): BadgeVariant {
  return type === 'rent' ? 'outline' : 'accent';
}

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status as PropertyStatus) {
    case 'available':
      return 'success';
    case 'reserved':
      return 'warning';
    case 'sold':
    case 'rented':
      return 'secondary';
    case 'inactive':
      return 'ghost';
    default:
      return 'outline';
  }
}

/**
 * Fecha corta determinista (zona Europe/Madrid → mismo string en SSR y cliente).
 * Ej.: "12 may 2026".
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

type PriceFields = Pick<PropertyListRow, 'type' | 'price_eur' | 'monthly_rent_eur'>;

/** Precio de venta o renta mensual, según el tipo. */
export function priceLabel(row: PriceFields): string {
  if (row.type === 'rent') {
    const v = formatEur(row.monthly_rent_eur);
    return v ? `${v}/mes` : 'Alquiler a consultar';
  }
  const v = formatEur(row.price_eur);
  return v ?? 'Precio a consultar';
}

export function m2Label(m2Built: number | null | undefined): string {
  if (m2Built == null) return '—';
  return `${m2Built} m²`;
}

export function roomsBathLabel(rooms: number, bathrooms: number): string {
  const r = `${rooms} hab`;
  const b = `${bathrooms} ${bathrooms === 1 ? 'baño' : 'baños'}`;
  return `${r} · ${b}`;
}
