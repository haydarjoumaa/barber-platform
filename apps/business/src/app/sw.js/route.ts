import { offlineWorker } from "@barber/shared";
export function GET() { return new Response(offlineWorker, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store", "Service-Worker-Allowed": "/" } }); }
