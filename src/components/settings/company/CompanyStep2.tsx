import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";

interface EmpresaData {
  certificado_a1_url?: string;
  certificado_senha?: string;
  certificado_validade?: string;
}

interface EmpresaStep2Props {
  data: EmpresaData;
  updateData: (data: Partial<EmpresaData>) => void;
  onPfxSelected?: (file: File | null) => void;
  onCertPasswordChange?: (password: string) => void;
  onVerifyPassword?: () => void;
  verifyStatus?: "idle" | "checking" | "valid" | "invalid";
}

export function EmpresaStep2({ data, updateData, onPfxSelected, onCertPasswordChange, onVerifyPassword, verifyStatus = "idle" }: EmpresaStep2Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.pfx')) {
      // Armazena o nome do arquivo para exibição e repassa o arquivo bruto ao pai
      updateData({ certificado_a1_url: file.name });
      if (onPfxSelected) onPfxSelected(file);
    } else {
      alert('Por favor, selecione apenas arquivos .pfx');
      if (onPfxSelected) onPfxSelected(null);
    }
    // Permitir re-selecionar o mesmo arquivo
    if (event.target) {
      try { (event.target as HTMLInputElement).value = ""; } catch (_) {}
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
          {/* Input de arquivo oculto e controlado */}
          <input
            ref={fileInputRef}
            type="file"
            id="certificado"
            accept=".pfx"
            onChange={handleFileUpload}
            className="hidden"
          />

          {!data.certificado_a1_url ? (
            <div className="space-y-2">
              <Label htmlFor="certificado">Arquivo do Certificado (.pfx)</Label>
              <div
                className="border-2 border-dashed border-novura-primary/40 rounded-lg p-6 text-center hover:border-novura-primary transition-colors bg-novura-primary/5 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto h-12 w-12 text-novura-primary mb-4" />
                <p className="text-sm text-gray-700">
                  Clique para fazer upload ou arraste o arquivo aqui
                  <br />
                  <span className="text-xs text-novura-primary">Apenas arquivos .pfx</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Arquivo do Certificado</Label>
              <div className="flex items-center justify-between rounded-lg border border-novura-primary/20 bg-novura-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-novura-primary/10 rounded-lg flex items-center justify-center">
                    <Upload className="w-5 h-5 text-novura-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{data.certificado_a1_url}</p>
                    <p className="text-xs text-gray-600">Certificado selecionado</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-novura-primary text-novura-primary hover:bg-novura-primary/10"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Alterar
                  </Button>
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      updateData({ certificado_a1_url: undefined });
                      if (onPfxSelected) onPfxSelected(null);
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="certificado_validade">Data de Validade</Label>
              <Input
                id="certificado_validade"
                type="text"
                placeholder="DD/MM/AAAA"
                value={data.certificado_validade || ""}
                onChange={(e) => updateData({ certificado_validade: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificado_senha">Senha do Certificado</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="certificado_senha"
                  type="password"
                  value={data.certificado_senha || ""}
                  onChange={(e) => {
                    updateData({ certificado_senha: e.target.value });
                    if (onCertPasswordChange) onCertPasswordChange(e.target.value);
                  }}
                  placeholder="Digite a senha do certificado"
                />
                <Button
                  type="button"
                  className="shrink-0"
                  onClick={onVerifyPassword}
                  disabled={verifyStatus === "checking"}
                >
                  {verifyStatus === "checking" && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {verifyStatus === "checking" ? "Verificando..." : "Verificar"}
                </Button>
              </div>
              {verifyStatus === "valid" && (
                <p className="text-xs text-green-600">Senha validada e validade identificada.</p>
              )}
              {verifyStatus === "invalid" && (
                <p className="text-xs text-red-600">Senha inválida ou arquivo .pfx não pôde ser lido.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}