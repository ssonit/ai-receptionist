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
} as const satisfies Record<AppErrorCode, string>;

export function appErrorMessage(code: AppErrorCode): string {
  return APP_ERROR_MESSAGE[code];
}

export function slugTakenMessage(slug: string): string {
  return `Slug “${slug}” is already taken. Choose another.`;
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
