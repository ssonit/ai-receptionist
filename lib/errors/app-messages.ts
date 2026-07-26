import {
  APP_ERROR_CODE,
  type AppErrorCode,
} from "@/lib/errors/app-codes";
import { MAX_CHAT_SUGGESTIONS } from "@/lib/chat-branding";
import { MAX_FAQ_ITEMS } from "@/lib/workspace-faq-types";

/** User-facing copy for shared app errors — never leak provider/DB strings. */

export const APP_ERROR_MESSAGE = {
  [APP_ERROR_CODE.SIGN_IN_REQUIRED]: "You need to sign in.",
  [APP_ERROR_CODE.NO_WORKSPACE]: "Account is not assigned to a workspace.",
  [APP_ERROR_CODE.UNAUTHORIZED]: "You need to sign in.",
  [APP_ERROR_CODE.SAVE_FAILED]: "Could not save changes. Try again.",
  [APP_ERROR_CODE.LOAD_FAILED]: "Could not load data. Try again.",
  [APP_ERROR_CODE.NOT_FOUND]: "That item was not found.",
  [APP_ERROR_CODE.INVALID_INPUT]: "Some fields are invalid. Check and try again.",
  [APP_ERROR_CODE.NAME_REQUIRED]: "Workspace name is required.",
  [APP_ERROR_CODE.NAME_EMPTY]: "Name cannot be empty.",
  [APP_ERROR_CODE.NAME_TOO_LONG]: "Name must be at most 120 characters.",
  [APP_ERROR_CODE.TIMEZONE_REQUIRED]: "Timezone is required.",
  [APP_ERROR_CODE.TITLE_REQUIRED]: "Title is required.",
  [APP_ERROR_CODE.INVALID_DURATION]: "Invalid duration.",
  [APP_ERROR_CODE.INVALID_LOCATION]: "Invalid location.",
  [APP_ERROR_CODE.INVALID_STATUS]: "Invalid status.",
  [APP_ERROR_CODE.SLUG_TOO_SHORT]:
    "Slug needs at least 2 characters (a-z, 0-9).",
  [APP_ERROR_CODE.SLUG_TAKEN]: "That slug is already taken. Choose another.",
  [APP_ERROR_CODE.CAL_KEY_REQUIRED]: "Paste a Cal.com API key to continue.",
  [APP_ERROR_CODE.CAL_KEY_MISSING]: "Cal.com API key is not connected.",
  [APP_ERROR_CODE.CAL_VERIFY_FAILED]:
    "Could not verify the Cal.com API key. Check the key and try again.",
  [APP_ERROR_CODE.CAL_NOT_CONFIGURED]: "Cal.com is not configured.",
  [APP_ERROR_CODE.CAL_NOT_CONFIGURED_GUEST]:
    "Online booking is not available right now. Please contact the business directly.",
  [APP_ERROR_CODE.CAL_NO_MEETING_TYPES]:
    "No meeting types on Cal.com. Create an event type, then Sync again.",
  [APP_ERROR_CODE.AI_MEETING_TYPE_REQUIRED]:
    "AI booking meeting type is not selected.",
  [APP_ERROR_CODE.MEETING_TYPE_NOT_FOUND]: "Meeting type not found.",
  [APP_ERROR_CODE.SYNC_FAILED]: "Sync failed. Try again.",
  [APP_ERROR_CODE.CREATE_FAILED]: "Could not create that item. Try again.",
  [APP_ERROR_CODE.INVALID_FAQ]: "Invalid FAQ data.",
  [APP_ERROR_CODE.FAQ_LIMIT]: `Maximum ${MAX_FAQ_ITEMS} FAQ items per workspace.`,
  [APP_ERROR_CODE.FAQ_ITEM_INVALID]: "That FAQ item is invalid.",
  [APP_ERROR_CODE.FAQ_ITEM_REQUIRED]:
    "FAQ question and answer are both required.",
  [APP_ERROR_CODE.FAQ_GENERATE_FAILED]:
    "Could not generate FAQ drafts. Try again.",
  [APP_ERROR_CODE.FAQ_GENERATE_UNAVAILABLE]:
    "AI generation is unavailable. Add a model API key, or use suggested questions.",
  [APP_ERROR_CODE.INVALID_SUGGESTIONS]: "Invalid suggestion data.",
  [APP_ERROR_CODE.SUGGESTION_LIMIT]: `Maximum ${MAX_CHAT_SUGGESTIONS} suggestions.`,
  [APP_ERROR_CODE.SUGGESTION_INVALID]: "That suggestion is invalid.",
  [APP_ERROR_CODE.SUGGESTION_REQUIRED]:
    "Both button label and message are required.",
  [APP_ERROR_CODE.MARK_READ_FAILED]: "Could not mark notification as read.",
  [APP_ERROR_CODE.MARK_ALL_READ_FAILED]:
    "Could not mark all notifications as read.",
  [APP_ERROR_CODE.SET_AI_BOOKING_FAILED]:
    "Could not set AI booking meeting type.",
  [APP_ERROR_CODE.OWNER_REQUIRED]:
    "Only the workspace owner can manage invites.",
  [APP_ERROR_CODE.INVITE_CREATE_FAILED]: "Could not create invite. Try again.",
  [APP_ERROR_CODE.INVITE_REVOKE_FAILED]: "Could not revoke invite. Try again.",
  [APP_ERROR_CODE.INVITE_INVALID]: "That invite link is invalid.",
  [APP_ERROR_CODE.INVITE_EXPIRED]: "That invite link has expired.",
  [APP_ERROR_CODE.INVITE_ACCEPTED]: "That invite was already accepted.",
  [APP_ERROR_CODE.INVITE_EMAIL_MISMATCH]:
    "Sign in with the email this invite was sent to.",
  [APP_ERROR_CODE.INVITE_ALREADY_IN_WORKSPACE]:
    "This account already belongs to another workspace.",
  [APP_ERROR_CODE.INVITE_ACCEPT_FAILED]: "Could not accept invite. Try again.",
  [APP_ERROR_CODE.INVITE_ALREADY_MEMBER]:
    "This account is already a member of that workspace. No changes were made.",
  [APP_ERROR_CODE.INVITE_EMAIL_REQUIRED]:
    "Enter the email address to invite. Open links are not supported.",
  [APP_ERROR_CODE.INVITE_SEND_FAILED]:
    "Invite was created but the email could not be sent. Copy the link and share it directly.",
  [APP_ERROR_CODE.INVITE_RESEND_TOO_SOON]:
    "An invite email was just sent. Wait a minute before resending.",
  [APP_ERROR_CODE.MEMBER_REMOVE_FAILED]:
    "Could not remove that member. Refresh and try again.",
  [APP_ERROR_CODE.CANNOT_REMOVE_OWNER]:
    "Transfer ownership to someone else before removing the owner.",
  [APP_ERROR_CODE.OWNERSHIP_TRANSFER_FAILED]:
    "Could not transfer ownership. Refresh and try again.",
  [APP_ERROR_CODE.BOOKING_CHANGE_CUTOFF]:
    "That appointment is too soon to change. Contact the business directly.",
  [APP_ERROR_CODE.BOOKING_CHANGE_DISABLED]:
    "Self-serve cancel/reschedule is turned off for this business.",
  [APP_ERROR_CODE.BOOKING_CODE_INVALID]:
    "That code is invalid or expired. Try again or ask for a new one.",
  [APP_ERROR_CODE.BOOKING_CODE_RATE_LIMITED]:
    "Too many code attempts. Wait a bit, then request a new code.",
  [APP_ERROR_CODE.BOOKING_OTP_RATE_LIMITED]:
    "Too many verification emails. Wait a bit, then try again.",
  [APP_ERROR_CODE.BOOKING_OTP_EXPIRED]:
    "That verification code expired. Request a new one.",
  [APP_ERROR_CODE.BOOKING_EMAIL_UNAVAILABLE]:
    "Could not send email right now. Ask the business to help instead.",
  [APP_ERROR_CODE.BOOKING_NOT_CLAIMABLE]:
    "No matching appointment is available for this chat yet. Try a manage code, email verification, or ask staff.",
  [APP_ERROR_CODE.BOOKING_ALREADY_CANCELLED]:
    "That appointment is already cancelled.",
  [APP_ERROR_CODE.BOOKING_VERIFY_REQUIRED]:
    "Verify ownership first (manage code, phone last digits, or email code).",
  [APP_ERROR_CODE.BOOKING_SESSION_MISMATCH]:
    "This chat session does not match the browser visitor. Start a new chat.",
  [APP_ERROR_CODE.AGENT_RATE_LIMITED]:
    "Too many messages right now. Please wait a few minutes and try again.",
  [APP_ERROR_CODE.WORKSPACE_RESOLVE_FAILED]:
    "Could not determine which business this chat belongs to.",
  [APP_ERROR_CODE.SIGNUP_CLOSED]:
    "Public signup is closed. You need an invite from a workspace owner.",
} as const satisfies Record<AppErrorCode, string>;

export function appErrorMessage(code: AppErrorCode): string {
  return APP_ERROR_MESSAGE[code];
}

export function slugTakenMessage(slug: string): string {
  return `Slug “${slug}” is already taken. Choose another.`;
}

export function inviteEmailMismatchMessage(inviteEmail: string): string {
  return `This invite is for ${inviteEmail}. Sign in with that account to accept it.`;
}

export function slugAvailableMessage(slug: string): string {
  return `“${slug}” is available.`;
}

export function slugIsYoursMessage(slug: string): string {
  return `“${slug}” is already your slug.`;
}

export function faqItemInvalidMessage(index1: number): string {
  return `FAQ #${index1} is invalid.`;
}

export function faqItemRequiredMessage(index1: number): string {
  return `FAQ #${index1}: question and answer are both required.`;
}

export function suggestionInvalidMessage(index1: number): string {
  return `Suggestion #${index1} is invalid.`;
}

export function suggestionRequiredMessage(index1: number): string {
  return `Suggestion #${index1}: both button label and message are required.`;
}

export function reminderLeadTooShortMessage(minMinutes: number): string {
  const hours = Math.floor(minMinutes / 60);
  const mins = minMinutes % 60;
  const label = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `Reminder lead time must be more than ${label} before the appointment — it's too close to the cancel/reschedule cutoff and would be dropped.`;
}
