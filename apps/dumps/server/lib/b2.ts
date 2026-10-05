import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const B2_ENV_KEYS = [
  "B2_S3_ENDPOINT",
  "B2_REGION",
  "B2_BUCKET",
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
] as const;

export type B2EnvKey = (typeof B2_ENV_KEYS)[number];

const DOWNLOAD_SECONDS = 15 * 60;
const PART_URL_SECONDS = 60 * 60;
const DEFAULT_PART_SIZE = 8 * 1024 * 1024;
const MAX_PARTS = 10_000;

export class B2ConfigError extends Error {
  missing: B2EnvKey[];

  constructor(missing: B2EnvKey[]) {
    super(`Backblaze is not configured. Missing ${missing.join(", ")}.`);
    this.name = "B2ConfigError";
    this.missing = missing;
  }
}

type B2Settings = {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  applicationKey: string;
};

let clientCache: { key: string; client: S3Client } | null = null;
let corsAttempted = false;

function readSettings(): { missing: B2EnvKey[]; settings: B2Settings | null } {
  const endpoint =
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    process.env.B2_S3_ENDPOINT?.trim() ?? "";
  const region =
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    process.env.B2_REGION?.trim() ?? "";
  const bucket =
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    process.env.B2_BUCKET?.trim() ?? "";
  const keyId =
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    process.env.B2_KEY_ID?.trim() ?? "";
  const applicationKey =
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    process.env.B2_APPLICATION_KEY?.trim() ?? "";
  const missing = B2_ENV_KEYS.filter((key) => {
    if (key === "B2_S3_ENDPOINT") return !endpoint;
    if (key === "B2_REGION") return !region;
    if (key === "B2_BUCKET") return !bucket;
    if (key === "B2_KEY_ID") return !keyId;
    return !applicationKey;
  });
  if (missing.length > 0) return { missing, settings: null };
  return {
    missing: [],
    settings: { endpoint, region, bucket, keyId, applicationKey },
  };
}

export function missingB2Env(): B2EnvKey[] {
  return readSettings().missing;
}

function requireSettings(): B2Settings {
  const { missing, settings } = readSettings();
  if (!settings) throw new B2ConfigError(missing);
  return settings;
}

function clientFor(settings: B2Settings): S3Client {
  const key = `${settings.endpoint}|${settings.region}|${settings.keyId}`;
  if (clientCache?.key === key) return clientCache.client;
  const client = new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: false,
    credentials: {
      accessKeyId: settings.keyId,
      secretAccessKey: settings.applicationKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  clientCache = { key, client };
  return client;
}

export function safeBasename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return cleaned || "file";
}

export function objectKey(
  orgId: string,
  fileId: string,
  filename: string,
): string {
  return `org/${orgId}/files/${fileId}/${safeBasename(filename)}`;
}

export function planParts(sizeBytes: number): {
  partSize: number;
  partCount: number;
} {
  const size = Math.max(0, Math.floor(sizeBytes));
  let partSize = DEFAULT_PART_SIZE;
  if (size > partSize * MAX_PARTS) {
    partSize = Math.ceil(size / MAX_PARTS);
  }
  const partCount = Math.max(1, Math.ceil(size / partSize));
  return { partSize, partCount };
}

function siteOrigins(): string[] {
  const origins = new Set<string>();
  for (const value of [process.env.APP_URL, process.env.BETTER_AUTH_URL]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore a malformed site URL. The upload still returns the CORS rule.
    }
  }
  return [...origins];
}

export async function ensureBucketCors(): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (corsAttempted) return { ok: true };
  const origins = siteOrigins();
  if (origins.length === 0) {
    return {
      ok: false,
      message:
        "Bucket CORS was not updated. Allow the site origin for PUT, GET, and HEAD, and expose ETag.",
    };
  }
  corsAttempted = true;
  try {
    const settings = requireSettings();
    await clientFor(settings).send(
      new PutBucketCorsCommand({
        Bucket: settings.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: origins,
              AllowedMethods: ["PUT", "GET", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "Bucket CORS was not updated. Allow the site origin for PUT, GET, and HEAD, and expose ETag.",
    };
  }
}

export async function createUpload(input: {
  key: string;
  contentType: string;
}): Promise<string> {
  const settings = requireSettings();
  const created = await clientFor(settings).send(
    new CreateMultipartUploadCommand({
      Bucket: settings.bucket,
      Key: input.key,
      ContentType: input.contentType || "application/octet-stream",
    }),
  );
  if (!created.UploadId) {
    throw new Error("Backblaze did not return an upload id.");
  }
  return created.UploadId;
}

export async function signParts(input: {
  key: string;
  uploadId: string;
  partNumbers: number[];
}): Promise<Array<{ partNumber: number; url: string }>> {
  const settings = requireSettings();
  const client = clientFor(settings);
  return Promise.all(
    input.partNumbers.map(async (partNumber) => {
      const url = await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: settings.bucket,
          Key: input.key,
          UploadId: input.uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: PART_URL_SECONDS },
      );
      return { partNumber, url };
    }),
  );
}

export async function completeUpload(input: {
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}): Promise<{ sizeBytes: number | null; contentType: string | null }> {
  const settings = requireSettings();
  const client = clientFor(settings);
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: settings.bucket,
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: [...input.parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
          })),
      },
    }),
  );
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: settings.bucket, Key: input.key }),
    );
    return {
      sizeBytes:
        typeof head.ContentLength === "number" ? head.ContentLength : null,
      contentType: head.ContentType ?? null,
    };
  } catch {
    return { sizeBytes: null, contentType: null };
  }
}

export async function abortUpload(input: {
  key: string;
  uploadId: string | null;
}): Promise<void> {
  const settings = requireSettings();
  const client = clientFor(settings);
  if (input.uploadId) {
    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: settings.bucket,
          Key: input.key,
          UploadId: input.uploadId,
        }),
      );
    } catch {
      // The multipart upload may already be gone.
    }
  }
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: settings.bucket, Key: input.key }),
    );
  } catch {
    // An unfinished upload often has no object yet.
  }
}

export async function deleteObject(key: string): Promise<void> {
  const settings = requireSettings();
  await clientFor(settings).send(
    new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }),
  );
}

export async function presignGet(input: {
  key: string;
  filename: string;
}): Promise<{ url: string; expiresInSeconds: number }> {
  const settings = requireSettings();
  const url = await getSignedUrl(
    clientFor(settings),
    new GetObjectCommand({
      Bucket: settings.bucket,
      Key: input.key,
      ResponseContentDisposition: `attachment; filename="${safeBasename(input.filename)}"`,
    }),
    { expiresIn: DOWNLOAD_SECONDS },
  );
  return { url, expiresInSeconds: DOWNLOAD_SECONDS };
}

export function publicB2Error(err: unknown): string {
  if (err instanceof B2ConfigError) return err.message;
  const message =
    err instanceof Error ? err.message : "Backblaze request failed.";
  if (/signature|credential|access key|secret|authorization/i.test(message)) {
    return "Backblaze rejected the request. Check the bucket endpoint, region, and key permissions.";
  }
  return message.slice(0, 300);
}
