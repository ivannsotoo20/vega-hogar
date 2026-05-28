import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Revisa tu email · Vega Hogar Inmobiliaria',
};

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

interface PageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function CheckEmailPage({ searchParams }: PageProps) {
  const { email } = await searchParams;
  const masked = email ? maskEmail(email) : 'tu email';

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Revisa tu bandeja</CardTitle>
          <CardDescription>
            Si la cuenta existe, hemos enviado un enlace de acceso a{' '}
            <span className="font-medium">{masked}</span>. Haz click para entrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>El enlace expira en 1 hora. Mira también en spam por si acaso.</p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Volver al login</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
