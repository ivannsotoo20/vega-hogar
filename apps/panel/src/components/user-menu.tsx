'use client';

import Link from 'next/link';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/lib/actions/auth';

interface Props {
  userEmail: string | null;
}

/**
 * Dropdown de cuenta en el header del shell. Avatar circular con iniciales del
 * email. Logout vía server action `logout` (signOut + redirect a /login).
 */
export function UserMenu({ userEmail }: Props) {
  const initials = computeInitials(userEmail);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full bg-primary/10 text-primary hover:bg-primary/15 font-semibold text-xs uppercase"
          aria-label="Menú de cuenta"
        >
          {initials}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        {userEmail ? (
          <>
            <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
              <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                Sesión
              </span>
              <span className="text-xs font-medium truncate">{userEmail}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="cursor-pointer">
            <UserIcon className="size-4" />
            Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void logout();
          }}
          className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function computeInitials(email: string | null): string {
  if (!email) return 'V';
  const local = email.split('@')[0] ?? '';
  if (!local) return 'V';
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}
