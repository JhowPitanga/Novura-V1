interface StepMarketplaceSelectorProps {
  connectedApps: string[];
  marketplaceSelection: string;
  onSelect: (name: string) => void;
}

export function StepMarketplaceSelector({
  connectedApps,
  marketplaceSelection,
  onSelect,
}: StepMarketplaceSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-700">Selecione um marketplace conectado</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {connectedApps.map((name) => {
          const selected = marketplaceSelection === name;
          return (
            <button
              key={name}
              className={`border rounded-lg px-4 py-3 text-left ${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"}`}
              onClick={() => onSelect(name)}
            >
              <div className="font-medium text-gray-900">{name}</div>
              <div className="text-xs text-gray-600">Conectado</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
