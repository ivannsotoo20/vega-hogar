'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { LeadDetail as LeadDetailData } from '@/lib/actions/leads';
import type { LabelOption } from '@/lib/actions/labels';
import type { MemberOption } from '@/lib/actions/members';

import { LeadDetail } from './lead-detail';

export function LeadDetailSheet({
  detail,
  members,
  labels,
  viewerId,
  canEdit,
  canManageGdpr,
  canDelete,
}: {
  detail: LeadDetailData | null;
  members: MemberOption[];
  labels: LabelOption[];
  viewerId: number;
  canEdit: boolean;
  canManageGdpr: boolean;
  canDelete: boolean;
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
          <SheetTitle>Ficha del lead</SheetTitle>
          <SheetDescription>Detalle, preferencias, inmuebles, timeline y notas del lead.</SheetDescription>
        </SheetHeader>
        {detail && (
          <LeadDetail
            detail={detail}
            members={members}
            labels={labels}
            viewerId={viewerId}
            canEdit={canEdit}
            canManageGdpr={canManageGdpr}
            canDelete={canDelete}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
