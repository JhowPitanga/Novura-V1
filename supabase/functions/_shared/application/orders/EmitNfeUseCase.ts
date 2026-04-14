import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import type { InvoicesPort } from "../../ports/invoices-port.ts";
import type { SupabaseClient } from "../../adapters/infra/supabase-client.ts";
import type { RecalculateOrderStatusUseCase } from "./RecalculateOrderStatusUseCase.ts";

export interface EmitNfeInput {
  readonly orderId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly environment: "homologacao" | "producao";
  readonly focusId: string | null;
  readonly nfeKey: string | null;
  readonly nfeNumber: number | null;
  /** True if the Focus NFe API returned status "autorizado". */
  readonly authorized: boolean;
  readonly errorMessage: string | null;
}

export interface EmitNfeResult {
  readonly orderId: string;
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Orchestrates the post-emission side effects after a Focus NFe API call:
 * 1. Validates the order exists in `orders`.
 * 2. Updates the invoice in `invoices` via InvoicesPort (markAuthorized or markError).
 * 3. Updates `orders.has_invoice` when authorized.
 * 4. Triggers status recalculation via RecalculateOrderStatusUseCase.
 */
export class EmitNfeUseCase {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly orderRepo: IOrderRepository,
    private readonly invoicesPort: InvoicesPort,
    private readonly recalculateOrderStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: EmitNfeInput): Promise<EmitNfeResult> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      return { orderId: input.orderId, ok: false, error: "Order not found in orders table" };
    }

    const idempotencyKey = `${input.organizationId}:${input.orderId}:${input.environment}`;

    if (input.authorized && input.nfeKey && input.nfeNumber !== null) {
      const existing = await this.invoicesPort.findByIdempotencyKey(this.admin, idempotencyKey);
      if (existing?.id) {
        await this.invoicesPort.markAuthorized(this.admin, existing.id, input.nfeKey, input.nfeNumber);
      }
      await this.orderRepo.updateInternalFlags(input.orderId, { hasInvoice: true });
    } else if (input.errorMessage) {
      const existing = await this.invoicesPort.findByIdempotencyKey(this.admin, idempotencyKey);
      if (existing?.id) {
        await this.invoicesPort.markError(this.admin, existing.id, input.errorMessage, existing.retry_count);
      }
    }

    try {
      await this.recalculateOrderStatus.execute(input.orderId, "user_action");
    } catch (e) {
      console.error("[EmitNfeUseCase] recalculate failed:", e instanceof Error ? e.message : String(e));
    }

    return { orderId: input.orderId, ok: true };
  }
}
