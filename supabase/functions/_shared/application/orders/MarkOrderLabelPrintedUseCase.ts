import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import { RecalculateOrderStatusUseCase } from "./RecalculateOrderStatusUseCase.ts";

export interface MarkOrderLabelPrintedInput {
  readonly orderIds: ReadonlyArray<string>;
  readonly organizationId: string;
}

export interface MarkOrderLabelPrintedResult {
  readonly processed: number;
  readonly statusChanges: ReadonlyArray<{ readonly orderId: string; readonly newStatus: OrderStatus }>;
}

/** Marks print flag for a batch of orders and triggers status recalculation. */
export class MarkOrderLabelPrintedUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly recalculateOrderStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: MarkOrderLabelPrintedInput): Promise<MarkOrderLabelPrintedResult> {
    await Promise.all(
      input.orderIds.map((id) => this.orderRepo.updateInternalFlags(id, { isPrintedLabel: true })),
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
