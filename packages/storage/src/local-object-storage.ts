import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export interface ObjectStorage {
  write(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
export function localUploadRoot(): string {
  if (process.env.BARBER_UPLOAD_ROOT) {
    if (!isAbsolute(process.env.BARBER_UPLOAD_ROOT)) throw new Error("BARBER_UPLOAD_ROOT must be an absolute path");
    return process.env.BARBER_UPLOAD_ROOT;
  }
  const cwd = process.cwd();
  const workspaceRoot = basename(dirname(cwd)) === "apps" && ["business", "client"].includes(basename(cwd)) ? resolve(cwd, "../..") : cwd;
  return join(workspaceRoot, ".local", "uploads");
}
export function createLocalObjectStorage(root = localUploadRoot()): ObjectStorage {
  function path(key: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/.test(key)) throw new Error("Invalid storage key");
    return join(root, key);
  }
  return {
    async write(key, bytes) {
      const target = path(key);
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    },
    async read(key) { return new Uint8Array(await readFile(path(key))); },
    async remove(key) {
      try { await unlink(path(key)); }
      catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
    },
  };
}
