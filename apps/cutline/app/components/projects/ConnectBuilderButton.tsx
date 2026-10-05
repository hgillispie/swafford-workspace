import {
  BuilderConnectPopover,
  useBuilderConnectFlow,
} from "@agent-native/toolkit/app/settings";
import { IconPlugConnected } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ConnectBuilderButton({
  size = "default",
  onConnected,
}: {
  size?: "default" | "sm";
  onConnected?: () => void;
}) {
  const queryClient = useQueryClient();
  const flow = useBuilderConnectFlow({
    provisionAccount: true,
    trackingSource: "cutline_media",
    trackingFlow: "media",
    onConnected: () => {
      void queryClient.invalidateQueries({
        queryKey: ["agent-native", "file-upload-status"],
      });
      onConnected?.();
    },
  });
  return (
    <BuilderConnectPopover flow={flow}>
      <Button size={size} disabled={flow.connecting}>
        {flow.connecting ? (
          <Spinner />
        ) : (
          <IconPlugConnected size={16} aria-hidden />
        )}
        {flow.connecting ? "Waiting for Builder.io…" : "Connect Builder.io"}
      </Button>
    </BuilderConnectPopover>
  );
}
