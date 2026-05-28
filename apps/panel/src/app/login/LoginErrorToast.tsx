'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Email no válido. Revisa el formato.',
  inactive: 'Tu cuenta está desactivada. Contacta con un administrador.',
  no_profile: 'No encontramos tu perfil en el sistema. Contacta con un administrador.',
  forbidden: 'No tienes permiso para acceder a esa sección.',
  missing_code: 'El enlace de acceso no es válido. Pide uno nuevo.',
  invalid_code: 'El enlace ha caducado o ya fue usado. Pide uno nuevo.',
};

export function LoginErrorToast() {
  const params = useSearchParams();
  const error = params.get('error');

  useEffect(() => {
    if (!error) return;
    const msg = ERROR_MESSAGES[error] ?? 'Ha ocurrido un error inesperado.';
    toast.error(msg);
  }, [error]);

  return null;
}
