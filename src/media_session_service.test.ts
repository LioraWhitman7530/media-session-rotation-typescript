import assert from "node:assert/strict";
import { InfraiAuthClient, rotateMediaSession } from "./media_session_service.ts";

const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const body = JSON.parse(String(init?.body));
  calls.push({ path: new URL(url).pathname, body });
  return new Response(JSON.stringify({ ok: true, data: calls.length === 1 ? { session_id: "new-session", refresh_token: "next-token" } : {} }), { status: 200 });
};

const result = await rotateMediaSession({ user_id: "creator-42", session_id: "session-17", method: "refresh", refresh_token: "old-token" }, new InfraiAuthClient("from-test"));
assert.deepEqual(result, { asset_owner: "creator-42", delivery_session: "new-session", refresh_token: "next-token" });
assert.equal(calls[0].path, "/v1/auth/session/refresh");
assert.deepEqual(calls[1].body, { session_id: "session-17" });
globalThis.fetch = originalFetch;
console.log("media session rotation decision passed");
