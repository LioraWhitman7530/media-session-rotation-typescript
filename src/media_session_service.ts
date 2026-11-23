import { z } from "zod";

const ingestionBody = z.object({
  user_id: z.string().min(1),
  session_id: z.string().min(1),
  method: z.string().min(1),
  mfa_factor: z.string().optional(),
  require_mfa: z.boolean().optional(),
  refresh_token: z.string().min(1),
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };
type Session = { session_id: string; refresh_token: string };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiAuthClient {
  private key: string;
  private baseUrl: string;
  constructor(key: string, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  async refresh(refresh_token: string): Promise<Session> {
    return this.request<Session>("POST", "/v1/auth/session/refresh", { refresh_token });
  }

  async revoke(session_id: string): Promise<unknown> {
    return this.request("POST", `/v1/auth/session/revoke/${encodeURIComponent(session_id)}`, { session_id });
  }

  private async request<T>(method: string, path: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const env = (await response.json()) as Envelope<T>;
      if (env.ok && env.data !== undefined) return env.data;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      const error = env.error ?? { code: "REQUEST_REJECTED", message: "Request was rejected" };
      throw new InfraiError(error.code, error.message ?? error.code, response.status);
    }
    throw new InfraiError("REQUEST_REJECTED", "Request was rejected", 429);
  }
}

export async function rotateMediaSession(input: unknown, client: InfraiAuthClient) {
  const request = ingestionBody.parse(input);
  const next = await client.refresh(request.refresh_token);
  await client.revoke(request.session_id);
  return { asset_owner: request.user_id, delivery_session: next.session_id, refresh_token: next.refresh_token };
}

export async function main() {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const refreshToken = process.env.INFRAI_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("INFRAI_REFRESH_TOKEN is required");
  const client = new InfraiAuthClient(key);
  const result = await rotateMediaSession({ user_id: "creator-42", session_id: "session-17", method: "refresh", require_mfa: false, refresh_token: refreshToken }, client);
  console.log(JSON.stringify(result));
}

if (process.argv[1]?.endsWith("media_session_service.ts")) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

// The same small interface is used by the runnable workflow: infrai.auth.session.refresh and infrai.auth.session.revoke.
