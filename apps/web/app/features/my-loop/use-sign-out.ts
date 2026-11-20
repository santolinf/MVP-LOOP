import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@loop/api-client";
import { useNavigate } from "react-router";

/** Signs the contractor out and returns to the home page. Shared by the site header. */
export function useSignOut() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = useLogout();

  async function signOut() {
    try {
      await logout.mutateAsync();
    } catch {
      // The session may already be gone; either way this browser is signed out.
    }
    qc.clear();
    navigate("/");
  }

  return { signOut, pending: logout.isPending };
}
