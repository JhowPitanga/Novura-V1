import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EmpresaData {
  numero_serie: string;
  proxima_nfe: number;
}

interface EmpresaStep4Props {
  data: EmpresaData;
  updateData: (data: Partial<EmpresaData>) => void;
}

export function EmpresaStep4({ data, updateData }: EmpresaStep4Props) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configurações de NF-e</h3>
        <p className="text-gray-600 mb-6">
          Configure o número de série e a próxima numeração da NF-e
        </p>

        {/* Tooltip moderno em roxo/branco acima dos campos */}
        <div className="mb-6 rounded-xl bg-gradient-to-r from-novura-primary to-purple-600 text-white shadow-sm ring-1 ring-purple-300/40">
          <div className="px-5 py-4 flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">⚙️</div>
            <div className="flex-1">
              <div className="text-sm font-semibold tracking-wide">Quase pronto!</div>
              <div className="text-sm/relaxed opacity-95">
                Após salvar, a empresa estará configurada e pronta para emitir notas fiscais.
              </div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="numero_serie">Número de Série *</Label>
            <Input
              id="numero_serie"
              value={data.numero_serie}
              onChange={(e) => updateData({ numero_serie: e.target.value })}
              placeholder="Digite o número de série"
              required
            />
            <p className="text-xs text-gray-500">
              Número de série fornecido pela SEFAZ para emissão de NF-e
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proxima_nfe">Próxima NF-e *</Label>
            <Input
              id="proxima_nfe"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={data.proxima_nfe ? String(data.proxima_nfe) : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                updateData({ proxima_nfe: digits ? parseInt(digits, 10) : 0 });
              }}
              placeholder="Digite o próximo número"
              required
            />
            <p className="text-xs text-gray-500">
              Próximo número sequencial da NF-e a ser emitida
            </p>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>Atenção:</strong> Verifique se o número de série e a próxima NF-e estão corretos. 
          Estes dados são essenciais para a emissão correta das notas fiscais.
        </p>
      </div>
    </div>
  );
}