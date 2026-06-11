import { redirect } from 'next/navigation';

import { CerebroBlockList } from '@/components/cerebro/cerebro-block-list';
import { listBlocks } from '@/lib/actions/cerebro';
import { requireRole } from '@/lib/auth/requireRole';

export const metadata = {
  title: 'Cerebro · Vega Hogar Inmobiliaria',
};

export const dynamic = 'force-dynamic';

export default async function CerebroPage() {
  // Gate de agencia: admin + agency-admin (mismo público que el grupo "Agencia").
  const profile = await requireRole('admin');
  if (!profile.isAgencyAdmin) redirect('/dashboard?error=forbidden');

  const res = await listBlocks();
  const blocks = res.ok ? (res.data ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Cerebro · prompts del agente</h1>
        <p className="text-sm text-muted-foreground">
          Edita y versiona los bloques de prompt que componen el cerebro del agente
          comercial. Publicar guarda una versión y actualiza el contenido activo.
        </p>
      </header>

      {!res.ok ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudieron cargar los bloques: {res.error}
        </p>
      ) : (
        <CerebroBlockList blocks={blocks} />
      )}
    </div>
  );
}
