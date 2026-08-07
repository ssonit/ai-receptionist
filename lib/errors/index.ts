export {
  AUTH_ERROR_CODE,
  type AuthErrorCode,
  type AuthErrorContext,
} from "@/lib/errors/auth-codes";
export {
  AUTH_ERROR_MESSAGE,
  authErrorMessage,
} from "@/lib/errors/auth-messages";
export { formatAuthError } from "@/lib/errors/auth";
export {
  APP_ERROR_CODE,
  type AppErrorCode,
} from "@/lib/errors/app-codes";
export {
  APP_ERROR_MESSAGE,
  appErrorMessage,
  slugTakenMessage,
  inviteEmailMismatchMessage,
  slugAvailableMessage,
  slugIsYoursMessage,
  faqItemInvalidMessage,
  faqItemRequiredMessage,
  suggestionInvalidMessage,
  suggestionRequiredMessage,
} from "@/lib/errors/app-messages";
export { AppError, isAppError } from "@/lib/errors/app-error";
export { formatDbError, formatUnknownError } from "@/lib/errors/format";
