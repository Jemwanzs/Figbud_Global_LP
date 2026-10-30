/**
 * Browser helpers for the admin area: calls through the same-origin proxy
 * (`/admin/api/*`) and WebAuthn JSON <-> ArrayBuffer conversion in the format
 * the API (webauthn-rs) produces and expects.
 */

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "reviewer" | "editor" | "viewer";
  last_login_at?: string;
  /** Which websites they work on (P7-F1); absent means every website. */
  access?: SiteAccess;
}

/** Every website with the Studio role, or selected websites, each with its own role. */
export interface SiteAccess {
  all: boolean;
  sites: { site: string; name: string; role: AdminUser["role"] }[];
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: FieldError[] = [],
  ) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/admin/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminError(
      data?.error?.message ??
        (response.status === 413 ? "That file is too large." : "Something went wrong. Please try again."),
      response.status,
      data?.error?.fields ?? [],
    );
  }
  return data as T;
}

/** Uploads a logo file as raw bytes; the API checks the type, size and contents. */
export async function uploadBrandAsset<T>(slug: string, file: File, label: string, alt: string): Promise<T> {
  const query = new URLSearchParams({ label, alt });
  const response = await fetch(`/admin/api/sites/${slug}/brand/uploads?${query}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
    credentials: "same-origin",
  });
  return parseResponse<T>(response);
}

/** Uploads a media library image as raw bytes; the API checks and re-encodes it. */
export async function uploadMedia<T>(slug: string, file: File, label: string, alt: string): Promise<T> {
  const query = new URLSearchParams({ label, alt });
  const response = await fetch(`/admin/api/sites/${slug}/media/uploads?${query}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
    credentials: "same-origin",
  });
  return parseResponse<T>(response);
}

const toBuffer = (value: string): ArrayBuffer => {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return bytes.buffer;
};

const toBase64Url = (buffer: ArrayBuffer | null): string | undefined => {
  if (!buffer) return undefined;
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

type Descriptor = { id: string; type: string; transports?: string[] };

export function supportsPasskeys(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials;
}

/** Runs `navigator.credentials.create` for the API's creation options. */
export async function createPasskey(options: { publicKey: Record<string, unknown> }) {
  const pk = options.publicKey as {
    challenge: string;
    user: { id: string; name: string; displayName: string };
    excludeCredentials?: Descriptor[];
  } & Record<string, unknown>;
  const publicKey = {
    ...pk,
    challenge: toBuffer(pk.challenge),
    user: { ...pk.user, id: toBuffer(pk.user.id) },
    excludeCredentials: pk.excludeCredentials?.map((c) => ({ ...c, id: toBuffer(c.id) })),
  } as unknown as PublicKeyCredentialCreationOptions;
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new AdminError("Passkey creation was cancelled.", 0);
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: toBase64Url(response.attestationObject),
      clientDataJSON: toBase64Url(response.clientDataJSON),
      transports: response.getTransports?.() ?? [],
    },
    extensions: credential.getClientExtensionResults(),
  };
}

/** Runs `navigator.credentials.get` for the API's request options. */
export async function assertPasskey(options: { publicKey: Record<string, unknown> }) {
  const pk = options.publicKey as { challenge: string; allowCredentials?: Descriptor[] } & Record<
    string,
    unknown
  >;
  const publicKey = {
    ...pk,
    challenge: toBuffer(pk.challenge),
    allowCredentials: pk.allowCredentials?.map((c) => ({ ...c, id: toBuffer(c.id) })),
  } as unknown as PublicKeyCredentialRequestOptions;
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new AdminError("Sign-in was cancelled.", 0);
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: toBase64Url(response.authenticatorData),
      clientDataJSON: toBase64Url(response.clientDataJSON),
      signature: toBase64Url(response.signature),
      userHandle: toBase64Url(response.userHandle),
    },
    extensions: credential.getClientExtensionResults(),
  };
}

/** Turns WebAuthn DOMExceptions into messages a person can act on. */
export function describePasskeyError(error: unknown): string {
  if (error instanceof AdminError) return error.message;
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError")
      return "The passkey prompt was dismissed or timed out. Please try again.";
    if (error.name === "InvalidStateError")
      return "This device already has a passkey for your account. Sign in instead.";
    if (error.name === "SecurityError") return "Passkeys need a secure (https) connection on this address.";
  }
  return "Something went wrong. Please try again.";
}

const RANK: Record<AdminUser["role"], number> = { viewer: 0, editor: 1, reviewer: 2, owner: 3 };

/** Mirrors the API's role order (owner > reviewer > editor > viewer) for showing controls. */
export function hasRole(user: Pick<AdminUser, "role">, minimum: AdminUser["role"]): boolean {
  return RANK[user.role] >= RANK[minimum];
}

/**
 * The person as they act on one website: their role there (never above
 * their Studio role). Pass it to website components so their role checks
 * follow per-website access; the API enforces the same rule.
 */
export function forSite(user: AdminUser, slug: string): AdminUser {
  if (!user.access || user.access.all) return user;
  const grant = user.access.sites.find((s) => s.site === slug);
  const role = grant && RANK[grant.role] < RANK[user.role] ? grant.role : user.role;
  // Without access the API answers 404; show nothing editable meanwhile.
  return { ...user, role: grant ? role : "viewer" };
}

export const ROLE_LABELS: Record<AdminUser["role"], string> = {
  owner: "Owner",
  reviewer: "Reviewer",
  editor: "Editor",
  viewer: "Viewer",
};

/** A plausible email address (the API does the real validation). */
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
