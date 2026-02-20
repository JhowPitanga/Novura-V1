import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Table } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";

interface AllOrdersFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  sortKey: string;
  sortDir: string;
  onSortKeyChange: (v: string) => void;
  onSortDirChange: (v: string) => void;
  isDatePopoverOpen: boolean;
  onDatePopoverOpenChange: (v: boolean) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (v: DateRange | undefined) => void;
  tempDateRange: DateRange | undefined;
  onTempDateRangeChange: (v: DateRange | undefined) => void;
  onExportCSV: () => void;
  isFilterDrawerOpen: boolean;
  onFilterDrawerOpenChange: (v: boolean) => void;
  onColumnsDrawerOpen: () => void;
  pageSize: number;
  onPageSizeChange: (v: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function AllOrdersFilterBar({
  searchTerm,
  onSearchTermChange,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirChange,
  isDatePopoverOpen,
  onDatePopoverOpenChange,
  dateRange,
  onDateRangeChange,
  tempDateRange,
  onTempDateRangeChange,
  onExportCSV,
  onFilterDrawerOpenChange,
  onColumnsDrawerOpen,
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  onPageChange,
}: AllOrdersFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
      <div className="relative w-full md:w-1/4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          placeholder="Buscar por ID, cliente, SKU ou produto..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
        />
      </div>
      <div className="flex items-center gap-4">
        {/* Ordenação: à esquerda do filtro de data */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
            >
              {sortDir === 'asc' ? (
                <ChevronUp className="w-4 h-4 mr-2" />
              ) : (
                <ChevronDown className="w-4 h-4 mr-2" />
              )}
              Ordenar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              className={sortKey === 'sku' ? 'text-novura-primary font-medium' : ''}
              onSelect={(e) => { e.preventDefault(); onSortKeyChange('sku'); onSortDirChange('asc'); }}
            >
              Sku
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortKey === 'items' ? 'text-novura-primary font-medium' : ''}
              onSelect={(e) => { e.preventDefault(); onSortKeyChange('items'); onSortDirChange('desc'); }}
            >
              Total de itens
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortKey === 'recent' ? 'text-novura-primary font-medium' : ''}
              onSelect={(e) => { e.preventDefault(); onSortKeyChange('recent'); onSortDirChange('desc'); }}
            >
              Mais recente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover open={isDatePopoverOpen} onOpenChange={onDatePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              aria-label="Filtrar por data"
              className={`group h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 ${!dateRange?.from && "text-gray-500"} ${isDatePopoverOpen ? 'gap-[1px]' : 'gap-0 group-hover:gap-[1px]'} justify-center`}
            >
              <Calendar className="h-4 w-4" />
              <span className={`overflow-hidden whitespace-nowrap max-w-0 opacity-0 transition-all duration-300 ease-out ${isDatePopoverOpen ? 'max-w-[140px] opacity-100' : 'group-hover:max-w-[140px] group-hover:opacity-100'}`}>
                Filtrar por data
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={8}>
            <CalendarComponent
              mode="range"
              selected={tempDateRange}
              onSelect={(range: any) => onTempDateRangeChange(range)}
              locale={ptBR}
              initialFocus
            />
            <div className="p-2 border-t flex justify-end space-x-2">
              <Button variant="ghost" className="text-gray-500" onClick={() => { onDateRangeChange(undefined); onDatePopoverOpenChange(false); }}>Remover Filtro</Button>
              <Button onClick={() => { onDateRangeChange(tempDateRange); onDatePopoverOpenChange(false); }}>Aplicar</Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          className="group h-12 px-4 rounded-2xl bg-primary shadow-lg text-white gap-0 group-hover:gap-2"
          onClick={onExportCSV}
          aria-label="Exportar CSV"
        >
          <Download className="h-4 w-4" />
          <span className="overflow-hidden whitespace-nowrap max-w-0 opacity-0 transition-all duration-300 ease-out group-hover:max-w-[120px] group-hover:opacity-100">
            Exportar CSV
          </span>
        </Button>
        <Button variant="outline" className="group h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 gap-0 group-hover:gap-2" onClick={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLButtonElement).blur();
          onFilterDrawerOpenChange(false);
          setTimeout(() => {
            onColumnsDrawerOpen();
          }, 0);
        }} data-columns-trigger aria-label="Colunas">
          <Table className="h-4 w-4" />
          <span className="overflow-hidden whitespace-nowrap max-w-0 opacity-0 transition-all duration-300 ease-out group-hover:max-w-[80px] group-hover:opacity-100">
            Colunas
          </span>
        </Button>
        <div className="w-[150px]">
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-12 rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/60">
              <SelectValue placeholder="Itens por página" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 por página</SelectItem>
              <SelectItem value="50">50 por página</SelectItem>
              <SelectItem value="100">100 por página</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 select-none">
          <Button
            variant="outline"
            className={`h-9 w-9 p-0 rounded-2xl ${currentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium w-[56px] text-center">{currentPage}/{totalPages}</div>
          <Button
            variant="outline"
            className={`h-9 w-9 p-0 rounded-2xl ${currentPage < totalPages ? 'text-primary' : 'text-gray-300'}`}
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
