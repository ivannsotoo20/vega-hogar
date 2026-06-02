import { redirect } from 'next/navigation';
import { getEffectiveTenant } from '@/lib/auth/effective-tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { AnimatedPageShell } from '@/components/animated-page-shell';

export const dynamic = 'force-dynamic';

/**
 * App shell — todo lo que cuelga del grupo (app)/ vive bajo sidebar + topbar.
 * Auth gating duplicado del middleware (defense in depth). El contexto sale del
 * shim `getEffectiveTenant()` (anon + RLS, sin service-role).
 *
 * NOTA F3: ScopeSwitcher + ImpersonateBanner (chrome del agency multi-tenant)
 * se difieren a F9, cuando entre el admin de agencia con cross-tenant real.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getEffectiveTenant();
  if (!ctx) redirect('/login');

  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const canManageTenant =
    ctx.isAgencyAdmin || ctx.role === 'admin' || ctx.role === 'director_general';

  return (
    <SidebarProvider>
      <AppSidebar
        tenantName={tenant?.name ?? tenant?.slug ?? null}
        isAgencyAdmin={ctx.isAgencyAdmin}
        canManageTenant={canManageTenant}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-md px-4 md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu userEmail={ctx.email} />
        </header>
        <main className="flex-1 min-w-0 flex flex-col p-6 md:p-8">
          <AnimatedPageShell>{children}</AnimatedPageShell>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
