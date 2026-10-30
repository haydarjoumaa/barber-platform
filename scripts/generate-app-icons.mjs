import { mkdir } from "node:fs/promises";
import sharp from "sharp";
for (const app of ["business", "client"]) {
  const directory = new URL(`../apps/${app}/public/assets/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const size of [192, 512]) await sharp(new URL("../packages/ui/assets/app-icon.svg", import.meta.url).pathname).resize(size, size).png().toFile(new URL(`app-${size}.png`, directory).pathname);
}
