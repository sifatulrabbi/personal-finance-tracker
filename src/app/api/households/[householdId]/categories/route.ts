import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { mockCategories } from "@/libs/server/api/mock-data";
import { createCategorySchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { createId } from "@/libs/id";
import { logger } from "@/libs/server/logger";
import { getUtcTimestamp } from "@/libs/server/time";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const categories = mockCategories.filter(
      (c) => c.householdId === householdId,
    );

    return Response.json({ data: categories });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createCategorySchema);

    const now = getUtcTimestamp();
    const category = {
      id: createId(),
      householdId,
      name: body.name,
      description: body.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    logger.info("categories.created", {
      categoryId: category.id,
      householdId,
    });

    return Response.json({ data: category }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
