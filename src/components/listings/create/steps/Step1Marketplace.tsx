import type { MarketplaceAdapter } from '@/adapters/listings/types';
import { resolveAdapter } from '@/adapters/listings/resolveAdapter';

interface Step1MarketplaceProps {
  connectedApps: string[];
  selectedName: string;
  onSelect: (name: string, adapter: MarketplaceAdapter) => void;
}

export function Step1Marketplace({ connectedApps, selectedName, onSelect }: Step1MarketplaceProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-700">Selecione um marketplace conectado</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {connectedApps.map((name) => {
          const selected = selectedName === name;
          const adapter = resolveAdapter(name);
          return (
            <button
              key={name}
              className={`border rounded-lg px-4 py-3 text-left transition-colors ${
                selected ? 'border-novura-primary bg-purple-50' : 'border-gray-200 bg-white hover:border-novura-primary/50'
              }`}
              onClick={() => adapter && onSelect(name, adapter)}
              disabled={!adapter}
            >
              <div className="font-medium text-gray-900">{name}</div>
              <div className="text-xs text-gray-500">{adapter ? 'Conectado' : 'Não suportado'}</div>
            </button>
          );
        })}
      </div>
      {!connectedApps.length && (
        <p className="text-sm text-gray-500">Nenhum marketplace conectado. Vá em Configurações → Integrações.</p>
      )}
    </div>
  );
}
