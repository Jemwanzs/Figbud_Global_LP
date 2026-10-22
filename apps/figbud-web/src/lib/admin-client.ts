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
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminError(data?.error?.message ?? "Something went wrong. Please try again.", response.status);
  }
  return data as T;
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
