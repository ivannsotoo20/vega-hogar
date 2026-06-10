import {
  parseCsvStringList,
  parseNumOrNull,
  parsePropertyTab,
  type PropertyFilterParams,
} from '@/lib/property-list-query';
import { PropertiesLayout } from '@/components/properties/properties-layout';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters: PropertyFilterParams = {
    q: one(sp.q) ?? undefined,
    types: parseCsvStringList(one(sp.types)),
    statuses: parseCsvStringList(one(sp.statuses)),
    neighborhoods: parseCsvStringList(one(sp.neighborhoods)),
    features: parseCsvStringList(one(sp.features)),
    assignee: one(sp.assignee) ?? undefined,
    priceMin: parseNumOrNull(one(sp.priceMin)),
    priceMax: parseNumOrNull(one(sp.priceMax)),
    roomsMin: parseNumOrNull(one(sp.roomsMin)),
    m2Min: parseNumOrNull(one(sp.m2Min)),
    viewerId: null,
  };

  const activeTab = parsePropertyTab(one(sp.tab));
  const selRaw = one(sp.selected);
  const selectedId = selRaw && /^\d+$/.test(selRaw) ? Number(selRaw) : null;
  // Cruce F8: el botón "Dar de alta inmueble" de captación/ficha de lead llega con ?new=1.
  const openNew = one(sp.new) === '1';

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Inmuebles</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de Vega Hogar: venta y alquiler en Valencia.
        </p>
      </header>
      <PropertiesLayout
        filters={filters}
        activeTab={activeTab}
        selectedId={selectedId}
        openNew={openNew}
      />
    </div>
  );
}
