import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import { RecalculateOrderStatusUseCase } from "./RecalculateOrderStatusUseCase.ts";

export interface UnmarkOrderLabelPrintedInput {
  readonly orderIds: ReadonlyArray<string>;
  readonly organizationId: string;
}

export interface UnmarkOrderLabelPrintedResult {
  readonly processed: number;
  readonly statusChanges: ReadonlyArray<{ readonly orderId: string; readonly newStatus: OrderStatus }>;
}

/** Clears the print flag for a batch of orders and triggers status recalculation. */
export class UnmarkOrderLabelPrintedUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly recalculateOrderStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: UnmarkOrderLabelPrintedInput): Promise<UnmarkOrderLabelPrintedResult> {
    await Promise.all(
      input.orderIds.map((id) => this.orderRepo.updateInternalFlags(id, { isPrintedLabel: false })),
    );

    const results = await Promise.all(
      input.orderIds.map((id) => this.recalculateOrderStatus.execute(id, "user_action")),
    );

    const statusChanges = results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => ({ orderId: r.orderId, newStatus: r.newStatus }));

    return { processed: input.orderIds.length, statusChanges };
  }
}
