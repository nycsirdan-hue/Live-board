/* global process */
const COOKIE_NAME = "studio125_liveboard_staff";
const COOKIE_SECONDS = 12 * 60 * 60;

function enabled() {
  return process.env.LIVEBOARD_PERSONAL_STAFF_AUTH_ENABLED?.trim().toLowerCase() === "true";
}

function cookieToken(request) {
  const cookies = String(request.headers.cookie || "");
  return cookies.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || "";
}

function sessionCookie(token, maxAge = COOKIE_SECONDS) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function configuration() {
  const studioBase = String(process.env.STUDIO125_API_URL || "").replace(/\/+$/, "");
  const serviceKey = String(process.env.STUDIO125_LIVEBOARD_API_KEY || "");
  if (!studioBase || !serviceKey) throw new Error("LiveBoard personal staff access is not configured.");
  return { studioBase, serviceKey };
}

function sameOrigin(request) {
  const expected = String(process.env.LIVEBOARD_PUBLIC_ORIGIN || "");
  return Boolean(expected && request.headers.origin === expected);
}

async function studioRequest(path, token, init = {}) {
  const { studioBase, serviceKey } = configuration();
  return fetch(`${studioBase}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      "x-studio125-service-key": serviceKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export default async function handler(request, response) {
  if (!enabled()) return response.status(404).json({ enabled: false });
  try {
    if (request.method === "GET") {
      const token = cookieToken(request);
      if (!token) return response.status(200).json({ enabled: true, authenticated: false });
      const upstream = await studioRequest("/api/staff-auth/session?audience=liveboard", token);
      const body = await upstream.json().catch(() => ({}));
      return response.status(upstream.ok ? 200 : 401).json({ enabled: true, ...body });
    }
    if (!sameOrigin(request)) return response.status(403).json({ error: "Invalid request origin." });
    if (request.method === "POST") {
      const upstream = await studioRequest("/api/staff-auth/login", "", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: "liveboard", email: request.body?.email, password: request.body?.password }),
      });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || !body.token) return response.status(upstream.status).json({ error: body.error || "Sign-in was not accepted." });
      response.setHeader("Set-Cookie", sessionCookie(body.token));
      return response.status(200).json({ authenticated: true, staff: body.staff });
    }
    if (request.method === "DELETE") {
      const token = cookieToken(request);
      if (token) await studioRequest("/api/staff-auth/session?audience=liveboard", token, { method: "DELETE" });
      response.setHeader("Set-Cookie", sessionCookie("", 0));
      return response.status(200).json({ ok: true });
    }
    return response.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Staff access failed." });
  }
}
