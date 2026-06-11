'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { BlockDetail, VersionRef } from '@/lib/cerebro-list-query';
import {
  discardDraft,
  loadVersionContent,
  publishDraft,
  restoreVersion,
  saveDraft,
} from '@/lib/actions/cerebro';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  detail: BlockDetail;
  versions: VersionRef[];
}

const AUTOSAVE_MS = 900;

/**
 * Editor de un bloque del Cerebro. Decisión F9 #1/#1b: PUBLICAR YA con
 * BD-como-fuente-de-verdad. Autosave del borrador (prompt_block_drafts) +
 * publicar (snapshot de versión + UPDATE prompt_blocks) + restaurar versión.
 *
 * La página remonta el editor con `key={block.version}` tras publish/restore
 * (la versión cambia), así que el estado local se reinicia desde el activo nuevo.
 * El descarte (versión no cambia) se reconcilia localmente.
 */
export function BlockEditor({ detail, versions }: Props) {
  const router = useRouter();
  const { block, activeContent, draft } = detail;

  const [content, setContent] = useState(draft?.content ?? activeContent);
  const [baseVersion, setBaseVersion] = useState(draft?.baseVersion ?? block.version);
  const [hasDraft, setHasDraft] = useState(draft != null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [changeSummary, setChangeSummary] = useState('');
  const [isPending, startTransition] = useTransition();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = content !== activeContent || hasDraft;

  // Autosave debounced del borrador. Solo persiste si el contenido difiere del
  // activo o ya hay borrador (no crea borradores no-op).
  function persistDraft(value: string) {
    if (value === activeContent && !hasDraft) {
      setSaveState('idle');
      return;
    }
    setSaveState('saving');
    startTransition(async () => {
      const res = await saveDraft({
        blockKey: block.blockKey,
        tenantId: block.tenantId,
        content: value,
        baseVersion,
      });
      if (res.ok) {
        setHasDraft(true);
        setSaveState('saved');
      } else {
        setSaveState('error');
        toast.error(`No se pudo guardar el borrador: ${res.error}`);
      }
    });
  }

  function onContentChange(value: string) {
    setContent(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persistDraft(value), AUTOSAVE_MS);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function onLoadVersion(versionId: string) {
    const id = Number(versionId);
    if (!Number.isFinite(id)) return;
    startTransition(async () => {
      const res = await loadVersionContent(id);
      if (res.ok && res.data) {
        setContent(res.data.content);
        // Marca como borrador (se autoguarda) para poder publicar desde aquí.
        if (timer.current) clearTimeout(timer.current);
        persistDraft(res.data.content);
        toast.message(`Cargada v${res.data.versionNumber} en el editor`);
      } else if (!res.ok) {
        toast.error(`No se pudo cargar la versión: ${res.error}`);
      }
    });
  }

  function onRestore(versionId: number, versionNumber: number) {
    startTransition(async () => {
      const res = await restoreVersion({ versionId });
      if (res.ok) {
        toast.success(`Restaurada v${versionNumber} → nueva v${res.data?.newVersionNumber}`);
        router.refresh();
      } else {
        toast.error(`No se pudo restaurar: ${res.error}`);
      }
    });
  }

  function onPublish() {
    startTransition(async () => {
      const res = await publishDraft({
        blockKey: block.blockKey,
        tenantId: block.tenantId,
        changeSummary: changeSummary.trim() || null,
      });
      if (res.ok) {
        toast.success(`Publicado → v${res.data?.newVersionNumber}`);
        setChangeSummary('');
        router.refresh();
      } else if (res.error === 'version_conflict') {
        toast.error('La versión cambió desde tu borrador. Recarga la página.');
      } else if (res.error === 'no_draft') {
        toast.error('No hay cambios que publicar.');
      } else {
        toast.error(`No se pudo publicar: ${res.error}`);
      }
    });
  }

  function onDiscard() {
    startTransition(async () => {
      const res = await discardDraft({ blockKey: block.blockKey, tenantId: block.tenantId });
      if (res.ok) {
        setContent(activeContent);
        setBaseVersion(block.version);
        setHasDraft(false);
        setSaveState('idle');
        toast.success('Borrador descartado');
        router.refresh();
      } else {
        toast.error(`No se pudo descartar: ${res.error}`);
      }
    });
  }

  const saveLabel =
    saveState === 'saving'
      ? 'Guardando…'
      : saveState === 'saved'
        ? 'Borrador guardado'
        : saveState === 'error'
          ? 'Error al guardar'
          : hasDraft
            ? 'Borrador sin publicar'
            : 'Sin cambios';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-xs">{block.blockKey}</span>
        {block.scope === 'shared' ? (
          <Badge variant="secondary">Compartido</Badge>
        ) : (
          <Badge variant="outline">Tenant {block.tenantId}</Badge>
        )}
        <Badge variant="outline" className="font-mono">
          v{block.version}
        </Badge>
        {hasDraft ? (
          <Badge className="bg-[var(--color-brand-terracota)] text-white hover:bg-[var(--color-brand-terracota)]">
            Borrador
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">{saveLabel}</span>
      </div>

      <Textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        spellCheck={false}
        rows={20}
        className="font-mono text-xs leading-relaxed"
        placeholder="Contenido del bloque de prompt…"
        disabled={isPending && saveState === 'saving'}
      />

      <div className="flex flex-wrap items-center gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={!dirty || isPending}>Publicar</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publicar bloque {block.blockKey}</AlertDialogTitle>
              <AlertDialogDescription>
                Se guardará una nueva versión (snapshot) y el contenido activo pasará a usarse
                en el agente. {block.scope === 'shared' ? 'Afecta a TODAS las inmobiliarias.' : `Afecta solo al tenant ${block.tenantId}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2 py-2">
              <Label htmlFor="change-summary">Resumen del cambio (opcional)</Label>
              <Input
                id="change-summary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Ej.: ajuste de tono de apertura"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onPublish}>Publicar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button variant="outline" onClick={onDiscard} disabled={!hasDraft || isPending}>
          Descartar borrador
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Historial:</span>
          <Select onValueChange={onLoadVersion} disabled={versions.length === 0 || isPending}>
            <SelectTrigger className="w-[220px]">
              <SelectValue
                placeholder={versions.length === 0 ? 'Sin versiones' : 'Cargar una versión…'}
              />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  v{v.versionNumber} · {new Date(v.changedAt).toLocaleString('es-ES')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {versions.length > 0 ? (
        <div className="rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="p-2 font-medium">Versión</th>
                <th className="p-2 font-medium">Fecha</th>
                <th className="p-2 font-medium">Resumen</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="p-2 font-mono">v{v.versionNumber}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {new Date(v.changedAt).toLocaleString('es-ES')}
                  </td>
                  <td className="p-2 text-xs">{v.changeSummary ?? '—'}</td>
                  <td className="p-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => onRestore(v.id, v.versionNumber)}
                    >
                      Restaurar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
