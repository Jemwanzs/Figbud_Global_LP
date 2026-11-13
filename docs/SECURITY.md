# Admin authentication and security

How administrators sign in to FigBud Studio, and the rules behind it. Code: `services/api/src/admin/` (`handlers.rs` passkeys and invitations, `security.rs` passwords and settings, `policy.rs` the sign-in policy, `credentials.rs` primitives). Screens: `/admin/login`, `/admin/create-password`, `/admin/forgot-password`, `/admin/reset-password`, `/admin/invite`, Settings → Security & Authentication, Settings → Users & access.

Last updated: 13 Nov 2026 (database-driven passwords: owner's brief of 13 Nov 2026).

PostgreSQL is the authority for administrator accounts: `admin_users` (name, email, role, websites via `admin_site_grants`, Studio areas, status, Argon2id password hash or none for passkey-only accounts, `password_set_at`, `last_login_at`, `created_at`, `updated_at`), their passkeys, sessions, the sign-in policy and the audit trail. **No email provider is needed** to create, change or use a password, or to recover one: email (Resend) stays for enquiries and marketing, and password links by email are only an extra where it's set up.

## 1. Sign-in methods

| Method | What it is | Second factor |
| --- | --- | --- |
| **Passkey** | WebAuthn: fingerprint, face or screen lock on the device | Built in (the device plus user verification) |
| **Password** | Works on any authorised device, with no passkey needed on it | An authenticator-app code (TOTP) or recovery code **for the roles the sign-in policy says** (every role by default). Where two-factor is set up, it's always asked for |

Where a role needs two-factor and it isn't set up, a password isn't stored, and a password alone never opens a session (refused at sign-in and on every request). Owners choose the roles in Users & access → Sign-in policy; owners and reviewers are recommended to keep it. Authenticator codes need `ADMIN_SECRETS_KEY` on the API; without it, passwords work only for roles that don't need two-factor.

## 2. Creating a password

- **Existing administrators** (`/admin/create-password`, linked from the sign-in card as "Create password"): enter the work email, confirm with the passkey, choose the password. The page never says whether an email has an account: an unknown address simply finds no passkey. The passkey check lasts 10 minutes (`admin_sessions.passkey_verified_until`). The same is possible in Security & Authentication after any recent identity check.
- **New administrators:** only owners add people (Users & access → **Add admin user**: name, email, role, websites, Studio areas). That creates a single-use invitation link, valid 7 days and stored only as a hash, to send privately. The newcomer opens it and creates a passkey or **a password** (`POST /v1/admin/invites/accept/password`); a weak password doesn't use up the invitation. There's no public sign-up.
- **Form:** new password and confirmation, show/hide on both, a strength guide and inline messages; the same rules are checked by the API (`credentials::password_problem`).
- There are no default passwords, nobody can set or see someone else's password, and passkeys are never removed when a password is created or changed.

## 3. Changing, forgetting and recovering

| Situation | What happens |
| --- | --- |
| Change password | Security & Authentication → Password: current password, new password, confirmation. The current one is checked against the hash (wrong answers count towards the 15-minute pause); the new hash replaces it, `password_set_at` is updated, other sessions are signed out and it's audited (`admin.password_changed`) |
| Forgot password, has a passkey | `/admin/create-password` (or "Reset with your passkey" on Forgot password): the passkey authorises a new password without the old one |
| Forgot password, no passkey | An owner creates a one-time recovery link in Users & access (single use; 1 hour for owners and reviewers, 24 hours for others) and passes it on directly. It changes only the password, signs out every session and doesn't skip two-factor. Owners and reviewers need two-factor for a link; other roles need two-factor or a role the policy lets use a password alone. Otherwise: a new invite, which adds a passkey to the account |
| Forgot password, by email | Only where email is set up, and only for accounts with two-factor (1-hour link). An email address alone never resets anything |
| Lost the authenticator | A recovery code signs them in; they then set up a new authenticator |
| Lost authenticator and recovery codes | Sign in with a passkey. Without one, an owner sends a new invite, which adds a passkey to the existing account; then set up two-factor again |
| Last owner locked out | `railway ssh --service figbud-api -- figbud-api admin invite --email <email> --role owner` (needs Railway access) |

**Email is on hold in production** (`EMAIL_MODE=hold`, roadmap Q4): email recovery sends nothing and is recorded in the audit log. The passkey reset and owner recovery links are the routes that don't need it.

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
- **Sensitive changes** need a check within the last 10 minutes: two-factor, a first password, recovery codes, passkeys and owner recovery links. Changing a password needs the current password instead (or a passkey check, for a forgotten one).
- **You can't remove your last way in:** the last passkey needs a password first, and a password needs a passkey first. Two-factor can't be removed while the person's role needs it with their password.
- **Nothing secret in the browser:** passwords go only to the API over HTTPS and are never stored in the browser (no local storage); the session is the `HttpOnly` cookie.
- **Audit:** every event is in `audit_log` and shown under Security activity (`admin.login`, `admin.login_failed`, `admin.password_*`, `admin.two_factor_*`, `admin.passkey_*`, `admin.session_revoked`, `admin.recovery_link_created`), and for owners managing people: `admin.role_changed`, `admin.suspended`, `admin.reactivated`, `admin.sessions_revoked`, `admin.invite_revoked`, `admin.modules_changed`. Password events record how the change was authorised (`identity_check`, `current_password`, `passkey` or `invite`).

**Approval authority** (P13-B5, `authority.rs`): every decision that publishes keeps its own maker-checker check and website role check, then calls `authority::gate` before changing anything. The gate applies the kind's rule (owners only, or chosen people; owners always may), the request's assignment (only the assignee or an owner) and the number of approvals: with two, the first is stored in `approval_steps` and answered 202 (`approval_recorded`), the same person can't give the second, and the second publishes. A request is its revision, or its item and the moment approval was asked for, so asking again (or editing an article) starts over. Rules only narrow who may approve; with no rule a kind behaves as before. Audited: `admin.approval_rule_changed` (before and after), `approval.recorded`, `approval.assigned`.

**Sign-in policy** (P13-B4, `admin/policy.rs`, one row in `admin_sign_in_policy`): passkeys and password-with-two-factor each on or off (never both off: a database constraint), roles that must use a passkey, and an inactivity timeout. Checked before a session starts (`signed_in` and the password step), and for every request: `authenticate` joins the policy, so a session started a way that's now off, or unused for longer than the timeout, is refused at once. Saving refuses a policy that would leave any active owner, or the owner saving it, without a way in, and revokes sessions it no longer allows; promoting someone to owner without an allowed way in is refused too. An invitation's first session (`auth_method = 'invite'`) always opens, so a newcomer can set up an allowed way in. Identity checks for sensitive changes accept a passkey or password-and-two-factor whatever the policy, since they confirm a person already signed in. Audited: `admin.sign_in_policy_changed` (before and after), `admin.session_revoked`.

**Authorisation layers** (each checked by the API, never only by hiding controls): the Studio role (owner, reviewer, editor, viewer); website access (all websites, or selected websites each with a role no higher than the Studio role); and Studio areas (P13-B3: selected areas, each with view, edit, ask for approval, approve and publish, export), checked for every admin request when the session is read. Owners are never limited, and maker-checker approval still applies to what they publish.
- **Roles:** the sign-in method doesn't affect roles or website access. Everything in Security & Authentication applies only to the signed-in person's own account.

## 5. Deliberately not built

**Trusted devices** ("skip two-factor on this device"). The brief allows it only with a secured, revocable mechanism. It would let a password alone open the Studio on that device, and sessions already last 12 hours, so the extra risk isn't worth it yet. Recorded as P13-A7 if you want it later.

## 6. Operating `ADMIN_SECRETS_KEY`

- Generate with `openssl rand -hex 32` and set it on `figbud-api` only. Never commit it, and keep it out of database backups.
- **Don't change it casually.** Every authenticator stops working (people recover with a passkey and enrol again), and password sign-in fails until they do. Passkeys are unaffected.
- **If it's lost:** the same as changing it. Nothing else depends on it.
- **Unset:** the API runs passkeys only, and Security & Authentication says two-factor isn't available.
