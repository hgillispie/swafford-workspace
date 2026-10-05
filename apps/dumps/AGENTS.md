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
| `complete-dump-upload`   | Finish the multipart upload                                  |
| `abort-dump-upload`      | Cancel an open upload and delete its row                     |
| `update-dump`            | Rename, retag, note, or move a file                          |
| `delete-dump`            | Delete a ready file and its object                           |
| `get-dump-download-link` | 15-minute presigned GET for download or preview              |
| `create-dump-share`      | Expiring share link for a signed-in org member               |
| `open-dump-share`        | Open a share token and return a short GET URL                |

Upload flow: `start-dump-upload`, then `sign-dump-parts` in batches, PUT each
part from the browser, then `complete-dump-upload` with the ETags. Part size
is 8 MiB unless the file needs larger parts to stay under 10,000 parts.

## Backblaze

Server-only site environment variables:

- `B2_S3_ENDPOINT` — S3 endpoint, such as `https://s3.us-west-004.backblazeb2.com`
- `B2_REGION` — matching region, such as `us-west-004`
- `B2_BUCKET`
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`

Missing names are returned by `list-dumps` and shown in the library. Do not
ask anyone to paste the values into chat.

The bucket CORS rule must allow the site origin, methods PUT, GET, and HEAD,
header `*`, and expose `ETag`. The first upload tries to set that rule when
the key allows it.

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
