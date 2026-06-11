import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { BlockListRow } from '@/lib/cerebro-list-query';
import { scopeParam } from '@/lib/cerebro-list-query';

/**
 * Lista de bloques de prompt del Cerebro (`/admin/cerebro`). Presentacional —
 * cada fila enlaza a la ficha-editor `[blockKey]?tenant=shared|<id>`.
 */
export function CerebroBlockList({ blocks }: { blocks: BlockListRow[] }) {
  if (blocks.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        No hay bloques de prompt visibles. (Se siembran en F4 como placeholders.)
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            <th className="p-3 font-medium">Bloque</th>
            <th className="p-3 font-medium">Ámbito</th>
            <th className="p-3 text-center font-medium">Versión</th>
            <th className="p-3 text-center font-medium">Estado</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={`${b.blockKey}-${b.tenantId ?? 'shared'}`} className="border-t">
              <td className="p-3">
                <span className="font-mono text-xs">{b.blockKey}</span>
                {!b.isActive ? (
                  <Badge variant="outline" className="ml-2 text-muted-foreground">
                    inactivo
                  </Badge>
                ) : null}
              </td>
              <td className="p-3">
                {b.scope === 'shared' ? (
                  <Badge variant="secondary">Compartido</Badge>
                ) : (
                  <Badge variant="outline">Tenant {b.tenantId}</Badge>
                )}
              </td>
              <td className="p-3 text-center font-mono">v{b.version}</td>
              <td className="p-3 text-center">
                {b.hasDraft ? (
                  <Badge className="bg-[var(--color-brand-terracota)] text-white hover:bg-[var(--color-brand-terracota)]">
                    Borrador
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Publicado</span>
                )}
              </td>
              <td className="p-3 text-right">
                <Link
                  href={`/admin/cerebro/${encodeURIComponent(b.blockKey)}?tenant=${scopeParam(b.tenantId)}`}
                  className="text-sm font-medium text-[var(--color-brand-oliva)] hover:underline"
                >
                  Editar →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
