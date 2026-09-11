const FROM = "Studio125 Reservations <contact@forms.studio125nyc.com>";

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function eventDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Reservation event date is invalid.");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
    year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(date);
}

function render(claim) {
  const introductions = {
    confirmation: "Your Studio125 reservation is confirmed.",
    reminder: "This is a reminder about your upcoming Studio125 reservation.",
    cancellation: "Your Studio125 reservation has been cancelled.",
    refund_update: "There is an update to your Studio125 reservation refund.",
  };
  const introduction = introductions[claim.messageKind];
  const eventTitle = String(claim.templateData?.eventTitle || "").trim();
  const confirmationCode = String(claim.templateData?.confirmationCode || "").trim();
  if (!introduction || !eventTitle || !confirmationCode) throw new Error("Reservation email data is incomplete.");
  const startsAt = eventDate(claim.templateData.startsAt);
  return {
    subject: claim.subject,
    text: [introduction, "", eventTitle, startsAt, `Confirmation: ${confirmationCode}`, "", "Studio125"].join("\n"),
    html: `<!doctype html><html><body style="background:#f4f1e8;color:#171713;font-family:Arial,sans-serif;margin:0;padding:32px"><main style="background:#fff;max-width:560px;margin:auto;padding:32px;border-radius:12px"><p style="letter-spacing:.12em;font-size:12px">STUDIO125</p><h1>${escapeHtml(eventTitle)}</h1><p>${escapeHtml(introduction)}</p><p><strong>${escapeHtml(startsAt)}</strong></p><p>Confirmation: <strong>${escapeHtml(confirmationCode)}</strong></p></main></body></html>`,
  };
}

async function json(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `${label} failed (${response.status}).`);
  return body;
}

async function sendResend(claim, apiKey, fetchFn) {
  const rendered = render(claim);
  const response = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": claim.dedupeKey },
    body: JSON.stringify({ from: FROM, to: [claim.destinationEmail], ...rendered }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) throw new Error(body.message || `Resend rejected the email (${response.status}).`);
  return body.id;
}

export async function deliverReservationEmails(config, fetchFn = fetch) {
  const studioBase = config.studio125ApiUrl.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${config.studio125EmailApiKey}`, "Content-Type": "application/json" };
  const claimed = await fetchFn(`${studioBase}/api/v1/internal/reservation-email/claims`, {
    method: "POST", headers, body: JSON.stringify({ limit: 5 }),
  }).then((response) => json(response, "Email claim"));
  const results = [];
  for (const claim of claimed.claims || []) {
    let acknowledgment;
    try {
      const id = await sendResend(claim, config.resendApiKey, fetchFn);
      acknowledgment = { claimToken: claim.claimToken, outcome: "sent", provider: "resend", providerMessageId: id };
    } catch (error) {
      acknowledgment = { claimToken: claim.claimToken, outcome: "retry",
        error: error instanceof Error ? error.message : "Email delivery failed.",
        nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 60_000 * (2 ** Math.max(0, claim.attemptCount - 1)))).toISOString() };
    }
    const result = await fetchFn(`${studioBase}/api/v1/internal/reservation-email/claims/${encodeURIComponent(claim.id)}`, {
      method: "PATCH", headers, body: JSON.stringify(acknowledgment),
    }).then((response) => json(response, "Email acknowledgment"));
    results.push({ id: claim.id, status: result.delivery.status });
  }
  return results;
}

export { FROM as RESERVATION_EMAIL_FROM };
