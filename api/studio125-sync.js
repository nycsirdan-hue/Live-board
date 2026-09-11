/* global process */
import { syncLiveBoardEvent } from "./_studio125/sync-event.js";

const MAX_EVENT_DISTANCE_MS = 21 * 24 * 60 * 60 * 1000;

async function json(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `${label} failed (${response.status}).`);
  return body;
}

export function selectNearestEvent(events, presetId, now = Date.now()) {
  return (events || []).filter((event) => event.status === "scheduled" && event.liveboardEventId === presetId)
    .sort((left, right) => Math.abs(Date.parse(left.startsAt) - now) - Math.abs(Date.parse(right.startsAt) - now))[0] || null;
}

function newYorkDate(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function selectEventForNewYorkDay(events, now = Date.now()) {
  const today = newYorkDate(now);
  return (events || []).filter((event) =>
    event.status === "scheduled" && event.liveboardEventId && newYorkDate(event.startsAt) === today
  ).sort((left, right) => Math.abs(Date.parse(left.startsAt) - now) - Math.abs(Date.parse(right.startsAt) - now))[0] || null;
}

export function selectRequestedEvent(events, eventInstanceId) {
  return (events || []).find((event) =>
    event.id === eventInstanceId && event.status === "scheduled" && event.liveboardEventId
  ) || null;
}

function requestBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  return {};
}

export function createLiveBoardHandler({
  env = process.env,
  fetchFn = fetch,
  now = () => Date.now(),
  syncFn = syncLiveBoardEvent,
} = {}) {
  return async function handler(request, response) {
  if (env.LIVEBOARD_STUDIO125_SYNC_ENABLED?.trim().toLowerCase() !== "true") {
    return response.status(404).json({ error: "Not found." });
  }
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(method)) {
    response.setHeader?.("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  const eventTriggered = method === "POST";
  const authorizationSecret = eventTriggered ? env.STUDIO125_LIVEBOARD_TRIGGER_KEY : env.CRON_SECRET;
  if (!authorizationSecret || request.headers.authorization !== `Bearer ${authorizationSecret}`) {
    return response.status(401).json({ error: "Not authorized." });
  }
  try {
    const required = ["STUDIO125_API_URL", "STUDIO125_LIVEBOARD_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    if (eventTriggered) required.push("STUDIO125_LIVEBOARD_TRIGGER_KEY");
    const missing = required.filter((name) => !String(env[name] || "").trim());
    if (missing.length) throw new Error(`Missing server configuration: ${missing.join(", ")}.`);
    const studioBase = env.STUDIO125_API_URL.replace(/\/+$/, "");
    const studioKey = env.STUDIO125_LIVEBOARD_API_KEY;
    const supabaseBase = env.SUPABASE_URL.replace(/\/+$/, "");
    const supabaseHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
    const [eventBody, settings] = await Promise.all([
      fetchFn(`${studioBase}/api/v1/internal/liveboard/events`, { headers: { Authorization: `Bearer ${studioKey}` } })
        .then((result) => json(result, "Event discovery")),
      fetchFn(`${supabaseBase}/rest/v1/board_settings?select=id,active_event_display_preset_id&order=updated_at.desc&limit=1`, { headers: supabaseHeaders })
        .then((result) => json(result, "Active preset lookup")),
    ]);
    const currentTime = now();
    const dayEvent = selectEventForNewYorkDay(eventBody.events, currentTime);
    const presetId = String(settings[0]?.active_event_display_preset_id || "").trim();
    const requestedEventId = String(requestBody(request).eventInstanceId || "").trim();
    if (eventTriggered && !requestedEventId) {
      return response.status(400).json({ error: "eventInstanceId is required." });
    }
    const requestedEvent = eventTriggered ? selectRequestedEvent(eventBody.events, requestedEventId) : null;
    if (eventTriggered && !requestedEvent) {
      return response.status(404).json({ error: "Scheduled event with an assigned LiveBoard preset was not found." });
    }
    const event = eventTriggered ? requestedEvent : dayEvent || selectNearestEvent(eventBody.events, presetId, currentTime);
    if (dayEvent && settings[0]?.id && presetId !== dayEvent.liveboardEventId) {
      await fetchFn(`${supabaseBase}/rest/v1/board_settings?id=eq.${encodeURIComponent(settings[0].id)}`, {
        method: "PATCH",
        headers: { ...supabaseHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ active_event_display_preset_id: dayEvent.liveboardEventId, updated_at: new Date(currentTime).toISOString() }),
      }).then((result) => json(result, "Midnight LiveBoard preset activation"));
    }
    const closeEnough = event && (eventTriggered || Math.abs(Date.parse(event.startsAt) - currentTime) <= MAX_EVENT_DISTANCE_MS);
    const changes = closeEnough ? await syncFn({
      eventInstanceId: event.id, studio125ApiUrl: studioBase, studio125ApiKey: studioKey,
      supabaseUrl: env.SUPABASE_URL, supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    }, fetchFn) : [];
    return response.status(200).json({ ok: true, trigger: eventTriggered ? "event" : "schedule", eventInstanceId: closeEnough ? event.id : null, changes });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Synchronization failed." });
  }
  };
}

export default createLiveBoardHandler();
