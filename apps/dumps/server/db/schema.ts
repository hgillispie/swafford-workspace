import {
  bigint,
  index,
  now,
  ownableColumns,
  table,
  text,
  uniqueIndex,
} from "@agent-native/core/db/schema";

export const dumpFolders = table(
  "dump_folders",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [
    index("dump_folders_org_idx").on(t.orgId),
    index("dump_folders_parent_idx").on(t.parentId),
  ],
);

export const dumpFiles = table(
  "dump_files",
  {
    id: text("id").primaryKey(),
    folderId: text("folder_id"),
    filename: text("filename").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    contentType: text("content_type"),
    uploaderEmail: text("uploader_email").notNull(),
    notes: text("notes"),
    tags: text("tags"),
    b2Key: text("b2_key").notNull(),
    uploadId: text("upload_id"),
    status: text("status", { enum: ["uploading", "ready", "failed"] })
      .notNull()
      .default("uploading"),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [
    index("dump_files_org_folder_idx").on(t.orgId, t.folderId),
    index("dump_files_org_status_idx").on(t.orgId, t.status),
  ],
);

export const dumpShares = table(
  "dump_shares",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id").notNull(),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [
    uniqueIndex("dump_shares_token_idx").on(t.token),
    index("dump_shares_file_idx").on(t.fileId),
    index("dump_shares_org_idx").on(t.orgId),
  ],
);
