import { createReadStream, createWriteStream } from "node:fs";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutBucketCorsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { browserPartUrlProblem, s3ErrorCode, s3ErrorMessage } from "./parts.js";

export const B2_ENV_KEYS = [
  "B2_S3_ENDPOINT",
  "B2_REGION",
  "B2_BUCKET",
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
] as const;

export type B2EnvKey = (typeof B2_ENV_KEYS)[number];

const DOWNLOAD_SECONDS = 15 * 60;
/** Large parts on a slow link, plus retries, can outlive a one-hour URL. */
const PART_URL_SECONDS = 6 * 60 * 60;

const PUBLIC_BUCKET = {
  endpoint: "https://s3.us-east-005.backblazeb2.com",
  region: "us-east-005",
  bucket: "swafford-video-dumps",
};

export const BUCKET_CORS_ORIGINS = [
  "https://swafford-workspace.netlify.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

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
let fileEnv: Partial<Record<B2EnvKey, string>> | null = null;

function envValue(name: B2EnvKey): string {
  if (name === "B2_S3_ENDPOINT") {
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    return process.env.B2_S3_ENDPOINT?.trim() ?? "";
  }
  if (name === "B2_REGION") {
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    return process.env.B2_REGION?.trim() ?? "";
  }
  if (name === "B2_BUCKET") {
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    return process.env.B2_BUCKET?.trim() ?? "";
  }
  if (name === "B2_KEY_ID") {
    // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
    return process.env.B2_KEY_ID?.trim() ?? "";
  }
  // guard:allow-env-credential — one workspace Backblaze bucket, set in site env
  return process.env.B2_APPLICATION_KEY?.trim() ?? "";
}

function workspaceFileEnv(): Partial<Record<B2EnvKey, string>> {
  if (fileEnv) return fileEnv;
  const found: Partial<Record<B2EnvKey, string>> = {};
  for (const file of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ]) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const split = trimmed.indexOf("=");
      if (split < 1) continue;
      const key = trimmed.slice(0, split).trim();
      if (!B2_ENV_KEYS.includes(key as B2EnvKey)) continue;
      let value = trimmed.slice(split + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) found[key as B2EnvKey] = value;
    }
    if (Object.keys(found).length > 0) break;
  }
  fileEnv = found;
  return found;
}

function readSettings(): { missing: B2EnvKey[]; settings: B2Settings | null } {
  const file = workspaceFileEnv();
  const endpoint =
    envValue("B2_S3_ENDPOINT") || file.B2_S3_ENDPOINT || PUBLIC_BUCKET.endpoint;
  const region =
    envValue("B2_REGION") || file.B2_REGION || PUBLIC_BUCKET.region;
  const bucket =
    envValue("B2_BUCKET") || file.B2_BUCKET || PUBLIC_BUCKET.bucket;
  const keyId = envValue("B2_KEY_ID") || file.B2_KEY_ID || "";
  const applicationKey =
    envValue("B2_APPLICATION_KEY") || file.B2_APPLICATION_KEY || "";
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

function forcePathStyle(): boolean {
  const value = process.env.B2_FORCE_PATH_STYLE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function sseMode(): "AES256" | "off" {
  const value = process.env.B2_SSE?.trim().toLowerCase();
  if (value === "off" || value === "none" || value === "false") return "off";
  return "AES256";
}

function clientFor(settings: B2Settings): S3Client {
  const pathStyle = forcePathStyle();
  const key = `${settings.endpoint}|${settings.region}|${settings.keyId}|${pathStyle}`;
  if (clientCache?.key === key) return clientCache.client;
  const client = new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: pathStyle,
    credentials: {
      accessKeyId: settings.keyId,
      secretAccessKey: settings.applicationKey,
    },
    // WHEN_REQUIRED keeps UploadPart presigns free of x-amz-checksum-crc32.
    // The SDK default signs the empty-body checksum and Backblaze resets the PUT.
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

export {
  BROWSER_MAX_PART_BYTES,
  browserPartUrlProblem,
  isMissingMultipartUpload,
  partCountFor,
  planParts,
  s3ErrorCode,
  s3ErrorMessage,
} from "./parts.js";

export function contentTypeForName(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "mkv") return "video/x-matroska";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function siteOrigin(): string {
  for (const value of [process.env.APP_URL, process.env.BETTER_AUTH_URL]) {
    if (!value) continue;
    try {
      return new URL(value).origin;
    } catch {
      // Try the next value.
    }
  }
  return BUCKET_CORS_ORIGINS[0];
}

function bucketCorsOrigins(): string[] {
  const origins = new Set<string>(BUCKET_CORS_ORIGINS);
  for (const value of [process.env.APP_URL, process.env.BETTER_AUTH_URL]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore a malformed site URL. The fixed origins still apply.
    }
  }
  return [...origins];
}

export async function ensureBucketCors(force = false): Promise<{
  ok: boolean;
  origins: string[];
  message?: string;
}> {
  const origins = bucketCorsOrigins();
  if (corsAttempted && !force) return { ok: true, origins };
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
              AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    return { ok: true, origins };
  } catch {
    return {
      ok: false,
      origins,
      message:
        "Bucket CORS was not updated. Allow the site and localhost origins for GET, PUT, HEAD, and POST, and expose ETag.",
    };
  }
}

function encryption():
  | { ServerSideEncryption: "AES256" }
  | Record<string, never> {
  return sseMode() === "AES256" ? { ServerSideEncryption: "AES256" } : {};
}

export function bucketName(): string {
  return requireSettings().bucket;
}

export async function ensureBucket(): Promise<void> {
  const settings = requireSettings();
  const client = clientFor(settings);
  try {
    await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: settings.bucket }));
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
      ...encryption(),
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
      const problem = browserPartUrlProblem(url);
      if (problem) throw new Error(problem);
      return { partNumber, url };
    }),
  );
}

export async function listUploadedParts(input: {
  key: string;
  uploadId: string;
}): Promise<Array<{ partNumber: number; etag: string }>> {
  const settings = requireSettings();
  const client = clientFor(settings);
  const parts: Array<{ partNumber: number; etag: string }> = [];
  let marker: string | undefined;
  const seenMarkers = new Set<string>();
  for (;;) {
    const page = await client.send(
      new ListPartsCommand({
        Bucket: settings.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumberMarker: marker,
        MaxParts: 1000,
      }),
    );
    for (const part of page.Parts ?? []) {
      if (part.PartNumber && part.ETag) {
        parts.push({ partNumber: part.PartNumber, etag: part.ETag });
      }
    }
    const next = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    if (!next || seenMarkers.has(next)) break;
    seenMarkers.add(next);
    marker = next;
  }
  return parts;
}

export async function listBucketPage(input: {
  prefix: string;
  cursor?: string | null;
}): Promise<{
  objects: Array<{ key: string; sizeBytes: number }>;
  nextToken: string | null;
}> {
  const settings = requireSettings();
  const page = await clientFor(settings).send(
    new ListObjectsV2Command({
      Bucket: settings.bucket,
      Prefix: input.prefix,
      ContinuationToken: input.cursor || undefined,
      MaxKeys: 200,
    }),
  );
  return {
    objects: (page.Contents ?? [])
      .filter((object) => object.Key && !object.Key.endsWith("/"))
      .map((object) => ({
        key: object.Key as string,
        sizeBytes: object.Size ?? 0,
      })),
    nextToken: page.IsTruncated ? (page.NextContinuationToken ?? null) : null,
  };
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

/**
 * The stored object for a key, or null when Backblaze has none. Used to tell
 * "the upload never finished" from "CompleteMultipartUpload succeeded but the
 * response never reached the browser".
 */
export async function headObject(
  key: string,
): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  const settings = requireSettings();
  try {
    const head = await clientFor(settings).send(
      new HeadObjectCommand({ Bucket: settings.bucket, Key: key }),
    );
    return {
      sizeBytes:
        typeof head.ContentLength === "number" ? head.ContentLength : 0,
      contentType: head.ContentType ?? null,
    };
  } catch (err) {
    const status =
      err && typeof err === "object" && "$metadata" in err
        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode
        : undefined;
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name?: unknown }).name)
        : "";
    if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
      return null;
    }
    throw err;
  }
}

export type PartProbe = {
  ok: boolean;
  /** HTTP status Backblaze returned to the server-side PUT, 0 if none. */
  status: number;
  code: string | null;
  message: string;
  /** Whether the bucket CORS rule allows the site origin and exposes ETag. */
  cors: "ok" | "origin_missing" | "etag_not_exposed" | "unknown";
};

// B2 only enforces its 5 MB minimum part size when an upload is completed,
// but probe with a full-size part so a size rule cannot hide a real answer.
const PROBE_PART_BYTES = 5 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 20_000;

async function probeCors(
  settings: B2Settings,
  origin: string | null,
): Promise<PartProbe["cors"]> {
  try {
    const cors = await clientFor(settings).send(
      new GetBucketCorsCommand({ Bucket: settings.bucket }),
    );
    const rules = cors.CORSRules ?? [];
    const matching = origin
      ? rules.filter((rule) =>
          (rule.AllowedOrigins ?? []).some(
            (allowed) => allowed === "*" || allowed === origin,
          ),
        )
      : rules;
    if (matching.length === 0) return "origin_missing";
    const exposesEtag = matching.some((rule) =>
      (rule.ExposeHeaders ?? []).some((name) => name.toLowerCase() === "etag"),
    );
    return exposesEtag ? "ok" : "etag_not_exposed";
  } catch {
    return "unknown";
  }
}

/**
 * Upload one throwaway part from the server through the same presign the
 * browser uses, then abort. Backblaze error responses omit CORS headers, so
 * the browser only ever sees status 0. The server can read the real status and
 * S3 error code, which says whether Backblaze rejects the signed request or
 * the break is between the browser and Backblaze.
 */
export async function probePartUpload(input: {
  orgId: string;
  origin?: string | null;
}): Promise<PartProbe> {
  const settings = requireSettings();
  const key = `org/${input.orgId}/.probe/${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const cors = await probeCors(settings, input.origin ?? siteOrigin());
  let uploadId: string | null = null;
  try {
    uploadId = await createUpload({
      key,
      contentType: "application/octet-stream",
    });
    const [signed] = await signParts({ key, uploadId, partNumbers: [1] });
    const response = await fetch(signed.url, {
      method: "PUT",
      body: new Uint8Array(PROBE_PART_BYTES),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const text = response.ok ? "" : await response.text().catch(() => "");
    const etag = response.headers.get("etag");
    if (response.ok && etag) {
      return {
        ok: true,
        status: response.status,
        code: null,
        message:
          "Backblaze accepted a test part from the server using the same signed URL the browser gets.",
        cors,
      };
    }
    const code = s3ErrorCode(text);
    const detail = s3ErrorMessage(text);
    return {
      ok: false,
      status: response.status,
      code,
      message: response.ok
        ? "Backblaze accepted the test part but did not return an ETag."
        : `Backblaze rejected a test part with ${response.status}${code ? ` ${code}` : ""}${detail ? `: ${detail}` : ""}.`,
      cors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe failed.";
    return {
      ok: false,
      status: 0,
      code: null,
      message: `The test upload from the server failed: ${message.slice(0, 200)}`,
      cors,
    };
  } finally {
    if (uploadId) {
      try {
        await clientFor(settings).send(
          new AbortMultipartUploadCommand({
            Bucket: settings.bucket,
            Key: key,
            UploadId: uploadId,
          }),
        );
      } catch {
        // The probe upload holds nothing the library can see.
      }
    }
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
  contentType?: string | null;
  disposition?: "inline" | "attachment";
}): Promise<{ url: string; expiresInSeconds: number }> {
  const settings = requireSettings();
  const filename = safeBasename(input.filename).replace(/"/g, "");
  const disposition =
    input.disposition === "attachment" ? "attachment" : "inline";
  const url = await getSignedUrl(
    clientFor(settings),
    new GetObjectCommand({
      Bucket: settings.bucket,
      Key: input.key,
      ResponseContentDisposition: `${disposition}; filename="${filename}"`,
      ...(input.contentType ? { ResponseContentType: input.contentType } : {}),
    }),
    { expiresIn: DOWNLOAD_SECONDS },
  );
  return { url, expiresInSeconds: DOWNLOAD_SECONDS };
}

export async function downloadToFile(key: string, dest: string): Promise<void> {
  const settings = requireSettings();
  const response = await clientFor(settings).send(
    new GetObjectCommand({ Bucket: settings.bucket, Key: key }),
  );
  if (!response.Body) throw new Error(`Object ${key} was empty.`);
  await mkdir(dirname(dest), { recursive: true });
  const body = response.Body;
  const stream =
    body instanceof Readable
      ? body
      : Readable.from(body as AsyncIterable<Uint8Array>);
  await pipeline(stream, createWriteStream(dest));
}

export async function uploadFile(input: {
  key: string;
  filePath: string;
  contentType: string;
}): Promise<void> {
  const settings = requireSettings();
  const upload = new Upload({
    client: clientFor(settings),
    params: {
      Bucket: settings.bucket,
      Key: input.key,
      Body: createReadStream(input.filePath),
      ContentType: input.contentType,
      ...encryption(),
    },
  });
  await upload.done();
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
