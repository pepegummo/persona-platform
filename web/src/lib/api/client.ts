import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./schema";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Schemas = components["schemas"];
export type Persona = Schemas["PersonaOut"];
export type PersonaListItem = Schemas["PersonaListItem"];
export type PersonaSettings = Schemas["PersonaSettings"];
export type PersonaCreate = Schemas["PersonaCreate"];
export type PersonaUpdate = Schemas["PersonaUpdate"];
export type Example = Schemas["ExampleOut"];
export type ExampleCreate = Schemas["ExampleCreate"];
export type ExampleUpdate = Schemas["ExampleUpdate"];

type HealthResponses = paths["/health"]["get"]["responses"];
// `Required` because fields with defaults are optional in the generated request/response types.
export type HealthOk = Required<HealthResponses[200]["content"]["application/json"]>;
export type HealthDegraded = Required<HealthResponses[503]["content"]["application/json"]>;
export type Health = HealthOk | HealthDegraded;

export type ApiClient = ReturnType<typeof createClient<paths>>;

/** Typed client; `getToken` is called per request so tokens can rotate. */
export function makeApiClient(getToken: () => Promise<string | null>): ApiClient {
  const client = createClient<paths>({ baseUrl: API_URL });
  const auth: Middleware = {
    async onRequest({ request }) {
      const token = await getToken();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}

/** Human-readable message from a FastAPI error body. */
export function errorMessage(error: unknown, fallback = "Request failed"): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : ""))
        .filter(Boolean)
        .join("; ");
    }
  }
  return fallback;
}

/** GET /health. Returns the body for both 200 and 503; throws only on network failure. */
export async function getHealth(): Promise<Health> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  return (await res.json()) as Health;
}
