#!/bin/bash
set -e

# =============================================================================
# Creates 4 deployment branches from the current refactoring work.
# Run from the project root: bash create-branches.sh
#
# Deploy order: 01 → 02 → 03 → 04 (each branch builds on the previous)
# =============================================================================

echo ""
echo "=========================================="
echo "  Creating deployment branches"
echo "=========================================="
echo ""

# ── Step 0: Save ALL current work to a backup branch ─────────────────────────
echo "[0/4] Saving all current work to refactor/backup..."
git add -A
git commit -m "backup: complete refactoring state" --no-verify || true
git branch -f refactor/backup HEAD

# ── Step 1: refactor/01-test-infra-auth ──────────────────────────────────────
echo ""
echo "[1/4] Creating refactor/01-test-infra-auth..."
git checkout master
git checkout -b refactor/01-test-infra-auth

# Test infrastructure
git checkout refactor/backup -- vitest.config.ts
git checkout refactor/backup -- package.json
git checkout refactor/backup -- package-lock.json
git checkout refactor/backup -- src/test/

# Test files
mkdir -p src/hooks/__tests__ src/services/__tests__ src/utils/__tests__
git checkout refactor/backup -- src/hooks/__tests__/usePermissions.test.ts
git checkout refactor/backup -- src/services/__tests__/auth.service.test.ts

# Auth service layer
git checkout refactor/backup -- src/services/query-keys.ts
git checkout refactor/backup -- src/services/supabase-helpers.ts
git checkout refactor/backup -- src/services/auth.service.ts

# Auth/permissions hook cleanup
git checkout refactor/backup -- src/hooks/useAuth.tsx
git checkout refactor/backup -- src/hooks/usePermissions.tsx

git add -A
git commit -m "feat: add test infrastructure and refactor auth/permissions

- Add vitest + testing-library + msw setup
- Create test utilities and mock factories
- Extract auth service layer (auth.service.ts)
- Add shared query-keys and supabase-helpers
- Refactor useAuth and usePermissions hooks
- Add unit tests for auth service and permissions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

echo "  ✓ refactor/01-test-infra-auth created"

# ── Step 2: refactor/02-module-renames ───────────────────────────────────────
echo ""
echo "[2/4] Creating refactor/02-module-renames..."
git checkout -b refactor/02-module-renames

# ---- Remove old page files (except Pedidos.tsx and NotasFiscais.tsx) ----
git rm -f \
  src/pages/Index.tsx \
  src/pages/Desempenho.tsx \
  src/pages/PesquisaMercado.tsx \
  src/pages/Produtos.tsx \
  src/pages/Anuncios.tsx \
  src/pages/AnunciosCriarML.tsx \
  src/pages/AnunciosEditarML.tsx \
  src/pages/RecursosSeller.tsx \
  src/pages/Aplicativos.tsx \
  src/pages/Estoque.tsx \
  src/pages/Equipe.tsx \
  src/pages/Comunidade.tsx \
  src/pages/Configuracoes.tsx \
  src/pages/NovaEmpresa.tsx \
  src/pages/ConviteAceito.tsx \
  src/pages/SAC.tsx

# ---- Add renamed page files from backup ----
git checkout refactor/backup -- \
  src/pages/Dashboard.tsx \
  src/pages/Performance.tsx \
  src/pages/MarketResearch.tsx \
  src/pages/Products.tsx \
  src/pages/Listings.tsx \
  src/pages/CreateListingML.tsx \
  src/pages/EditListingML.tsx \
  src/pages/SellerResources.tsx \
  src/pages/Apps.tsx \
  src/pages/Inventory.tsx \
  src/pages/Team.tsx \
  src/pages/Community.tsx \
  src/pages/Settings.tsx \
  src/pages/NewCompany.tsx \
  src/pages/InviteAccepted.tsx \
  src/pages/CustomerService.tsx

# ---- Remove old component directories (except pedidos/) ----
git rm -rf \
  src/components/comunidade/ \
  src/components/estoque/ \
  src/components/pesquisa-mercado/ \
  src/components/recursos/ \
  src/components/configuracoes/ \
  src/components/equipe/

# Remove old produtos/ directory
git rm -rf src/components/produtos/

# Remove products/ if it partially exists (will be replaced from backup)
git rm -rf src/components/products/ 2>/dev/null || true

# ---- Add renamed component directories from backup ----
git checkout refactor/backup -- \
  src/components/community/ \
  src/components/inventory/ \
  src/components/market-research/ \
  src/components/seller-resources/ \
  src/components/settings/ \
  src/components/team/ \
  src/components/products/

# ---- Remove old type/util/data files ----
git rm -f \
  src/types/estoque.ts \
  src/utils/estoqueUtils.tsx \
  src/data/estoqueData.ts

# ---- Add renamed type/util/data files from backup ----
git checkout refactor/backup -- \
  src/types/inventory.ts \
  src/utils/inventoryUtils.tsx \
  src/data/inventoryData.ts

# ---- Update modified hooks (inventory-related import path updates) ----
git checkout refactor/backup -- \
  src/hooks/useStockData.ts \
  src/hooks/useStorage.ts \
  src/hooks/useProductSync.ts

# ---- Update other modified files ----
git checkout refactor/backup -- src/components/ConfiguracoesModal.tsx
git checkout refactor/backup -- src/services/inventory.service.ts

# ---- App.tsx: update all imports EXCEPT Orders and Invoices ----
git checkout refactor/backup -- src/App.tsx
# Revert Orders back to Pedidos (will be updated in branch 03)
sed -i 's|const Orders = lazy(() => import("./pages/Orders"));|const Pedidos = lazy(() => import("./pages/Pedidos"));|' src/App.tsx
sed -i 's|<Orders />|<Pedidos />|g' src/App.tsx
# Revert Invoices back to NotasFiscais (will be updated in branch 04)
sed -i 's|const Invoices = lazy(() => import("./pages/Invoices"));|const NotasFiscais = lazy(() => import("./pages/NotasFiscais"));|' src/App.tsx
sed -i 's|<Invoices />|<NotasFiscais />|g' src/App.tsx

# ---- Documentation ----
git checkout refactor/backup -- CLAUDE.md
git checkout refactor/backup -- REFACTORING_PLAN.md

git add -A
git commit -m "refactor: rename all modules to English

Rename all pages, components, types, utils, and data files from
Portuguese to English. URL routes remain unchanged.

Modules renamed:
- comunidade/ → community/
- estoque/ → inventory/
- pesquisa-mercado/ → market-research/
- recursos/ → seller-resources/
- configuracoes/ → settings/
- equipe/ → team/
- produtos/ → products/
- All page files (Index→Dashboard, Desempenho→Performance, etc.)

NOT included (separate branches):
- Orders (Pedidos) — see refactor/03
- Invoices (NotasFiscais) — see refactor/04

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

echo "  ✓ refactor/02-module-renames created"

# ── Step 3: refactor/03-orders-refactor ──────────────────────────────────────
echo ""
echo "[3/4] Creating refactor/03-orders-refactor..."
git checkout -b refactor/03-orders-refactor

# ---- Remove old orders files ----
git rm -f src/pages/Pedidos.tsx
git rm -rf src/components/pedidos/
git rm -rf src/types/Pedidos/
git rm -rf src/logic/Pedidos/

# ---- Add all orders files from backup ----
# Renamed + extracted page
git checkout refactor/backup -- src/pages/Orders.tsx

# All order components (renamed + new extracted)
git checkout refactor/backup -- src/components/orders/

# Types and logic
git checkout refactor/backup -- src/types/orders.ts
mkdir -p src/logic/orders
git checkout refactor/backup -- src/logic/orders/

# Service layer
git checkout refactor/backup -- src/services/orders.service.ts
git checkout refactor/backup -- src/services/__tests__/orders.service.test.ts

# Utilities
git checkout refactor/backup -- src/utils/orderUtils.ts
git checkout refactor/backup -- src/utils/pdfGenerators.ts
git checkout refactor/backup -- src/utils/__tests__/orderUtils.test.ts
git checkout refactor/backup -- src/utils/__tests__/pdfGenerators.test.ts

# ---- Update App.tsx: Pedidos → Orders ----
sed -i 's|const Pedidos = lazy(() => import("./pages/Pedidos"));|const Orders = lazy(() => import("./pages/Orders"));|' src/App.tsx
sed -i 's|<Pedidos />|<Orders />|g' src/App.tsx

git add -A
git commit -m "refactor: extract Orders page into components + service layer

- Rename Pedidos.tsx → Orders.tsx (4145 → 1624 lines)
- Rename pedidos/ → orders/ components to English
- Extract 17 subcomponents from Orders page:
  OrderStatusCards, OrderTableHeader, OrderTableRow,
  OrderTablePagination, ColumnsManagementPanel,
  ScannerCheckoutModal, SyncOrdersModal, PrintConfigModal,
  NfeFilterBar, PrintFilterBar, ShippedFilterBar,
  CanceledFilterBar, AllOrdersFilterBar, LinkFilterBar,
  AdvancedFiltersDrawer, orderColumnDefs factory
- Create orders.service.ts with 15 service functions
- Extract orderUtils.ts and pdfGenerators.ts
- Add unit tests for service and utils

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

echo "  ✓ refactor/03-orders-refactor created"

# ── Step 4: refactor/04-invoices-refactor ────────────────────────────────────
echo ""
echo "[4/4] Creating refactor/04-invoices-refactor..."
git checkout -b refactor/04-invoices-refactor

# ---- Remove old invoices page ----
git rm -f src/pages/NotasFiscais.tsx

# ---- Add invoices files from backup ----
git checkout refactor/backup -- src/pages/Invoices.tsx
git checkout refactor/backup -- src/components/invoices/
git checkout refactor/backup -- src/utils/nfeUtils.ts
git checkout refactor/backup -- src/utils/__tests__/nfeUtils.test.ts

# ---- Update App.tsx: NotasFiscais → Invoices ----
sed -i 's|const NotasFiscais = lazy(() => import("./pages/NotasFiscais"));|const Invoices = lazy(() => import("./pages/Invoices"));|' src/App.tsx
sed -i 's|<NotasFiscais />|<Invoices />|g' src/App.tsx

git add -A
git commit -m "refactor: extract Invoices page into components + utils

- Rename NotasFiscais.tsx → Invoices.tsx
- Extract InvoiceTable, InvoiceFilters, InvoiceActions,
  InvoiceStatusBadges components
- Extract nfeUtils.ts utility functions
- Add unit tests for nfeUtils

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

echo "  ✓ refactor/04-invoices-refactor created"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  All branches created successfully!"
echo "=========================================="
echo ""
echo "Branches (deploy in this order):"
echo "  1. refactor/01-test-infra-auth"
echo "  2. refactor/02-module-renames"
echo "  3. refactor/03-orders-refactor"
echo "  4. refactor/04-invoices-refactor"
echo ""
echo "Backup: refactor/backup (all changes in one commit)"
echo ""
echo "To deploy branch 1:"
echo "  git checkout master"
echo "  git merge refactor/01-test-infra-auth"
echo "  npm run build   # verify"
echo "  git push"
echo ""
echo "Then deploy branch 2:"
echo "  git merge refactor/02-module-renames"
echo "  npm run build   # verify"
echo "  git push"
echo ""
echo "And so on for branches 3 and 4."
echo ""
