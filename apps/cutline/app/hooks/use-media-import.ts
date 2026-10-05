import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import {
  clearUpload,
  failUpload,
  rememberUploadProgress,
  uploadError,
  uploadVideoFile,
} from "@/lib/import-store";
import { mediaKindOf } from "@/lib/media";

export function useMediaImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const importFile = useCallback(
    async (file: File) => {
      if (mediaKindOf(file) !== "video") {
        toast.error("Choose a video file.");
        return;
      }
      const key = `upload:${file.name}:${file.size}`;
      setPending(true);
      rememberUploadProgress(key, 0);
      try {
        const created = await uploadVideoFile(file, (ratio) =>
          rememberUploadProgress(key, ratio),
        );
        clearUpload(key);
        void queryClient.invalidateQueries({ queryKey: ["action"] });
        navigate(`/projects/${created.id}`);
      } catch (error) {
        failUpload(key, error);
        toast.error(uploadError(error));
      } finally {
        setPending(false);
      }
    },
    [navigate, queryClient],
  );

  const attachFile = useCallback(
    async (_projectId: string, file: File) => {
      await importFile(file);
    },
    [importFile],
  );

  return { importFile, attachFile, pending };
}
