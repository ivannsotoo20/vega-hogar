import { Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  variant?: 'mark' | 'full';
  className?: string;
}

/**
 * Logo tipográfico de Vega Hogar (sin asset binario — Fase 3).
 *   - `mark`: hojita en cuadro oliva. El tamaño lo da `className` (p.ej. size-8).
 *   - `full`: mark + wordmark "Vega Hogar" en serif (Playfair).
 * Si más adelante hay un logo gráfico real, sustituir aquí.
 */
export function VegaLogo({ variant = 'mark', className }: Props) {
  if (variant === 'mark') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground',
          className,
        )}
        aria-label="Vega Hogar"
      >
        <Leaf className="size-[55%]" />
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-2', className)} aria-label="Vega Hogar">
      <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Leaf className="size-4" />
      </span>
      <span className="font-serif text-lg font-semibold tracking-tight">Vega Hogar</span>
    </span>
  );
}
