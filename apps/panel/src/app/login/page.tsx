import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoginErrorToast } from './LoginErrorToast';
import { requestMagicLinkAction } from './actions';

export const metadata = {
  title: 'Acceder · Vega Hogar Inmobiliaria',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={null}>
        <LoginErrorToast />
      </Suspense>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Vega Hogar Inmobiliaria</CardTitle>
          <CardDescription>
            Introduce tu email y te enviaremos un enlace de acceso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={requestMagicLinkAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="tu@email.com"
                autoComplete="email"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full">
              Enviar enlace de acceso
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
