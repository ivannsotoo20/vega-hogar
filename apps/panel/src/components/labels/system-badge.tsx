'use client';

import { Lock } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function SystemBadge() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-4 items-center gap-0.5 rounded-sm bg-muted px-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground cursor-help">
            <Lock className="size-2.5" />
            sistema
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Etiqueta del sistema. No se puede borrar ni renombrar; sí editar color, descripción
          y acciones (pausar IA, asignar).
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
