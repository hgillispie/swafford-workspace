import { OrgSwitcher } from "@agent-native/toolkit/app/org";
import {
  IconLayoutGrid,
  IconPalette,
  IconTemplate,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { Link, NavLink } from "react-router";

import { cn } from "@/lib/utils";

import { BrandMark } from "./BrandMark";

const NAV: Array<{ to: string; label: string; icon: Icon; end?: boolean }> = [
  { to: "/", label: "Projects", icon: IconLayoutGrid, end: true },
  { to: "/shared", label: "Shared with me", icon: IconUsers },
  { to: "/templates", label: "Templates", icon: IconTemplate },
  { to: "/brand-kit", label: "Brand kit", icon: IconPalette },
];

export function AppSidebar() {
  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link
          to="/"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <BrandMark />
        </Link>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
        {NAV.map(({ to, label, icon: ItemIcon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <ItemIcon
                  size={17}
                  stroke={1.75}
                  className={cn(
                    "shrink-0",
                    isActive ? "text-primary" : "opacity-80",
                  )}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border p-2">
        <OrgSwitcher
          reserveSpace
          className="h-11 w-full min-w-0 rounded-md bg-transparent px-2.5 text-[13px] text-sidebar-accent-foreground hover:bg-sidebar-accent"
        />
      </div>
    </div>
  );
}
