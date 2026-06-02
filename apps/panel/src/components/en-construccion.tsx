import { Construction } from 'lucide-react';

interface Props {
  titulo: string;
  /** Número de fase del roadmap de port en la que se construye esta sección. */
  fase: string;
}

/**
 * Placeholder de sección aún-no-portada (Fase 3). El shell ya navega a estas
 * rutas; el contenido real llega en la fase indicada del port SETTER→Vega.
 */
export function EnConstruccion({ titulo, fase }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Construction className="size-6" />
      </span>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Esta sección se construye en la <strong>Fase {fase}</strong> del port. El
        shell ya está listo; los datos y las acciones llegan en su fase.
      </p>
    </div>
  );
}
