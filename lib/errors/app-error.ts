import { type AppErrorCode } from "@/lib/errors/app-codes";
import { appErrorMessage } from "@/lib/errors/app-messages";

/**
 * Error whose `message` is already user-safe copy from `APP_ERROR_MESSAGE`.
 * Route handlers that surface `error.message` to a guest can pass an AppError
 * straight through; anything else must stay server-side (see errors.md rule 1).
 */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode) {
    super(appErrorMessage(code));
    this.name = "AppError";
    this.code = code;
  }
}

export function isAppError(
  error: unknown,
  code?: AppErrorCode,
): error is AppError {
  return (
    error instanceof AppError && (code === undefined || error.code === code)
  );
}
