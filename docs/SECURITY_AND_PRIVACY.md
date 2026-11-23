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
- **Sign-in rate budget.** Session changes under `/api/auth/*` (POST/DELETE) are limited to 60 a minute per client address, separate from the general 240. Public sign-in configuration reads are not counted, so a class behind one campus address can open the login screen together. Like the general limit it is per process; a shared gateway limiter is still required behind multiple workers or a proxy that hides client addresses.

Limits to state plainly: `style-src` still allows inline styles because React style attributes need it. `connect-src` on the server-hosted shell allows `https:` because the OIDC token endpoint lives on the identity provider's host. None of this has been verified on a physical device.

### Account credentials (email and password)

- The app never receives, stores or logs a user's password. Sign-in is delegated to the configured OIDC identity provider with PKCE (S256) and a `state` check; the server only verifies the provider's signed token (RS256/ES256, issuer, audience, expiry).
- Access and refresh tokens are held in memory only. "Stay signed in" stores a random session token (hashed on the server; `HttpOnly`, `Secure`, `SameSite=Lax` cookie on the web, OS secure storage on devices) for at most eight hours, never the provider's refresh token.
- No real user's email address is stored: accounts are keyed by the provider's subject identifier. Only demo seed data contains an email.
- The one password the server checks is the App Store review account (PBKDF2-SHA256, 600,000 rounds). It now locks for 15 minutes after 10 wrong attempts from any address, in addition to the per-address limit.
- Password strength, breach checks and two-step verification are the identity provider's responsibility and must be enabled there. They cannot be enforced from this app.

### Deployment behind a proxy or load balancer — EXTERNAL SETUP REQUIRED

The container starts uvicorn without a trusted-proxy list, and uvicorn only trusts forwarded headers from `127.0.0.1` by default. Behind a TLS-terminating proxy or load balancer this has two consequences unless `FORWARDED_ALLOW_IPS` is set to the proxy's address (uvicorn reads that environment variable):

- With `APP_ENV=production` every request is answered `400 HTTPS 연결이 필요합니다`, because the app sees the proxy's plain-HTTP hop instead of the visitor's HTTPS connection.
- Every visitor shares the proxy's address, so the per-address limits (240 requests a minute, 60 session changes) become limits for the whole service.

Set `FORWARDED_ALLOW_IPS` to the proxy's address or network, never `*` on a host that is reachable directly. Even when set correctly, people on one campus network share a public address: 240 requests a minute is low for a class using the app at the same time, so enforce limits per account at the gateway for such deployments. This has not been exercised against a real proxy.

### Open question: WebAssembly under the content security policy on iOS 15 — NOT DEVICE VERIFIED

The iOS project's deployment target is 15.0. The policy allows the bundled pose model with `'wasm-unsafe-eval'`, which WebKit is understood to honour from Safari 16; earlier versions may require `'unsafe-eval'` to compile WebAssembly. If so, camera pose feedback would not start on iOS 15 while the rest of the app works. This has not been tested on a device. The choices are to raise the deployment target to iOS 16, or to add `'unsafe-eval'` to `script-src` (the app itself does not use `eval`, but the policy would no longer block it). Until one is chosen and checked on a device, treat iOS 15 pose feedback as unverified.
