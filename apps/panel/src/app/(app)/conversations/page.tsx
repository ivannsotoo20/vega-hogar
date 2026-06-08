import { ConversationsLayout } from '@/components/conversations/conversations-layout';
import {
  parseConvTab,
  parseCsvInts,
  parseCsvStrings,
  type ConversationFilterParams,
} from '@/lib/conversation-list-query';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters: ConversationFilterParams = {
    q: one(sp.q) ?? undefined,
    channels: parseCsvStrings(one(sp.channels)),
    assignee: one(sp.assignee) ?? undefined,
    labelIds: parseCsvInts(one(sp.labels)),
    viewerId: null,
  };

  const activeTab = parseConvTab(one(sp.tab));
  const selRaw = one(sp.selected) ?? '';
  const selectedId = /^\d+$/.test(selRaw) ? Number(selRaw) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Operación</p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Conversaciones</h1>
      </div>
      <ConversationsLayout filters={filters} activeTab={activeTab} selectedId={selectedId} />
    </div>
  );
}
