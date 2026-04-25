# PRD — C3-T7 Inventory & Listings: Ajustes Operacionais

## Contexto

Este PRD consolida os ajustes implementados para melhorar o fluxo operacional entre Estoque, Armazéns, Full e Listings.  
O objetivo principal foi reduzir fricção no dia a dia do time, aumentar rastreabilidade de movimentações e melhorar a consistência dos dados exibidos no frontend.

## Objetivos

- Habilitar transferências entre armazéns com regras claras de origem/destino.
- Reforçar rastreabilidade das movimentações de estoque com classificação estruturada.
- Melhorar a operação de vinculação entre anúncio e produto.
- Exibir distribuição de estoque por armazém de forma confiável e compatível com filtros.
- Entregar aba de relatórios com visão operacional e exportação.

## Escopo Entregue

### 1) Transferência entre armazéns

- Novo suporte para `TRANSFERENCIA` no backend de movimentações.
- Inclusão de `counterpart_storage_id` para registrar o armazém contraparte.
- RPC dedicada para transferência entre armazéns:
  - valida origem/destino;
  - impede origem e destino iguais;
  - bloqueia destino Full conforme regra de negócio.
- Fluxo integrado no `InventoryManagementDrawer` com seleção de origem/destino.

## 2) Auditoria e classificação de transações

- Evolução da estrutura de `inventory_transactions` com colunas para classificação sem depender apenas de `source_ref`.
- Inclusão de campos estruturados para tipo de entidade e motivo:
  - `entity_type`
  - `reason_code`
- Cobertura dos cenários:
  - venda;
  - saída manual;
  - estorno;
  - devolução;
  - transferências.

## 3) Distribuição por armazém no card de estoque

- Alinhamento do filtro para usar identificador de armazém (`storage_id`) em vez de nome.
- Ajuste da agregação para evitar distorção por armazéns sem quantidade.
- Correção da lógica quando há filtro por armazém:
  - o card passa a agregar somente o armazém selecionado.
- Garantia de consistência entre lista e popover de distribuição (top N + visão completa).

## 4) Aba de relatórios de movimentações

- Nova aba `Relatórios` no módulo de Estoque.
- Criação de `MovementsTab` com:
  - cards de resumo (Entradas, Saídas, Reservas, Transferências);
  - filtros operacionais;
  - tabela com badges por tipo;
  - exportação CSV.
- Serviço e hook dedicados com paginação server-side:
  - `movements.service.ts`
  - `useInventoryMovements.ts`

## 5) Full/Fulfillment e vínculo anúncio-produto

- Reestruturação da aba Full para operar com foco em itens vinculados.
- Exibição de imagem, SKU, ID do anúncio e armazém no fluxo de Full.
- Criação de `LinkPickerDrawer` padronizado para dois modos:
  - anúncio -> produto;
  - produto -> anúncio.
- Auto-match por SKU no vínculo, priorizando candidatos exatos/similares.
- `ListingCard` com badge operacional para facilitar ação de vínculo.
- Expansão da distribuição por armazém dentro do card de anúncio:
  - Mercado Livre via `marketplace_stock_distribution`;
  - Shopee via `stock_info_v2`.

## 6) UX, componentes e ajustes de interface

- Remoção de botões duplicados de fechamento em drawers.
- Ajustes de largura/responsividade em drawers de gestão de estoque e armazém.
- Pequenos refinamentos em componentes UI de base (`toast`, `badge`, `alert-dialog`).

## Migrações incluídas

- `20260424_000001_warehouse_transfer_support.sql`
- `20260424_000002_inventory_actor_audit.sql`
- `20260424_000003_products_stock_multi_warehouse_unique.sql`

## Arquivos-chave impactados

- Páginas:
  - `src/pages/Inventory.tsx`
  - `src/pages/Listings.tsx`
- Estoque:
  - `src/components/inventory/InventoryManagementDrawer.tsx`
  - `src/components/inventory/StorageManagementDrawer.tsx`
  - `src/components/inventory/tabs/StockTab.tsx`
  - `src/components/inventory/tabs/FulfillmentTab.tsx`
  - `src/components/inventory/tabs/MovementsTab.tsx`
- Listings:
  - `src/components/listings/ListingCard.tsx`
  - `src/components/shared/LinkPickerDrawer.tsx`
  - `src/hooks/useListingLinks.ts`
  - `src/services/listingLinks.service.ts`
- Movimentações:
  - `src/hooks/useInventoryMovements.ts`
  - `src/services/movements.service.ts`
- Serviços/tipos auxiliares:
  - `src/services/inventory.service.ts`
  - `src/services/listings.service.ts`
  - `src/hooks/useListings.ts`
  - `src/types/listings.ts`
  - `src/utils/listingUtils.ts`

## Critérios de aceite atendidos

- Transferência entre armazéns funciona com validações de negócio.
- Destino Full bloqueado para transferência.
- Origem diferente do destino é obrigatória.
- Movimentações possuem classificação estruturada auditável.
- Relatórios exibem resumo, histórico e exportação.
- Vínculo de anúncio-produto foi simplificado com auto-match SKU.
- Card de distribuição por armazém respeita filtro e cálculo esperado.

## Riscos e observações

- Duplicidade de caminhos com separadores diferentes (`/` e `\`) pode causar confusão em ambientes Windows quando houver arquivos espelhados no status.  
- Recomenda-se revisão final da árvore de arquivos antes de merge para evitar duplicatas não intencionais.

## Plano de validação

- Validar manualmente o fluxo de transferência:
  - origem != destino;
  - destino Full bloqueado;
  - atualização de saldos por armazém.
- Validar relatórios com filtros combinados e exportação CSV.
- Validar fluxo de vínculo com auto-match SKU em cenários com e sem candidatos.
- Validar card de distribuição por armazém:
  - sem filtro;
  - com filtro por armazém específico;
  - com produtos sem estoque.
- Executar build e lint do frontend antes do merge.
