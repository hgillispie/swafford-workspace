import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import { IconMenu2, IconMessageCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useMobileNav } from "./mobile-nav";

export function AgentButton({ className }: { className?: string }) {
  return (
    <AgentToggleButton
      className={cn("w-auto gap-1.5 px-2.5 text-[13px] font-medium", className)}
      icon={
        <>
          <IconMessageCircle size={16} stroke={1.8} aria-hidden />
          <span>Agent</span>
        </>
      }
    />
  );
}

export function PageHeader({
  children,
  actions,
  className,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const mobileNav = useMobileNav();
  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-3 md:px-6",
        className,
      )}
    >
      {mobileNav ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={mobileNav.open}
        >
          <IconMenu2 size={18} />
        </Button>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <AgentButton />
      </div>
    </header>
  );
}
