import {
  LayoutGrid,
  ListChecks,
  CheckCheck,
  Shield,
  List as ListIcon,
  MessageSquare,
  Users,
  Settings,
  Search,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { openCommandPalette } from "@/components/CommandPalette";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
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
  useSidebar,
} from "./ui/sidebar";

// Intent groups (design IA: Work · Policy · System). Routes are kept stable —
// labels were renamed per the redesign (Dashboard→Overview, Log→Decisions,
// Users→Team).
const NAV_GROUPS: {
  group: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; match?: (p: string, s: string) => boolean }[];
}[] = [
  {
    group: "Work",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutGrid },
      { href: "/queue", label: "Queue", icon: ListChecks },
      { href: "/moderation-log", label: "Decisions", icon: CheckCheck },
    ],
  },
  {
    group: "Policy",
    items: [
      { href: "/rules", label: "Rules", icon: Shield },
      { href: "/lists", label: "Lists", icon: ListIcon },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    group: "System",
    items: [{ href: "/team", label: "Team", icon: Users }],
  },
];

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  badge,
  hot,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  badge?: number;
  hot?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link to={href} onClick={() => setOpenMobile(false)}>
          <Icon />
          <span>{label}</span>
          {badge !== undefined && badge > 0 && (
            <span
              className={`num ml-auto min-w-[20px] rounded-[4px] border px-1.5 text-center text-[11px] font-semibold leading-[17px] ${
                hot
                  ? "border-je-ink bg-je-ink text-background"
                  : "border-border bg-je-surface text-je-ink-2"
              }`}
            >
              {badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarNav() {
  const location = useLocation();
  const { data: stats } = useApiQuery(apiClient.listings.stats, undefined, { pollMs: 7000 });
  const manualCount = stats?.manual || 0;

  return (
    <SidebarContent>
      {NAV_GROUPS.map((g) => (
        <SidebarGroup key={g.group}>
          <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {g.items.map((item) => {
                const isActive = item.match
                  ? item.match(location.pathname, location.search)
                  : location.pathname === item.href;
                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={isActive}
                    badge={item.href === "/queue" ? manualCount : undefined}
                    hot={item.href === "/queue"}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  );
}

function SidebarUserMenu() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme, switchable } = useTheme();
  const { setOpenMobile } = useSidebar();
  const location = useLocation();
  const isSettingsActive = location.pathname === "/settings" && !location.search.includes("tab=team");

  return (
    <SidebarFooter className="border-t border-sidebar-border">
      <SidebarMenu>
        {/* ⌘K Inspect — persistent command-palette entry (design IA: "Everywhere"). */}
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => openCommandPalette()}
            className="border border-border bg-je-surface text-je-ink-2"
          >
            <Search />
            <span>Inspect or jump…</span>
            <span className="num ml-auto font-mono text-[10px] text-je-ink-3">⌘K</span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isSettingsActive}>
            <Link to="/settings" onClick={() => setOpenMobile(false)}>
              <Settings />
              <span>Settings</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg">
                <Avatar className="size-8 rounded-none">
                  <AvatarFallback className="rounded-none bg-je-ink text-background text-sm font-semibold">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium truncate">{user?.name || "User"}</span>
                  <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-[--radix-dropdown-menu-trigger-width]">
              {switchable && (
                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
                  {theme === "light" ? "Dark mode" : "Light mode"}
                </DropdownMenuItem>
              )}
              {switchable && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={() => signOut()}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

function SidebarHeaderContent() {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarHeader className="border-b border-sidebar-border">
      <Link to="/dashboard" onClick={() => setOpenMobile(false)} className="flex flex-col gap-1 px-2 py-2">
        <span className="font-serif text-[27px] font-medium leading-none tracking-[0.02em]">
          Feed<span className="text-je-teal">Lens</span>
        </span>
        <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-je-ink-3">
          JamesEdition · T&amp;S
        </span>
      </Link>
    </SidebarHeader>
  );
}

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeaderContent />
      <SidebarNav />
      <SidebarUserMenu />
    </Sidebar>
  );
}
