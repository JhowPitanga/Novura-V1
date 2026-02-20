
import { MoreHorizontal, Edit, Copy, Trash2, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";

interface KitsAccordionProps {
  kits: any[];
  loading?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (kitId: string, checked: boolean) => void;
}

export function KitsAccordion({ kits, loading = false, selectedIds = [], onToggleSelect }: KitsAccordionProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (kits.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            Nenhum kit encontrado
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <Accordion type="single" collapsible className="w-full">
          {kits.map((kit) => (
            <AccordionItem key={kit.id} value={`kit-${kit.id}`}>
              <div className="flex justify-between items-center w-full p-4 mb-6 rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex items-center space-x-5">
                  {/* Coluna vertical: checkbox em cima, seta abaixo */}
                  <div className="flex flex-col items-center justify-center">
                    <Checkbox
                      checked={selectedIds.includes(kit.id)}
                      onCheckedChange={(checked) => onToggleSelect?.(kit.id, Boolean(checked))}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Selecionar kit"
                    />
                    <AccordionTrigger className="mt-1 p-2 rounded hover:bg-gray-100 w-8 h-8 flex items-center justify-center">
                      <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                    </AccordionTrigger>
                  </div>

                  {(() => {
                    const parentImage = Array.isArray(kit.image_urls) && kit.image_urls.length > 0 ? kit.image_urls[0] : undefined;
                    return parentImage ? (
                      <img
                        src={parentImage}
                        alt={kit.name}
                        className="w-12 h-12 rounded-lg object-cover bg-gray-100"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200" aria-label="Sem foto" />
                    );
                  })()}
                  <div className="flex flex-col">
                    <span className="font-medium">{kit.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">SKU</span>
                      <span className="text-xs text-gray-700">{kit.sku || '-'}</span>
                      {kit.sku && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(kit.sku);
                          }}
                          title="Copiar SKU"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{kit.kit_items.length} itens</Badge>
                  {/* Menu de ações do produto PAI */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => window.location.href = `/produtos/editar-kit/${kit.id}`}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => console.log('Duplicar kit', kit.id)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600" onClick={() => console.log('Excluir kit', kit.id)}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <AccordionContent>
                <div className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Imagem</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Quantidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kit.kit_items.map((item: any, idx: number) => (
                        <TableRow key={item.id || idx}>
                          <TableCell>
                            {item.product?.image_urls && item.product.image_urls.length > 0 ? (
                              <img
                                src={item.product.image_urls[0]}
                                alt={item.product.name}
                                className="w-10 h-10 rounded object-cover bg-gray-100"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200" aria-label="Sem foto" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{item.product.name}</TableCell>
                          <TableCell className="font-mono text-sm">{item.product.sku}</TableCell>
                          <TableCell>{item.quantity}x</TableCell>

                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Estoque disponível:</span>
                      <span className={kit.available_kits < 10 ? "text-red-600 font-medium" : "text-gray-900 font-medium"}>
                        {kit.available_kits} kits
                      </span>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
