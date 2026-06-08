import { cn } from '@/lib/utils';
import type { ThreadMessage } from '@/lib/actions/conversations';

import { roleLabel } from './format';

/**
 * Render del hilo de mensajes. Burbujas por rol:
 *   - lead  → izquierda, neutra (mensaje entrante del cliente).
 *   - agent → derecha, oliva (respuesta de la IA).
 *   - human → derecha, ámbar (respuesta manual de un comercial).
 *   - system→ centrada, tenue (eventos del motor).
 */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });
}

export function Thread({ messages }: { messages: ThreadMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="py-8 text-center text-sm italic text-muted-foreground">Sin mensajes todavía.</p>
    );
  }

  return (
    <ol className="flex flex-col gap-2 py-2">
      {messages.map((m) => {
        const isLead = m.role === 'lead';
        const isSystem = m.role === 'system';
        const isHuman = m.role === 'human';

        if (isSystem) {
          return (
            <li key={m.id} className="flex justify-center">
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                {m.content}
              </span>
            </li>
          );
        }

        return (
          <li key={m.id} className={cn('flex', isLead ? 'justify-start' : 'justify-end')}>
            <div
              className={cn(
                'max-w-[78%] rounded-2xl px-3 py-2 text-sm',
                isLead
                  ? 'rounded-bl-sm bg-muted text-foreground'
                  : isHuman
                    ? 'rounded-br-sm bg-warning/15 text-foreground'
                    : 'rounded-br-sm bg-primary/10 text-foreground',
              )}
            >
              <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>{roleLabel(m.role)}</span>
                <span>{timeLabel(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
