'use client';

import { useState, useTransition } from 'react';
import { Archive, Check, Loader2, MapPin, Pencil, Trash2 } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  archiveProperty,
  deleteProperty,
  updateProperty,
  type PropertyDetail as PropertyDetailData,
} from '@/lib/actions/properties';
import type { OfficeOption } from '@/lib/actions/offices';
import type { MemberOption } from '@/lib/actions/members';
import {
  getActiveFeatures,
  type PropertyStatus,
  type PropertyType,
} from '@/lib/property-list-query';

import { PropertyGallery } from './property-gallery';
import { PropertyInterestBlock } from './property-interest-block';
import { PropertyOwnerBlock } from './property-owner-block';
import {
  FEATURE_KEYS,
  NEIGHBORHOODS,
  PROPERTY_STATUS_LABEL,
  featureLabel,
  formatShortDate,
  m2Label,
  neighborhoodLabel,
  priceLabel,
  statusBadgeVariant,
  statusLabel,
  typeBadgeVariant,
  typeLabel,
} from './format';

const TYPES: PropertyType[] = ['sale', 'rent'];
const STATUSES: PropertyStatus[] = ['available', 'reserved', 'sold', 'rented', 'inactive'];
const NO_VALUE = '__none__';

function num(s: string): number | null {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
}

export function PropertyDetail({
  detail,
  members,
  offices,
  viewerId,
  canEdit,
  canDelete,
  canViewOwners,
}: {
  detail: PropertyDetailData;
  members: MemberOption[];
  offices: OfficeOption[];
  viewerId: number;
  canEdit: boolean;
  canDelete: boolean;
  canViewOwners: boolean;
}) {
  const router = useRouter();
  const { property, photos, owners, interests } = detail;
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? 'Error');
        return;
      }
      toast.success(ok);
      after?.();
      router.refresh();
    });
  };

  const officeName = offices.find((o) => o.id === property.office_id)?.name ?? `Oficina #${property.office_id}`;
  const assigneeName =
    property.assigned_to_user_id != null
      ? (members.find((m) => m.id === property.assigned_to_user_id)?.fullName ??
        members.find((m) => m.id === property.assigned_to_user_id)?.email ??
        `#${property.assigned_to_user_id}`)
      : null;
  const activeFeatures = getActiveFeatures(property.features);

  // --- Edición ---
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: property.title,
    type: property.type,
    status: property.status,
    priceEur: property.price_eur != null ? String(property.price_eur) : '',
    monthlyRentEur: property.monthly_rent_eur != null ? String(property.monthly_rent_eur) : '',
    m2Built: String(property.m2_built),
    m2Useful: property.m2_useful != null ? String(property.m2_useful) : '',
    rooms: String(property.rooms),
    bathrooms: String(property.bathrooms),
    yearBuilt: property.year_built != null ? String(property.year_built) : '',
    neighborhood: property.neighborhood,
    addressShort: property.address_short ?? '',
    description: property.description ?? '',
    officeId: property.office_id,
    assignedToUserId: property.assigned_to_user_id,
  });
  const [feat, setFeat] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const k of getActiveFeatures(property.features)) init[k] = true;
    return init;
  });

  function saveData() {
    if (!form.title.trim()) {
      toast.error('El título es obligatorio');
      return;
    }
    const features: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(feat)) if (v) features[k] = true;
    run(
      () =>
        updateProperty({
          propertyId: property.id,
          patch: {
            title: form.title.trim(),
            type: form.type,
            status: form.status,
            priceEur: num(form.priceEur),
            monthlyRentEur: num(form.monthlyRentEur),
            m2Built: num(form.m2Built) ?? property.m2_built,
            m2Useful: num(form.m2Useful),
            rooms: num(form.rooms) ?? 0,
            bathrooms: num(form.bathrooms) ?? 0,
            yearBuilt: num(form.yearBuilt),
            neighborhood: form.neighborhood,
            addressShort: form.addressShort.trim() || null,
            description: form.description.trim() || null,
            officeId: form.officeId,
            assignedToUserId: form.assignedToUserId,
            features,
          },
        }),
      'Inmueble actualizado',
      () => setEditing(false),
    );
  }

  function doDelete() {
    run(() => deleteProperty(property.id), 'Inmueble eliminado', () => {
      setDeleteOpen(false);
      router.replace('/properties', { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">{property.title}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={typeBadgeVariant(property.type)}>{typeLabel(property.type)}</Badge>
          <Badge variant={statusBadgeVariant(property.status)}>{statusLabel(property.status)}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin aria-hidden className="size-3" /> {neighborhoodLabel(property.neighborhood)}
          </span>
        </div>
        <div className="text-xl font-semibold text-foreground">{priceLabel(property)}</div>
      </div>

      {/* Acciones */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setEditing((v) => !v)}>
            <Pencil aria-hidden /> {editing ? 'Cerrar edición' : 'Editar'}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                <Archive aria-hidden /> Cambiar estado
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Estado del inmueble</DropdownMenuLabel>
              {STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() =>
                    run(() => archiveProperty({ propertyId: property.id, status: s }), `Estado: ${statusLabel(s)}`)
                  }
                >
                  {property.status === s && <Check aria-hidden className="size-3.5" />}
                  {PROPERTY_STATUS_LABEL[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {canDelete && (
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={pending}>
                  <Trash2 aria-hidden /> Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar este inmueble</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se archivará <strong>{property.title}</strong> (soft-delete): dejará de aparecer en
                    el catálogo. Las fotos, propietarios e intereses se conservan. Reservado a
                    administradores.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="prop-del-confirm" className="text-xs">
                    Escribe <span className="font-mono font-semibold">{property.id}</span> para confirmar
                  </Label>
                  <Input
                    id="prop-del-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={String(property.id)}
                    autoComplete="off"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirmText('')}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={confirmText.trim() !== String(property.id) || pending}
                    onClick={(e) => {
                      e.preventDefault();
                      doDelete();
                    }}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      <Separator />

      <Tabs defaultValue="datos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="fotos">Fotos</TabsTrigger>
          {canViewOwners && <TabsTrigger value="propietario">Propietario</TabsTrigger>}
          <TabsTrigger value="leads">Leads interesados</TabsTrigger>
        </TabsList>

        {/* DATOS */}
        <TabsContent value="datos" className="pt-3">
          {editing && canEdit ? (
            <div className="flex flex-col gap-3">
              <Field label="Título">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PropertyType })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {typeLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Estado">
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PropertyStatus })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {form.type === 'sale' ? (
                <Field label="Precio (€)">
                  <Input
                    type="number"
                    value={form.priceEur}
                    onChange={(e) => setForm({ ...form, priceEur: e.target.value })}
                  />
                </Field>
              ) : (
                <Field label="Renta mensual (€)">
                  <Input
                    type="number"
                    value={form.monthlyRentEur}
                    onChange={(e) => setForm({ ...form, monthlyRentEur: e.target.value })}
                  />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="m² construidos">
                  <Input type="number" value={form.m2Built} onChange={(e) => setForm({ ...form, m2Built: e.target.value })} />
                </Field>
                <Field label="m² útiles">
                  <Input type="number" value={form.m2Useful} onChange={(e) => setForm({ ...form, m2Useful: e.target.value })} />
                </Field>
                <Field label="Habitaciones">
                  <Input type="number" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} />
                </Field>
                <Field label="Baños">
                  <Input type="number" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} />
                </Field>
                <Field label="Año construcción">
                  <Input type="number" value={form.yearBuilt} onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })} />
                </Field>
              </div>
              <Field label="Barrio">
                <Select value={form.neighborhood} onValueChange={(v) => setForm({ ...form, neighborhood: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEIGHBORHOODS.map((n) => (
                      <SelectItem key={n} value={n}>
                        {neighborhoodLabel(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Dirección (corta)">
                <Input value={form.addressShort} onChange={(e) => setForm({ ...form, addressShort: e.target.value })} />
              </Field>
              <Field label="Oficina">
                <Select value={String(form.officeId)} onValueChange={(v) => setForm({ ...form, officeId: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Comercial asignado">
                <Select
                  value={form.assignedToUserId == null ? NO_VALUE : String(form.assignedToUserId)}
                  onValueChange={(v) => setForm({ ...form, assignedToUserId: v === NO_VALUE ? null : Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VALUE}>Sin asignar</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.fullName ?? m.email}
                        {m.id === viewerId ? ' (yo)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Descripción">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </Field>
              <Field label="Características">
                <div className="flex flex-wrap gap-1.5">
                  {FEATURE_KEYS.map((f) => {
                    const on = feat[f] === true;
                    return (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setFeat({ ...feat, [f]: !on })}
                        className={
                          on
                            ? 'rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary'
                            : 'rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted'
                        }
                      >
                        {featureLabel(f)}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveData} disabled={pending}>
                  {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Check aria-hidden />}
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <ReadField label="Tipo" value={typeLabel(property.type)} />
              <ReadField label="Estado" value={statusLabel(property.status)} />
              <ReadField label="Precio" value={priceLabel(property)} />
              <ReadField label="Superficie" value={m2Label(property.m2_built)} />
              {property.m2_useful != null && <ReadField label="m² útiles" value={m2Label(property.m2_useful)} />}
              <ReadField label="Habitaciones" value={String(property.rooms)} />
              <ReadField label="Baños" value={String(property.bathrooms)} />
              {property.year_built != null && <ReadField label="Año" value={String(property.year_built)} />}
              <ReadField label="Barrio" value={neighborhoodLabel(property.neighborhood)} />
              <ReadField label="Dirección" value={property.address_short} />
              <ReadField label="Oficina" value={officeName} />
              <ReadField label="Comercial" value={assigneeName} />
              <ReadField label="Creado" value={formatShortDate(property.created_at)} />
              {activeFeatures.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeFeatures.map((f) => (
                    <Badge key={f} variant="outline">
                      {featureLabel(f)}
                    </Badge>
                  ))}
                </div>
              )}
              {property.description && (
                <p className="whitespace-pre-wrap pt-1 text-sm text-muted-foreground">{property.description}</p>
              )}
            </div>
          )}
        </TabsContent>

        {/* FOTOS */}
        <TabsContent value="fotos" className="pt-3">
          <PropertyGallery propertyId={property.id} photos={photos} canEdit={canEdit} />
        </TabsContent>

        {/* PROPIETARIO */}
        {canViewOwners && (
          <TabsContent value="propietario" className="pt-3">
            <PropertyOwnerBlock propertyId={property.id} owners={owners} canManage={canViewOwners} />
          </TabsContent>
        )}

        {/* LEADS INTERESADOS */}
        <TabsContent value="leads" className="pt-3">
          <PropertyInterestBlock propertyId={property.id} interests={interests} canManage />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground">{value || '—'}</span>
    </div>
  );
}
