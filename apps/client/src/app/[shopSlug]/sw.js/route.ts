import { offlineWorker } from "@barber/shared";
import { clientShop } from "../../client-server";
export async function GET(_request: Request, { params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  if (!await clientShop(shopSlug)) return new Response(null, { status: 404 });
  return new Response(offlineWorker, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store", "Service-Worker-Allowed": `/${shopSlug}/` } });
}
