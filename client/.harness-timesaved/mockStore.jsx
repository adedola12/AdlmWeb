// Throwaway mock of client/src/store.jsx: a signed-in admin. Not committed.
export function useAuth() {
  return { accessToken: "harness", user: { email: "admin@example.com", role: "admin", isSuperAdmin: true } };
}
