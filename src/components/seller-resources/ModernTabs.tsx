
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ModernTabsProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function ModernTabs({ value, onValueChange }: ModernTabsProps) {
  return (
    <div className="bg-white px-6 py-6">
      <Tabs value={value} onValueChange={onValueChange} className="w-full">
        <TabsList className="bg-gray-100 p-1 rounded-xl border-0 shadow-sm">
          <TabsTrigger 
            value="produtos" 
            className="px-8 py-3 rounded-lg font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm text-gray-600"
          >
            Produtos
          </TabsTrigger>
          <TabsTrigger 
            value="compras" 
            className="px-8 py-3 rounded-lg font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm text-gray-600"
          >
            Minhas Compras
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
