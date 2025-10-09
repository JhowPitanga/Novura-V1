
import { MoreHorizontal, Edit, Copy, Trash2, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";

interface VariationsAccordionProps {
  products: any[];
  loading?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (productId: string, checked: boolean) => void;
}

export function VariationsAccordion({ products, loading = false, selectedIds = [], onToggleSelect }: VariationsAccordionProps) {
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

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            Nenhum produto com variações encontrado
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <Accordion type="single" collapsible className="w-full">
          {products.map((produto) => (
            <AccordionItem key={produto.id} value={`item-${produto.id}`}>
              <div className="flex justify-between items-center w-full p-4 mb-6 rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex items-center space-x-5">
                  {/* Coluna vertical: checkbox em cima, seta abaixo */}
                  <div className="flex flex-col items-center justify-center">
                    <Checkbox
                      checked={selectedIds.includes(produto.id)}
                      onCheckedChange={(checked) => onToggleSelect?.(produto.id, Boolean(checked))}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Selecionar produto"
                    />
                    <AccordionTrigger className="mt-1 p-2 rounded hover:bg-gray-100 w-8 h-8 flex items-center justify-center">
                      <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                    </AccordionTrigger>
                  </div>

                  {(() => {
                    const parentImage = produto.variations?.find((v: any) => Array.isArray(v.image_urls) && v.image_urls.length > 0)?.image_urls?.[0];
                    return parentImage ? (
                      <img
                        src={parentImage}
                        alt={produto.name}
                        className="w-12 h-12 rounded-lg object-cover bg-gray-100"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200" aria-label="Sem foto" />
                    );
                  })()}
                  <span className="font-medium">{produto.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{produto.total_variations} variações</Badge>
                  {/* Menu de ações (3 pontinhos) do produto pai */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => window.location.href = `/produtos/editar-variacao/${produto.id}`}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => console.log('Duplicar grupo de variações', produto.id)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600" onClick={() => console.log('Excluir grupo de variações', produto.id)}>
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
                        <TableHead>SKU</TableHead>
                        {/* Detectar campos preenchidos (Cor/Tamanho/Material/Personalizado) e exibir colunas */}
                        {(() => {
                          const vars = produto.variations || [];
                          const hasColor = vars.some((v: any) => !!v.color);
                          const hasSize = vars.some((v: any) => !!v.size);
                          const hasMaterial = vars.some((v: any) => !!(v.material || v.custom_attributes?.material));
                          const hasCustom = vars.some((v: any) => !!(v.customType || v.custom_value || v.custom_attributes?.custom || v.custom_attributes?.type || v.custom_attributes?.valor || v.custom_attributes?.value));
                          return (
                            <>
                              {hasColor && <TableHead>Cor</TableHead>}
                              {hasSize && <TableHead>Tamanho</TableHead>}
                              {hasMaterial && <TableHead>Material</TableHead>}
                              {hasCustom && <TableHead>Personalizado</TableHead>}
                            </>
                          );
                        })()}
                        <TableHead>Custo</TableHead>
                        <TableHead>Estoque</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {produto.variations.map((variacao: any, idx: number) => (
                        <TableRow key={variacao.id || idx}>
                          <TableCell>
                            {variacao.image_urls && variacao.image_urls.length > 0 ? (
                              <img
                                src={variacao.image_urls[0]}
                                alt="Capa"
                                className="w-10 h-10 rounded object-cover bg-gray-100"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200" aria-label="Sem foto" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{variacao.sku}</TableCell>
                          {(() => {
                            const vars = produto.variations || [];
                            const hasColor = vars.some((v: any) => !!v.color);
                            const hasSize = vars.some((v: any) => !!v.size);
                            const hasMaterial = vars.some((v: any) => !!(v.material || v.custom_attributes?.material));
                            const hasCustom = vars.some((v: any) => !!(v.customType || v.custom_value || v.custom_attributes?.custom || v.custom_attributes?.type || v.custom_attributes?.valor || v.custom_attributes?.value));
                            return (
                              <>
                                {hasColor && <TableCell>{variacao.color || '-'}</TableCell>}
                                {hasSize && <TableCell>{variacao.size || '-'}</TableCell>}
                                {hasMaterial && <TableCell>{variacao.material || variacao.custom_attributes?.material || '-'}</TableCell>}
                                {hasCustom && <TableCell>{variacao.custom_value || variacao.customValue || variacao.custom_attributes?.value || variacao.custom_attributes?.custom || '-'}</TableCell>}
                              </>
                            );
                          })()}
                          <TableCell>R$ {(variacao.cost_price || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <span className={variacao.total_current_stock < 10 ? "text-red-600 font-medium" : "text-gray-900"}>
                              {variacao.total_current_stock || 0}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
