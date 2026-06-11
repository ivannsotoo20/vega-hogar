import { EnConstruccion } from '@/components/en-construccion';
import { IntegrationsInfoSection } from '@/components/settings/integrations-info';
import { MembersSection } from '@/components/settings/members-section';
import { ProfileSection } from '@/components/settings/profile-section';
import { SettingsIndex } from '@/components/settings/settings-index';

export const dynamic = 'force-dynamic';

/**
 * Settings dispatch (F9). El optional catch-all `[[...slug]]` resuelve /settings y
 * sus sub-rutas (no se pueden tener `settings/page.tsx` + catch-all → conflicto de
 * especificidad). Cada sección es un server component que gatea por su cuenta.
 * Las hrefs aún no construidas (preferences, followup-templates, calendars) caen en
 * el fallback EnConstruccion hasta su fase.
 */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const section = slug?.[0] ?? '';

  switch (section) {
    case '':
      return <SettingsIndex />;
    case 'profile':
      return <ProfileSection />;
    case 'integrations':
      return <IntegrationsInfoSection />;
    case 'members':
      return <MembersSection />;
    default:
      return <EnConstruccion titulo="Ajustes" fase="9" />;
  }
}
