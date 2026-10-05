import {
  AccountSettingsCard,
  SettingsTabsPage,
  useAgentSettingsTabs,
} from "@agent-native/toolkit/app/settings";

import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Settings · ${APP_TITLE}` }];
}

export default function SettingsRoute() {
  const agentSettingsTabs = useAgentSettingsTabs();
  return (
    <div className="h-full min-h-0">
      <SettingsTabsPage
        account={<AccountSettingsCard />}
        extraTabs={agentSettingsTabs}
      />
    </div>
  );
}
