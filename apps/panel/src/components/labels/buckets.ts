/**
 * Buckets de destino de las etiquetas (puro, sin React). Un `destination_bucket`
 * decide a qué columna del pipeline / tab de leads salta una conversación al
 * aplicar la etiqueta. Los 5 terminales (cancelled/no_show/recontact/bought/lost)
 * son las columnas outcome del kanban.
 */

import type { DestinationBucket } from '@/lib/lead-list-query';

export const ALL_BUCKETS: DestinationBucket[] = [
  'chats',
  'hot',
  'done',
  'bought',
  'recontact',
  'no_show',
  'cancelled',
  'lost',
];

export const BUCKET_LABEL: Record<DestinationBucket, string> = {
  chats: 'Chats (activos)',
  hot: 'Lead caliente',
  done: 'Completado',
  bought: 'Cerrado / Ganado',
  cancelled: 'Cancelada',
  no_show: 'No-show',
  recontact: 'Recontactar',
  lost: 'Perdido',
};

export function bucketLabel(b: DestinationBucket | null | undefined): string {
  return b ? (BUCKET_LABEL[b] ?? b) : '—';
}
