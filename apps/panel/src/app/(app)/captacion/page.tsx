import { requireRole } from '@/lib/auth/requireRole';
import { CaptacionCockpit } from '@/components/captacion/captacion-cockpit';

export const dynamic = 'force-dynamic';

export default async function CaptacionPage() {
  // Gate de ruta = captacion.view ([admin, director_general, director_oficina,
  // asistente_captador]; comercial excluido). Match exacto, no jerárquico.
  await requireRole(['admin', 'director_general', 'director_oficina', 'asistente_captador']);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Captación</h1>
        <p className="text-sm text-muted-foreground">
          Funnel de vendedores y arrendadores: fases de tasación y visitas técnicas humanas.
        </p>
      </header>
      <CaptacionCockpit />
    </div>
  );
}
