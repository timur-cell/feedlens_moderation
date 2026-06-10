// Self-registration was removed when auth moved to the Rails backend:
// accounts are created by an administrator (POST /api/users).
// This component is intentionally unused; it remains only because the
// tooling in this environment cannot delete files. Safe to remove.

export function SignUp() {
  return null;
}
