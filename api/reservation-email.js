/* global process */
import { deliverReservationEmails } from "./_studio125/reservation-email.js";

export default async function handler(request, response) {
  if (process.env.RESERVATION_EMAIL_SENDER_ENABLED?.trim().toLowerCase() !== "true") {
    return response.status(404).json({ error: "Not found." });
  }
  if (!process.env.CRON_SECRET || request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({ error: "Not authorized." });
  }
  const required = ["STUDIO125_API_URL", "STUDIO125_EMAIL_API_KEY", "RESEND_API_KEY"];
  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length) return response.status(503).json({ error: `Missing server configuration: ${missing.join(", ")}.` });
  try {
    const results = await deliverReservationEmails({
      studio125ApiUrl: process.env.STUDIO125_API_URL,
      studio125EmailApiKey: process.env.STUDIO125_EMAIL_API_KEY,
      resendApiKey: process.env.RESEND_API_KEY,
    });
    return response.status(200).json({ ok: true, results });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Email delivery failed." });
  }
}
