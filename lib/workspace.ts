/** Pilot / default workspace id for single-tenant MVP. */
export const PILOT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

export function getPilotWorkspaceId(): string {
  return (
    process.env.NEXT_PUBLIC_BOOKING_WORKSPACE_ID?.trim() ||
    process.env.BOOKING_WORKSPACE_ID?.trim() ||
    PILOT_WORKSPACE_ID
  );
}
