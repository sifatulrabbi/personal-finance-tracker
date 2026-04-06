import { z } from "zod";

import {
  createBadRequestError,
  createValidationError,
  type ApiErrorDetails,
} from "@/libs/server/api/errors";
import { toMinorUnits } from "@/libs/server/money";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const uuidStringSchema = z.string().trim().regex(UUID_PATTERN);
export const dateOnlyStringSchema = z.string().trim().refine(isValidDateOnly);
export const moneyInputSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      return toMinorUnits(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Must be a valid money amount with at most two decimals.",
      });

      return z.NEVER;
    }
  });

function formatPath(path: Array<PropertyKey>): string {
  if (path.length === 0) {
    return "body";
  }

  return path.map((part) => String(part)).join(".");
}

function formatZodIssues(error: z.ZodError): ApiErrorDetails {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  developerMessage = "Request validation failed.",
): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw createValidationError({
      developerMessage,
      details: formatZodIssues(result.error),
      cause: result.error,
    });
  }

  return result.data;
}

/**
 * Reads and validates a JSON request body with a Zod schema.
 */
export async function parseJsonRequestBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    throw createBadRequestError({
      userMessage: "Request body must be valid JSON.",
      developerMessage: "Failed to parse request JSON body.",
      cause: error,
    });
  }

  return parseWithSchema(schema, body);
}

export function parseIdParam(value: unknown, field = "id"): string {
  const result = uuidStringSchema.safeParse(value);

  if (!result.success) {
    throw createValidationError({
      developerMessage: `Invalid ${field} route parameter.`,
      details: [
        {
          path: field,
          message: "Must be a valid UUID.",
        },
      ],
      cause: result.error,
    });
  }

  return result.data;
}

export function parseDateOnlyInput(value: unknown, field = "date"): string {
  const result = dateOnlyStringSchema.safeParse(value);

  if (!result.success) {
    throw createValidationError({
      developerMessage: `Invalid ${field} date input.`,
      details: [
        {
          path: field,
          message: "Must be a valid YYYY-MM-DD date.",
        },
      ],
      cause: result.error,
    });
  }

  return result.data;
}

export function normalizeMoneyInput(value: unknown, field = "amount"): number {
  const result = moneyInputSchema.safeParse(value);

  if (!result.success) {
    throw createValidationError({
      developerMessage: `Invalid ${field} money input.`,
      details: [
        {
          path: field,
          message: "Must be a valid money amount with at most two decimals.",
        },
      ],
      cause: result.error,
    });
  }

  return result.data;
}
