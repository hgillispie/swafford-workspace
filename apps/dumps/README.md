# Dumps

Private video dumps for the workspace. Hunter and Matt drop MP4s in the
browser, including multi-gigabyte files and whole folders. Bytes go straight
to a private Backblaze B2 bucket. Postgres stores only the ledger.

Open the library at `/dumps`.

## Bucket

The bucket is private, server-side encryption is on, and Object Lock is off.

| Setting | Value |
| --- | --- |
| Bucket | `swafford-video-dumps` |
| Region | `us-east-005` |
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
URLs, and PUTs the bytes to B2. Part size starts at 8 MiB and grows toward
32 MiB for multi-gigabyte files so a file stays under 10,000 parts. Several
parts run at once, and two files can be in flight together. A failed upload
stays open. Choose the same file from its row to resume. Already stored parts
are skipped.

`configure-dump-cors` writes the bucket CORS rule: production origin
`https://swafford-workspace.netlify.app`, localhost dev origins, methods
`GET`, `PUT`, `HEAD`, and `POST`, header `*`, and exposed `ETag`. The first
upload tries the same rule.

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
