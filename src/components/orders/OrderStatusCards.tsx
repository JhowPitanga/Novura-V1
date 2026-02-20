import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface StatusBlock {
  id: string;
  title: string;
  count: number;
  description: string;
}

interface OrderStatusCardsProps {
  statusBlocks: StatusBlock[];
  activeStatus: string;
  onStatusChange: (id: string) => void;
  hasDelayedByBlock: (blockId: string) => boolean;
}

export function OrderStatusCards({ statusBlocks, activeStatus, onStatusChange, hasDelayedByBlock }: OrderStatusCardsProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 mb-8">
      {statusBlocks.map((block) => (
        <Card
          key={block.id}
          className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-0 bg-white text-gray-900 overflow-hidden relative ${
            activeStatus === block.id ? "ring-2 ring-primary shadow-lg scale-105 bg-primary text-white" : ""
          }`}
          onClick={() => onStatusChange(block.id)}
        >
          <CardContent className="p-4 text-center relative z-10">
            <div className="text-3xl font-bold mb-2 relative inline-block">
              {block.count}
              {hasDelayedByBlock(block.id) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="absolute top-0 left-full ml-5 z-20">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-lg"></span>
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] whitespace-normal leading-snug text-center">
                    <span className="block">Você tem pedidos em atraso!</span>
                    <span className="block">Envie o mais rápido possível para evitar problemas na reputação.😟</span>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="text-sm font-medium">{block.title}</div>
            <div className="text-xs opacity-80 mt-1">{block.description}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
