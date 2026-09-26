import type { ErrorCode } from "./types";

// One error type for every failed API call. `message` is what the user should read: the
// server's own text when it sent one, otherwise a fallback for the status.
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly field?: string;
  // False when the message is a client-side fallback rather than the server's text.
  readonly fromServer: boolean;

  constructor(options: {
    status: number;
    code: ErrorCode;
    message: string;
    field?: string;
    fromServer?: boolean;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.field = options.field;
    this.fromServer = options.fromServer ?? false;
  }

  get unauthenticated() {
    return this.status === 401;
  }
  get network() {
    return this.code === "network";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

const codeForStatus: Record<number, ErrorCode> = {
  400: "validation_failed",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "stale_version",
  415: "unsupported_media_type",
  429: "rate_limited",
};

const fallbackForStatus: Record<number, string> = {
  400: "Some values were not accepted. Check them and try again.",
  401: "Your session has ended. Sign in again to continue.",
  403: "This request was blocked. Reload the page and try again.",
  404: "This record no longer exists. Close the form to see the latest records.",
  409: "Someone changed this record, or this request was already used. Close the form to see the latest values, then try again.",
  429: "Too many sign-in attempts. Wait a minute and try again.",
};
const serverFailure =
  "Something went wrong on the server. Your entry is still here; try again.";

// The pre-envelope backend sends a few fixed, terse sentences. They are not useful to a
// household member, so they get the status fallback. Any other server text is shown as sent.
const legacyGeneric = new Set([
  "invalid input",
  "authentication required",
  "record not found",
  "record changed or request key reused",
  "internal server error",
]);

function fallback(status: number) {
  return fallbackForStatus[status] ?? serverFailure;
}

function statusCode(status: number): ErrorCode {
  return codeForStatus[status] ?? "internal";
}

// Builds an ApiError from a non-2xx response body. Understands the shared envelope
// {"error":{"code","message","field"}}, the legacy {"error":"text"}, and empty or non-JSON
// bodies (for example a proxy error page).
export function errorFromBody(status: number, body: string): ApiError {
  let parsed: unknown;
  try {
    parsed = body.trim() ? JSON.parse(body) : undefined;
  } catch {
    parsed = undefined;
  }
  const error =
    parsed && typeof parsed === "object" && "error" in parsed
      ? (parsed as { error: unknown }).error
      : undefined;
  if (error && typeof error === "object") {
    const envelope = error as { code?: unknown; message?: unknown; field?: unknown };
    const message =
      typeof envelope.message === "string" && envelope.message.trim()
        ? envelope.message
        : "";
    return new ApiError({
      status,
      code:
        typeof envelope.code === "string" && envelope.code
          ? (envelope.code as ErrorCode)
          : statusCode(status),
      message: message || fallback(status),
      field:
        typeof envelope.field === "string" && envelope.field
          ? envelope.field
          : undefined,
      fromServer: Boolean(message),
    });
  }
  if (typeof error === "string" && error.trim() && !legacyGeneric.has(error.trim())) {
    return new ApiError({
      status,
      code: statusCode(status),
      message: error,
      fromServer: true,
    });
  }
  return new ApiError({ status, code: statusCode(status), message: fallback(status) });
}

export function networkError(reason: "offline" | "timeout" = "offline") {
  return new ApiError({
    status: 0,
    code: "network",
    message:
      reason === "timeout"
        ? "The server took too long to answer. Your entry is still here; try again."
        : "Cannot reach the server. Check your connection and try again.",
  });
}

// For UI: the sentence to show for any thrown value.
export function errorMessage(error: unknown, otherwise = "Something went wrong. Try again.") {
  if (error instanceof ApiError) return error.message;
  return otherwise;
}
