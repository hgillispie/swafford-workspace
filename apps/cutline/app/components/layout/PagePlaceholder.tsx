import { type Icon } from "@tabler/icons-react";

import { PageHeader } from "./PageHeader";

export function PagePlaceholder({
  name,
  icon: PlaceholderIcon,
}: {
  name: string;
  icon: Icon;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center text-center">
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl border border-dashed border-border bg-card text-muted-foreground">
            <PlaceholderIcon size={20} stroke={1.6} aria-hidden />
          </span>
          <h1 className="text-[14px] font-medium text-foreground">
            {name} isn't built yet
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Keep prompting to design and build this page.
          </p>
        </div>
      </div>
    </div>
  );
}
