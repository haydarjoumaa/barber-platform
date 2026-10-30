import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  transpilePackages: ["@barber/ui", "@barber/shared"],
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  poweredByHeader: false,
};
export default config;
