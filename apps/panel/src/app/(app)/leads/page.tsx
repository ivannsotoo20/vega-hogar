import {
  parseAiState,
  parseCsvIntList,
  parseCsvStringList,
  parseLeadTab,
  type LeadFilterParams,
} from '@/lib/lead-list-query';
import { LeadsLayout } from '@/components/leads/leads-layout';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters: LeadFilterParams = {
    q: one(sp.q) ?? undefined,
    intents: parseCsvStringList(one(sp.intents)),
    statuses: parseCsvStringList(one(sp.statuses)),
    phases: parseCsvIntList(one(sp.phases)),
    labelIds: parseCsvIntList(one(sp.labels)),
    assignee: one(sp.assignee) ?? undefined,
    aiState: parseAiState(one(sp.ai)),
    createdFrom: one(sp.createdFrom) ?? null,
    createdTo: one(sp.createdTo) ?? null,
    lastMsgFrom: one(sp.lastMsgFrom) ?? null,
    lastMsgTo: one(sp.lastMsgTo) ?? null,
    lastMsgNever: one(sp.lastMsgNever) === '1',
    viewerId: null,
  };

  const activeTab = parseLeadTab(one(sp.tab));
  const selRaw = one(sp.selected);
  const selectedId = selRaw && /^\d+$/.test(selRaw) ? Number(selRaw) : null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Compradores, inquilinos, vendedores y arrendadores de Vega Hogar.
        </p>
      </header>
      <LeadsLayout filters={filters} activeTab={activeTab} selectedId={selectedId} />
    </div>
  );
}
