// Zod schemas for common input validation at edge function boundaries.
// Uses esm.sh import so the file works in Deno without a package manager.

import { z } from "https://esm.sh/zod@3";

export const UuidSchema = z.string().uuid();

export const OrganizationIdSchema = UuidSchema.describe("organization_id");
export const IntegrationIdSchema = UuidSchema.describe("integration_id");

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const MarketplaceNameSchema = z.enum(["mercado_livre", "shopee"]);

export type Pagination = z.infer<typeof PaginationSchema>;
export type MarketplaceName = z.infer<typeof MarketplaceNameSchema>;
