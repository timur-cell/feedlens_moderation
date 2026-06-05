// Test user credentials — read from env vars, fallback to defaults for local dev
export const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || "agent@test.local",
  password: process.env.TEST_USER_PASSWORD || "change-me-in-env",
  name: "Test Agent",
} as const;
