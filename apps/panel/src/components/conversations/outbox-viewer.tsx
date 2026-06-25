import { Send } from 'lucide-react';

import { formatShortDate } from '@/components/leads/format';
import type { OutboxEntry } from '@/lib/actions/conversations';

/**
 * Viewer read-only de `mock_whatsapp_outbox`: lo que el motor "envió" por el
 * driver mock (burbujas + estado). Verificación humana del golden path (F10b).
 * El driver real YCloud (F10c) no usa esta tabla.
 */
export function OutboxViewer({ entries }: { entries: OutboxEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Send className="size-3" /> Salida WhatsApp (mock) · {entries.length}
      </span>
      <ul className="flex flex-col gap-2">
        {entries.map((o) => (
          <li key={o.id} className="rounded-md border border-border p-2 text-sm">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                #{o.id} · {o.status}
              </span>
              <span>{formatShortDate(o.createdAt)}</span>
            </div>
            <div className="mt-1 flex flex-col gap-1">
              {o.parts.map((p, i) => (
                <p
                  key={i}
                  className="whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1"
                >
                  {p}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
