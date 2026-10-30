import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createLocalObjectStorage, localUploadRoot } from "../packages/storage/src/local-object-storage";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const root = localUploadRoot(), storage = createLocalObjectStorage(root);
try {
  let removed = 0;
  while (true) {
    const pending = await db.mediaAsset.findMany({ where: { removedAt: { not: null }, purgedAt: null }, select: { id: true, storageKey: true }, orderBy: { id: "asc" }, take: 100 });
    if (!pending.length) break;
    for (const asset of pending) {
      await storage.remove(asset.storageKey);
      await db.mediaAsset.updateMany({ where: { id: asset.id, removedAt: { not: null }, purgedAt: null }, data: { purgedAt: new Date() } });
      removed += 1;
    }
  }
  const files = await readdir(root).catch(error => { if (error.code === "ENOENT") return []; throw error; });
  const orphanCutoff = Date.now() - 24 * 60 * 60_000;
  for (const key of files) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/.test(key)) continue;
    const file = await lstat(join(root, key)).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!file) continue;
    if (!file.isFile()) continue;
    const asset = await db.mediaAsset.findUnique({ where: { storageKey: key }, select: { id: true, removedAt: true } });
    // Active assets are never deleted. New orphan objects may belong to an in-flight upload.
    if (asset ? !asset.removedAt : file.mtimeMs >= orphanCutoff) continue;
    await storage.remove(key);
    if (asset) await db.mediaAsset.updateMany({ where: { id: asset.id, removedAt: { not: null } }, data: { purgedAt: new Date() } });
    removed += 1;
  }
  console.log(`Removed ${removed} withdrawn or old unreferenced image object(s).`);
} finally { await db.$disconnect(); }
