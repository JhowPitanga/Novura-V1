import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";

interface EmpresaData {
  certificado_a1_url?: string;
  certificado_senha?: string;
  certificado_validade?: string;
}

interface EmpresaStep2Props {
  data: EmpresaData;
  updateData: (data: Partial<EmpresaData>) => void;
}

export function EmpresaStep2({ data, updateData }: EmpresaStep2Props) {
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.pfx')) {
      // Here you would typically upload to Supabase Storage
      updateData({ certificado_a1_url: file.name });
    } else {
      alert('Por favor, selecione apenas arquivos .pfx');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Certificado A1</h3>
        <p className="text-gray-600 mb-6">
          Faça upload do certificado digital A1 para emissão de notas fiscais
        </p>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="certificado">Arquivo do Certificado (.pfx)</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                id="certificado"
                accept=".pfx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="certificado" className="cursor-pointer">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-sm text-gray-600">
                  {data.certificado_a1_url ? (
                    <span className="text-green-600">Arquivo selecionado: {data.certificado_a1_url}</span>
                  ) : (
                    <>
                      Clique para fazer upload ou arraste o arquivo aqui
                      <br />
                      <span className="text-xs text-gray-500">Apenas arquivos .pfx</span>
                    </>
                  )}
                </p>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="certificado_validade">Data de Validade</Label>
              <Input
                id="certificado_validade"
                type="date"
                value={data.certificado_validade || ""}
                onChange={(e) => updateData({ certificado_validade: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificado_senha">Senha do Certificado</Label>
              <Input
                id="certificado_senha"
                type="password"
                value={data.certificado_senha || ""}
                onChange={(e) => updateData({ certificado_senha: e.target.value })}
                placeholder="Digite a senha do certificado"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>Informação:</strong> O certificado A1 é opcional nesta etapa e pode ser configurado posteriormente.
        </p>
      </div>
    </div>
  );
}