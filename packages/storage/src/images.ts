import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ObjectStorage } from "./local-object-storage";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export interface ImageUpload { bytes: Uint8Array; contentType: string; }
export interface StoredImage { storageKey: string; mimeType: "image/jpeg"; byteSize: number; width: number; height: number; }
let activeConversions = 0;

/** Decode and re-encode; client MIME and filenames never determine stored content. */
export async function storeImage(storage: ObjectStorage, upload: ImageUpload): Promise<StoredImage> {
  if (!upload.bytes.byteLength || upload.bytes.byteLength > MAX_IMAGE_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(upload.contentType)) throw new Error("Invalid image");
  if (activeConversions >= 2) throw new Error("Image processing busy");
  activeConversions += 1;
  try {
    const decoder = sharp(Buffer.from(upload.bytes), { failOn: "warning", limitInputPixels: 20_000_000 });
    const metadata = await decoder.metadata();
    const mime = ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[metadata.format ?? ""];
    if (!mime || mime !== upload.contentType || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
    // The default output drops EXIF/GPS and other input metadata. No SVG or animation is accepted.
    const { data, info } = await decoder.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const storageKey = `${randomUUID()}.jpg`;
    await storage.write(storageKey, data);
    return { storageKey, mimeType: "image/jpeg", byteSize: data.byteLength, width: info.width, height: info.height };
  } finally { activeConversions -= 1; }
}
