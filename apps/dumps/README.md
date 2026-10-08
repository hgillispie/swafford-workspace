# Dumps

Private video dumps for the workspace. Hunter and Matt drop MP4s in the
browser, including multi-gigabyte files and whole folders. Bytes go straight
to a private Backblaze B2 bucket. Postgres stores only the ledger.

Open the library at `/dumps`.

## Bucket

The bucket is private, server-side encryption is on, and Object Lock is off.

| Setting     | Value                                    |
| ----------- | ---------------------------------------- |
| Bucket      | `swafford-video-dumps`                   |
| Region      | `us-east-005`                            |
| S3 endpoint | `https://s3.us-east-005.backblazeb2.com` |

Server-only variables. The endpoint, region, and bucket name are not secret
and are also in `docs/.env.example`. The key id and application key stay in
the Netlify site environment and the workspace root `.env`.

- `B2_S3_ENDPOINT`
- `B2_REGION`
- `B2_BUCKET`
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`

Local runs read those names from the process environment, then from the
workspace root `.env` when a name is unset. The public bucket settings above
are the fallback for the three non-secret names.

## Browser uploads

The browser asks Dumps to start a multipart upload, receives presigned part
URLs, and PUTs the bytes to B2. Parts are 8 MiB, the size rclone and the AWS
CLI use, so a 16 GiB file is 2,048 parts. A file only gets bigger parts when it
would need more than 10,000 (about 78 GiB). Files under 1 GiB send three parts
at once. A larger file sends one part at a time, and two smaller files can be
in flight together.

The browser copies each part into memory and PUTs that, with no Content-Type
header. The presign signs only `host` and `UNSIGNED-PAYLOAD`. Checksum query
parameters are left off: `x-amz-checksum-crc32=AAAAAA==` is the checksum of an
empty body, and Backblaze resets the connection while a real part is
uploading. Reading the part first means a file that changes on disk, or sits on
an external drive, network share, or sync folder that stalls, fails with a clear
"could not read this file" message instead of looking like a network drop.

Backblaze error responses omit `Access-Control-Allow-Origin`, so the browser
cannot tell a reset from a rejected request or a lost link. Each part is tried
up to eight times with backoff, waits while the browser is offline, and is
abandoned after 60 seconds without progress. When a part still fails, the
upload lists the parts Backblaze holds, waits, and continues from the missing
ones. It stops only after four rounds in a row store nothing new. Progress
never moves backward. The row shows "Lost the connection to Backblaze" while it
waits.

When it does stop, the page asks the server to run `probe-dump-upload`: one
5 MiB throwaway part is PUT from the server through the same presigned URL and
then aborted. The server can read what Backblaze really answered, so the row
says either `Backblaze rejected a test part with 403 SignatureDoesNotMatch`
(a key, signature, or encryption problem) or that Backblaze accepted it and the
break is between this computer and Backblaze (VPN, a firewall or antivirus that
inspects uploads, an unstable link). The probe also reports whether the bucket
CORS rule lists the site and exposes `ETag`.

A failed upload stays open. Choose the same file from its row to resume.
Already stored parts are skipped. If Backblaze no longer has that upload
session, resume first checks whether the finished object is already in the
bucket (a Complete whose response was lost) and marks the row ready. Otherwise
it starts the same row over and says so. An open upload with no stored parts
and a part size above 8 MiB is aborted and started again in 8 MiB parts. An
upload that already has stored parts keeps its part size. No bucket CORS change
is required for this. The existing `workspaceUploads` rule already allows the
site origin to PUT and exposes `ETag`.

`configure-dump-cors` writes the bucket CORS rule: production origin
`https://swafford-workspace.netlify.app`, the workspace gateway on port
8080, localhost ports 3000 and 5173, methods `GET`, `PUT`, `HEAD`, and
`POST`, header `*`, and exposed `ETag`. The bucket already has this rule
as `workspaceUploads`. Starting an upload does not change it. Successful
PUTs from that origin already return the origin and `ETag`. Backblaze omits
the origin header on error responses, which is why a failed part looks like a
network error.

Preview and download use a 15-minute presigned GET. Preview is inline so an
MP4 plays in the browser. Download uses an attachment disposition.

## Shop copies with rclone

From a shop machine, copy into this organization's inbox prefix. The library
shows the prefix after sign-in. It looks like `org/<org id>/inbox/`.

```sh
rclone copy "/path/to/drive" ":s3:swafford-video-dumps/org/<org id>/inbox" \
  --s3-provider Other \
  --s3-endpoint "https://s3.us-east-005.backblazeb2.com" \
  --s3-region "us-east-005" \
  --s3-access-key-id "$B2_KEY_ID" \
  --s3-secret-access-key "$B2_APPLICATION_KEY"
```

Then ask the agent to run `index-dump-bucket`, or call it from the app. It
lists objects under `org/<org id>/` and inserts ledger rows for keys that are
not already recorded. When the result includes `nextToken`, call it again
with that `cursor`. Indexed MP4s can be previewed, tagged, shared, and
downloaded like browser uploads.
