import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import { IconCopy } from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PULSE_QUERY_SETTLE_MS, pulseAsyncPhase } from "@/lib/pulse-async";
import { cn } from "@/lib/utils";

export function PulsePage({
  kicker,
  title,
  action,
  children,
}: {
  kicker: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
            {kicker}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {title}
          </h1>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

function usePulseQueryStall(pending: boolean) {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!pending) {
      setStalled(false);
      return;
    }
    const timer = window.setTimeout(
      () => setStalled(true),
      PULSE_QUERY_SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [pending]);
  return stalled;
}

export function AsyncRegion({
  pending,
  isError,
  error,
  onRetry,
  label,
  skeleton,
  children,
}: {
  pending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  label: string;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const stalled = usePulseQueryStall(pending);
  const phase = pulseAsyncPhase({ pending, stalled, isError });
  if (phase === "loading") return skeleton;
  if (phase === "error") {
    return (
      <Panel>
        <p className="text-sm">
          {actionErrorMessage(error) ?? `${label} didn't load.`}
        </p>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          type="button"
          onClick={onRetry}
        >
          Retry
        </Button>
      </Panel>
    );
  }
  return children;
}

export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-3 w-full animate-pulse rounded bg-muted" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
      <div className="flex gap-2 pt-2">
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function CopyPackButton({
  cardId,
  format,
  text,
  label,
  primary = false,
}: {
  cardId: string;
  format: "caption" | "capcut" | "descript" | "markdown";
  text: string;
  label: string;
  primary?: boolean;
}) {
  const log = useActionMutation("pulse-export-paste-pack");
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? "default" : "outline"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => toast.success(`${label} copied`),
          () => toast.error("Clipboard was blocked"),
        );
        log.mutate({ id: cardId, format });
      }}
    >
      <IconCopy className="size-3.5" />
      {label}
    </Button>
  );
}

export function CopyTextButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => toast.success(`${label} copied`),
          () => toast.error("Clipboard was blocked"),
        );
      }}
    >
      <IconCopy className="size-3.5" />
      Copy {label.toLowerCase()}
    </Button>
  );
}

export function MetaLine({
  items,
}: {
  items: Array<string | null | undefined | false>;
}) {
  const text = items.filter(Boolean).join(" · ");
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-4", className)}
    >
      {children}
    </section>
  );
}
