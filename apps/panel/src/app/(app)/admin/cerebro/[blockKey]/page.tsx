import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BlockEditor } from '@/components/cerebro/block-editor';
import { Button } from '@/components/ui/button';
import { getBlockDetail, listVersions } from '@/lib/actions/cerebro';
import { parseScopeParam } from '@/lib/cerebro-list-query';
import { requireRole } from '@/lib/auth/requireRole';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CerebroBlockPage({
  params,
  searchParams,
}: {
  params: Promise<{ blockKey: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireRole('admin');
  if (!profile.isAgencyAdmin) redirect('/dashboard?error=forbidden');

  const { blockKey } = await params;
  const sp = await searchParams;
  const tenantId = parseScopeParam(one(sp.tenant));

  const decodedKey = decodeURIComponent(blockKey);
  const detailRes = await getBlockDetail(decodedKey, tenantId);
  if (!detailRes.ok || !detailRes.data) {
    if (detailRes.ok || detailRes.error === 'not_found') notFound();
    redirect('/admin/cerebro');
  }
  const detail = detailRes.data;

  const versionsRes = await listVersions(detail.block.id);
  const versions = versionsRes.ok ? (versionsRes.data ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Editar bloque de prompt</h1>
          <p className="text-sm text-muted-foreground">
            Borrador autoguardado · publica para crear una versión y activar el contenido.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/cerebro">← Volver al Cerebro</Link>
        </Button>
      </header>

      {/* key={version} → remonta el editor tras publish/restore (la versión cambia). */}
      <BlockEditor key={detail.block.version} detail={detail} versions={versions} />
    </div>
  );
}
