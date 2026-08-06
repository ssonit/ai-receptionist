import { getActiveWorkspace } from "@/lib/active-workspace";

/** Cookie-session workspace helpers — not safe for Eve agent tool bundles. */

/**
 * The workspace the dashboard is currently showing. Resolves through
 * `getActiveWorkspace()`, so every caller (analytics, notifications,
 * conversations, dashboard search, Cal sync) follows the workspace switcher
 * without needing to know it exists.
 */
export async function getSessionWorkspaceId(): Promise<string | null> {
  const active = await getActiveWorkspace();
  return active?.workspaceId ?? null;
}

export async function requireSessionWorkspaceId(): Promise<string> {
  const id = await getSessionWorkspaceId();
  if (!id) {
    throw new Error("Account is not assigned to a workspace.");
  }
  return id;
}
