import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoginErrorToast } from './LoginErrorToast';
import { PasswordLoginForm } from './PasswordLoginForm';
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
      <div className="flex w-full max-w-md flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Vega Hogar Inmobiliaria</CardTitle>
            <CardDescription>
              Introduce tu email y te enviaremos un enlace de acceso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={requestMagicLinkAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ml-email">Email</Label>
                <Input
                  id="ml-email"
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">¿Tienes contraseña?</CardTitle>
            <CardDescription>
              Acceso alternativo con email + contraseña.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordLoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
