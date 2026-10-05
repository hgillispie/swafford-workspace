/**
 * Starts the media worker after a job is queued.
 * `fly` talks to the Machines API. `local` does nothing: a Mac (or compose)
 * process is already polling. Server-only. Do not import this from client code.
 */

export type WorkerLauncherName = "fly" | "local";

export type WorkerLaunchResult = {
  adapter: WorkerLauncherName;
  /** True when the machine was stopped and this call started it, or it is still booting. */
  cold: boolean;
  state: string;
  machineId?: string;
  error?: string;
};

type Env = Record<string, string | undefined>;

type MachineRecord = {
  id?: string;
  name?: string;
  state?: string;
};

export type MachineStep =
  | { action: "ready"; cold: false }
  | { action: "wait"; cold: true }
  | { action: "start"; cold: true }
  | { action: "create"; cold: true };

const FLY_API = "https://api.machines.dev/v1";

export function launcherName(env: Env = process.env): WorkerLauncherName {
  const explicit = env.WORKER_LAUNCHER?.trim().toLowerCase();
  if (
    explicit === "local" ||
    explicit === "noop" ||
    explicit === "none" ||
    explicit === "mac"
  ) {
    return "local";
  }
  if (explicit === "fly") return "fly";
  if (env.FLY_API_TOKEN?.trim() && env.FLY_APP?.trim()) return "fly";
  return "local";
}

/** What to do with a Fly machine in this state. Idempotent for started/starting. */
export function nextMachineStep(state: string | null | undefined): MachineStep {
  const normalized = (state ?? "").trim().toLowerCase();
  if (normalized === "started") return { action: "ready", cold: false };
  if (normalized === "starting" || normalized === "replacing") {
    return { action: "wait", cold: true };
  }
  if (
    !normalized ||
    normalized === "destroyed" ||
    normalized === "destroying" ||
    normalized === "failed"
  ) {
    return { action: "create", cold: true };
  }
  return { action: "start", cold: true };
}

export function launchStatusLabel(result: WorkerLaunchResult): string | null {
  if (result.cold) return "Starting renderer…";
  if (result.error) {
    return `Renderer did not start: ${result.error}`.slice(0, 180);
  }
  return null;
}

export async function launchMediaWorker(
  env: Env = process.env,
): Promise<WorkerLaunchResult> {
  if (launcherName(env) === "local") {
    return { adapter: "local", cold: false, state: "local" };
  }
  try {
    return await launchFly(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      adapter: "fly",
      cold: false,
      state: "error",
      error: message.slice(0, 300),
    };
  }
}

async function launchFly(env: Env): Promise<WorkerLaunchResult> {
  const token = env.FLY_API_TOKEN?.trim();
  const app = env.FLY_APP?.trim();
  if (!token || !app) {
    throw new Error("FLY_API_TOKEN and FLY_APP are required for the fly launcher.");
  }
  const preferredId = env.FLY_MACHINE_ID?.trim() || "";
  const machine = preferredId
    ? await getMachine(env, app, token, preferredId)
    : await findMachine(env, app, token);

  if (!machine?.id || nextMachineStep(machine.state).action === "create") {
    const created = await createMachine(env, app, token);
    if (!created.id) throw new Error("Fly did not return a machine id.");
    const createdStep = nextMachineStep(created.state);
    if (createdStep.action === "start" || createdStep.action === "create") {
      await startMachine(env, app, token, created.id);
    }
    return {
      adapter: "fly",
      cold: true,
      state: created.state || "created",
      machineId: created.id,
    };
  }

  const step = nextMachineStep(machine.state);
  if (step.action === "start") {
    await startMachine(env, app, token, machine.id);
    return {
      adapter: "fly",
      cold: true,
      state: "starting",
      machineId: machine.id,
    };
  }
  return {
    adapter: "fly",
    cold: step.cold,
    state: machine.state || step.action,
    machineId: machine.id,
  };
}

async function flyFetch(
  env: Env,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const timeout = Number(env.FLY_LAUNCH_TIMEOUT_MS ?? 8000) || 8000;
  return fetch(`${FLY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeout),
  });
}

async function readError(response: Response): Promise<string> {
  const body = await response.text();
  return `${response.status} ${body.slice(0, 240)}`.trim();
}

function alreadyRunning(status: number, body: string): boolean {
  return (
    status === 409 ||
    status === 412 ||
    /already (started|running|starting)/i.test(body)
  );
}

async function getMachine(
  env: Env,
  app: string,
  token: string,
  id: string,
): Promise<MachineRecord | null> {
  const response = await flyFetch(
    env,
    token,
    `/apps/${encodeURIComponent(app)}/machines/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as MachineRecord;
}

async function findMachine(
  env: Env,
  app: string,
  token: string,
): Promise<MachineRecord | null> {
  const response = await flyFetch(
    env,
    token,
    `/apps/${encodeURIComponent(app)}/machines`,
  );
  if (!response.ok) throw new Error(await readError(response));
  const machines = (await response.json()) as MachineRecord[];
  const live = machines.filter((machine) => {
    const state = (machine.state ?? "").toLowerCase();
    return state && state !== "destroyed" && state !== "destroying";
  });
  const named = live.find((machine) => machine.name === "media-worker");
  if (named) return named;
  if (live.length === 1) return live[0];
  if (live.length > 1) {
    throw new Error(
      "More than one Fly machine exists. Set FLY_MACHINE_ID to the media worker.",
    );
  }
  return null;
}

function rootfsGb(env: Env): number {
  const raw = env.FLY_ROOTFS_GB?.trim();
  if (raw === undefined || raw === "") return 80;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 80;
  return Math.round(value);
}

async function createMachine(
  env: Env,
  app: string,
  token: string,
  image = env.FLY_IMAGE?.trim() || "",
): Promise<MachineRecord> {
  if (!image) {
    throw new Error(
      "No Fly machine exists. Set FLY_MACHINE_ID, or FLY_IMAGE so a machine can be created.",
    );
  }
  const size = env.FLY_MACHINE_SIZE?.trim() || "performance-4x";
  const region = env.FLY_REGION?.trim() || "iad";
  const disk = rootfsGb(env);
  const response = await flyFetch(
    env,
    token,
    `/apps/${encodeURIComponent(app)}/machines`,
    {
      method: "POST",
      body: JSON.stringify({
        name: "media-worker",
        region,
        config: {
          image,
          size,
          restart: { policy: "on-failure", max_retries: 3 },
          rootfs: {
            persist: "never",
            ...(disk > 0 ? { size_gb: disk } : {}),
          },
          env: {
            MEDIA_WORKDIR: "/tmp/media-worker",
            MEDIA_WORKER_IDLE_MINUTES:
              env.MEDIA_WORKER_IDLE_MINUTES?.trim() || "5",
          },
          metadata: { role: "media-worker" },
        },
      }),
    },
  );
  if (response.ok) return (await response.json()) as MachineRecord;
  const errorText = await response.text();
  if (response.status === 422 || /already exists|name/i.test(errorText)) {
    const existing = await findMachine(env, app, token);
    if (existing?.id) return existing;
  }
  throw new Error(`${response.status} ${errorText.slice(0, 240)}`.trim());
}

async function startMachine(
  env: Env,
  app: string,
  token: string,
  id: string,
): Promise<{ previousState: string }> {
  const response = await flyFetch(
    env,
    token,
    `/apps/${encodeURIComponent(app)}/machines/${encodeURIComponent(id)}/start`,
    { method: "POST", body: "{}" },
  );
  const body = await response.text();
  if (alreadyRunning(response.status, body)) {
    return { previousState: "started" };
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${body.slice(0, 240)}`.trim());
  }
  try {
    const parsed = JSON.parse(body) as { previous_state?: string };
    return { previousState: parsed.previous_state || "starting" };
  } catch {
    return { previousState: "starting" };
  }
}
