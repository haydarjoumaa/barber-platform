import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "Barber Platform — Business", short_name: "Barber Business", start_url: "/workspace", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#2563eb",
    icons: [{ src: "/assets/app-192.png", sizes: "192x192", type: "image/png" }, { src: "/assets/app-512.png", sizes: "512x512", type: "image/png" }] };
}
