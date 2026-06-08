'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ConversationDetail } from '@/lib/actions/conversations';
import type { LabelOption } from '@/lib/actions/labels';

import { ConversationDetailView } from './conversation-detail';

export function ConversationDetailSheet({
  detail,
  labels,
  canBlock,
}: {
  detail: ConversationDetail | null;
  labels: LabelOption[];
  canBlock: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('selected');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Sheet
      open={detail !== null}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto p-4 sm:max-w-xl">
        <SheetHeader className="sr-only">
          <SheetTitle>Conversación</SheetTitle>
          <SheetDescription>Hilo de mensajes, control de la IA, etiquetas y notas.</SheetDescription>
        </SheetHeader>
        {detail ? (
          <ConversationDetailView detail={detail} labels={labels} canBlock={canBlock} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
