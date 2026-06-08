'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { PropertyDetail as PropertyDetailData } from '@/lib/actions/properties';
import type { OfficeOption } from '@/lib/actions/offices';
import type { MemberOption } from '@/lib/actions/members';

import { PropertyDetail } from './property-detail';

export function PropertyDetailSheet({
  detail,
  members,
  offices,
  viewerId,
  canEdit,
  canDelete,
  canViewOwners,
}: {
  detail: PropertyDetailData | null;
  members: MemberOption[];
  offices: OfficeOption[];
  viewerId: number;
  canEdit: boolean;
  canDelete: boolean;
  canViewOwners: boolean;
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
          <SheetTitle>Ficha del inmueble</SheetTitle>
          <SheetDescription>Datos, fotos, propietario y leads interesados del inmueble.</SheetDescription>
        </SheetHeader>
        {detail && (
          <PropertyDetail
            detail={detail}
            members={members}
            offices={offices}
            viewerId={viewerId}
            canEdit={canEdit}
            canDelete={canDelete}
            canViewOwners={canViewOwners}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
