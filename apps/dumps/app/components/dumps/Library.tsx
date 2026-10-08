import { appPath } from "@agent-native/core/client/api-path";
import {
  actionErrorMessage,
  callAction,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconFolder, IconUpload } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ensureDumpFolders,
  filesFromDrop,
  filesFromInput,
  resumeDumpFile,
  transferErrorMessage,
  uploadDumpFile,
  type DumpTransferFile,
} from "@/lib/dump-transfer";

type DumpFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt?: string;
};

type DumpFile = {
  id: string;
  folderId: string | null;
  filename: string;
  sizeBytes: number;
  contentType: string | null;
  uploaderEmail: string;
  notes: string | null;
  tags: string[];
  status: "uploading" | "ready" | "failed";
  createdAt: string;
};

type LibraryData = {
  missingEnv: string[];
  orgId?: string;
  inboxPrefix?: string;
  folder: DumpFolder | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  folders: DumpFolder[];
  files: DumpFile[];
  allFolders: DumpFolder[];
};

type Transfer = {
  key: string;
  filename: string;
  loaded: number;
  total: number;
  error?: string;
  /** Shown while the upload waits to reconnect. */
  note?: string;
};

type Preview = {
  filename: string;
  contentType: string | null;
  url: string;
};

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function previewKind(
  contentType: string | null,
): "image" | "video" | "audio" | "pdf" | null {
  if (!contentType) return null;
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf") return "pdf";
  return null;
}

export function DumpLibrary() {
  const [params, setParams] = useSearchParams();
  const folderId = params.get("folder") || undefined;
  const shareToken = params.get("share");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftFolder, setDraftFolder] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const resumeId = useRef<string | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Closing the tab ends a running upload. Warn while parts are still sending.
  const sending = transfers.some((transfer) => !transfer.error);
  useEffect(() => {
    if (!sending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  const library = useActionQuery("list-dumps", {
    ...(query ? { q: query } : {}),
    ...(folderId ? { folderId } : {}),
  });
  const data = library.data as LibraryData | undefined;
  const createFolder = useActionMutation("create-dump-folder");
  const updateFolder = useActionMutation("update-dump-folder");
  const deleteFolder = useActionMutation("delete-dump-folder");
  const updateFile = useActionMutation("update-dump");
  const deleteFile = useActionMutation("delete-dump");
  const abortUpload = useActionMutation("abort-dump-upload");
  const createShare = useActionMutation("create-dump-share");
  const openShare = useActionQuery(
    "open-dump-share",
    shareToken ? { token: shareToken } : undefined,
    { enabled: Boolean(shareToken) },
  );

  const selected = useMemo(
    () => data?.files.find((file) => file.id === selectedId) ?? null,
    [data?.files, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraftName(selected.filename);
    setDraftNotes(selected.notes ?? "");
    setDraftTags(selected.tags.join(", "));
    setDraftFolder(selected.folderId ?? "");
    setShareUrl(null);
  }, [selected]);

  useEffect(() => {
    if (!preview) return;
    previewDialog.current?.showModal();
  }, [preview]);

  function openFolder(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("folder", id);
    else next.delete("folder");
    next.delete("share");
    setParams(next);
    setSelectedId(null);
  }

  async function uploadBatch(items: DumpTransferFile[]) {
    if (items.length === 0) return;
    const cache = new Map<string, string | null>();
    const root = folderId ?? null;
    const planned: Array<
      DumpTransferFile & { key: string; folder: string | null }
    > = [];
    for (const item of items) {
      const destination = await ensureDumpFolders(
        item.relativePath,
        root,
        cache,
      );
      const key = `${item.relativePath}:${item.file.size}:${item.file.lastModified}`;
      planned.push({ ...item, key, folder: destination });
      setTransfers((current) => [
        ...current,
        { key, filename: item.file.name, loaded: 0, total: item.file.size },
      ]);
    }
    let cursor = 0;
    const worker = async () => {
      while (cursor < planned.length) {
        const item = planned[cursor];
        cursor += 1;
        if (!item) return;
        const controller = new AbortController();
        try {
          await uploadDumpFile({
            file: item.file,
            folderId: item.folder,
            signal: controller.signal,
            onProgress: (loaded) => {
              setTransfers((current) =>
                current.map((transfer) =>
                  transfer.key === item.key
                    ? { ...transfer, loaded }
                    : transfer,
                ),
              );
            },
            onStatus: (note) => {
              setTransfers((current) =>
                current.map((transfer) =>
                  transfer.key === item.key
                    ? { ...transfer, note: note ?? undefined }
                    : transfer,
                ),
              );
            },
          });
          setTransfers((current) =>
            current.filter((transfer) => transfer.key !== item.key),
          );
        } catch (error) {
          const message = transferErrorMessage(error, "Upload failed.");
          setTransfers((current) =>
            current.map((transfer) =>
              transfer.key === item.key
                ? { ...transfer, error: message, note: undefined }
                : transfer,
            ),
          );
          const detail = /[.!?]$/.test(message) ? message : `${message}.`;
          setNotice(
            `${item.file.name} stopped: ${detail} Choose the same file from its row to resume.`,
          );
        }
      }
    };
    const large = planned.some((item) => item.file.size >= 1024 * 1024 * 1024);
    await Promise.all(large ? [worker()] : [worker(), worker()]);
    void library.refetch();
  }

  async function resumeSelected(list: FileList | null) {
    const file = list?.[0];
    const id = resumeId.current;
    resumeId.current = null;
    if (!file || !id) return;
    const key = `resume:${id}:${file.size}`;
    setTransfers((current) => [
      ...current,
      { key, filename: file.name, loaded: 0, total: file.size },
    ]);
    try {
      const resumed = await resumeDumpFile({
        id,
        file,
        signal: new AbortController().signal,
        onProgress: (loaded) => {
          setTransfers((current) =>
            current.map((transfer) =>
              transfer.key === key ? { ...transfer, loaded } : transfer,
            ),
          );
        },
        onStatus: (note) => {
          setTransfers((current) =>
            current.map((transfer) =>
              transfer.key === key
                ? { ...transfer, note: note ?? undefined }
                : transfer,
            ),
          );
        },
      });
      setTransfers((current) =>
        current.filter((transfer) => transfer.key !== key),
      );
      if (resumed.message) setNotice(resumed.message);
      void library.refetch();
    } catch (error) {
      const message = transferErrorMessage(error, "Resume failed.");
      setTransfers((current) =>
        current.map((transfer) =>
          transfer.key === key
            ? { ...transfer, error: message, note: undefined }
            : transfer,
        ),
      );
      setNotice(message);
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if ((data?.missingEnv.length ?? 0) > 0) return;
    void filesFromDrop(event.dataTransfer).then((items) => uploadBatch(items));
  }

  async function openDownload(file: DumpFile, previewFirst: boolean) {
    try {
      const result = (await callAction(
        "get-dump-download-link",
        {
          id: file.id,
          disposition: previewFirst ? "inline" : "attachment",
        },
        { method: "GET" },
      )) as {
        url: string;
        filename: string;
        contentType: string | null;
      };
      if (previewFirst && previewKind(result.contentType)) {
        setPreview({
          filename: result.filename,
          contentType: result.contentType,
          url: result.url,
        });
        return;
      }
      window.open(result.url, "_blank", "noopener");
    } catch (error) {
      setNotice(actionErrorMessage(error) ?? "Download failed.");
    }
  }

  const missingEnv = data?.missingEnv ?? [];
  const busy =
    createFolder.isPending ||
    updateFile.isPending ||
    deleteFile.isPending ||
    abortUpload.isPending;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Private bucket
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Dumps</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Drop MP4s straight into the private bucket, including multi-gigabyte
          files and whole folders. Leave and come back, then choose the same
          file to resume.
        </p>
        {data?.inboxPrefix ? (
          <p className="font-mono text-xs text-muted-foreground">
            Shop copies: {data.inboxPrefix}
          </p>
        ) : null}
      </header>

      {missingEnv.length > 0 ? (
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm">
          <p className="font-medium">Backblaze is not configured.</p>
          <p className="mt-1 text-muted-foreground">
            Set these site environment variables, then reload. Uploads stay off
            until they exist.
          </p>
          <ul className="mt-2 font-mono text-xs">
            {missingEnv.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {shareToken ? (
        <ShareBanner
          pending={openShare.isPending}
          error={
            openShare.error
              ? (actionErrorMessage(openShare.error) ?? "Share link failed.")
              : null
          }
          result={
            openShare.data as
              | {
                  filename: string;
                  url: string;
                  contentType: string | null;
                }
              | undefined
          }
          onPreview={(result) =>
            setPreview({
              filename: result.filename,
              contentType: result.contentType,
              url: result.url,
            })
          }
          onClose={() => openFolder(folderId ?? null)}
        />
      ) : null}

      {notice ? (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed px-4 py-6 text-center ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <IconUpload className="mx-auto size-5 text-primary" />
        <p className="mt-2 text-sm font-medium">Drop MP4s or a folder</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            type="button"
            disabled={missingEnv.length > 0}
            onClick={() => fileInput.current?.click()}
          >
            Add files
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={missingEnv.length > 0}
            onClick={() => folderInput.current?.click()}
          >
            Add folder
          </Button>
        </div>
        <input
          ref={resumeInput}
          type="file"
          className="hidden"
          onChange={(event) => {
            void resumeSelected(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="video/mp4,video/*,.mp4,.mov,.m4v"
          className="hidden"
          onChange={(event) => {
            void uploadBatch(filesFromInput(event.target.files));
            event.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            void uploadBatch(filesFromInput(event.target.files));
            event.target.value = "";
          }}
        />
      </div>

      {transfers.length > 0 ? (
        <ul className="space-y-2">
          {transfers.map((transfer) => (
            <li key={transfer.key} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate">{transfer.filename}</span>
                <span className="text-muted-foreground">
                  {transfer.error ? "Failed · " : ""}
                  {formatBytes(transfer.loaded)} / {formatBytes(transfer.total)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${transfer.total ? Math.min(100, (transfer.loaded / transfer.total) * 100) : 0}%`,
                  }}
                />
              </div>
              {transfer.error ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {transfer.error}
                </p>
              ) : transfer.note ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {transfer.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 hover:bg-accent"
            onClick={() => openFolder(null)}
          >
            Library
          </button>
          {data?.breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 hover:bg-accent"
                onClick={() => openFolder(crumb.id)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search files"
          aria-label="Search files"
          className="md:max-w-xs"
        />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = folderName.trim();
          if (!name) return;
          createFolder.mutate(
            { name, parentId: folderId ?? null },
            {
              onSuccess: () => setFolderName(""),
              onError: (error) => {
                setNotice(
                  actionErrorMessage(error) ?? "Could not create the folder.",
                );
              },
            },
          );
        }}
      >
        <Input
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          placeholder="New folder name"
          aria-label="New folder name"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={createFolder.isPending}
        >
          New folder
        </Button>
      </form>

      {library.isPending ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-10 animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      ) : library.error ? (
        <p className="text-sm">
          {actionErrorMessage(library.error) ??
            "The library could not be loaded."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">
                  Size
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  Added
                </th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {data?.folders.map((folder) => (
                <tr
                  key={folder.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 font-medium"
                      onClick={() => openFolder(folder.id)}
                    >
                      <IconFolder className="size-4 text-primary" />
                      {folder.name}
                    </button>
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">
                    Folder
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {folder.createdAt
                      ? new Date(folder.createdAt).toLocaleDateString()
                      : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        const name = window.prompt("Folder name", folder.name);
                        if (!name?.trim()) return;
                        updateFolder.mutate(
                          { id: folder.id, name: name.trim() },
                          {
                            onError: (error) => {
                              setNotice(
                                actionErrorMessage(error) ??
                                  "Could not rename the folder.",
                              );
                            },
                          },
                        );
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        deleteFolder.mutate(
                          { id: folder.id },
                          {
                            onError: (error) => {
                              setNotice(
                                actionErrorMessage(error) ??
                                  "Could not delete the folder.",
                              );
                            },
                          },
                        );
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {data?.files.map((file) => (
                <tr
                  key={file.id}
                  className={`border-b border-border last:border-0 ${
                    selectedId === file.id ? "bg-accent/60" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() =>
                        setSelectedId((current) =>
                          current === file.id ? null : file.id,
                        )
                      }
                    >
                      <span className="font-medium">{file.filename}</span>
                      {file.status !== "ready" ? (
                        <span className="ml-2 text-xs uppercase text-muted-foreground">
                          {file.status}
                        </span>
                      ) : null}
                    </button>
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">
                    {formatBytes(file.sizeBytes)}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {file.createdAt
                      ? new Date(file.createdAt).toLocaleDateString()
                      : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {file.status === "uploading" || file.status === "failed" ? (
                      <span className="inline-flex gap-3">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            resumeId.current = file.id;
                            resumeInput.current?.click();
                          }}
                        >
                          Resume
                        </button>
                        {file.status === "uploading" ? (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => abortUpload.mutate({ id: file.id })}
                          >
                            Abort
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => void openDownload(file, true)}
                      >
                        Open
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.folders.length === 0 && data.files.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    {query ? "No matches." : "This folder is empty."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <form
          className="grid gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            updateFile.mutate(
              {
                id: selected.id,
                filename: draftName.trim(),
                notes: draftNotes,
                tags: draftTags
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
                folderId: draftFolder || null,
              },
              {
                onError: (error) => {
                  setNotice(
                    actionErrorMessage(error) ?? "Could not update the file.",
                  );
                },
              },
            );
          }}
        >
          <p className="text-sm font-medium">File details</p>
          <Input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            aria-label="Filename"
          />
          <textarea
            value={draftNotes}
            onChange={(event) => setDraftNotes(event.target.value)}
            aria-label="Notes"
            rows={3}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Notes"
          />
          <Input
            value={draftTags}
            onChange={(event) => setDraftTags(event.target.value)}
            aria-label="Tags"
            placeholder="Tags, comma separated"
          />
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Folder</span>
            <select
              value={draftFolder}
              onChange={(event) => setDraftFolder(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Library root</option>
              {data?.allFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            {selected.uploaderEmail} · {selected.contentType || "unknown type"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void openDownload(selected, false)}
            >
              Download
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                createShare.mutate(
                  { id: selected.id, expiresInHours: 24 },
                  {
                    onSuccess: (result) => {
                      const share = result as { sharePath: string };
                      const url = `${window.location.origin}${appPath(share.sharePath)}`;
                      setShareUrl(url);
                      void navigator.clipboard
                        ?.writeText(url)
                        .catch(() => undefined);
                    },
                    onError: (error) => {
                      setNotice(
                        actionErrorMessage(error) ??
                          "Could not create a share link.",
                      );
                    },
                  },
                );
              }}
            >
              Share for 24 hours
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                deleteFile.mutate(
                  { id: selected.id },
                  {
                    onSuccess: () => setSelectedId(null),
                    onError: (error) => {
                      setNotice(
                        actionErrorMessage(error) ??
                          "Could not delete the file.",
                      );
                    },
                  },
                );
              }}
            >
              Delete
            </Button>
          </div>
          {shareUrl ? (
            <Input readOnly value={shareUrl} aria-label="Share link" />
          ) : null}
        </form>
      ) : null}

      <dialog
        ref={previewDialog}
        className="w-[min(960px,92vw)] rounded-lg border border-border bg-card p-4 text-foreground"
        onClose={() => setPreview(null)}
      >
        {preview ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium">{preview.filename}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => previewDialog.current?.close()}
              >
                Close
              </Button>
            </div>
            {previewKind(preview.contentType) === "image" ? (
              <img
                src={preview.url}
                alt={preview.filename}
                className="max-h-[70vh] object-contain"
              />
            ) : null}
            {previewKind(preview.contentType) === "video" ? (
              <video
                src={preview.url}
                controls
                playsInline
                preload="metadata"
                className="max-h-[70vh] w-full"
              />
            ) : null}
            {previewKind(preview.contentType) === "audio" ? (
              <audio src={preview.url} controls className="w-full" />
            ) : null}
            {previewKind(preview.contentType) === "pdf" ? (
              <iframe
                title={preview.filename}
                src={preview.url}
                className="h-[70vh] w-full"
              />
            ) : null}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function ShareBanner({
  pending,
  error,
  result,
  onPreview,
  onClose,
}: {
  pending: boolean;
  error: string | null;
  result?: { filename: string; url: string; contentType: string | null };
  onPreview: (result: {
    filename: string;
    url: string;
    contentType: string | null;
  }) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 text-sm">
      {pending ? (
        <div className="h-8 animate-pulse rounded-md bg-muted" />
      ) : error ? (
        <p>{error}</p>
      ) : result ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            Shared file <span className="font-medium">{result.filename}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => onPreview(result)}>
              Preview
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(result.url, "_blank", "noopener")}
            >
              Download
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
