import {
  APP_ERROR_CODE,
  type AppErrorCode,
} from "@/lib/errors/app-codes";
import { appErrorMessage } from "@/lib/errors/app-messages";

type ProviderLikeError = {
  message?: string;
  code?: string;
} | null | undefined;

/**
 * Map DB / thrown errors to product copy.
 * Logs the raw message server-side; never returns it to the UI.
 */
export function formatDbError(
  error: ProviderLikeError,
  fallback: AppErrorCode = APP_ERROR_CODE.SAVE_FAILED,
): string {
  if (error?.message) {
    console.error("[app-error]", error.code ?? "unknown", error.message);
  }
  return appErrorMessage(fallback);
}

/**
 * Map unknown catch values to product copy (Cal.com, network, etc.).
 */
export function formatUnknownError(
  error: unknown,
  fallback: AppErrorCode,
): string {
  if (error instanceof Error && error.message) {
    console.error("[app-error]", error.message);
  } else if (error != null) {
    console.error("[app-error]", error);
  }
  return appErrorMessage(fallback);
}
