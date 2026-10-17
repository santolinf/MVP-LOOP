import { useGetMe } from "@loop/api-client";

// Wraps the generated hook; 401 means no session yet (auth is a dev-only fallback for now).
export function useMe() {
  const query = useGetMe();
  const unauthenticated = query.isError && (query.error as { status?: number } | null)?.status === 401;
  return { ...query, me: query.data?.data, unauthenticated };
}
