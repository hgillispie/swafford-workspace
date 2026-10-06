import { signOut } from "@agent-native/core/client";
import { HeaderActionsProvider } from "@agent-native/toolkit/app-shell";
import {
  AgentSidebar,
  AgentToggleButton,
} from "@agent-native/toolkit/app/chat";
import {
  IconBrandYoutube,
  IconChevronDown,
  IconLogout,
  IconMessageCircle,
  IconVideo,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TAB_ID } from "@/lib/tab-id";

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const onProject = location.pathname.startsWith("/projects/");

  return (
    <HeaderActionsProvider>
      <AgentSidebar
        position="right"
        storageKey="opus-agent"
        browserTabId={TAB_ID}
        emptyStateText="What are you working on?"
        composerPlaceholder="Ask about your video or clip ideas…"
        defaultOpen={false}
      >
        <div className="studio-shell flex h-dvh min-h-0 w-full overflow-hidden bg-background text-foreground">
          <aside className="studio-nav hidden w-60 shrink-0 flex-col border-r border-white/10 lg:flex">
            <Link
              to="/"
              className="flex h-20 items-center gap-3 px-7 text-white"
              aria-label="Opus home"
            >
              <span className="brand-mark" aria-hidden="true">
                <span />
                <span />
              </span>
              <span className="text-[18px] font-bold tracking-[-0.055em]">
                Op<span className="text-primary">us</span>
                <span className="ml-1 align-top text-[10px] font-medium tracking-normal text-white/40">
                  STUDIO
                </span>
              </span>
            </Link>

            <div className="px-4 pt-8">
              <div className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Workspace
              </div>
              <Link
                to="/"
                className="studio-nav-link studio-nav-link-active flex items-center gap-3 px-3 py-2.5 text-sm font-medium"
              >
                <IconVideo size={18} stroke={1.8} aria-hidden />
                Studio
              </Link>
              <Link
                to="/#projects"
                className="studio-nav-link mt-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium"
              >
                <IconBrandYoutube size={18} stroke={1.8} aria-hidden />
                Projects
              </Link>
            </div>

            <div className="mt-auto border-t border-white/10 p-4">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-white/70 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="flex size-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold text-white">
                    OP
                  </span>
                  <span className="flex-1 text-sm">Account</span>
                  <IconChevronDown size={16} aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => void signOut()}>
                      <IconLogout size={16} aria-hidden /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-5 sm:px-8 lg:h-20 lg:px-10">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  to="/"
                  className="flex items-center gap-2 text-base font-bold tracking-[-0.055em] lg:hidden"
                  aria-label="Opus home"
                >
                  <span
                    className="brand-mark brand-mark-small"
                    aria-hidden="true"
                  >
                    <span />
                    <span />
                  </span>
                  Opus
                </Link>
                <span className="hidden text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:block">
                  {onProject ? "Project workspace" : "Your workspace"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Agent workspace
                </span>
                <AgentToggleButton
                  className="!size-9 !rounded-full border border-border bg-card"
                  icon={
                    <IconMessageCircle size={18} stroke={1.8} aria-hidden />
                  }
                  showWhenOpen
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                    aria-label="Account menu"
                  >
                    OP
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => void signOut()}>
                        <IconLogout size={16} aria-hidden /> Sign out
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <main className="agent-native-app-main min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
              {children}
            </main>
          </div>
        </div>
      </AgentSidebar>
    </HeaderActionsProvider>
  );
}
