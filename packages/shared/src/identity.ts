export const AUTH_PROVIDER_EMAIL_PASSWORD = "EMAIL_PASSWORD" as const;
export const AUTH_PROVIDERS_RESERVED = ["ENTRA", "GOOGLE", "SSO_ONLY"] as const;
export const AUTH_PROVIDERS = [AUTH_PROVIDER_EMAIL_PASSWORD, ...AUTH_PROVIDERS_RESERVED] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailPasswordProvider(provider: string): boolean {
  return provider === AUTH_PROVIDER_EMAIL_PASSWORD;
}
