import { clientShop } from "../../client-server";
export async function GET(_request: Request, { params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params, shop = await clientShop(shopSlug);
  if (!shop) return new Response(null, { status: 404 });
  return Response.json({ id: `/${shopSlug}/`, name: shop.name, short_name: shop.name.slice(0, 24), start_url: `/${shopSlug}/book`, scope: `/${shopSlug}/`, display: "standalone", background_color: "#ffffff", theme_color: shop.brandColor,
    icons: [{ src: "/assets/app-192.png", sizes: "192x192", type: "image/png" }, { src: "/assets/app-512.png", sizes: "512x512", type: "image/png" }] }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } });
}
