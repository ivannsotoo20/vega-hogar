'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LabelChip } from '@/components/labels/label-chip';
import {
  channelLabel,
  formatShortDate,
  intentBadgeVariant,
  intentLabel,
} from '@/components/leads/format';
import {
  addConversationNote,
  applyConvLabel,
  removeConvLabel,
  type ConversationDetail,
} from '@/lib/actions/conversations';
import type { LabelOption } from '@/lib/actions/labels';

import { AiControl } from './ai-control';
import { Composer } from './composer';
import { OutboxViewer } from './outbox-viewer';
import { Thread } from './thread';
import { convStatusLabel } from './format';

export function ConversationDetailView({
  detail,
  labels,
  canBlock,
}: {
  detail: ConversationDetail;
  labels: LabelOption[];
  canBlock: boolean;
}) {
  const c = detail.conversation;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');

  const appliedIds = new Set(c.labels.map((l) => l.id));
  const available = labels.filter((l) => !appliedIds.has(l.id));

  const addLabel = (labelId: number) =>
    startTransition(async () => {
      const res = await applyConvLabel({ conversationId: c.id, labelId });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Etiqueta aplicada');
      router.refresh();
    });

  const removeLabel = (labelId: number) =>
    startTransition(async () => {
      const res = await removeConvLabel({ conversationId: c.id, labelId });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      router.refresh();
    });

  const submitNote = () => {
    const content = note.trim();
    if (!content) return;
    startTransition(async () => {
      const res = await addConversationNote({ conversationId: c.id, content });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Nota añadida');
      setNote('');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-lg font-semibold tracking-tight">
            {c.lead_name ?? 'Sin nombre'}
          </h2>
          <Badge variant={intentBadgeVariant(c.intent)}>{intentLabel(c.intent)}</Badge>
          {c.is_blocked ? <Badge variant="destructive">Bloqueada</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{channelLabel(c.channel)}</span>
          <span aria-hidden>·</span>
          <span>{convStatusLabel(c.status)}</span>
          <span aria-hidden>·</span>
          <span>Fase {c.current_phase}</span>
          {c.lead_phone ? (
            <>
              <span aria-hidden>·</span>
              <span>{c.lead_phone}</span>
            </>
          ) : null}
        </div>
        <Link
          href={`/leads/${c.lead_id}`}
          className="flex w-fit items-center gap-1 text-xs text-primary hover:underline"
        >
          Ver ficha del lead <ExternalLink className="size-3" />
        </Link>
      </div>

      <AiControl
        conversationId={c.id}
        aiPausedUntil={c.ai_paused_until}
        isHandoff={c.is_handoff_to_human}
        isUnread={c.is_unread}
        isBlocked={c.is_blocked}
        canBlock={canBlock}
      />

      {/* Etiquetas */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Etiquetas</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {c.labels.length === 0 ? (
            <span className="text-xs italic text-muted-foreground">Sin etiquetas</span>
          ) : (
            c.labels.map((l) => (
              <LabelChip
                key={l.id}
                size="sm"
                label={{ id: l.id, name: l.name, color: l.color }}
                onRemove={() => removeLabel(l.id)}
              />
            ))
          )}
        </div>
        {available.length > 0 ? (
          <Select value="" onValueChange={(v) => v && addLabel(Number(v))} disabled={pending}>
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="Añadir etiqueta…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {/* Hilo de mensajes + composer (envío manual del agente humano) */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="max-h-[420px] overflow-y-auto px-3">
          <Thread messages={detail.messages} />
        </div>
        <Composer conversationId={c.id} />
      </div>

      {/* Salida WhatsApp simulada (mock outbox) — verificación del golden path */}
      <OutboxViewer entries={detail.outbox} />

      {/* Notas internas */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Notas internas</span>
        <div className="flex gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Nota interna (no se envía al lead)…"
            className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="button" size="sm" onClick={submitNote} disabled={pending || !note.trim()}>
            Añadir
          </Button>
        </div>
        {detail.notes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {detail.notes.map((n) => (
              <li key={n.id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{n.authorEmail ?? 'Sistema'}</span>
                  <span>{formatShortDate(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{n.content}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
