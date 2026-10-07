import { actionErrorMessage, useActionQuery } from "@agent-native/core/client/hooks";
import { IconLoader2 } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

export function ScoutPage({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div className="flex min-h-9 items-center justify-end gap-2">
        <h1 className="sr-only">{title}</h1>
        {action}
      </div>
      <ProviderNote />
      {children}
    </div>
  );
}

export function ProviderNote() {
  const query = useActionQuery("scout-provider-status", {});
  if (query.isPending) {
    return <div className="h-10 animate-pulse rounded-md bg-muted" />;
  }
  const configured = (query.data as { configured?: boolean } | undefined)?.configured;
  if (configured !== false) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
      <span>SCRAPECREATORS_API_KEY</span>
      <Link to="/settings" className="text-primary underline">
        Add in Settings
      </Link>
    </div>
  );
}

export function RowsSkeleton() {
  return (
    <div className="grid gap-2" aria-hidden="true">
      <div className="h-16 animate-pulse rounded-md bg-muted" />
      <div className="h-16 animate-pulse rounded-md bg-muted" />
      <div className="h-16 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-sm text-destructive">{actionErrorMessage(error)}</p>;
}

export function PendingIcon({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return <IconLoader2 className="size-4 animate-spin" />;
}

export function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-md border border-border bg-card p-3">{children}</section>;
}

export async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function formatCount(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}
