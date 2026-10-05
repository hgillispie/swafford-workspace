import { HeaderActionsProvider } from "@agent-native/toolkit/app-shell";
import { AgentSidebar } from "@agent-native/toolkit/app/chat";
import { isSettingsPathname } from "@agent-native/toolkit/app/settings";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { projectIdFromPath } from "@/hooks/use-navigation-state";
import { TAB_ID } from "@/lib/tab-id";

import { AppSidebar } from "./AppSidebar";
import { MobileNavContext } from "./mobile-nav";

const EDITOR_SUGGESTIONS = [
  "Remove the filler words",
  "Shorten the long pauses",
  "Write show notes for this episode",
  "Find the strongest 30-second clip",
];

const LIBRARY_SUGGESTIONS = [
  "Open my most recent project",
  "Which projects still need a transcript?",
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isEditor = projectIdFromPath(pathname) !== null;
  const showRail = !isEditor && !isSettingsPathname(pathname);
  const mobileNav = useMemo(() => ({ open: () => setMobileNavOpen(true) }), []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <HeaderActionsProvider>
      <MobileNavContext.Provider value={showRail ? mobileNav : null}>
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
          {showRail ? (
            <aside className="hidden w-60 shrink-0 border-r border-sidebar-border md:flex">
              <AppSidebar />
            </aside>
          ) : null}
          {showRail ? (
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SheetDescription className="sr-only">
                  Cutline sections
                </SheetDescription>
                <AppSidebar />
              </SheetContent>
            </Sheet>
          ) : null}
          <AgentSidebar
            position="right"
            storageKey="cutline"
            browserTabId={TAB_ID}
            defaultSidebarWidth={400}
            agentPageHref="/settings/agent"
            emptyStateText={
              isEditor ? "How can I help with this edit?" : "How can I help?"
            }
            suggestions={isEditor ? EDITOR_SUGGESTIONS : LIBRARY_SUGGESTIONS}
          >
            <main className="agent-native-app-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </main>
          </AgentSidebar>
        </div>
      </MobileNavContext.Provider>
    </HeaderActionsProvider>
  );
}
