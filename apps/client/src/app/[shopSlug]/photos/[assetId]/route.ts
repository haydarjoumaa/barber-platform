import { createMediaRepository, getDatabase } from "@barber/database";
import { clientShop, clientToken } from "../../../client-server";

export async function GET(_request: Request, { params }: { params: Promise<{ shopSlug: string; assetId: string }> }) {
  try {
    const { shopSlug, assetId } = await params, shop = await clientShop(shopSlug);
    if (!shop) return new Response(null, { status: 404 });
    const bytes = await createMediaRepository(getDatabase()).clientRead(shopSlug, await clientToken(shop.id), assetId);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Disposition": "inline" } });
  } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
