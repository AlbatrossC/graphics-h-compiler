// migrate.js
// Build migration.sql using:
//   - users.csv (required, Supabase export)
//   - R2 object contents (file source of truth)
//
// R2 key format supported:
//   - user_id/folder_name/file_name
//   - user_id/file_name (treated as root file)
//
// Targets workers/graphics-oc-files/schema.sql.
// Always keeps users.last_opened_file_id as NULL.

import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";
import { createHash, randomUUID } from "crypto";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

config();

const USERS_CSV = process.env.USERS_CSV || "./users.csv";
const OUTPUT_SQL = process.env.OUTPUT_SQL || "./migration.sql";
const BUCKET_NAME = process.env.R2_BUCKET || "__graphics-compiler-users";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("Missing R2 env vars. Need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function escStr(str) {
  if (str === null || str === undefined) return "NULL";
  return `'${String(str).replace(/'/g, "''")}'`;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFlag(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "t", "yes", "y"].includes(s)) return 1;
  if (["0", "false", "f", "no", "n"].includes(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? (n ? 1 : 0) : fallback;
}

function firstField(row, names, fallback = null) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      const value = row[name];
      if (value !== undefined) return value;
    }
  }
  return fallback;
}

function parseUsersCsv(rows) {
  const usersById = new Map();
  const seenEmail = new Set();

  for (const row of rows) {
    const userId = cleanText(firstField(row, ["user_id", "id", "uid"]));
    if (!userId) continue;

    const emailRaw = cleanText(firstField(row, ["email", "user_email"]));
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    if (email && seenEmail.has(email)) {
      console.warn(`Skipping duplicate email row: ${email} (user_id=${userId})`);
      continue;
    }
    if (email) seenEmail.add(email);

    usersById.set(userId, {
      user_id: userId,
      display_name: cleanText(firstField(row, ["display_name", "name", "full_name"])) || email || userId,
      email,
      first_sign_in: toIntOrNull(firstField(row, ["first_sign_in", "created_at_ms", "created_at"])),
      last_sign_in: toIntOrNull(firstField(row, ["last_sign_in", "updated_at_ms", "updated_at"])),
      write_blocked: toFlag(firstField(row, ["write_blocked", "is_blocked"]), 0),
    });
  }

  return usersById;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function listAllObjects() {
  const out = [];
  let continuationToken = undefined;

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: continuationToken,
      })
    );
    if (resp.Contents) out.push(...resp.Contents);
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  return out;
}

async function fetchObjectText(key) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const buf = await streamToBuffer(resp.Body);
  return buf.toString("utf-8");
}

function parseR2Key(key) {
  const parts = String(key).split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const userId = parts[0];
  if (parts.length === 2) {
    return { user_id: userId, folder_name: null, file_name: parts[1] };
  }
  return {
    user_id: userId,
    folder_name: parts[1],
    file_name: parts.slice(2).join("/"),
  };
}

function sha256Hex(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function buildDataFromR2() {
  const folders = [];
  const files = [];

  const folderIdByKey = new Map();
  const seenFileKey = new Set();

  const objects = await listAllObjects();
  console.log(`R2 objects found: ${objects.length}`);

  for (const obj of objects) {
    const key = obj?.Key;
    if (!key) continue;

    const parsed = parseR2Key(key);
    if (!parsed || !parsed.user_id || !parsed.file_name) {
      console.warn(`Skipping unsupported key format: ${key}`);
      continue;
    }

    let folderId = null;
    if (parsed.folder_name) {
      const folderKey = `${parsed.user_id}\u0000${parsed.folder_name.toLowerCase()}`;
      folderId = folderIdByKey.get(folderKey);
      if (!folderId) {
        folderId = randomUUID();
        folderIdByKey.set(folderKey, folderId);
        folders.push({
          id: folderId,
          user_id: parsed.user_id,
          folder_name: parsed.folder_name,
        });
      }
    }

    const dedupeKey = folderId
      ? `FOLDER\u0000${parsed.user_id}\u0000${folderId}\u0000${parsed.file_name.toLowerCase()}`
      : `ROOT\u0000${parsed.user_id}\u0000${parsed.file_name.toLowerCase()}`;
    if (seenFileKey.has(dedupeKey)) continue;
    seenFileKey.add(dedupeKey);

    let content = "";
    try {
      content = await fetchObjectText(key);
    } catch (error) {
      console.warn(`Failed to read R2 object ${key}: ${error?.message || error}`);
      content = "";
    }

    files.push({
      id: randomUUID(),
      user_id: parsed.user_id,
      folder_id: folderId,
      file_name: parsed.file_name,
      file_content: content,
      file_size: Buffer.byteLength(content, "utf-8"),
      content_hash: sha256Hex(content),
    });
  }

  return { folders, files };
}

function buildStats(files) {
  const byUser = new Map();
  for (const file of files) {
    const prev = byUser.get(file.user_id) || { total_files: 0, total_storage: 0 };
    prev.total_files += 1;
    prev.total_storage += Number(file.file_size || 0);
    byUser.set(file.user_id, prev);
  }
  return byUser;
}

function buildSql(usersById, folders, files) {
  const stats = buildStats(files);
  const sql = [];

  sql.push("-- =====================================================");
  sql.push("-- Migration: users.csv + R2 objects -> Cloudflare D1");
  sql.push(`-- Generated: ${new Date().toISOString()}`);
  sql.push("-- =====================================================");
  sql.push("");

  sql.push("-- USERS");
  for (const user of usersById.values()) {
    const s = stats.get(user.user_id) || { total_files: 0, total_storage: 0 };
    sql.push(
      `INSERT INTO users (` +
        `user_id, display_name, email, first_sign_in, last_sign_in, total_files, total_storage, write_blocked, last_opened_file_id` +
      `) VALUES (` +
        `${escStr(user.user_id)}, ${escStr(user.display_name)}, ${escStr(user.email)}, ` +
        `${user.first_sign_in ?? "NULL"}, ${user.last_sign_in ?? "NULL"}, ` +
        `${s.total_files}, ${s.total_storage}, ${user.write_blocked}, NULL` +
      `) ` +
      `ON CONFLICT(user_id) DO UPDATE SET ` +
        `display_name=excluded.display_name, ` +
        `email=excluded.email, ` +
        `first_sign_in=excluded.first_sign_in, ` +
        `last_sign_in=excluded.last_sign_in, ` +
        `total_files=excluded.total_files, ` +
        `total_storage=excluded.total_storage, ` +
        `write_blocked=excluded.write_blocked, ` +
        `last_opened_file_id=NULL;`
    );
  }
  sql.push("");

  sql.push("-- FOLDERS");
  for (const folder of folders) {
    sql.push(
      `INSERT INTO folders (id, user_id, folder_name) VALUES (` +
        `${escStr(folder.id)}, ${escStr(folder.user_id)}, ${escStr(folder.folder_name)}` +
      `) ON CONFLICT(user_id, folder_name) DO NOTHING;`
    );
  }
  sql.push("");

  sql.push("-- FILES");
  for (const file of files) {
    const folderValue = file.folder_id ? escStr(file.folder_id) : "NULL";
    sql.push(
      `INSERT INTO files (` +
        `id, user_id, folder_id, file_name, file_content, file_size, content_hash` +
      `) VALUES (` +
        `${escStr(file.id)}, ${escStr(file.user_id)}, ${folderValue}, ${escStr(file.file_name)}, ` +
        `${escStr(file.file_content)}, ${file.file_size}, ${escStr(file.content_hash)}` +
      `) ` +
      `ON CONFLICT(user_id, folder_id, file_name) WHERE folder_id IS NOT NULL DO NOTHING ` +
      `ON CONFLICT(user_id, file_name) WHERE folder_id IS NULL DO NOTHING;`
    );
  }
  sql.push("");

  sql.push("-- Final stats sync and keep last_opened_file_id NULL");
  sql.push(
    `UPDATE users
SET total_files = (
  SELECT COUNT(*)
  FROM files f
  WHERE f.user_id = users.user_id
),
total_storage = (
  SELECT COALESCE(SUM(f.file_size), 0)
  FROM files f
  WHERE f.user_id = users.user_id
),
last_opened_file_id = NULL;`
  );

  return sql.join("\n");
}

async function main() {
  if (!existsSync(USERS_CSV)) {
    console.error(`Missing required CSV: ${USERS_CSV}`);
    process.exit(1);
  }

  const usersRows = parse(readFileSync(USERS_CSV, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const usersById = parseUsersCsv(usersRows);
  console.log(`Users in CSV: ${usersById.size}`);

  const { folders, files } = await buildDataFromR2();

  // Ensure users exist for all owners seen in R2.
  for (const folder of folders) {
    if (!usersById.has(folder.user_id)) {
      usersById.set(folder.user_id, {
        user_id: folder.user_id,
        display_name: folder.user_id,
        email: null,
        first_sign_in: null,
        last_sign_in: null,
        write_blocked: 0,
      });
    }
  }
  for (const file of files) {
    if (!usersById.has(file.user_id)) {
      usersById.set(file.user_id, {
        user_id: file.user_id,
        display_name: file.user_id,
        email: null,
        first_sign_in: null,
        last_sign_in: null,
        write_blocked: 0,
      });
    }
  }

  const sql = buildSql(usersById, folders, files);
  writeFileSync(OUTPUT_SQL, sql, "utf-8");

  console.log(`Generated ${OUTPUT_SQL}`);
  console.log(`users=${usersById.size}, folders=${folders.length}, files=${files.length}`);
  console.log("last_opened_file_id is NULL for all imported users.");
}

main().catch((err) => {
  console.error("Migration generation failed:", err?.message || err);
  process.exit(1);
});
