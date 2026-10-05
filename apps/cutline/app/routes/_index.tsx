import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import type { ProjectSummary } from "@shared/project";
import {
  IconAlertTriangle,
  IconCloudUpload,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import {
  firstDroppedFile,
  MediaDropZone,
} from "@/components/projects/MediaDropZone";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { RenameProjectDialog } from "@/components/projects/RenameProjectDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaImport } from "@/hooks/use-media-import";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [
    { title: `Projects · ${APP_TITLE}` },
    {
      name: "description",
      content: "Edit video and audio by editing the transcript.",
    },
  ];
}

const LIST_KEY = ["action", "list-projects", undefined] as const;

function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <Skeleton className="aspect-video rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectsRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectsQuery = useActionQuery("list-projects", undefined, {
    refetchInterval: (query) =>
      (query.state.data as ProjectSummary[] | undefined)?.some(
        (p) => p.transcriptStatus === "processing",
      )
        ? 4000
        : false,
  });
  const { importFile, pending } = useMediaImport();
  const library = useActionQuery("list-library-videos", {});
  const fromLibrary = useActionMutation("create-project-from-library");
  const createSample = useActionMutation("create-sample-project");
  const renameProject = useActionMutation("update-project");
  const deleteProject = useActionMutation("delete-project");

  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const projects = projectsQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? projects.filter((p) => p.title.toLowerCase().includes(q))
      : projects;
  }, [projects, search]);

  const openSample = () => {
    setNewOpen(false);
    createSample.mutate(
      {},
      {
        onSuccess: (project) => navigate(`/projects/${project.id}`),
        onError: (error) =>
          toast.error(
            actionErrorMessage(error) ?? "Couldn't create the sample.",
          ),
      },
    );
  };

  const startImport = (file: File) => {
    setNewOpen(false);
    void importFile(file);
  };

  const submitRename = (project: ProjectSummary, title: string) => {
    setRenaming(null);
    const previous = queryClient.getQueryData<ProjectSummary[]>(LIST_KEY);
    queryClient.setQueryData<ProjectSummary[]>(LIST_KEY, (rows) =>
      rows?.map((row) => (row.id === project.id ? { ...row, title } : row)),
    );
    renameProject.mutate(
      { id: project.id, title },
      {
        onError: (error) => {
          queryClient.setQueryData(LIST_KEY, previous);
          toast.error(
            actionErrorMessage(error) ?? "Couldn't rename the project.",
          );
        },
      },
    );
  };

  const confirmDelete = () => {
    const project = deleting;
    if (!project) return;
    setDeleting(null);
    const previous = queryClient.getQueryData<ProjectSummary[]>(LIST_KEY);
    queryClient.setQueryData<ProjectSummary[]>(LIST_KEY, (rows) =>
      rows?.filter((row) => row.id !== project.id),
    );
    deleteProject.mutate(
      { id: project.id },
      {
        onSuccess: () => toast.success(`Deleted “${project.title}”`),
        onError: (error) => {
          queryClient.setQueryData(LIST_KEY, previous);
          toast.error(
            actionErrorMessage(error) ?? "Couldn't delete the project.",
          );
        },
      },
    );
  };

  const hasProjects = projects.length > 0;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(event) => {
        if (!hasProjects || !event.dataTransfer?.types.includes("Files"))
          return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasProjects) return;
        event.preventDefault();
        setDragging(false);
        const file = firstDroppedFile(event);
        if (file) startImport(file);
      }}
    >
      <PageHeader
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLibraryOpen((open) => !open)}
            >
              From library
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)} disabled={pending}>
              <IconPlus size={16} aria-hidden />
              New project
            </Button>
          </>
        }
      >
        {hasProjects ? (
          <div className="relative w-full max-w-xs">
            <IconSearch
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              className="h-8 bg-card pl-8 text-[13px]"
            />
          </div>
        ) : null}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
          {projectsQuery.isLoading ? (
            <GridSkeleton />
          ) : projectsQuery.isError ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <IconAlertTriangle
                size={22}
                className="text-destructive"
                aria-hidden
              />
              <p className="text-[14px] font-medium">
                Couldn't load your projects
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => projectsQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : !hasProjects ? (
            <div className="mx-auto flex max-w-xl flex-col items-center pt-[8vh]">
              <h1 className="mb-6 text-center text-[22px] font-semibold tracking-[-0.02em]">
                Start your first project
              </h1>
              <MediaDropZone
                onFile={startImport}
                pending={pending}
                className="min-h-72 w-full"
              />
              <button
                type="button"
                onClick={openSample}
                disabled={createSample.isPending}
                className="mt-4 text-[13px] font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline disabled:opacity-60"
              >
                {createSample.isPending
                  ? "Opening sample…"
                  : "Try the sample project"}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-24 text-center text-[13px] text-muted-foreground">
              No projects match “{search.trim()}”.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onRename={setRenaming}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary bg-background/85">
          <IconCloudUpload size={28} className="text-primary" aria-hidden />
          <p className="text-[15px] font-semibold">
            Drop to start a new project
          </p>
        </div>
      ) : null}

      {libraryOpen ? (
        <div className="border-t border-border px-6 py-4">
          <p className="mb-3 text-[13px] font-medium">Videos in the dumps bucket</p>
          {(
            (library.data as { videos?: Array<{ id: string; filename: string; sizeBytes: number }> } | undefined)
              ?.videos ?? []
          ).length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No ready videos yet. Upload one, or add it in Dumps first.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(
                library.data as {
                  videos: Array<{ id: string; filename: string; sizeBytes: number }>;
                }
              ).videos.map((video) => (
                <li key={video.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-[13px] hover:bg-muted"
                    onClick={() =>
                      fromLibrary.mutate(
                        { dumpFileId: video.id },
                        {
                          onSuccess: (result) =>
                            navigate(
                              `/projects/${(result as { project: { id: string } }).project.id}`,
                            ),
                          onError: (error) =>
                            toast.error(
                              actionErrorMessage(error) ??
                                "Couldn't open that video.",
                            ),
                        },
                      )
                    }
                  >
                    <span className="truncate">{video.filename}</span>
                    <span className="text-muted-foreground">
                      {Math.max(1, Math.round(video.sizeBytes / 1024 / 1024))} MB
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <NewProjectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onFile={startImport}
        onSample={openSample}
        pending={pending}
      />
      <RenameProjectDialog
        project={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSubmit={submitRename}
      />
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The transcript and all edits will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
