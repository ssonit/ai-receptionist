/** Canonical workspace membership roles (matches `profiles.role` check constraint). */
export const WORKSPACE_ROLE = {
  OWNER: "owner",
  STAFF: "staff",
} as const;

export type WorkspaceRole =
  (typeof WORKSPACE_ROLE)[keyof typeof WORKSPACE_ROLE];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === WORKSPACE_ROLE.OWNER || value === WORKSPACE_ROLE.STAFF;
}
