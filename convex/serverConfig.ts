// Server-side configuration — reads from Convex environment variables.
// All API keys must be set via `npx convex env set KEY value` on your deployment.
// See .env.example for the full list of required environment variables.

function getEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}. Set it via: npx convex env set ${name} <value>`);
  }
  return val;
}

export const config = {
  get ANTHROPIC_API_KEY() { return getEnv("ANTHROPIC_API_KEY"); },
  get OPENAI_API_KEY() { return getEnv("OPENAI_API_KEY"); },
  get IMPLIO_API_KEY() { return getEnv("IMPLIO_API_KEY"); },
};

// Default password applied to admin-created accounts when none is supplied.
// Must come from the DEFAULT_USER_PASSWORD env var so the value is never
// shipped in source / the client bundle. Lazy so unrelated functions in
// importing modules keep working when the var is unset.
export function getDefaultUserPassword(): string {
  return getEnv("DEFAULT_USER_PASSWORD");
}
