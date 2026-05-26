# STATUS-ENGINE-T5 — Use Case: Vincular Produto a Item de Pedido

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
**Depende de:** [T2 — Ports](./STATUS-ENGINE-T2-portas.md), [T3 — Engine](./STATUS-ENGINE-T3-calculadora.md), [T4 — Adapters](./STATUS-ENGINE-T4-adaptadores.md)
**Bloqueia:** T9 (wiring nas edge functions), T10 (frontend)

---

## 1. Visão Geral (para não-técnicos)

Quando um vendedor abre o modal "A vincular" e escolhe qual produto do catálogo corresponde a cada item do pedido, várias coisas precisam acontecer:

1. Salvar a vinculação (permanente ou apenas para este pedido)
2. Atualizar os itens do pedido com o produto vinculado
3. Verificar se ainda sobrou algum item sem vínculo
4. Se não sobrou nenhum, recalcular o status do pedido (vai sair de "A vincular")
5. Reservar estoque se o novo status exigir

Hoje, toda essa lógica está misturada na edge function `linked_products_item` — queries de banco, validações, cálculos e chamadas para outras edge functions, tudo no mesmo arquivo. Esta task extrai essa orquestração para um use case dedicado, testável, e reutilizável.

**Analogia:** Hoje é como um garçom que cozinha, serve e lava o prato ao mesmo tempo. O use case é o garçom que só serve — ele delega cozinhar para a cozinha e lavar para o copa.

---

## 2. Arquivo a Criar

### `supabase/functions/_shared/application/orders/LinkProductToOrderItemUseCase.ts`

**Responsabilidade:** Orquestrar a vinculação de um produto ERP a um ou mais itens de um pedido de marketplace.

**Regras de negócio:**
1. Um item pode ser vinculado de forma **permanente** (registra em `marketplace_item_product_links`, vale para pedidos futuros) ou **efêmera** (só para este pedido)
2. Após vincular, o sistema deve verificar se ainda existem itens não vinculados
3. Se `unlinkedCount === 0`, o pedido deve ter seu status recalculado (use case T6)
4. O use case **não deve** reservar estoque diretamente — isso é responsabilidade do `HandleStockSideEffectsUseCase` (T7), acionado como consequência da mudança de status

**Entradas:**
```typescript
interface LinkProductInput {
  orderId: string;
  organizationId: string;
  marketplace: string;
  /** Lista de vínculos a aplicar */
  links: Array<{
    orderItemId: string;
    marketplaceItemId: string;
    variationId: string;
    productId: string;
    /** Se true, salva também em marketplace_item_product_links */
    isPermanent: boolean;
  }>;
}
```

**Saídas:**
```typescript
interface LinkProductResult {
  orderId: string;
  /** Quantidade de itens que ainda estão sem vínculo após a operação */
  remainingUnlinkedCount: number;
  /** Se o status do pedido mudou como resultado da vinculação */
  statusChanged: boolean;
  /** Novo status (se mudou) */
  newStatus?: string;
}
```

```typescript
import type { IOrderRepository } from '../../ports/orders/IOrderRepository.ts';
import type { IProductLinkRepository } from '../../ports/orders/IProductLinkRepository.ts';
import type { RecalculateOrderStatusUseCase } from './RecalculateOrderStatusUseCase.ts';

export interface LinkProductInput {
  orderId: string;
  organizationId: string;
  marketplace: string;
  links: Array<{
    orderItemId: string;
    marketplaceItemId: string;
    variationId: string;
    productId: string;
    isPermanent: boolean;
  }>;
}

export interface LinkProductResult {
  orderId: string;
  remainingUnlinkedCount: number;
  statusChanged: boolean;
  newStatus?: string;
}

/**
 * Use Case: Vincula produtos do catálogo ERP a itens de um pedido de marketplace.
 *
 * Orquestra:
 * 1. Persistência dos vínculos (permanentes e/ou no pedido)
 * 2. Atualização de order_items.product_id
 * 3. Verificação do estado de vinculação pós-operação
 * 4. Acionamento do recálculo de status se todos os itens foram vinculados
 *
 * Este use case NÃO trata estoque — isso é responsabilidade do HandleStockSideEffectsUseCase,
 * que é acionado pelo RecalculateOrderStatusUseCase quando o status muda.
 */
export class LinkProductToOrderItemUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly linkRepo: IProductLinkRepository,
    private readonly recalculateStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: LinkProductInput): Promise<LinkProductResult> {
    // 1. Persistir os vínculos permanentes
    await this.savePermanentLinks(input);

    // 2. Atualizar order_items com product_id
    await this.updateOrderItems(input);

    // 3. Verificar quantos itens ainda estão sem vínculo
    const remainingCount = await this.countRemainingUnlinked(input);

    // 4. Se todos estão vinculados, recalcular status
    if (remainingCount === 0) {
      const result = await this.recalculateStatus.execute({
        orderId: input.orderId,
        organizationId: input.organizationId,
        source: 'user_action',
      });
      return {
        orderId: input.orderId,
        remainingUnlinkedCount: 0,
        statusChanged: result.statusChanged,
        newStatus: result.newStatus,
      };
    }

    return {
      orderId: input.orderId,
      remainingUnlinkedCount: remainingCount,
      statusChanged: false,
    };
  }

  private async savePermanentLinks(input: LinkProductInput): Promise<void> {
    const permanentLinks = input.links.filter(l => l.isPermanent);
    await Promise.all(permanentLinks.map(link =>
      this.linkRepo.upsertPermanentLink({
        organizationId: input.organizationId,
        marketplace: input.marketplace,
        marketplaceItemId: link.marketplaceItemId,
        variationId: link.variationId,
        productId: link.productId,
      })
    ));
  }

  private async updateOrderItems(input: LinkProductInput): Promise<void> {
    // Cada link tem um orderItemId — atualiza order_items.product_id
    // Esta operação usa o orderRepo que sabe como atualizar a tabela order_items
    await this.orderRepo.updateOrderItemsProductId(
      input.links.map(l => ({ orderItemId: l.orderItemId, productId: l.productId }))
    );
  }

  private async countRemainingUnlinked(input: LinkProductInput): Promise<number> {
    // Recarrega o pedido para obter a lista atual de itens
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) throw new Error(`Order ${input.orderId} not found`);
    return this.linkRepo.countUnlinkedItems({
      organizationId: input.organizationId,
      marketplace: input.marketplace,
      orderId: input.orderId,
      items: order.items ?? [], // items são carregados com o pedido
    });
  }
}
```

**Nota:** O método `updateOrderItemsProductId` precisa ser adicionado ao `IOrderRepository` (T2). Adicionar como um item extra não documentado não é problema — o port pode evoluir.

**Tamanho esperado:** ~90 linhas

---

## 3. Atualizações em T2 (IOrderRepository)

Adicionar o método que faltou ao `IOrderRepository`:

```typescript
/**
 * Atualiza o product_id de múltiplos order_items em uma operação.
 * Chamado após o usuário vincular manualmente os produtos.
 */
updateOrderItemsProductId(updates: Array<{
  orderItemId: string;
  productId: string;
}>): Promise<void>;
```

E a implementação em `SupabaseOrderRepository` (T4):

```typescript
async updateOrderItemsProductId(updates: Array<{ orderItemId: string; productId: string }>): Promise<void> {
  // Atualiza em batch usando Promise.all (N queries, mas tipicamente N = 1-3 itens)
  await Promise.all(updates.map(({ orderItemId, productId }) =>
    this.supabase
      .from('order_items')
      .update({ product_id: productId })
      .eq('id', orderItemId)
      .throwOnError()
  ));
}
```

---

## 4. Testes

### Arquivo: `__tests__/application/LinkProductToOrderItemUseCase.test.ts`

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { LinkProductToOrderItemUseCase } from "../LinkProductToOrderItemUseCase.ts";
import { MockOrderRepository } from "../../__mocks__/MockOrderRepository.ts";
import { MockProductLinkRepository } from "../../__mocks__/MockProductLinkRepository.ts";
import { MockRecalculateStatusUseCase } from "../../__mocks__/MockRecalculateStatusUseCase.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";

// Configuração padrão dos mocks
function createUseCase(options: { remainingUnlinked?: number } = {}) {
  const orderRepo = new MockOrderRepository();
  const linkRepo = new MockProductLinkRepository({ remainingUnlinked: options.remainingUnlinked ?? 0 });
  const recalculate = new MockRecalculateStatusUseCase({ newStatus: OrderStatus.READY_TO_PRINT, statusChanged: true });
  return { useCase: new LinkProductToOrderItemUseCase(orderRepo, linkRepo, recalculate), orderRepo, linkRepo, recalculate };
}

const baseInput = {
  orderId: 'order-1',
  organizationId: 'org-1',
  marketplace: 'mercado_livre',
  links: [{
    orderItemId: 'item-1',
    marketplaceItemId: 'ml-item-123',
    variationId: '',
    productId: 'product-abc',
    isPermanent: true,
  }],
};

Deno.test("LinkProduct: salva vínculo permanente quando isPermanent=true", async () => {
  const { useCase, linkRepo } = createUseCase();
  await useCase.execute(baseInput);
  assertEquals(linkRepo.permanentLinksSaved.length, 1);
  assertEquals(linkRepo.permanentLinksSaved[0].productId, 'product-abc');
});

Deno.test("LinkProduct: NÃO salva permanente quando isPermanent=false", async () => {
  const { useCase, linkRepo } = createUseCase();
  await useCase.execute({ ...baseInput, links: [{ ...baseInput.links[0], isPermanent: false }] });
  assertEquals(linkRepo.permanentLinksSaved.length, 0);
});

Deno.test("LinkProduct: chama recálculo quando remainingUnlinked=0", async () => {
  const { useCase, recalculate } = createUseCase({ remainingUnlinked: 0 });
  await useCase.execute(baseInput);
  assertEquals(recalculate.wasCalled, true);
});

Deno.test("LinkProduct: NÃO chama recálculo quando ainda há itens não vinculados", async () => {
  const { useCase, recalculate } = createUseCase({ remainingUnlinked: 1 });
  await useCase.execute(baseInput);
  assertEquals(recalculate.wasCalled, false);
});

Deno.test("LinkProduct: retorna statusChanged=true quando status mudou", async () => {
  const { useCase } = createUseCase({ remainingUnlinked: 0 });
  const result = await useCase.execute(baseInput);
  assertEquals(result.statusChanged, true);
  assertEquals(result.newStatus, OrderStatus.READY_TO_PRINT);
});

Deno.test("LinkProduct: retorna remainingUnlinkedCount correto", async () => {
  const { useCase } = createUseCase({ remainingUnlinked: 2 });
  const result = await useCase.execute(baseInput);
  assertEquals(result.remainingUnlinkedCount, 2);
  assertEquals(result.statusChanged, false);
});
```

---

## 5. Definition of Done

- [ ] Arquivo `LinkProductToOrderItemUseCase.ts` criado em `application/orders/`
- [ ] Tipos `LinkProductInput` e `LinkProductResult` exportados
- [ ] Método `execute()` implementado com as 4 etapas descritas
- [ ] O use case depende apenas de interfaces (IOrderRepository, IProductLinkRepository)
- [ ] `IOrderRepository` atualizado com `updateOrderItemsProductId()`
- [ ] `SupabaseOrderRepository` (T4) atualizado com implementação de `updateOrderItemsProductId()`
- [ ] Arquivo `MockProductLinkRepository.ts` criado em `__mocks__/` para uso nos testes
- [ ] Todos os testes unitários passam sem banco de dados
- [ ] Nenhum arquivo excede 150 linhas
- [ ] Zero chamadas diretas ao Supabase no use case
