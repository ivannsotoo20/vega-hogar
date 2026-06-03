'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/utils';
import type { LeadTabCounts, LeadTabKey } from '@/lib/lead-list-query';

const TABS: Array<{ key: LeadTabKey; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'buyers', label: 'Compradores' },
  { key: 'sellers', label: 'Vendedores' },
  { key: 'hot', label: 'Calientes' },
  { key: 'closed', label: 'Cerrados' },
];

export function LeadsListTabs({ active, counts }: { active: LeadTabKey; counts: LeadTabCounts }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectTab(key: LeadTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'all') params.delete('tab');
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
