'use client';

import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Props {
  label: { id: number; name: string; color: string };
  size?: 'sm' | 'md' | 'mini';
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

/**
 * Chip de color por etiqueta. Variantes:
 *   - mini: lista lateral (dot + nombre corto).
 *   - sm:   topbar + dropdowns.
 *   - md:   tabla /labels.
 */
export function LabelChip({ label, size = 'sm', onClick, onRemove, className }: Props) {
  const isMini = size === 'mini';
  const isMd = size === 'md';

  const dim = isMini
    ? 'h-3.5 text-[9px] px-1 gap-0.5'
    : isMd
      ? 'h-6 text-xs px-2 gap-1.5'
      : 'h-5 text-[11px] px-1.5 gap-1';
  const dotDim = isMini ? 'size-1.5' : 'size-2';

  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-md border whitespace-nowrap',
        dim,
        onClick && 'cursor-pointer hover:opacity-80',
        className,
      )}
      style={{
        borderColor: `${label.color}66`,
        backgroundColor: `${label.color}15`,
        color: label.color,
      }}
    >
      <span className={cn('rounded-full shrink-0', dotDim)} style={{ backgroundColor: label.color }} />
      <span className="truncate font-medium">{label.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70"
          aria-label={`Quitar etiqueta ${label.name}`}
        >
          <X className={isMini ? 'size-2' : 'size-3'} />
        </button>
      ) : null}
    </span>
  );
}
