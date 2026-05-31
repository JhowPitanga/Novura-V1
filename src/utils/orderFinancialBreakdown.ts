import type { Order } from "@/types/orders";

export interface OrderFinancialBreakdown {
  valorBrutoItens: number;
  valorRecebidoFrete: number;
  freteRecebidoLiquido: number;
  freteCusto: number;
  comissaoMarketplace: number;
  impostosCalculados: number;
  impostosPercentual: number;
  custoProdutos: number;
  custosExtras: number;
  cupomFixo: number;
  valorLiquidoReceber: number;
  lucroPedido: number;
  mcPercent: number;
  isZeroed: boolean;
}

function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

export function computeOrderFinancialBreakdown(
  order: Order,
  options: { cmvLinked?: number | null; taxRatePct?: number | null } = {},
): OrderFinancialBreakdown {
  const fin = order.financial ?? ({} as Order["financial"]);
  const items = Array.isArray(order.items) ? order.items : [];

  const valorBrutoItens =
    items.reduce((sum, it) => sum + toNum(it.unitPrice) * (toNum(it.quantity) || 0), 0) ||
    toNum(fin.orderAmount) ||
    toNum(order.totalAmount);

  const valorRecebidoFrete = toNum(fin.shippingReceived);
  const freteCusto = toNum(fin.shippingCost);
  const comissaoMarketplace = toNum(fin.marketplaceFee);
  const shippingFeeBuyer = toNum(fin.shippingFeeBuyer);
  const freteRecebidoLiquido = toNum(fin.shippingNetReceived ?? valorRecebidoFrete - shippingFeeBuyer);
  const custosExtras = toNum(fin.extraCosts);
  const cupomFixo = toNum(fin.couponAmount);

  const cmvFromItems = items.reduce(
    (sum, it) => sum + toNum(it.unitCost) * (toNum(it.quantity) || 0),
    0,
  );
  const custoProdutos = cmvFromItems > 0 ? cmvFromItems : toNum(options.cmvLinked ?? fin.productCost);

  const taxRatePct = toNum(options.taxRatePct);
  const impostosFromFin = toNum(fin.taxAmount);
  const impostosCalculados =
    impostosFromFin > 0 ? impostosFromFin : valorBrutoItens * (taxRatePct / 100);
  const impostosPercentual = valorBrutoItens > 0 ? (impostosCalculados / valorBrutoItens) * 100 : taxRatePct;

  const statusNorm = String(order.status || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  const isZeroed =
    statusNorm === "cancelado" ||
    statusNorm === "devolucao" ||
    statusNorm === "cancelled" ||
    statusNorm === "returned";
  const zero = (n: number) => (isZeroed ? 0 : n);

  const custoLiquidoFrete = zero(freteCusto) - zero(freteRecebidoLiquido);

  const valorLiquidoReceber =
    zero(valorBrutoItens) +
    zero(freteRecebidoLiquido) -
    zero(comissaoMarketplace) -
    zero(impostosCalculados) -
    zero(cupomFixo);

  const lucroPedido =
    valorLiquidoReceber -
    zero(custoProdutos) -
    zero(custosExtras) -
    zero(custoLiquidoFrete);

  const custosVariaveisTotal =
    zero(comissaoMarketplace) +
    zero(impostosCalculados) +
    zero(custoProdutos) +
    zero(custosExtras) +
    zero(cupomFixo) +
    zero(freteCusto);
  const despesasVariaveisTotal = zero(freteRecebidoLiquido);
  const mcValor = zero(valorBrutoItens) - custosVariaveisTotal + despesasVariaveisTotal;
  const mcPercent = isZeroed ? 0 : valorBrutoItens > 0 ? (mcValor / valorBrutoItens) * 100 : 0;

  return {
    valorBrutoItens,
    valorRecebidoFrete,
    freteRecebidoLiquido,
    freteCusto,
    comissaoMarketplace,
    impostosCalculados,
    impostosPercentual,
    custoProdutos,
    custosExtras,
    cupomFixo,
    valorLiquidoReceber,
    lucroPedido,
    mcPercent,
    isZeroed,
  };
}
