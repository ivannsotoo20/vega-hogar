'use client';

import { useState, useTransition } from 'react';
import { Download, ShieldAlert, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteLeadDataAction, exportLeadDataAction } from '@/lib/actions/gdpr';

export function LeadGdprActions({
  leadId,
  leadName,
  canDelete,
}: {
  leadId: number;
  leadName: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [exporting, startExport] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirmText, setConfirmText] = useState('');
  const [open, setOpen] = useState(false);

  function exportData() {
    startExport(async () => {
      const res = await exportLeadDataAction(leadId);
      if (!res.ok) {
        toast.error(`No se pudo exportar (${res.error})`);
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lead-${leadId}-datos-gdpr.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Datos del lead exportados (JSON)');
    });
  }

  function deleteData() {
    startDelete(async () => {
      const res = await deleteLeadDataAction({ leadId, confirmation: confirmText.trim() });
      if (!res.ok) {
        toast.error(`No se pudo eliminar (${res.error})`);
        return;
      }
      toast.success('Lead y sus datos eliminados definitivamente');
      setOpen(false);
      // Cierra la ficha y refresca la lista.
      router.replace('/leads', { scroll: false });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ShieldAlert aria-hidden className="size-4 text-muted-foreground" /> Protección de datos (LOPD)
      </div>
      <p className="text-xs text-muted-foreground">
        Derechos GDPR del titular: exportar todos sus datos (acceso) o eliminarlos
        definitivamente (supresión). Solo gestores.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={exportData} disabled={exporting}>
          <Download aria-hidden /> {exporting ? 'Exportando…' : 'Exportar datos'}
        </Button>

        {canDelete && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 aria-hidden /> Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar definitivamente este lead</AlertDialogTitle>
              <AlertDialogDescription>
                Se borrarán <strong>{leadName}</strong> y todos sus datos personales
                (conversaciones, mensajes, notas, etiquetas, preferencias, visitas). La auditoría
                de coste se conserva de-identificada. Esta acción es <strong>irreversible</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gdpr-confirm" className="text-xs">
                Escribe <span className="font-mono font-semibold">{leadId}</span> para confirmar
              </Label>
              <Input
                id="gdpr-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={String(leadId)}
                autoComplete="off"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmText('')}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText.trim() !== String(leadId) || deleting}
                onClick={(e) => {
                  e.preventDefault();
                  deleteData();
                }}
              >
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        )}
      </div>
    </div>
  );
}
