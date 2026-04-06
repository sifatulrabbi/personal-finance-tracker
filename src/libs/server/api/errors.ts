import type { AppLogger } from "@/libs/server/logger";

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal_server_error";

export type ApiErrorDetails = Record<string, unknown> | Array<unknown>;

export type ApiErrorEnvelope = Readonly<{
  error: Readonly<{
    code: ApiErrorCode;
    message: string;
    requestId?: string;
    details?: ApiErrorDetails;
  }>;
}>;

export type ApiErrorOptions = Readonly<{
  statusCode: number;
  code: ApiErrorCode;
  userMessage: string;
  developerMessage?: string;
  details?: ApiErrorDetails;
  cause?: unknown;
}>;

export type ApiErrorResponseOptions = Readonly<{
  requestId?: string;
  logger?: AppLogger;
}>;

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly userMessage: string;
  readonly developerMessage?: string;
  readonly details?: ApiErrorDetails;

  constructor({
    statusCode,
    code,
    userMessage,
    developerMessage,
    details,
    cause,
  }: ApiErrorOptions) {
    super(developerMessage ?? userMessage, { cause });
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.userMessage = userMessage;
    this.developerMessage = developerMessage;
    this.details = details;
  }
}

export function createBadRequestError({
  userMessage = "The request could not be processed.",
  developerMessage,
  details,
  cause,
}: Partial<Omit<ApiErrorOptions, "statusCode" | "code">> = {}): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "bad_request",
    userMessage,
    developerMessage,
    details,
    cause,
  });
}

export function createValidationError({
  userMessage = "Please check your input and try again.",
  developerMessage,
  details,
  cause,
}: Partial<Omit<ApiErrorOptions, "statusCode" | "code">> = {}): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "validation_failed",
    userMessage,
    developerMessage,
    details,
    cause,
  });
}

export function createDomainConflictError({
  userMessage,
  developerMessage,
  details,
  cause,
}: Omit<ApiErrorOptions, "statusCode" | "code">): ApiError {
  return new ApiError({
    statusCode: 409,
    code: "conflict",
    userMessage,
    developerMessage,
    details,
    cause,
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  return new ApiError({
    statusCode: 500,
    code: "internal_server_error",
    userMessage: "Something went wrong. Please try again.",
    developerMessage:
      error instanceof Error ? error.message : "Unknown non-error thrown.",
    cause: error,
  });
}

function createApiErrorEnvelope({
  apiError,
  requestId,
}: {
  apiError: ApiError;
  requestId?: string;
}): ApiErrorEnvelope {
  return {
    error: {
      code: apiError.code,
      message: apiError.userMessage,
      requestId,
      details: apiError.details,
    },
  };
}

/**
 * Converts thrown values into the standard user-safe API error envelope.
 */
export function createApiErrorResponse(
  error: unknown,
  { requestId, logger }: ApiErrorResponseOptions = {},
): Response {
  const apiError = toApiError(error);

  logger?.error("api.error", {
    requestId,
    statusCode: apiError.statusCode,
    code: apiError.code,
    userMessage: apiError.userMessage,
    developerMessage: apiError.developerMessage ?? apiError.message,
  });

  return Response.json(createApiErrorEnvelope({ apiError, requestId }), {
    status: apiError.statusCode,
  });
}
