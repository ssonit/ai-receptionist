"use server";

import { revalidatePath } from "next/cache";
import {
  handBackConversation,
  sendStaffMessage,
  takeOverConversation,
} from "@/lib/conversation-handoff";
import { getDashboardUser } from "@/lib/dashboard-user";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import { ROUTES } from "@/lib/routes";

/**
 * Workspace and identity come from the server session only — never from the
 * caller (spec T2). The sessionId argument is a lookup key, and every lib
 * function below filters on the resolved workspace.
 */
type ActionResult = { error?: string };

async function requireStaff(): Promise<
  | { error: string }
  | { workspaceId: string; staffUserId: string; staffName: string }
> {
  const user = await getDashboardUser();
  if (!user) return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  if (!user.workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }
  return {
    workspaceId: user.workspaceId,
    staffUserId: user.userId,
    staffName: user.navUser.name,
  };
}

export async function takeOverAction(sessionId: string): Promise<ActionResult> {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx;

  const result = await takeOverConversation({
    sessionId,
    workspaceId: ctx.workspaceId,
    staffUserId: ctx.staffUserId,
  });
  if (!result.ok) return { error: appErrorMessage(result.code) };

  revalidatePath(ROUTES.DASHBOARD_CONVERSATIONS);
  return {};
}

export async function handBackAction(sessionId: string): Promise<ActionResult> {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx;

  const result = await handBackConversation({
    sessionId,
    workspaceId: ctx.workspaceId,
  });
  if (!result.ok) return { error: appErrorMessage(result.code) };

  revalidatePath(ROUTES.DASHBOARD_CONVERSATIONS);
  return {};
}

export async function sendStaffMessageAction(
  sessionId: string,
  text: string,
): Promise<ActionResult> {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx;

  const result = await sendStaffMessage({
    sessionId,
    workspaceId: ctx.workspaceId,
    staffUserId: ctx.staffUserId,
    staffName: ctx.staffName,
    text,
  });
  if (!result.ok) return { error: appErrorMessage(result.code) };

  revalidatePath(ROUTES.DASHBOARD_CONVERSATIONS);
  return {};
}
