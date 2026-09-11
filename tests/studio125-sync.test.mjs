import assert from "node:assert/strict";
import test from "node:test";
import handler, {
  createLiveBoardHandler,
  selectEventForNewYorkDay,
  selectNearestEvent,
  selectRequestedEvent,
} from "../api/studio125-sync.js";
import { toLiveBoardEntry } from "../api/_studio125/card-projection.js";
import { deliverReservationEmails, RESERVATION_EMAIL_FROM } from "../api/_studio125/reservation-email.js";

test("Studio125 sync is unavailable unless its server flag is explicitly enabled", async () => {
  const original = process.env.LIVEBOARD_STUDIO125_SYNC_ENABLED;
  delete process.env.LIVEBOARD_STUDIO125_SYNC_ENABLED;
  const result = {};
  const response = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  await handler({ headers: {} }, response);
  assert.deepEqual(result, { status: 404, body: { error: "Not found." } });
  if (original === undefined) delete process.env.LIVEBOARD_STUDIO125_SYNC_ENABLED;
  else process.env.LIVEBOARD_STUDIO125_SYNC_ENABLED = original;
});

test("monthly event selection follows the active preset and nearest date", () => {
  const event = selectNearestEvent([
    { id: "old", status: "scheduled", liveboardEventId: "sting", startsAt: "2026-08-01T23:00:00Z" },
    { id: "next", status: "scheduled", liveboardEventId: "sting", startsAt: "2026-09-20T23:00:00Z" },
    { id: "other", status: "scheduled", liveboardEventId: "other", startsAt: "2026-09-20T23:00:00Z" },
  ], "sting", Date.parse("2026-09-19T23:00:00Z"));
  assert.equal(event.id, "next");
});

test("event-day activation follows the New York date from midnight onward", () => {
  const selected = selectEventForNewYorkDay([
    { id: "tonight", status: "scheduled", liveboardEventId: "sting", startsAt: "2026-09-20T01:00:00Z" },
    { id: "tomorrow", status: "scheduled", liveboardEventId: "next", startsAt: "2026-09-21T01:00:00Z" },
  ], Date.parse("2026-09-19T04:01:00Z"));
  assert.equal(selected.id, "tonight");
});

test("event trigger selects only a scheduled event with an assigned preset", () => {
  const events = [
    { id: "ready", status: "scheduled", liveboardEventId: "sting" },
    { id: "draft", status: "draft", liveboardEventId: "other" },
    { id: "unmapped", status: "scheduled", liveboardEventId: null },
  ];
  assert.equal(selectRequestedEvent(events, "ready").id, "ready");
  assert.equal(selectRequestedEvent(events, "draft"), null);
  assert.equal(selectRequestedEvent(events, "unmapped"), null);
});

function vercelResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("authenticated POST synchronizes exactly the Check-In event", async () => {
  const synced = [];
  const liveBoardHandler = createLiveBoardHandler({
    env: {
      LIVEBOARD_STUDIO125_SYNC_ENABLED: "true",
      STUDIO125_LIVEBOARD_TRIGGER_KEY: "trigger-secret",
      STUDIO125_API_URL: "https://studio.test",
      STUDIO125_LIVEBOARD_API_KEY: "studio-secret",
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-secret",
    },
    now: () => Date.parse("2026-09-18T20:00:00Z"),
    fetchFn: async (url) => {
      if (url.endsWith("/events")) return Response.json({ events: [
        { id: "event-sept", status: "scheduled", liveboardEventId: "preset-1", startsAt: "2026-09-19T20:00:00Z" },
        { id: "event-oct", status: "scheduled", liveboardEventId: "preset-2", startsAt: "2026-10-17T20:00:00Z" },
      ] });
      if (url.includes("/board_settings?")) return Response.json([{ id: "settings-1", active_event_display_preset_id: "preset-1" }]);
      return Response.json({ error: "unexpected request" }, { status: 500 });
    },
    syncFn: async (options) => {
      synced.push(options.eventInstanceId);
      return [{ cardId: "card-1", action: "publish" }];
    },
  });
  const response = vercelResponse();
  await liveBoardHandler({
    method: "POST",
    headers: { authorization: "Bearer trigger-secret" },
    body: { eventInstanceId: "event-sept" },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.trigger, "event");
  assert.deepEqual(synced, ["event-sept"]);
});

test("event trigger fails closed for missing credentials and unknown events", async () => {
  const liveBoardHandler = createLiveBoardHandler({
    env: {
      LIVEBOARD_STUDIO125_SYNC_ENABLED: "true",
      STUDIO125_LIVEBOARD_TRIGGER_KEY: "trigger-secret",
      STUDIO125_API_URL: "https://studio.test",
      STUDIO125_LIVEBOARD_API_KEY: "studio-secret",
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-secret",
    },
    fetchFn: async (url) => url.endsWith("/events")
      ? Response.json({ events: [] })
      : Response.json([{ id: "settings-1", active_event_display_preset_id: null }]),
  });
  const unauthorized = vercelResponse();
  await liveBoardHandler({ method: "POST", headers: {}, body: { eventInstanceId: "missing" } }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  const unknown = vercelResponse();
  await liveBoardHandler({
    method: "POST",
    headers: { authorization: "Bearer trigger-secret" },
    body: { eventInstanceId: "missing" },
  }, unknown);
  assert.equal(unknown.statusCode, 404);
});

test("projection omits private identity and keeps display values", () => {
  const entry = toLiveBoardEntry({
    displayName: "Alex", email: "private@example.com", answers: { position: "bottom" },
  }, { fields: [{ id: "position", legacyKey: "position", type: "select", options: [{ id: "bottom", label: "Bottom" }] }] });
  assert.equal(entry.name, "Alex");
  assert.equal(entry.position, "Bottom");
  assert.equal("email" in entry, false);
});

test("reservation email uses the existing sender, guest address, and idempotency key", async () => {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/claims")) return Response.json({ claims: [{
      id: "mail-1", claimToken: "claim-1", messageKind: "confirmation",
      destinationEmail: "guest@example.com", dedupeKey: "reservation:r-1:confirmation",
      subject: "Reservation confirmed", attemptCount: 1,
      templateData: { eventTitle: "STING", confirmationCode: "ABC234", startsAt: "2026-09-20T23:00:00Z" },
    }] });
    if (url === "https://api.resend.com/emails") return Response.json({ id: "email-1" });
    if (url.includes("/claims/mail-1")) return Response.json({ delivery: { status: "sent" } });
    return Response.json({ error: "unexpected" }, { status: 500 });
  };
  const result = await deliverReservationEmails({
    studio125ApiUrl: "https://studio.test", studio125EmailApiKey: "email-key", resendApiKey: "resend-key",
  }, fetchFn);
  assert.deepEqual(result, [{ id: "mail-1", status: "sent" }]);
  const send = calls.find((call) => call.url === "https://api.resend.com/emails");
  assert.equal(JSON.parse(send.init.body).from, RESERVATION_EMAIL_FROM);
  assert.deepEqual(JSON.parse(send.init.body).to, ["guest@example.com"]);
  assert.equal(send.init.headers["Idempotency-Key"], "reservation:r-1:confirmation");
});
