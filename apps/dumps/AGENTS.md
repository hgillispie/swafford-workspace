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
| `abort-dump-upload`      | Cancel an open upload and delete its row                     |
| `configure-dump-cors`    | PutBucketCors for the site, localhost, and ETag              |
| `index-dump-bucket`      | Sync and index objects already in the bucket                 |
| `update-dump`            | Rename, retag, note, or move a file                          |
| `delete-dump`            | Delete a ready file and its object                           |
| `get-dump-download-link` | 15-minute presigned GET for download or preview              |
| `create-dump-share`      | Expiring share link for a signed-in org member               |
| `open-dump-share`        | Open a share token and return a short GET URL                |

Upload flow: `start-dump-upload`, then `sign-dump-parts` in batches, PUT each
part from the browser, then `complete-dump-upload` with the ETags. Part size
is 8 MiB and grows toward 32 MiB for multi-gigabyte files, staying under
10,000 parts. New objects use SSE-B2 (`AES256`). Do not enable Object Lock.

Resume flow: `list-dump-parts` returns parts already in the bucket. Sign and
PUT only the missing part numbers, then complete.

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

`configure-dump-cors` allows `https://swafford-workspace.netlify.app` and
localhost dev origins, methods GET, PUT, HEAD, and POST, header `*`, and
exposes `ETag`.

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
