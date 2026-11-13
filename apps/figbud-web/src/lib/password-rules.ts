/**
 * The Studio's password rules, as the API applies them
 * (`services/api/src/admin/credentials.rs`, `password_problem`), so people
 * see what's wrong while typing. The API still checks every password.
 */

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 128;

const COMMON = new Set([
  "password1234",
  "password12345",
  "password123456",
  "passwordpassword",
  "123456789012",
  "1234567890123",
  "12345678901234",
  "qwertyuiop12",
  "qwertyuiop123",
  "qwerty123456",
  "administrator",
  "adminadminadmin",
  "letmeinletmein",
  "welcome12345",
  "welcome123456",
  "figbudglobal",
  "figbudglobal1",
  "figbudglobal123",
]);

/** Why a new password would be refused, or `null`. */
export function passwordProblem(password: string, email = "", name = ""): string | null {
  const length = [...password].length;
  if (length < MIN_PASSWORD) return "Use at least 12 characters. A short phrase is easiest to remember.";
  if (length > MAX_PASSWORD) return "Use up to 128 characters.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || [...lower].every((c) => c === lower[0]))
    return "That password is too easy to guess. Try a longer phrase.";
  const local = (email.split("@")[0] ?? "").toLowerCase();
  if (email && (lower === email.toLowerCase() || (local.length >= 4 && lower.includes(local))))
    return "Don't use your email address in your password.";
  if (name.trim() && lower === name.trim().toLowerCase()) return "Don't use your name as your password.";
  return null;
}

export type Strength = { score: 0 | 1 | 2 | 3; label: string };

/**
 * Guidance, not a rule: longer is stronger, and mixing words, numbers and
 * symbols helps. A password that would be refused is always "Too weak".
 */
export function passwordStrength(password: string, email = "", name = ""): Strength {
  if (!password) return { score: 0, label: "" };
  if (passwordProblem(password, email, name)) return { score: 0, label: "Too weak" };
  const length = [...password].length;
  const kinds = [/[a-z]/i, /\d/, /[^a-z\d\s]/i, /\s/].filter((r) => r.test(password)).length;
  if (length >= 20 || (length >= 16 && kinds >= 3)) return { score: 3, label: "Strong" };
  if (length >= 16 || kinds >= 3) return { score: 2, label: "Good" };
  return { score: 1, label: "Fair" };
}
