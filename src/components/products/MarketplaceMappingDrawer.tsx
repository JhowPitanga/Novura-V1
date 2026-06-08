/**
 * Presentational drawer for marketplace item mapping in EditProduct.
 * Receives data + callbacks from useMarketplaceMappingDrawer — no Supabase, no fetch-effects.
 *
 * NOTE: The drawer is structurally present but openMapeamento is never set to true
 * in the current UI — this is a pre-existing dead-code situation preserved as-is.
 */

import { Search, ExternalLink, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { marketplaces, labelByDbName } from '@/utils/products/marketplaceItemMapping';
import type { useMarketplaceMappingDrawer } from '@/hooks/products/useMarketplaceMappingDrawer';

interface MarketplaceMappingDrawerProps {
  drawer: ReturnType<typeof useMarketplaceMappingDrawer>;
}

export function MarketplaceMappingDrawer({ drawer }: MarketplaceMappingDrawerProps) {
  const {
    openMapeamento, setOpenMapeamento,
    selectedMarketplace, setSelectedMarketplace,
    searchTerm, setSearchTerm,
    existingLinks,
    itemsLoading,
    items,
    linkingItemId,
    unlinkingKey,
    activeDbMarketplaceNames,
    handleLinkItem,
    handleUnlink,
  } = drawer;

  const activeMarketplaces = marketplaces.filter(
    (m) => activeDbMarketplaceNames.some((name) => name.includes(m.value.replace('-', '_')))
  );

  return (
    <Drawer open={openMapeamento} onOpenChange={setOpenMapeamento} direction="right">
      <DrawerContent className="fixed inset-y-0 right-0 h-full w-[600px]">
        <DrawerHeader>
          <DrawerTitle>Mapear Anúncio ao Produto</DrawerTitle>
          <DrawerDescription>Vincule um anúncio de marketplace a este produto.</DrawerDescription>
        </DrawerHeader>
        <div className="flex gap-3 px-4 py-3 border-b">
          <Select value={selectedMarketplace} onValueChange={setSelectedMarketplace}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Marketplace" />
            </SelectTrigger>
            <SelectContent>
              {(activeMarketplaces.length > 0 ? activeMarketplaces : marketplaces).map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Buscar por título, SKU ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {existingLinks.length > 0 && (
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-medium text-gray-700 mb-2">Vínculos existentes</p>
            <div className="space-y-1">
              {existingLinks.map((link: any) => {
                const key = `${link.marketplace_item_id}::${link.variation_id || ''}`;
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                    <div>
                      <span className="text-xs font-medium text-gray-700">{labelByDbName[link.marketplace_name] || link.marketplace_name}</span>
                      <span className="mx-2 text-gray-400">·</span>
                      <span className="text-xs text-gray-600">{link.marketplace_item_id}</span>
                      {link.variation_id && <Badge variant="outline" className="ml-2 text-xs">{link.variation_id}</Badge>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={unlinkingKey === key}
                      onClick={() => handleUnlink(link)}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                    >
                      {unlinkingKey === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto px-4 py-3">
          {itemsLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando anúncios...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
              <ExternalLink className="w-8 h-8" />
              <p className="text-sm">Nenhum anúncio encontrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imagem</TableHead>
                  <TableHead>Título / SKU</TableHead>
                  <TableHead>Variação</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any) => {
                  const key = `${item.marketplace_item_id}::${item.variation_id || ''}`;
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt="" className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center"><ExternalLink className="w-4 h-4 text-gray-300" /></div>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium truncate max-w-[200px]">{item.title}</p>
                        {item.sku && <p className="text-xs text-gray-500">SKU: {item.sku}</p>}
                      </TableCell>
                      <TableCell>
                        {item.variation_label && <Badge variant="outline" className="text-xs">{item.variation_label}</Badge>}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={linkingItemId === key}
                          onClick={() => handleLinkItem(item)}
                          className="bg-violet-700 hover:bg-violet-800 text-white"
                        >
                          {linkingItemId === key ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                          Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
