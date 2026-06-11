import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Catálogo informativo de integraciones (read-only en v1). La configuración real
 * (credenciales BYOK) la consume el motor → llega en F10 (WhatsApp/GHL) y F13
 * (Meta Ads). SIN ManyChat (anti-jugada del port). Gate admin/dg (`integrations.view`).
 */
const PROVIDERS = [
  { key: 'ghl', name: 'GoHighLevel (GHL)', desc: 'CRM + calendario (espejo de visitas).', phase: 'F10' },
  { key: 'ycloud', name: 'YCloud (WhatsApp BSP)', desc: 'Canal WhatsApp del agente.', phase: 'F10' },
  { key: 'meta_ads', name: 'Meta Ads', desc: 'Campañas + lead-forms (vía Composio).', phase: 'F13' },
  { key: 'zadarma', name: 'Zadarma', desc: 'Telefonía PSTN para el agente de voz.', phase: 'F12' },
  { key: 'elevenlabs', name: 'ElevenLabs', desc: 'Voz del agente (Agents + TTS).', phase: 'F12' },
];

export async function IntegrationsInfoSection() {
  await requireRole(['admin', 'director_general']);

  // Lectura opcional de cuentas ya conectadas (RLS admin/dg). Vacío hoy.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('integration_accounts')
    .select('id, provider, display_name, active');
  const connected = new Set(((data ?? []) as Array<{ provider: string }>).map((r) => r.provider));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Integraciones</h1>
        <p className="text-sm text-muted-foreground">
          Servicios que conecta el agente. La configuración de credenciales se habilita con
          el motor (F10) y Meta Ads (F13).
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <Card key={p.key}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                {connected.has(p.key) ? (
                  <Badge variant="secondary">Conectada</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">{p.phase}</Badge>
                )}
              </div>
              <CardDescription>{p.desc}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {connected.has(p.key) ? 'Configurada.' : `Configuración disponible en ${p.phase}.`}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
