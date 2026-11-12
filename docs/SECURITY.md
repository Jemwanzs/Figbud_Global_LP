# Admin authentication and security

How administrators sign in to FigBud Studio, and the rules behind it. Code: `services/api/src/admin/` (`handlers.rs` passkeys, `security.rs` passwords and settings, `credentials.rs` primitives). Screens: `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`, Settings → Security & Authentication.

Last updated: 5 Nov 2026.

## 1. Sign-in methods

| Method | What it is | Second factor |
| --- | --- | --- |
| **Passkey** | WebAuthn: fingerprint, face or screen lock on the device. Unchanged | Built in (the device plus user verification) |
| **Password** | Works on any authorised device, with no passkey needed on it | **Always required:** an authenticator-app code (TOTP) or a recovery code |

A password can't exist without confirmed two-factor. The API refuses it, and a database constraint (`admin_users_password_needs_2fa`) enforces it too, so a password alone never opens a session.

## 2. Enrolment

An existing passkey administrator goes to Settings → Security & Authentication:

1. **Confirm it's you**, if the last check was more than 10 minutes ago: a passkey, or a password plus code.
2. **Set up two-factor:** scan the QR code or type the key, then enter a code. Nothing changes until that code is right, and an authenticator being replaced keeps working until then.
3. **Save the 10 recovery codes.** They're shown once.
4. **Create a password.**

There are no default passwords, and nobody can set a password for someone else.

## 3. Forgot password and lockout

| Situation | What happens |
| --- | --- |
| Forgot password, two-factor set up | A single-use link, valid for 1 hour. It changes only the password, signs out every session and doesn't skip two-factor |
| Forgot password, no two-factor | No link is sent, because email alone must never set up a way in. They're told to use their passkey |
| Email unavailable | An owner creates a link in Team & access (single use, 24 hours). It gives the owner no way in: the person's authenticator is still required |
| Lost the authenticator | A recovery code signs them in; they then set up a new authenticator |
| Lost authenticator and recovery codes | Sign in with a passkey. Without one, an owner sends a new invite, which adds a passkey to the existing account; then set up two-factor again |
| Last owner locked out | `railway ssh --service figbud-api -- figbud-api admin invite --email <email> --role owner` (needs Railway access) |

**Email is on hold in production** (`EMAIL_MODE=hold`, roadmap Q4). Until Resend is configured, **Forgot password sends nothing**: the request is recorded in the audit log and no link is created. The screen tells people to ask an owner if nothing arrives, which is the working route today.

## 4. Protections

- **Passwords:** Argon2id (19 MiB, two passes), salted per password. At least 12 characters, up to 128. Common passwords and ones containing the person's email are refused.
- **Two-factor secrets:** encrypted with ChaCha20-Poly1305 using `ADMIN_SECRETS_KEY`, which lives outside the database, so a database copy alone can't produce codes. Each code works once, with one 30-second step of clock drift allowed either way.
- **Recovery codes and link tokens:** stored only as hashes. Link tokens travel in the URL fragment, so they never reach server logs or `Referer` headers.
- **No account enumeration:**
  - A wrong password, an unknown account and a passkey-only account get the same message, after the same hashing work.
  - Passkey sign-in answers unknown emails with a realistic ceremony that can't succeed. It used to say "No passkey is registered for this email".
  - Forgot password always gives the same answer and does its work after responding.
- **Rate limits and lockout:**
  - 20 sign-in attempts per IP address every 10 minutes (in-process; move to shared storage when the API runs more than one replica).
  - 5 failed passwords or codes pause password sign-in for that account for 15 minutes.
  - Passkeys are never affected, so an attacker can't lock someone out of the Studio.
- **Sessions:** random tokens stored as hashes, in `HttpOnly`, `SameSite=Strict`, `Secure` (`__Host-` prefixed) cookies. State changes also need the admin `Origin`. Changing or resetting a password signs out other sessions. Signing out does a full page load, so nothing stays in browser memory.
- **Sensitive changes** need a check within the last 10 minutes: two-factor, passwords, recovery codes, passkeys and owner recovery links.
- **You can't remove your last way in:** the last passkey needs a password first, and a password needs a passkey first. Two-factor can't be removed while a password depends on it.
- **Audit:** every event is in `audit_log` and shown under Security activity (`admin.login`, `admin.login_failed`, `admin.password_*`, `admin.two_factor_*`, `admin.passkey_*`, `admin.session_revoked`, `admin.recovery_link_created`), and for owners managing people: `admin.role_changed`, `admin.suspended`, `admin.reactivated`, `admin.sessions_revoked`, `admin.invite_revoked`.
- **Roles:** the sign-in method doesn't affect roles or website access. Everything in Security & Authentication applies only to the signed-in person's own account.

## 5. Deliberately not built

**Trusted devices** ("skip two-factor on this device"). The brief allows it only with a secured, revocable mechanism. It would let a password alone open the Studio on that device, and sessions already last 12 hours, so the extra risk isn't worth it yet. Recorded as P13-A7 if you want it later.

## 6. Operating `ADMIN_SECRETS_KEY`

- Generate with `openssl rand -hex 32` and set it on `figbud-api` only. Never commit it, and keep it out of database backups.
- **Don't change it casually.** Every authenticator stops working (people recover with a passkey and enrol again), and password sign-in fails until they do. Passkeys are unaffected.
- **If it's lost:** the same as changing it. Nothing else depends on it.
- **Unset:** the API runs passkeys only, and Security & Authentication says two-factor isn't available.
