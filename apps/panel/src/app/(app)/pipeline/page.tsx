import { PipelineLayout } from '@/components/pipeline/pipeline-layout';
import { PipelineTrackToggle } from '@/components/pipeline/pipeline-track-toggle';
import type { PipelineTrack } from '@/lib/pipeline-constants';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const track: PipelineTrack = one(sp.track) === 'seller' ? 'seller' : 'buyer';

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Operación</p>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Pipeline</h1>
        </div>
        <PipelineTrackToggle active={track} />
      </div>
      <PipelineLayout track={track} />
    </div>
  );
}
