import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import { RecalculateOrderStatusUseCase, type RecalculateOrderStatusResult } from "./RecalculateOrderStatusUseCase.ts";

export interface MarkOrderLabelPrintedInput {
  readonly orderId: string;
  readonly organizationId: string;
}

/** Marks print flag and triggers immediate status recalculation. */
export class MarkOrderLabelPrintedUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly recalculateOrderStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: MarkOrderLabelPrintedInput): Promise<RecalculateOrderStatusResult | null> {
    await this.orderRepo.updateInternalFlags(input.orderId, { isPrintedLabel: true });
    return this.recalculateOrderStatus.execute(input.orderId);
  }
}
