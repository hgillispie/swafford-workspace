# Dumps — Agent Guide

Dumps is the workspace file library. Files stay in a private Backblaze B2
bucket. Postgres stores the ledger: folder, filename, size, type, uploader,
tags, notes, and the object key. The browser uploads and downloads through
presigned S3 URLs. Actions never accept file bytes.

The public root opens the shared sign-in page. Signed-in members land on
`/home`, the library. Full-page chat stays at `/chat/:threadId`.

## Actions

| Action                   | Purpose                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `list-dumps`             | List or search folders and files in the current organization |
| `create-dump-folder`     | Create a folder                                              |
| `update-dump-folder`     | Rename a folder or move it                                   |
| `delete-dump-folder`     | Delete an empty folder                                       |
| `start-dump-upload`      | Open a multipart upload and record metadata                  |
| `sign-dump-parts`        | Sign a batch of part PUT URLs                                |
| `list-dump-parts`        | List stored parts so a browser can resume                    |
| `complete-dump-upload`   | Finish the multipart upload                                  |
| `restart-dump-upload`    | Reopen a lost multipart session on the same row              |
| `probe-dump-upload`      | Server-side test part that shows Backblaze's real answer     |
| `abort-dump-upload`      | Cancel an open upload and delete its row                     |
| `configure-dump-cors`    | PutBucketCors for the site, localhost, and ETag              |
| `index-dump-bucket`      | Sync and index objects already in the bucket                 |
| `update-dump`            | Rename, retag, note, or move a file                          |
| `delete-dump`            | Delete a ready file and its object                           |
| `get-dump-download-link` | 15-minute presigned GET for download or preview              |
| `create-dump-share`      | Expiring share link for a signed-in org member               |
| `open-dump-share`        | Open a share token and return a short GET URL                |

Upload flow: `start-dump-upload`, then `sign-dump-parts` in batches, PUT each
part from the browser, then `complete-dump-upload` with the ETags. Parts are
8 MiB, the size rclone and the AWS CLI use for the shop copies that already
land in this bucket, and only grow past that when a file would need more than
10,000 parts (about 78 GiB). A 16 GiB file is 2,048 parts. Files under 1 GiB
upload three parts at once. A larger file uploads one part at a time so a
reset cannot look like progress across several half-sent parts. The browser
reads each slice into memory before the PUT, so a file that changes on disk, or
sits on a drive, share, or sync folder that stalls, fails with a readable
message instead of a dropped connection. It sends the bytes with no
Content-Type. Presigned part URLs sign only `host` and use `UNSIGNED-PAYLOAD`.
The S3 client sets checksum calculation to `WHEN_REQUIRED` so the SDK does not
append `x-amz-checksum-crc32=AAAAAA==`. That empty-body checksum makes
Backblaze reset the PUT while the browser is still sending. New objects use
SSE-B2 (`AES256`). Do not enable Object Lock. Do not raise the 8 MiB part size
for browser uploads (128 MiB and 32 MiB parts kept dying) and do not turn
flexible checksums back on.

Failure handling: Backblaze error responses omit `Access-Control-Allow-Origin`,
so the browser reads a reset, a 403, a 503, and a lost Wi-Fi link all as
status 0. Do not guess which one from the browser. A part is tried up to eight
times with backoff up to 30 s, waits for the browser to be online, and is
abandoned after 60 s with no progress. When a part runs out of tries the client
lists stored parts, waits, and continues, and gives up only after four rounds
in a row store nothing new. Then it calls `probe-dump-upload`, which PUTs one
5 MiB throwaway part from the server through the same presigned URL, aborts it,
and reports the real status and S3 error code plus whether bucket CORS lists
the site and exposes ETag. That text is appended to the failure on the row. An
"accepted" probe means the signed URL, key, and encryption are fine and the
break is between that computer and Backblaze. Run the action yourself when a
user reports a failed upload.

Resume flow: `list-dump-parts` returns parts already in the bucket. Sign and
PUT only the missing part numbers, then complete. A connection reset, or a
200 whose ETag the browser could not read, asks `list-dump-parts` before
sending that part again. If Backblaze dropped the multipart session,
`restart-dump-upload` first looks for a finished object of the recorded size
and marks the row ready (a Complete whose response was lost), and only
otherwise opens a new session on the same row and sends the file again from
the start. `complete-dump-upload` does the same check when Backblaze answers
NoSuchUpload. If the session is still open, has no stored parts, and its part
size is above 8 MiB, resume calls `restart-dump-upload` with `replaceEmpty:
true` so the same row continues in 8 MiB parts. Sessions that already have
stored parts keep their part size. Part upload failures stay visible in the
library, and closing the tab while a transfer runs asks for confirmation.

Shop machines copy into `org/{orgId}/inbox/` with rclone. See `README.md` for
the command. Run `index-dump-bucket` afterward. Pass `cursor` when the result
includes `nextToken`. The prefix must stay under `org/{orgId}/`.

## Backblaze

Server-only site environment variables:

- `B2_S3_ENDPOINT` — `https://s3.us-east-005.backblazeb2.com`
- `B2_REGION` — `us-east-005`
- `B2_BUCKET` — `swafford-video-dumps`
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`

The endpoint, region, and bucket name are public for this workspace. The key
id and application key are not. Missing key names are returned by `list-dumps`
and shown in the library. Do not ask anyone to paste values into chat. Local
runs also read a workspace root `.env` when a name is unset.

`configure-dump-cors` allows `https://swafford-workspace.netlify.app`,
`http://localhost:8080`, `http://127.0.0.1:8080`, and localhost ports 3000
and 5173, methods GET, PUT, HEAD, and POST, header `*`, and exposes `ETag`.
The live bucket already has this rule under `workspaceUploads`. Do not call
the action unless an origin is missing. Successful PUTs already return the
origin and `ETag`. Error responses omit the origin header; that is Backblaze
behavior, not a missing bucket rule.

Object keys look like `org/{orgId}/files/{id}/{filename}`.

## Core Rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Keep file bytes out of SQL, actions, and function logs.
- Scope every dump query by the request organization.
- Never hardcode credentials. Read the five B2 variables from the environment.
- Keep chat for agent work. File operations stay on the actions above.

## Application State

- `navigation.view` is `library` on `/home` and `chat` on `/chat/:threadId`.
- `view-screen` reads the current route when the visible folder is unclear.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
