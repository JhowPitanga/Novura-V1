import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";

interface FilterOption {
  label: string;
  value: string;
}

interface AdminFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  selects?: {
    key: string;
    placeholder: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
  }[];
  onClear?: () => void;
  isDirty?: boolean;
}

export function AdminFilterBar({
  search,
  onSearchChange,
  placeholder = "Buscar...",
  selects = [],
  onClear,
  isDirty = false,
}: AdminFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {selects.map((s) => (
        <Select key={s.key} value={s.value} onValueChange={s.onChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={s.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{s.placeholder}</SelectItem>
            {s.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {isDirty && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
          <X className="h-4 w-4 mr-1" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
