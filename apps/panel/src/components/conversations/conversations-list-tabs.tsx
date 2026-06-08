'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/utils';
import type { ConvTabCounts, ConvTabKey } from '@/lib/conversation-list-query';

const TABS: { key: ConvTabKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Sin leer' },
  { key: 'handoff', label: 'Derivadas' },
  { key: 'paused', label: 'IA en pausa' },
];

export function ConversationsListTabs({
  active,
  counts,
}: {
  active: ConvTabKey;
  counts: ConvTabCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (key: ConvTabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'all') params.delete('tab');
    else params.set('tab', key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => go(t.key)}
          aria-pressed={active === t.key}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            active === t.key
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {t.label} <span className="tabular-nums opacity-70">{counts[t.key]}</span>
        </button>
      ))}
    </div>
  );
}
