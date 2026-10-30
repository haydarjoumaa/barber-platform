import { createMediaRepository, getDatabase } from "@barber/database";
export async function GET(_request: Request, { params }: { params: Promise<{ shopSlug: string }> }) {
  try {
    const bytes = await createMediaRepository(getDatabase()).publicLogo((await params).shopSlug);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" } });
  } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
