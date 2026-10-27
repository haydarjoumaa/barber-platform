import type { HealthResponse } from "@barber/shared";

export function GET() {
  return Response.json({ status: "ok", app: "business" } satisfies HealthResponse);
}
