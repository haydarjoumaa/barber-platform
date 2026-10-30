import { createMediaRepository, getDatabase } from "@barber/database";
import { accounts, staffToken } from "../../../../account-server";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const principal = await accounts().authenticate(await staffToken()), shopId = new URL(request.url).searchParams.get("shopId");
    if (!principal || !shopId || !/^[0-9a-f-]{36}$/i.test(shopId)) return new Response(null, { status: 404 });
    const bytes = await createMediaRepository(getDatabase()).ownerRead(principal, shopId, (await params).assetId);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Disposition": "inline" } });
  } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
