import { Search, Settings, FileText, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NfeFilterBarProps {
  nfBadgeFilter: string;
  onNfBadgeFilterChange: (v: string) => void;
  onNavigate: (path: string) => void;
  badgeCounts: { emitir: number; processando: number; falha: number; subirXml: number };
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  filteredPedidos: any[];
  selectedPedidosEmissao: string[];
  onMassEmit: (pedidos: any[]) => void;
  onSelectedEmit: (pedidos: any[]) => void;
  emitEnvironment: string;
  onEmitEnvironmentChange: (v: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function NfeFilterBar({
  nfBadgeFilter,
  onNfBadgeFilterChange,
  onNavigate,
  badgeCounts,
  searchTerm,
  onSearchTermChange,
  filteredPedidos,
  selectedPedidosEmissao,
  onMassEmit,
  onSelectedEmit,
  emitEnvironment,
  onEmitEnvironmentChange,
  currentPage,
  totalPages,
  onPageChange,
}: NfeFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
      <div className="w-full">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className={`h-9 rounded-full px-3 ${nfBadgeFilter === 'emitir' ? 'border-novura-primary text-novura-primary' : 'border-gray-200 text-gray-700'}`}
            onClick={() => { onNfBadgeFilterChange('emitir'); onNavigate('/pedidos/emissao_nfe/emitir'); }}
          >
            Emitir ({badgeCounts.emitir})
          </Button>
          <Button
            variant="outline"
            className={`h-9 rounded-full px-3 ${nfBadgeFilter === 'processando' ? 'border-novura-primary text-novura-primary' : 'border-gray-200 text-gray-700'}`}
            onClick={() => { onNfBadgeFilterChange('processando'); onNavigate('/pedidos/emissao_nfe/processando'); }}
          >
            Processando ({badgeCounts.processando})
          </Button>
          <Button
            variant="outline"
            className={`h-9 rounded-full px-3 ${nfBadgeFilter === 'falha' ? 'border-novura-primary text-novura-primary' : 'border-gray-200 text-gray-700'}`}
            onClick={() => { onNfBadgeFilterChange('falha'); onNavigate('/pedidos/emissao_nfe/falha_emissao'); }}
          >
            Falha na emissão ({badgeCounts.falha})
          </Button>
          <Button
            variant="outline"
            className={`h-9 rounded-full px-3 ${nfBadgeFilter === 'subir_xml' ? 'border-novura-primary text-novura-primary' : 'border-gray-200 text-gray-700'}`}
            onClick={() => { onNfBadgeFilterChange('subir_xml'); onNavigate('/pedidos/emissao_nfe/subir_xml'); }}
          >
            Subir xml ({badgeCounts.subirXml})
          </Button>
        </div>
      </div>
      <div className="relative w-full md:w-1/4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          placeholder="Buscar por ID, cliente, SKU ou produto..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
        />
        <style>
          {`
            @keyframes processingGrowWidth {
              0% { width: 0%; }
              100% { width: 100%; }
            }
          `}
        </style>
      </div>
      <div className="flex items-center gap-4">
        {nfBadgeFilter === 'emitir' && (
          <>
            <Button className="h-10 px-4 rounded-xl bg-primary shadow-lg" onClick={() => onMassEmit(filteredPedidos)}>
              <FileText className="w-4 h-4 mr-2" />
              Emissão em Massa
            </Button>
            <Button
              className="h-10 px-4 rounded-xl bg-primary shadow-lg disabled:opacity-50 disabled:pointer-events-none"
              disabled={selectedPedidosEmissao.length === 0}
              onClick={() => onSelectedEmit(filteredPedidos.filter(p => selectedPedidosEmissao.includes(p.id)))}
            >
              <FileText className="w-4 h-4 mr-2" />
              Emitir Selecionados ({selectedPedidosEmissao.length})
            </Button>
          </>
        )}
        {nfBadgeFilter === 'emitir' && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-2xl" aria-label="Configurar ambiente de emissão">
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  className={emitEnvironment === 'homologacao' ? 'text-novura-primary font-medium' : ''}
                  onSelect={(e) => {
                    e.preventDefault();
                    onEmitEnvironmentChange('homologacao');
                    try { localStorage.setItem('nfe_environment', 'homologacao'); } catch {}
                  }}
                >
                  Ambiente: Homologação
                  {emitEnvironment === 'homologacao' && <Check className="w-4 h-4 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={emitEnvironment === 'producao' ? 'text-novura-primary font-medium' : ''}
                  onSelect={(e) => {
                    e.preventDefault();
                    onEmitEnvironmentChange('producao');
                    try { localStorage.setItem('nfe_environment', 'producao'); } catch {}
                  }}
                >
                  Ambiente: Produção
                  {emitEnvironment === 'producao' && <Check className="w-4 h-4 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {emitEnvironment === 'homologacao' && (
              <Badge className="ml-1 bg-orange-100 text-orange-700 border border-orange-200">
                Homologação
              </Badge>
            )}
          </>
        )}
        <div className="flex items-center gap-0.5 select-none">
          <Button
            variant="outline"
            className={`h-10 w-8 p-0 rounded-2xl ${currentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium w-[40px] text-center">{currentPage}/{totalPages}</div>
          <Button
            variant="outline"
            className={`h-10 w-8 p-0 rounded-2xl ${currentPage < totalPages ? 'text-primary' : 'text-gray-300'}`}
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
