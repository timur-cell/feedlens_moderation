import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import {
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sun,
  ListChecks,
  ClipboardList,
  ShieldCheck,
  MessageSquare,
  Eye,
  Users,
  Sparkles,
  ListIcon,
  SearchCheck,
  FlaskConical,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { api } from "../../convex/_generated/api";
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

const mainNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/queue", label: "Manual Queue", icon: ClipboardList },
  { href: "/moderation-log", label: "Moderation Log", icon: Eye },
];

const aiNavItems = [
  { href: "/moderate-by-id", label: "Moderate by URL", icon: SearchCheck },
  { href: "/image-recognition", label: "Image Recognition", icon: Sparkles },
];

// Settings removed from configNavItems — now lives in SidebarFooter near user block
const configNavItems = [
  { href: "/rules", label: "Rules", icon: ShieldCheck },
  { href: "/lists", label: "Lists", icon: ListIcon },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/settings?tab=team", label: "Users", icon: Users },
];

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  badge?: number;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link to={href} onClick={() => setOpenMobile(false)}>
          <Icon />
          <span>{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
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
  const stats = useQuery(api.listings.getStats);
  const manualCount = stats?.manual || 0;

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Moderation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {mainNavItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={location.pathname === item.href}
                badge={item.href === "/queue" ? manualCount : undefined}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Configuration</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {configNavItems.map((item) => {
              const isActive =
                item.href === "/settings?tab=team"
                  ? location.pathname === "/settings" && location.search.includes("tab=team")
                  : location.pathname === item.href;
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={isActive}
                />
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>AI Tools</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {aiNavItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={location.pathname === item.href}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}

function SidebarUserMenu() {
  const user = useQuery(api.auth.currentUser);
  const { signOut } = useAuthActions();
  const { theme, toggleTheme, switchable } = useTheme();
  const { setOpenMobile } = useSidebar();
  const location = useLocation();
  const isSettingsActive = location.pathname === "/settings" && !location.search.includes("tab=team");

  return (
    <SidebarFooter className="border-t border-sidebar-border">
      <SidebarMenu>
        {/* Settings link — standalone in footer near user block */}
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isSettingsActive}>
            <Link to="/settings" onClick={() => setOpenMobile(false)}>
              <Settings />
              <span>Settings</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {/* User dropdown — theme toggle + sign out only */}
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium truncate">
                    {user?.name || "User"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </span>
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-[--radix-dropdown-menu-trigger-width]"
            >
              {switchable && (
                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === "light" ? (
                    <Moon className="size-4" />
                  ) : (
                    <Sun className="size-4" />
                  )}
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
      <Link
        to="/dashboard"
        onClick={() => setOpenMobile(false)}
        className="flex items-center gap-2.5 px-2 py-1"
      >
        <div className="size-8 rounded-lg bg-blue-600 flex items-center justify-center">
          <SearchCheck className="size-4 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-lg leading-tight">
            Feed<span className="text-blue-600">Lens</span>
          </span>
          <span className="text-[10px] text-muted-foreground leading-none tracking-wide">
            moderation
          </span>
        </div>
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
