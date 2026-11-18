import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const { apiRequest, SESSION_EXPIRED_EVENT } = await import("../src/services/apiClient.js");

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test("retries a protected request after refreshing an expired access token", async () => {
  const requests = [];
  let protectedRequests = 0;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/auth/refresh")) return jsonResponse(200, { message: "Session refreshed" });
    protectedRequests += 1;
    return protectedRequests === 1
      ? jsonResponse(401, { detail: "Authentication required" })
      : jsonResponse(200, { assistant_enabled: true });
  };

  const result = await apiRequest("/admin/crm/voice/status");

  assert.deepEqual(result, { assistant_enabled: true });
  assert.equal(requests.length, 3);
  assert.equal(requests[1].options.method, "POST");
  assert.equal(requests[1].options.credentials, "include");
  assert.equal(requests[2].url, "/api/admin/crm/voice/status");
});

test("does not refresh the session for authentication requests", async () => {
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    return jsonResponse(401, { detail: "Invalid credentials" });
  };

  await assert.rejects(apiRequest("/auth/password/login", { method: "POST" }), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.message, "Invalid credentials");
    return true;
  });
  assert.deepEqual(requests, ["/api/auth/password/login"]);
});

test("announces an expired session when refresh is rejected", async () => {
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async (url) =>
    jsonResponse(url.endsWith("/auth/refresh") ? 401 : 401, { detail: "Authentication required" });

  await assert.rejects(apiRequest("/admin/crm/voice/calls"), (error) => error.status === 401);
  assert.deepEqual(events, [SESSION_EXPIRED_EVENT]);
});
