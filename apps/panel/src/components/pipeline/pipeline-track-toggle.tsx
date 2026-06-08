'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/utils';
import { TRACK_LABELS, type PipelineTrack } from '@/lib/pipeline-constants';

export function PipelineTrackToggle({ active }: { active: PipelineTrack }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (track: PipelineTrack) => {
    const params = new URLSearchParams(searchParams.toString());
    if (track === 'buyer') params.delete('track');
    else params.set('track', track);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-sm">
      {(['buyer', 'seller'] as PipelineTrack[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => go(t)}
          aria-pressed={active === t}
          className={cn(
            'rounded-md px-3 py-1 font-medium transition-colors',
            active === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {TRACK_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
