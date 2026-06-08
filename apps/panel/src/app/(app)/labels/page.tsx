import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { ROLE_HIERARCHY } from '@/lib/auth/types';
import { listLabelsAdmin } from '@/lib/actions/labels';
import { listMembers } from '@/lib/actions/members';
import { AddLabelDialog } from '@/components/labels/add-label-dialog';
import { LabelsList } from '@/components/labels/labels-list';

export const dynamic = 'force-dynamic';

export default async function LabelsPage() {
  const eff = await getEffectiveTenant();
  if (!eff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin tenant asignado</CardTitle>
          <CardDescription>Tu cuenta no tiene una agencia asociada. Contacta con un administrador.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // labels.manage = admin / director_general (matriz + RLS tenant_labels).
  const canManage = ROLE_HIERARCHY[eff.role] >= ROLE_HIERARCHY.director_general;

  const [labelsRes, membersRes] = await Promise.all([listLabelsAdmin(), listMembers()]);
  const labels = labelsRes.ok ? labelsRes.data : [];
  const members = membersRes.ok ? membersRes.data : [];

  const systemCount = labels.filter((l) => l.isSystem).length;
  const customCount = labels.length - systemCount;
  const totalApplied = labels.reduce((acc, l) => acc + l.conversationCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Configuración</p>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Etiquetas</h1>
        </div>
        {canManage ? <AddLabelDialog members={members} /> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Etiquetas del sistema</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{systemCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Lead caliente / Visita agendada / Comprado / Alquilado… Preconfiguradas, no se borran.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Etiquetas propias</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{customCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Las que crea la agencia para clasificar leads (ej. «Objeción precio», «VIP»).
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Aplicaciones totales</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{totalApplied}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Suma de conversaciones etiquetadas (cada etiqueta cuenta por separado).
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Etiquetas configuradas ({labels.length})</CardTitle>
          <CardDescription>
            {canManage
              ? 'Las etiquetas del sistema están preconfiguradas (no se borran). Crea las tuyas para clasificar y, con buckets terminales, alimentar las columnas del pipeline.'
              : 'Catálogo de etiquetas de la agencia. Solo los gestores (dirección) pueden crearlas o editarlas.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!labelsRes.ok ? (
            <p className="text-sm text-destructive">Error: {labelsRes.error}</p>
          ) : labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin etiquetas todavía{canManage ? ' — pulsa «Nueva etiqueta».' : '.'}
            </p>
          ) : (
            <LabelsList labels={labels} members={members} canManage={canManage} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
