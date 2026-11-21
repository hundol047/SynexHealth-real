# Security and privacy upgrade

IMPLEMENTED: existing OIDC ownership/role guards, production demo refusal, bounded requests, same-origin controls and least-privilege health access. Account deletion removes measurements, routines/history, workouts, pose sessions, profile, preferences, billing mapping, consent and session tokens. Audit identity is replaced with a random deletion label and detail stripped; minimal account tombstone remains to reject old tokens. External school identity and store subscription cancellation remain external actions.

Health values and pose frames are not emitted in diagnostics/logs. No raw photos are stored. Browser response caches remain memory-only. Pending workout writes now persist in account-scoped IndexedDB with AES-GCM and a non-exportable CryptoKey. Server-verified same-account login restores the queue; authentication expiry locks without deleting, while explicit logout/account deletion removes records and key. Mutation replay and optimistic revision checks prevent duplicate writes and silent cross-device overwrites. Conflicts require a user decision. This is not hardware-backed Keychain/Keystore storage and does not protect against a compromised same-origin script. App deletion, browser data clearing and OS storage eviction can remove unsynced data. See LAUNCH_COMPLETION.md for the precise scope.

VERIFIED: existing ownership/consent/deletion tests plus adaptive-history purge and cache/queue tests. Native token unregistration, store logout and background camera shutdown still require device testing. Operator retention schedule, hosting logs, backups and incident process must be documented before deployment. Review APP_STORE_PRIVACY.md and actual archive manifest reports after final dependencies.


Status definitions: VERIFIED means a named automated/browser check passed; IMPLEMENTED / NOT DEVICE VERIFIED means code exists without physical-device evidence; EXTERNAL SETUP REQUIRED needs operator systems; NOT IMPLEMENTED means no working feature is claimed.

## Hardening update — 2026-11-21

IMPLEMENTED / VERIFIED by automated tests (`backend/tests/test_production_hardening.py`) and a browser pass over ten personal-build screens with no policy violations:

- **Response headers.** Every response carries `Content-Security-Policy`, `Permissions-Policy` (camera and microphone for this origin only; geolocation, payment, USB, Bluetooth disabled), `Cross-Origin-Opener-Policy: same-origin` and `X-Permitted-Cross-Domain-Policies: none`. HSTS now includes subdomains. API responses use `default-src 'none'`. The app shell allows only bundled scripts (`script-src 'self' 'wasm-unsafe-eval'`), with no `unsafe-eval` or inline script.
- **Personal build policy.** The build-time policy widened from `connect-src 'self'` alone to a full policy (scripts, styles, images, media, workers, objects, base URI, forms). Requests to other hosts stay blocked.
- **API documentation.** `/docs`, `/redoc` and `/openapi.json` are not served when `APP_ENV=production` or `PILOT_MODE=true`.
- **Error responses.** Validation errors return only location, message and type. The submitted value (a health measurement) is no longer echoed. Unhandled errors return a fixed message; the log records the exception class and route, not its message.
- **Sign-in rate budget.** `/api/auth/*` is limited to 30 requests a minute per client address, separate from the general 240. Like the general limit it is per process; a shared gateway limiter is still required behind multiple workers or a proxy that hides client addresses.

Limits to state plainly: `style-src` still allows inline styles because React style attributes need it. `connect-src` on the server-hosted shell allows `https:` because the OIDC token endpoint lives on the identity provider's host. None of this has been verified on a physical device.

### Account credentials (email and password)

- The app never receives, stores or logs a user's password. Sign-in is delegated to the configured OIDC identity provider with PKCE (S256) and a `state` check; the server only verifies the provider's signed token (RS256/ES256, issuer, audience, expiry).
- Access and refresh tokens are held in memory only. "Stay signed in" stores a random session token (hashed on the server; `HttpOnly`, `Secure`, `SameSite=Lax` cookie on the web, OS secure storage on devices) for at most eight hours, never the provider's refresh token.
- No real user's email address is stored: accounts are keyed by the provider's subject identifier. Only demo seed data contains an email.
- The one password the server checks is the App Store review account (PBKDF2-SHA256, 600,000 rounds). It now locks for 15 minutes after 10 wrong attempts from any address, in addition to the per-address limit.
- Password strength, breach checks and two-step verification are the identity provider's responsibility and must be enabled there. They cannot be enforced from this app.
