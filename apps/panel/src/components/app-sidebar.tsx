'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Brain,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  Clock,
  Handshake,
  KeyRound,
  Kanban,
  LayoutDashboard,
  MessageSquare,
  Plug,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  User,
  UserCog,
  Users,
} from 'lucide-react';
import { VegaLogo } from '@/components/branding/vega-logo';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  /** Sub-header visible. Undefined = items sueltos sin agrupar. */
  label?: string;
  items: NavItem[];
}

const NAV_OPERACION: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversaciones', icon: MessageSquare },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/properties', label: 'Inmuebles', icon: Building2 },
  { href: '/captacion', label: 'Captación', icon: Handshake },
  { href: '/visits', label: 'Visitas', icon: CalendarCheck },
];

const NAV_AGENCIA: NavItem[] = [
  { href: '/admin/dashboard', label: 'Resumen agencia', icon: Building2 },
  { href: '/admin/tenants', label: 'Inmobiliarias', icon: Users },
  { href: '/admin/admins', label: 'Admins Fyzon', icon: ShieldCheck },
  { href: '/admin/cerebro', label: 'Cerebro (prompts)', icon: Brain },
  { href: '/admin/permisos', label: 'Permisos', icon: KeyRound },
];

/** Entradas de Configuración agrupadas. `canManageTenant` oculta config sensible. */
function buildConfigGroups(canManageTenant: boolean): NavGroup[] {
  const groups: NavGroup[] = [];

  const topItems: NavItem[] = [{ href: '/settings/profile', label: 'Perfil', icon: User }];
  if (canManageTenant) {
    topItems.push({ href: '/settings/integrations', label: 'Integraciones', icon: Plug });
  }
  groups.push({ items: topItems });

  groups.push({
    label: 'Automatización',
    items: [
      { href: '/keywords', label: 'Palabras clave', icon: Sparkles },
      { href: '/labels', label: 'Etiquetas', icon: Tag },
      { href: '/settings/followup-templates', label: 'Seguimientos', icon: Clock },
    ],
  });

  groups.push({
    label: 'Agenda',
    items: [{ href: '/calendars', label: 'Calendarios', icon: CalendarDays }],
  });

  groups.push({
    label: 'Equipo',
    items: [{ href: '/settings/members', label: 'Miembros', icon: UserCog }],
  });

  if (canManageTenant) {
    groups.push({
      items: [{ href: '/settings/preferences', label: 'Preferencias', icon: Sliders }],
    });
  }

  return groups;
}

interface Props {
  tenantName?: string | null;
  isAgencyAdmin?: boolean;
  /** Admin/director del tenant o agency-admin → puede ver config sensible. */
  canManageTenant?: boolean;
}

export function AppSidebar({ tenantName, isAgencyAdmin = false, canManageTenant = true }: Props) {
  const pathname = usePathname();
  const configGroups = buildConfigGroups(canManageTenant);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <VegaLogo variant="mark" className="size-8" />
                <div className="flex flex-col gap-0.5 leading-none min-w-0 flex-1">
                  <span className="font-serif font-semibold truncate tracking-tight">
                    Vega Hogar
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {tenantName ?? 'Inmobiliaria'}
                  </span>
                </div>
                {isAgencyAdmin ? <ShieldCheck className="size-4 text-primary shrink-0" /> : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_OPERACION.map((item) => (
                <NavItemRow key={item.href} item={item} active={isActive(pathname, item.href)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <ConfigCollapsibleItem groups={configGroups} pathname={pathname} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAgencyAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>Agencia</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_AGENCIA.map((item) => (
                  <NavItemRow key={item.href} item={item} active={isActive(pathname, item.href)} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-center gap-2 px-2 py-2 group-data-[collapsible=icon]:px-0">
          <VegaLogo variant="mark" className="size-6 shrink-0" />
          <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="text-xs font-semibold tracking-tight">Vega Hogar</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Inmobiliaria · v0.3
            </span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavItemRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link href={item.href}>
          <Icon className="size-4" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ConfigCollapsibleItem({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  const allItems = groups.flatMap((g) => g.items);
  const anySubActive = allItems.some((item) => isActive(pathname, item.href));
  return (
    <Collapsible defaultOpen={anySubActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip="Configuración">
            <Settings className="size-4" />
            <span>Configuración</span>
            <ChevronDown className="ml-auto size-4 transition-transform duration-150 group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {groups.map((group, gIdx) => (
              <ConfigGroupBlock
                key={group.label ?? `_g${gIdx}`}
                group={group}
                pathname={pathname}
                isFirst={gIdx === 0}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function ConfigGroupBlock({
  group,
  pathname,
  isFirst,
}: {
  group: NavGroup;
  pathname: string;
  isFirst: boolean;
}) {
  return (
    <>
      {group.label ? (
        <li
          className={cn(
            'px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 select-none',
            isFirst ? 'pt-1' : 'pt-3',
          )}
          aria-hidden
        >
          {group.label}
        </li>
      ) : null}
      {group.items.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <SidebarMenuSubItem key={item.href}>
            <SidebarMenuSubButton asChild isActive={active}>
              <Link href={item.href}>
                <Icon className="size-4" />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
    </>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
