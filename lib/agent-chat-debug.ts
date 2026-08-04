export const EVE_SHOW_TOOL_CALLS_ENV = "NEXT_PUBLIC_EVE_SHOW_TOOL_CALLS" as const;

export function shouldShowAgentToolCalls(): boolean {
  return process.env[EVE_SHOW_TOOL_CALLS_ENV] === "true";
}
