'use client';

import { useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { deleteLabel, type LabelAdminRow } from '@/lib/actions/labels';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: LabelAdminRow;
}

export function DeleteLabelDialog({ open, onOpenChange, label }: Props) {
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const res = await deleteLabel(label.id);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success(`Etiqueta «${label.name}» eliminada`);
      onOpenChange(false);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar etiqueta «{label.name}»</AlertDialogTitle>
          <AlertDialogDescription>
            Se borrará la etiqueta y se quitará de las {label.conversationCount} conversaciones que
            la tienen aplicada. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={pending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
