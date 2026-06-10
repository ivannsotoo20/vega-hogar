'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/utils';
import type { VisitTabCounts, VisitTabKey } from '@/lib/visit-list-query';

const TABS: Array<{ key: VisitTabKey; label: string }> = [
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'done', label: 'Realizadas' },
  { key: 'tasations', label: 'Tasaciones' },
  { key: 'all', label: 'Todas' },
];

export function VisitsListTabs({
  active,
  counts,
}: {
  active: VisitTabKey;
  counts: VisitTabCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectTab(key: VisitTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    // 'scheduled' es la pestaña por defecto (parseVisitTab) → sin param.
    if (key === 'scheduled') params.delete('tab');
    else params.set('tab', key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {counts[t.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
