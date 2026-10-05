import { IconUsers } from "@tabler/icons-react";

import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Shared with me · ${APP_TITLE}` }];
}

export default function SharedRoute() {
  return <PagePlaceholder name="Shared with me" icon={IconUsers} />;
}
