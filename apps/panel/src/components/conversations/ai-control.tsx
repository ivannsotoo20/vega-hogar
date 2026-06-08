'use client';

import { useTransition } from 'react';
import { Ban, Bot, Loader2, Mail, MailOpen, Pause, Play, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  setConversationBlocked,
  setConversationHandoff,
  setConversationUnread,
  togglePauseConversation,
} from '@/lib/actions/conversations';
import { isConvAiPaused } from '@/lib/conversation-list-query';

interface Props {
  conversationId: number;
  aiPausedUntil: string | null;
  isHandoff: boolean;
  isUnread: boolean;
  isBlocked: boolean;
  canBlock: boolean;
}

export function AiControl({
  conversationId,
  aiPausedUntil,
  isHandoff,
  isUnread,
  isBlocked,
  canBlock,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const paused = isConvAiPaused(aiPausedUntil);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Bot className="size-4 text-primary" /> Control de la conversación
          </CardTitle>
          {paused ? (
            <Badge variant="outline" className="border-warning/40 bg-warning/5 text-warning">
              <Pause className="mr-1 size-3" /> IA pausada
            </Badge>
          ) : (
            <Badge variant="outline" className="border-success/40 bg-success/5 text-success">
              <Play className="mr-1 size-3" /> IA activa
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button
          type="button"
          variant={paused ? 'default' : 'outline'}
          size="sm"
          disabled={pending}
          className="w-full justify-start"
          onClick={() =>
            run(
              () => togglePauseConversation({ conversationId, paused: !paused }),
              paused ? 'IA reactivada' : 'IA pausada',
            )
          }
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : paused ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
          {paused ? 'Reactivar IA' : 'Pausar IA'}
        </Button>

        <Button
          type="button"
          variant={isHandoff ? 'default' : 'outline'}
          size="sm"
          disabled={pending}
          className="w-full justify-start"
          onClick={() =>
            run(
              () => setConversationHandoff({ conversationId, on: !isHandoff }),
              isHandoff ? 'Handoff retirado · IA al mando' : 'Conversación derivada a un humano',
            )
          }
        >
          <UserCheck className="size-3.5" />
          {isHandoff ? 'Quitar derivación' : 'Derivar a humano'}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          className="w-full justify-start"
          onClick={() =>
            run(
              () => setConversationUnread({ conversationId, unread: !isUnread }),
              isUnread ? 'Marcada como leída' : 'Marcada como no leída',
            )
          }
        >
          {isUnread ? <MailOpen className="size-3.5" /> : <Mail className="size-3.5" />}
          {isUnread ? 'Marcar como leída' : 'Marcar como no leída'}
        </Button>

        {canBlock ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={() =>
              run(
                () => setConversationBlocked({ conversationId, blocked: !isBlocked }),
                isBlocked ? 'Conversación desbloqueada' : 'Conversación bloqueada · IA pausada',
              )
            }
          >
            <Ban className="size-3.5" />
            {isBlocked ? 'Desbloquear' : 'Bloquear'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
