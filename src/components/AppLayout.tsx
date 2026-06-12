import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "./CommandPalette";
import { InspectPanel } from "./InspectPanel";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";

export function AppLayout() {
  return (
    <SidebarProvider>
      <CommandPalette />
      <InspectPanel />
      <AppSidebar />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <header className="flex h-12 items-center border-b border-border px-4 md:hidden">
          <SidebarTrigger />
        </header>
        {/* main is viewport-bounded: full-bleed pages (Queue) pin their own
            decision bar and scroll panes internally; plain pages scroll here. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
