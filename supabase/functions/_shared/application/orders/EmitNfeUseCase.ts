import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import type { INfePort, InvoiceRecord } from "../../domain/orders/ports/INfePort.ts";
import type { RecalculateOrderStatusUseCase } from "./RecalculateOrderStatusUseCase.ts";

export interface EmitNfeInput {
  readonly orderId: string;
  /** Invoice record to persist (built by the edge function after Focus API call). */
  readonly invoice: InvoiceRecord;
  /** True if the Focus NFe API returned status "autorizado". */
  readonly authorized: boolean;
}

export interface EmitNfeResult {
  readonly orderId: string;
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Orchestrates the post-emission side effects after a Focus NFe API call:
 * 1. Validates the order exists in `orders`.
 * 2. Persists the invoice to `notas_fiscais` via INfePort.
 * 3. Updates `orders.has_invoice` when authorized.
 * 4. Triggers status recalculation via RecalculateOrderStatusUseCase.
 *
 * Does NOT reference `marketplace_orders_presented_new`.
 */
export class EmitNfeUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly nfePort: INfePort,
    private readonly recalculateOrderStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: EmitNfeInput): Promise<EmitNfeResult> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      return { orderId: input.orderId, ok: false, error: "Order not found in orders table" };
    }

    await this.nfePort.upsertInvoice(input.invoice);

    if (input.authorized) {
      await this.orderRepo.updateInternalFlags(input.orderId, { hasInvoice: true });
    }

    try {
      await this.recalculateOrderStatus.execute(input.orderId, "nfe_emission");
    } catch (e) {
      console.error("[EmitNfeUseCase] recalculate failed:", e instanceof Error ? e.message : String(e));
    }

    return { orderId: input.orderId, ok: true };
  }
}
