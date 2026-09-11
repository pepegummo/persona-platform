// Inlined at build time. When no Clerk key is configured the app runs in dev-auth mode:
// the api accepts `Bearer dev:<id>` (only when its AUTH_DEV_BYPASS=true).
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
export const DEV_USER_STORAGE_KEY = "persona.devUser";
export const DEFAULT_DEV_USER = "local";
