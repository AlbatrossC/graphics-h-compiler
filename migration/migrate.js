// migrate.js
// Reads users from CSV, fetches all objects from Cloudflare R2 (S3 API),
// and generates a migration.sql file ready to push to Cloudflare D1.
//
// Dependencies: @aws-sdk/client-s3, csv-parse, dotenv
// Install: npm install @aws-sdk/client-s3 csv-parse dotenv

// Load .env file from current directory
import { config } from "dotenv";
config(); // reads .env automatically

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { writeFileSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { parse } from "csv-parse/sync";

// ── Config ────────────────────────────────────────────────────────────────────
const BUCKET_NAME = process.env.R2_BUCKET || "__graphics-compiler-users";
const CSV_PATH = "./users.csv"; // path to your exported Supabase CSV
const OUTPUT_SQL = "./migration.sql";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

console.log("🔧 Config loaded:");
console.log(`   R2_ACCOUNT_ID     : ${R2_ACCOUNT_ID ? R2_ACCOUNT_ID.slice(0,6) + "..." : "❌ MISSING"}`);
console.log(`   R2_ACCESS_KEY_ID  : ${R2_ACCESS_KEY_ID ? R2_ACCESS_KEY_ID.slice(0,6) + "..." : "❌ MISSING"}`);
console.log(`   R2_SECRET_ACCESS_KEY : ${R2_SECRET_ACCESS_KEY ? "✓ loaded" : "❌ MISSING"}`);
console.log(`   BUCKET            : ${BUCKET_NAME}`);
console.log("");

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("❌ Missing one or more required env vars. Check your .env file.");
  process.exit(1);
}

// ── S3 Client (Cloudflare R2) ─────────────────────────────────────────────────
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function escStr(str) {
  if (str === null || str === undefined) return "NULL";
  return `'${String(str).replace(/'/g, "''")}'`;
}

function generateId() {
  // UUID v4 via crypto
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── List ALL objects in R2 bucket ─────────────────────────────────────────────
async function listAllObjects() {
  const objects = [];
  let continuationToken = undefined;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      ContinuationToken: continuationToken,
    });
    const resp = await s3.send(cmd);
    if (resp.Contents) objects.push(...resp.Contents);
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

// ── Fetch file content from R2 ────────────────────────────────────────────────
async function fetchObject(key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  const resp = await s3.send(cmd);
  const buf = await streamToBuffer(resp.Body);
  return buf.toString("utf-8");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Parse CSV
  console.log("📄 Reading CSV...");
  const csvContent = readFileSync(CSV_PATH, "utf-8");
  const users = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`   Found ${users.length} users.`);

  // 2. List all R2 objects
  console.log("☁️  Listing R2 objects...");
  const objects = await listAllObjects();
  console.log(`   Found ${objects.length} objects in bucket.`);

  // 3. Group objects by user_id → folder_name → [file_name]
  // Key format: <user_id>/<folder_name>/<file_name>
  const r2Tree = {}; // { user_id: { folder_name: [file_name, ...] } }
  for (const obj of objects) {
    const parts = obj.Key.split("/");
    if (parts.length < 3) {
      console.warn(`   Skipping unexpected key format: ${obj.Key}`);
      continue;
    }
    const [userId, folderName, ...fileParts] = parts;
    const fileName = fileParts.join("/"); // in case filename has slashes
    if (!r2Tree[userId]) r2Tree[userId] = {};
    if (!r2Tree[userId][folderName]) r2Tree[userId][folderName] = [];
    r2Tree[userId][folderName].push({ fileName, key: obj.Key });
  }

  const sqlLines = [];
  sqlLines.push("-- =====================================================");
  sqlLines.push("-- Migration: Supabase CSV + R2 → Cloudflare D1");
  sqlLines.push(`-- Generated: ${new Date().toISOString()}`);
  sqlLines.push("-- =====================================================");
  sqlLines.push("");

  // 4. Insert users
  console.log("👤 Generating user INSERTs...");
  sqlLines.push("-- USERS");
  for (const user of users) {
    const r2Folders = r2Tree[user.user_id] || {};
    const totalFiles = Object.values(r2Folders).reduce((sum, files) => sum + files.length, 0);

    sqlLines.push(
      `INSERT INTO users (user_id, display_name, email, first_sign_in, last_sign_in, total_files, total_storage, write_blocked) ` +
      `VALUES (${escStr(user.user_id)}, ${escStr(user.display_name)}, ${escStr(user.email)}, ` +
      `${user.first_sign_in || "NULL"}, ${user.last_sign_in || "NULL"}, ${totalFiles}, 0, 0) ` +
      `ON CONFLICT(user_id) DO UPDATE SET ` +
      `display_name=excluded.display_name, email=excluded.email, ` +
      `first_sign_in=excluded.first_sign_in, last_sign_in=excluded.last_sign_in, ` +
      `total_files=excluded.total_files;`
    );
  }
  sqlLines.push("");

  // 5. Insert folders & files
  console.log("📁 Generating folder + file INSERTs (fetching file contents from R2)...");
  sqlLines.push("-- FOLDERS & FILES");

  let totalFilesProcessed = 0;

  for (const [userId, folders] of Object.entries(r2Tree)) {
    for (const [folderName, files] of Object.entries(folders)) {
      const folderId = generateId();

      sqlLines.push(
        `INSERT INTO folders (id, user_id, folder_name) VALUES (${escStr(folderId)}, ${escStr(userId)}, ${escStr(folderName)}) ` +
        `ON CONFLICT(user_id, folder_name) DO NOTHING;`
      );

      for (const { fileName, key } of files) {
        process.stdout.write(`   Fetching: ${key} ... `);
        let content = "";
        try {
          content = await fetchObject(key);
          process.stdout.write("✓\n");
        } catch (err) {
          process.stdout.write(`✗ (${err.message})\n`);
          content = "";
        }

        const fileSize = Buffer.byteLength(content, "utf-8");
        const contentHash = createHash("sha256").update(content).digest("hex");
        const fileId = generateId();

        sqlLines.push(
          `INSERT INTO files (id, user_id, folder_id, file_name, file_content, file_size, content_hash) ` +
          `VALUES (${escStr(fileId)}, ${escStr(userId)}, ${escStr(folderId)}, ${escStr(fileName)}, ` +
          `${escStr(content)}, ${fileSize}, ${escStr(contentHash)}) ` +
          `ON CONFLICT(user_id, folder_id, file_name) DO NOTHING;`
        );

        totalFilesProcessed++;
      }
    }
  }

  // 6. Update total_storage per user (sum of file sizes)
  sqlLines.push("");
  sqlLines.push("-- UPDATE total_storage per user");
  sqlLines.push(
    `UPDATE users SET total_storage = (` +
    `  SELECT COALESCE(SUM(f.file_size), 0) FROM files f WHERE f.user_id = users.user_id` +
    `);`
  );

  // 7. Write SQL file
  writeFileSync(OUTPUT_SQL, sqlLines.join("\n"), "utf-8");
  console.log(`\n✅ Done! Generated ${OUTPUT_SQL}`);
  console.log(`   Users: ${users.length}, Files: ${totalFilesProcessed}`);
  console.log(`\nNext step: run ./import.sh to push to D1 remotely.`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});