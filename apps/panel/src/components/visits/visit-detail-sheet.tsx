'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { VisitDetail as VisitDetailData } from '@/lib/actions/visits';
import type { MemberOption } from '@/lib/actions/members';

import { VisitDetail } from './visit-detail';

export function VisitDetailSheet({
  detail,
  members,
  viewerId,
  canReassign,
}: {
  detail: VisitDetailData | null;
  members: MemberOption[];
  viewerId: number;
  canReassign: boolean;
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
          <SheetTitle>Ficha de la visita</SheetTitle>
          <SheetDescription>Lead, inmueble, comercial, estado y notas de la visita.</SheetDescription>
        </SheetHeader>
        {detail && (
          <VisitDetail
            detail={detail}
            members={members}
            viewerId={viewerId}
            canReassign={canReassign}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
