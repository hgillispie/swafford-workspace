# Dumps

Private file dumps for the workspace. Files go directly to a Backblaze B2
bucket. The app stores only the ledger.

Open the library at `/dumps`.

## Bucket setup

Set these server-only variables on the Netlify site and in the workspace
environment. Do not commit their values.

- `B2_S3_ENDPOINT`
- `B2_REGION`
- `B2_BUCKET`
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`

`B2_S3_ENDPOINT` is the S3 endpoint, for example
`https://s3.us-west-004.backblazeb2.com`. `B2_REGION` is the matching region.

Bucket CORS must allow the site origin, methods `PUT`, `GET`, and `HEAD`,
any header, and must expose `ETag`. Dumps tries to write that rule on the
first upload when the key has permission.
