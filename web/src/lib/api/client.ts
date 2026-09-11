import type { paths } from "./schema";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type HealthResponses = paths["/health"]["get"]["responses"];
export type HealthOk = HealthResponses[200]["content"]["application/json"];
export type HealthDegraded =
  HealthResponses[503]["content"]["application/json"];
export type Health = HealthOk | HealthDegraded;

/** GET /health. Returns the body for both 200 and 503; throws only on network failure. */
export async function getHealth(): Promise<Health> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  return (await res.json()) as Health;
}
