'use client';

import { useState, useTransition } from 'react';
import {
  Check,
  Clock,
  Home,
  Pause,
  Pencil,
  Play,
  Plus,
  UserCog,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  getMaxPhase,
  getUniqueLabels,
  isLeadAiPaused,
  type LeadIntent,
} from '@/lib/lead-list-query';
import {
  addLeadNote,
  applyLeadLabel,
  assignLead,
  removeLeadLabel,
  togglePauseLead,
  updateLead,
  type LeadDetail as LeadDetailData,
} from '@/lib/actions/leads';
import type { LabelOption } from '@/lib/actions/labels';
import type { MemberOption } from '@/lib/actions/members';

import { LeadGdprActions } from './lead-gdpr-actions';
import {
  channelLabel,
  formatEur,
  formatShortDate,
  initials,
  intentBadgeVariant,
  intentLabel,
  statusLabel,
} from './format';

const INTENTS: LeadIntent[] = ['buyer', 'tenant', 'seller', 'landlord', 'unknown'];
const PROP_TYPE_LABEL: Record<string, string> = { sale: 'Compra', rent: 'Alquiler' };

const EVENT_LABEL: Record<string, string> = {
  phase_change: 'Cambio de fase',
  outcome_applied: 'Etiqueta aplicada',
  outcome_removed: 'Etiqueta retirada',
};

export function LeadDetail({
  detail,
  members,
  labels,
  viewerId,
  canEdit,
  canManageGdpr,
  canDelete,
}: {
  detail: LeadDetailData;
  members: MemberOption[];
  labels: LabelOption[];
  viewerId: number;
  canEdit: boolean;
  canManageGdpr: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { lead, preferences, propertyInterests, events, notes } = detail;
  const [pending, startTransition] = useTransition();

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

  const paused = isLeadAiPaused(lead);
  const appliedLabels = getUniqueLabels(lead);
  const appliedIds = new Set(appliedLabels.map((l) => l.id));
  const available = labels.filter((l) => !appliedIds.has(l.id));
  const assigneeName =
    lead.assigned_to_user_id != null
      ? (members.find((m) => m.id === lead.assigned_to_user_id)?.fullName ??
        members.find((m) => m.id === lead.assigned_to_user_id)?.email ??
        `#${lead.assigned_to_user_id}`)
      : null;

  // --- Edición de datos maestros ---
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: lead.full_name ?? '',
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    intent: lead.intent,
    location: lead.location ?? '',
  });

  function saveData() {
    run(
      () =>
        updateLead({
          leadId: lead.id,
          patch: {
            full_name: form.full_name.trim() || null,
            phone: form.phone.trim(),
            email: form.email.trim() || null,
            intent: form.intent,
            location: form.location.trim() || null,
          },
        }),
      'Datos actualizados',
    );
    setEditing(false);
  }

  // --- Nota nueva ---
  const [note, setNote] = useState('');
  function addNote() {
    const content = note.trim();
    if (!content) return;
    run(() => addLeadNote({ leadId: lead.id, content }), 'Nota añadida');
    setNote('');
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
          {initials(lead.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {lead.full_name ?? 'Sin nombre'}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={intentBadgeVariant(lead.intent)}>{intentLabel(lead.intent)}</Badge>
            <Badge variant="outline">{statusLabel(lead.status)}</Badge>
            <Badge variant="secondary">Fase {getMaxPhase(lead)}</Badge>
            {lead.conversations[0] && (
              <Badge variant="ghost">{channelLabel(lead.conversations[0].channel)}</Badge>
            )}
            {paused && (
              <Badge variant="warning">
                <Pause aria-hidden /> IA en pausa
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => togglePauseLead({ leadId: lead.id, paused: !paused }),
              paused ? 'IA reanudada' : 'IA pausada',
            )
          }
        >
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {paused ? 'Reanudar IA' : 'Pausar IA'}
        </Button>

        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                <UserCog aria-hidden /> {assigneeName ? `Asignado: ${assigneeName}` : 'Asignar'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
              <DropdownMenuLabel>Asignar a</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => run(() => assignLead({ leadId: lead.id, userId: null }), 'Lead sin asignar')}
              >
                Sin asignar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {members.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() =>
                    run(() => assignLead({ leadId: lead.id, userId: m.id }), `Asignado a ${m.fullName ?? m.email}`)
                  }
                >
                  {lead.assigned_to_user_id === m.id && <Check aria-hidden className="size-3.5" />}
                  {m.fullName ?? m.email}
                  {m.id === viewerId ? ' (yo)' : ''}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Cruce F8 → F7: dar de alta el inmueble que capta un vendedor/arrendador
            (solo do+, que es quien puede crear inmuebles). */}
        {canEdit && (lead.intent === 'seller' || lead.intent === 'landlord') && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/properties?new=1&fromLead=${lead.id}`}>
              <Home aria-hidden /> Dar de alta inmueble
            </Link>
          </Button>
        )}
      </div>

      {/* Etiquetas */}
      <div className="flex flex-wrap items-center gap-1.5">
        {appliedLabels.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2 pr-1 text-xs"
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
            {l.name}
            <button
              type="button"
              aria-label={`Quitar ${l.name}`}
              className="rounded-full p-0.5 hover:bg-muted"
              disabled={pending}
              onClick={() => run(() => removeLeadLabel({ leadId: lead.id, labelId: l.id }), 'Etiqueta retirada')}
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        {available.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" disabled={pending}>
                <Plus aria-hidden /> Etiqueta
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
              {available.map((l) => (
                <DropdownMenuItem
                  key={l.id}
                  onClick={() => run(() => applyLeadLabel({ leadId: lead.id, labelId: l.id }), 'Etiqueta aplicada')}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                  {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {appliedLabels.length === 0 && available.length === 0 && (
          <span className="text-xs text-muted-foreground">Sin etiquetas</span>
        )}
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="datos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="preferencias">Preferencias</TabsTrigger>
          <TabsTrigger value="inmuebles">Inmuebles</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
        </TabsList>

        {/* DATOS */}
        <TabsContent value="datos" className="pt-3">
          {editing ? (
            <div className="flex flex-col gap-3">
              <Field label="Nombre">
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </Field>
              <Field label="Teléfono">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Intención">
                <Select
                  value={form.intent}
                  onValueChange={(v) => setForm({ ...form, intent: v as LeadIntent })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTENTS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {intentLabel(i)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Ubicación">
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </Field>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveData} disabled={pending}>
                  <Check aria-hidden /> Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <ReadField label="Teléfono" value={lead.phone} />
              <ReadField label="Email" value={lead.email} />
              <ReadField label="Ubicación" value={lead.location} />
              <ReadField label="Intención" value={intentLabel(lead.intent)} />
              <ReadField label="Creado" value={formatShortDate(lead.created_at)} />
              {canEdit && (
                <div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil aria-hidden /> Editar datos
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* PREFERENCIAS */}
        <TabsContent value="preferencias" className="pt-3">
          {preferences.length === 0 ? (
            <Empty>Sin preferencias registradas.</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {preferences.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-medium">{PROP_TYPE_LABEL[p.type] ?? p.type}</div>
                  {p.neighborhoods.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.neighborhoods.map((n) => (
                        <Badge key={n} variant="outline">
                          {n}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <Stat k="Precio" v={priceRange(p.priceMinEur, p.priceMaxEur)} />
                    <Stat k="Habitaciones" v={p.roomsMin != null ? `≥ ${p.roomsMin}` : null} />
                    <Stat k="m²" v={p.m2Min != null ? `≥ ${p.m2Min}` : null} />
                    <Stat k="Urgencia" v={p.urgency} />
                  </dl>
                  {p.motives && <p className="mt-2 text-xs text-muted-foreground">{p.motives}</p>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* INMUEBLES */}
        <TabsContent value="inmuebles" className="pt-3">
          {propertyInterests.length === 0 ? (
            <Empty>Sin inmuebles de interés.</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {propertyInterests.map((pi) => (
                <div key={pi.propertyId} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
                  <Home aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {pi.property?.title ?? `Inmueble #${pi.propertyId}`}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {pi.property && (
                        <span>
                          {formatEur(pi.property.priceEur ?? pi.property.monthlyRentEur) ?? '—'}
                        </span>
                      )}
                      {pi.property?.rooms != null && <span>· {pi.property.rooms} hab</span>}
                      {pi.property?.m2Built != null && <span>· {pi.property.m2Built} m²</span>}
                      {pi.property?.neighborhood && <span>· {pi.property.neighborhood}</span>}
                    </div>
                  </div>
                  <Badge variant="outline">{pi.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="pt-3">
          {events.length === 0 ? (
            <Empty>Sin eventos de pipeline (visible solo para gestores).</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-start gap-2 text-sm">
                  <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <span className="font-medium">{EVENT_LABEL[ev.eventType] ?? ev.eventType}</span>{' '}
                    <span className="text-muted-foreground">
                      {ev.fromValue ? `${ev.fromValue} → ` : ''}
                      {ev.toValue}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(ev.occurredAt)} · {ev.source}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* NOTAS */}
        <TabsContent value="notas" className="pt-3">
          <div className="flex flex-col gap-3">
            {lead.conversations.length === 0 ? (
              <Empty>Sin conversación todavía — las notas se asocian a una conversación.</Empty>
            ) : (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Añade una nota interna…"
                  rows={3}
                  maxLength={4000}
                />
                <div>
                  <Button size="sm" onClick={addNote} disabled={pending || note.trim().length === 0}>
                    <Plus aria-hidden /> Añadir nota
                  </Button>
                </div>
              </div>
            )}
            {notes.length > 0 && (
              <ul className="flex flex-col gap-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="whitespace-pre-wrap">{n.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.authorEmail ?? 'Sistema'} · {formatShortDate(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {canManageGdpr && (
        <>
          <Separator />
          <LeadGdprActions
            leadId={lead.id}
            leadName={lead.full_name ?? `Lead #${lead.id}`}
            canDelete={canDelete}
          />
        </>
      )}
    </div>
  );
}

function priceRange(min: number | null, max: number | null): string | null {
  const lo = formatEur(min);
  const hi = formatEur(max);
  if (lo && hi) return `${lo} – ${hi}`;
  if (hi) return `hasta ${hi}`;
  if (lo) return `desde ${lo}`;
  return null;
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

function Stat({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <div className="flex items-center gap-1">
      <dt>{k}:</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
