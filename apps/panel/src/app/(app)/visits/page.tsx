import {
  parseCsvStringList,
  parseVisitTab,
  parseVisitType,
  type VisitFilterParams,
} from '@/lib/visit-list-query';
import { VisitsLayout } from '@/components/visits/visits-layout';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters: VisitFilterParams = {
    q: one(sp.q) ?? undefined,
    statuses: parseCsvStringList(one(sp.statuses)),
    visitType: parseVisitType(one(sp.type)),
    comercial: one(sp.comercial) ?? undefined,
    scheduledFrom: one(sp.from) ?? null,
    scheduledTo: one(sp.to) ?? null,
    viewerId: null,
  };

  const activeTab = parseVisitTab(one(sp.tab));
  const selRaw = one(sp.selected);
  const selectedId = selRaw && /^\d+$/.test(selRaw) ? Number(selRaw) : null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Visitas</h1>
        <p className="text-sm text-muted-foreground">
          Agenda de visitas comerciales y visitas técnicas de tasación.
        </p>
      </header>
      <VisitsLayout filters={filters} activeTab={activeTab} selectedId={selectedId} />
    </div>
  );
}
