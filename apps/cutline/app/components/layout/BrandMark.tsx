import { appPath } from "@agent-native/core/client/api-path";

import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  withName = true,
}: {
  className?: string;
  withName?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <img
        src={appPath("/favicon.svg")}
        alt=""
        className="size-6 shrink-0 rounded-[6px]"
      />
      {withName ? (
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          {APP_TITLE}
        </span>
      ) : null}
    </span>
  );
}
