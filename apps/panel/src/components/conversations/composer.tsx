'use client';

import { useState, useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { sendManualMessage } from '@/lib/actions/conversations';

/**
 * Composer del thread (habilitado en F10). El agente humano responde al lead:
 * inserta `conversation_messages(role='human')` (anon+RLS) y **pausa la IA**
 * automáticamente (se hizo cargo). El envío real por WhatsApp lo hace el motor
 * (mock en F10b → `mock_whatsapp_outbox`; YCloud real gated en F10c).
 */
export function Composer({ conversationId }: { conversationId: number }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    startTransition(async () => {
      const res = await sendManualMessage({ conversationId, content });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Mensaje enviado · IA pausada');
      setText('');
      router.refresh();
    });
  };

  return (
    <div className="shrink-0 border-t border-border bg-background/95 p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={pending}
          placeholder="Responder al lead (te haces cargo · pausa la IA)…"
          className="min-h-[40px] flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={pending || !text.trim()}
          aria-label="Enviar mensaje"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
        Al responder como humano, la IA se pausa automáticamente en esta conversación.
      </p>
    </div>
  );
}
