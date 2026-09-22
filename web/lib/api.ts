export const apiBase = "";

export async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = (text ? JSON.parse(text) : {}) as T;
  return { status: response.status, body };
}

export interface SessionView {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  activeOrganizationId: string | null;
  mfa?: { required: boolean; enrolled: boolean; freshnessOk: boolean };
  status?: string;
  mfaToken?: string;
}
