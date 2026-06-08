'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addPropertyPhoto,
  removePropertyPhoto,
  reorderPropertyPhotos,
} from '@/lib/actions/properties';
import type { PropertyPhotoRow } from '@/lib/property-list-query';

export function PropertyGallery({
  propertyId,
  photos,
  canEdit,
}: {
  propertyId: number;
  photos: PropertyPhotoRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? 'Error');
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  };

  function addPhoto() {
    const trimmed = url.trim();
    if (!trimmed) return;
    run(
      () => addPropertyPhoto({ propertyId, url: trimmed, caption: caption.trim() || null }),
      'Foto añadida',
    );
    setUrl('');
    setCaption('');
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...photos];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    run(
      () => reorderPropertyPhotos({ propertyId, orderedPhotoIds: next.map((p) => p.id) }),
      'Orden actualizado',
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {photos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin fotos todavía.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((photo, idx) => (
            <li key={photo.id} className="group relative overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- URLs externas arbitrarias (v1 sin Storage) */}
              <img
                src={photo.url}
                alt={photo.caption ?? ''}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              {photo.caption && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-[10px] text-white">
                  {photo.caption}
                </span>
              )}
              {canEdit && (
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label="Subir"
                    disabled={pending || idx === 0}
                    onClick={() => move(idx, -1)}
                    className="rounded bg-background/90 p-1 text-foreground shadow disabled:opacity-40"
                  >
                    <ArrowUp aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Bajar"
                    disabled={pending || idx === photos.length - 1}
                    onClick={() => move(idx, 1)}
                    className="rounded bg-background/90 p-1 text-foreground shadow disabled:opacity-40"
                  >
                    <ArrowDown aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar foto"
                    disabled={pending}
                    onClick={() =>
                      run(() => removePropertyPhoto({ propertyId, photoId: photo.id }), 'Foto eliminada')
                    }
                    className="rounded bg-background/90 p-1 text-destructive shadow"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-xs font-medium text-foreground">Añadir foto por URL</p>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            inputMode="url"
          />
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Pie de foto (opcional)"
            maxLength={200}
          />
          <div>
            <Button size="sm" onClick={addPhoto} disabled={pending || !url.trim()}>
              {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <ImagePlus aria-hidden />}
              Añadir foto
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
