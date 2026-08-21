# Project Delivery Requirements

- The user runs this application live and expects requested changes to be deployed to the live production application.
- Do not treat a local development server, local function, local preview, or local-only verification as delivery of a change.
- For implementation requests, deploy the completed change to production and verify the live deployment unless the user explicitly says not to deploy.
- Local checks may be used only as intermediate validation; they do not replace production deployment and live verification.
- If production deployment is blocked by credentials, permissions, provider failure, or required user approval, state that clearly and do not claim the change is complete or live.
