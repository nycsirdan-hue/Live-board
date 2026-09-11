# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# Studio125 LiveBoard

## Disabled Studio125 projection adapter

The local `/api/studio125-sync` Vercel Function can reconcile approved
Studio125 Connection Cards into the currently recalled LiveBoard preset. It is
fail-closed unless `LIVEBOARD_STUDIO125_SYNC_ENABLED=true`, requires Vercel's
server-side `CRON_SECRET`, and keeps both the Studio125 service credential and
Supabase service-role key out of browser code. No cron schedule, environment
secret, Supabase migration, deployment, or production change is included.

When a protected invocation runs on an event's New York calendar date, it
activates that event's assigned LiveBoard preset. A midnight-or-later invocation
therefore makes the event board available throughout the day. Queued Studio125
cards are still withheld until Check-In releases them; native LiveBoard entries
remain real-time.

The same function accepts an authenticated `POST` from Check-In using a
separate server-only `STUDIO125_LIVEBOARD_TRIGGER_KEY`. Its JSON body must name
an exact scheduled `eventInstanceId` with an assigned LiveBoard preset. This
event-driven path lets an accepted check-in publish queued cards immediately;
the existing scheduled `GET` continues to use `CRON_SECRET`.

`studio125-integration/board-entry-source-columns.sql` is review-only additive
SQL. Its source fields are nullable so existing manual and real-time LiveBoard
entries are unaffected. Do not apply it until rollout is deliberately approved.

The `/liveboard/admin` route also contains a dormant personal Studio125 sign-in
gate. It does nothing unless `LIVEBOARD_PERSONAL_STAFF_AUTH_ENABLED=true`; the
public entry, kiosk, and display routes never pass through it. The Vercel API
keeps the LiveBoard machine credential and central staff token in server-only
configuration and an HttpOnly cookie. This gate is rollout preparation, not a
replacement for reviewing LiveBoard's existing Supabase row-level security.

The same Vercel project now contains a disabled `/api/reservation-email`
function for confirmation, reminder, cancellation, and refund-update messages.
It uses the existing verified sender
`Studio125 Reservations <contact@forms.studio125nyc.com>`, sends to the guest
address in the claimed reservation message, and forwards the deterministic
outbox key to Resend for duplicate protection. It requires the protected cron
secret plus `RESERVATION_EMAIL_SENDER_ENABLED=true`; no schedule or credential
has been added and no email has been sent.
