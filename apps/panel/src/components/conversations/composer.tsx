'use client';

import { Lock, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Composer del thread — DESHABILITADO en F6. El envío manual real (mensaje al
 * lead vía WhatsApp/YCloud + inserción `role='human'` + pausa automática de la IA)
 * depende del motor, que llega en la Fase 10. Se muestra en solo lectura para que
 * el inbox se vea completo.
 */
export function Composer() {
  return (
    <div className="shrink-0 border-t border-border bg-background/95 p-3">
      <div className="flex items-end gap-2 opacity-60">
        <textarea
          disabled
          rows={1}
          placeholder="Responder al lead — disponible en la Fase 10 (motor + WhatsApp)…"
          className="min-h-[40px] flex-1 cursor-not-allowed resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
        <Button type="button" size="icon" disabled aria-label="Enviar (deshabilitado)">
          <Send className="size-4" />
        </Button>
      </div>
      <p className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
        <Lock className="size-3" /> Composer en solo lectura — el envío manual se activa en la Fase 10.
      </p>
    </div>
  );
}
