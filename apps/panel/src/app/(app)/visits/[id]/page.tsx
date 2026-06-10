import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Deep-link a una visita concreta. La ficha vive en el Sheet de `/visits`
 * (controlado por `?selected=<id>`), así que reenviamos allí (espejo de F5/F7).
 */
export default async function VisitDeepLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (/^\d+$/.test(id)) redirect(`/visits?selected=${id}`);
  redirect('/visits');
}
