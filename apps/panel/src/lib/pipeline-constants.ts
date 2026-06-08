// apps/panel/src/lib/pipeline-constants.ts
// Catálogo dual del pipeline inmobiliario (re-domain de SETTER coaching → Vega Hogar).
// Las fases coinciden 1:1 con la tabla `phases` (13 filas seed, intent_track buyer/seller/shared);
// el track lo deriva el agente del `lead.intent`. Colores: progresión gris → oliva (marca Vega),
// NO el azul Fyzon de SETTER. Outcomes: colores tomados de los system labels del seed.

export type LeadIntent = 'buyer' | 'tenant' | 'seller' | 'landlord' | 'unknown';
export type PipelineTrack = 'buyer' | 'seller';
export type OutcomeBucket = 'cancelled' | 'no_show' | 'recontact' | 'bought' | 'lost';
export type PhaseKey = 'f0' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7';
export type ColumnKey = PhaseKey | OutcomeBucket;

export interface PhaseDef {
  key: PhaseKey;
  number: number;
  name: string;
  color: string;
}

export interface OutcomeDef {
  key: OutcomeBucket;
  label: string;
  color: string;
}

// Progresión gris-slate → oliva Vega (#5c6f44 = brand). 8 tonos f0..f7.
const PHASE_COLORS = [
  '#94a3b8', // f0 slate-400
  '#9aa590', // f1
  '#9aa67e', // f2
  '#97a36a', // f3
  '#8f9a58', // f4
  '#7f8c4e', // f5
  '#6d7c46', // f6
  '#5c6f44', // f7 oliva Vega
] as const;

export const BUYER_PHASES: PhaseDef[] = [
  { key: 'f0', number: 0, name: 'Pre-contacto', color: PHASE_COLORS[0] },
  { key: 'f1', number: 1, name: 'Conexión', color: PHASE_COLORS[1] },
  { key: 'f2', number: 2, name: 'Necesidad', color: PHASE_COLORS[2] },
  { key: 'f3', number: 3, name: 'Cualificación', color: PHASE_COLORS[3] },
  { key: 'f4', number: 4, name: 'Puente', color: PHASE_COLORS[4] },
  { key: 'f5', number: 5, name: 'Propuesta de visita', color: PHASE_COLORS[5] },
  { key: 'f6', number: 6, name: 'Agenda de visita', color: PHASE_COLORS[6] },
  { key: 'f7', number: 7, name: 'Cierre / Handoff', color: PHASE_COLORS[7] },
];

export const SELLER_PHASES: PhaseDef[] = [
  { key: 'f0', number: 0, name: 'Pre-contacto', color: PHASE_COLORS[0] },
  { key: 'f1', number: 1, name: 'Conexión', color: PHASE_COLORS[1] },
  { key: 'f2', number: 2, name: 'Inmueble', color: PHASE_COLORS[2] },
  { key: 'f3', number: 3, name: 'Cualificación', color: PHASE_COLORS[3] },
  { key: 'f4', number: 4, name: 'Puente', color: PHASE_COLORS[4] },
  { key: 'f5', number: 5, name: 'Propuesta de tasación', color: PHASE_COLORS[5] },
  { key: 'f6', number: 6, name: 'Agenda de tasación', color: PHASE_COLORS[6] },
  { key: 'f7', number: 7, name: 'Cierre / Handoff', color: PHASE_COLORS[7] },
];

// Columnas terminales de resultado (compartidas por ambos tracks). El `key` es el
// `destination_bucket` del system label que se aplica al soltar una card aquí.
export const OUTCOME_COLUMNS: OutcomeDef[] = [
  { key: 'cancelled', label: 'Cancelada', color: '#d97706' },
  { key: 'no_show', label: 'No-show', color: '#dc2626' },
  { key: 'recontact', label: 'Recontactar', color: '#0ea5e9' },
  { key: 'bought', label: 'Cerrado / Ganado', color: '#16a34a' },
  { key: 'lost', label: 'Perdido', color: '#6b7280' },
];

export const OUTCOME_BUCKETS: OutcomeBucket[] = OUTCOME_COLUMNS.map((o) => o.key);

export const PHASE_KEYS: PhaseKey[] = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'];

export const TRACK_LABELS: Record<PipelineTrack, string> = {
  buyer: 'Compradores',
  seller: 'Vendedores',
};

/** Fases (sin outcomes) del track indicado. */
export function phasesForTrack(track: PipelineTrack): PhaseDef[] {
  return track === 'seller' ? SELLER_PHASES : BUYER_PHASES;
}

/** Orden de columnas del board: fases del track + las 5 columnas outcome. */
export function columnsForTrack(track: PipelineTrack): ColumnKey[] {
  return [...phasesForTrack(track).map((p) => p.key), ...OUTCOME_BUCKETS];
}

/** Deriva el track del intent del lead (buyer/tenant → buyer; seller/landlord → seller). */
export function trackForIntent(intent: LeadIntent | string | null | undefined): PipelineTrack {
  return intent === 'seller' || intent === 'landlord' ? 'seller' : 'buyer';
}

/** `current_phase` (INT 0-7) → PhaseKey, con clamp defensivo. */
export function phaseKey(n: number | null | undefined): PhaseKey {
  const clamped = Math.max(0, Math.min(7, Math.trunc(n ?? 0)));
  return `f${clamped}` as PhaseKey;
}

/** PhaseKey → número de fase. */
export function phaseNumberFromKey(key: PhaseKey): number {
  return Number(key.slice(1));
}

export function isOutcomeKey(key: string): key is OutcomeBucket {
  return (OUTCOME_BUCKETS as string[]).includes(key);
}

export function isPhaseKey(key: string): key is PhaseKey {
  return (PHASE_KEYS as string[]).includes(key);
}

/** Etiqueta legible de una columna (fase u outcome). */
export function columnLabel(key: ColumnKey): string {
  if (isOutcomeKey(key)) {
    return OUTCOME_COLUMNS.find((o) => o.key === key)?.label ?? key;
  }
  // El nombre de fase puede diferir por track; para una etiqueta neutra usamos buyer.
  return BUYER_PHASES.find((p) => p.key === key)?.name ?? key;
}

export function columnColor(key: ColumnKey): string {
  if (isOutcomeKey(key)) {
    return OUTCOME_COLUMNS.find((o) => o.key === key)?.color ?? '#94a3b8';
  }
  return PHASE_COLORS[phaseNumberFromKey(key)] ?? '#94a3b8';
}

/** Etiqueta + color de cada columna del board, dependientes del track (las fases
 * difieren: F2 Necesidad vs Inmueble, F5 Propuesta de visita vs tasación…). */
export function columnMetaForTrack(track: PipelineTrack): Record<ColumnKey, { label: string; color: string }> {
  const meta = {} as Record<ColumnKey, { label: string; color: string }>;
  for (const p of phasesForTrack(track)) meta[p.key] = { label: p.name, color: p.color };
  for (const o of OUTCOME_COLUMNS) meta[o.key] = { label: o.label, color: o.color };
  return meta;
}
