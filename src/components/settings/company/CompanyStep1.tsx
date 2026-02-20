import type { ChangeEvent } from "react";
import { MousePointerClick } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EmpresaData {
  razao_social: string;
  cnpj: string;
  tipo_empresa: string;
  tributacao: string;
  inscricao_estadual: string;
  email: string;
  cep: string;
  cidade: string;
  estado: string;
  endereco: string;
  numero: string;
  bairro: string;
  complemento?: string;
  logo_url?: string;
}

 interface EmpresaStep1Props {
   data: EmpresaData;
   updateData: (data: Partial<EmpresaData>) => void;
   showErrors?: boolean;
   cnpjBlocked?: boolean;
   onLogoSelected?: (file: File | null) => void;
 }

 export function CompanyStep1({ data, updateData, showErrors, cnpjBlocked, onLogoSelected }: EmpresaStep1Props) {
   const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    const parts = [
      digits.slice(0, 2),
      digits.slice(2, 5),
      digits.slice(5, 8),
      digits.slice(8, 12),
      digits.slice(12, 14),
    ];
    let formatted = parts[0] || "";
    if (digits.length > 2) formatted += "." + parts[1];
    if (digits.length > 5) formatted += "." + parts[2];
    if (digits.length > 8) formatted += "/" + parts[3];
    if (digits.length > 12) formatted += "-" + parts[4];
    return formatted;
  };

  const handleCnpjChange = (e: ChangeEvent<HTMLInputElement>) => {
    const masked = formatCNPJ(e.target.value);
    updateData({ cnpj: masked });
  };

  const requiredClass = (value?: string) => showErrors && !value ? "border-red-500 focus-visible:ring-red-500" : "";

  const cnpjClass = cnpjBlocked ? "border-red-600 focus-visible:ring-red-600" : requiredClass(data.cnpj);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuração da Empresa</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ *</Label>
            <Input
              id="cnpj"
              value={data.cnpj}
              onChange={handleCnpjChange}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              maxLength={18}
              required
              className={`mt-1 ${cnpjClass}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="razao_social">Razão Social *</Label>
            <Input
              id="razao_social"
              value={data.razao_social}
              onChange={(e) => updateData({ razao_social: e.target.value })}
              placeholder="Digite a razão social"
              required
              className={`mt-1 ${requiredClass(data.razao_social)}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo_empresa">Tipo de Empresa *</Label>
            <Select value={data.tipo_empresa} onValueChange={(value) => updateData({ tipo_empresa: value })}>
              <SelectTrigger className={`mt-1 ${requiredClass(data.tipo_empresa)}`}>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="matriz">Matriz</SelectItem>
                <SelectItem value="filial">Filial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tributacao">Tributação *</Label>
            <Select value={data.tributacao} onValueChange={(value) => updateData({ tributacao: value })}>
              <SelectTrigger className={`mt-1 ${requiredClass(data.tributacao)}`}>
                <SelectValue placeholder="Selecione a tributação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEI">MEI</SelectItem>
                <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                <SelectItem value="Simples Nacional - Excesso de sublimite">Simples Nacional - Excesso de sublimite de receita bruta</SelectItem>
                <SelectItem value="Regime Normal">Regime Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="inscricao_estadual">Inscrição Estadual (IE)</Label>
              <a
                href="http://www.sintegra.gov.br/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-purple-600 hover:text-purple-700"
              >
                Não sabe? busque aqui
              </a>
            </div>
            <Input
              id="inscricao_estadual"
              value={data.inscricao_estadual}
              onChange={(e) => updateData({ inscricao_estadual: e.target.value })}
              placeholder="000.000.000.000"
              className="mt-1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={data.email}
              onChange={(e) => updateData({ email: e.target.value })}
              placeholder="empresa@email.com"
              required
              className={`mt-1 ${requiredClass(data.email)}`}
            />
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-md font-medium text-gray-900 mb-4">Endereço da Empresa</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="cep">CEP *</Label>
            <Input
              id="cep"
              value={data.cep}
              onChange={(e) => updateData({ cep: e.target.value })}
              placeholder="00000-000"
              required
              className={`mt-1 ${requiredClass(data.cep)}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cidade">Cidade *</Label>
            <Input
              id="cidade"
              value={data.cidade}
              onChange={(e) => updateData({ cidade: e.target.value })}
              placeholder="Digite a cidade"
              required
              className={`mt-1 ${requiredClass(data.cidade)}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="estado">Estado *</Label>
            <Input
              id="estado"
              value={data.estado}
              onChange={(e) => updateData({ estado: e.target.value })}
              placeholder="Digite o estado"
              required
              className={`mt-1 ${requiredClass(data.estado)}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço *</Label>
            <Input
              id="endereco"
              value={data.endereco}
              onChange={(e) => updateData({ endereco: e.target.value })}
              placeholder="Rua, Avenida..."
              required
              className={`mt-1 ${requiredClass(data.endereco)}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="numero">Número *</Label>
            <Input
              id="numero"
              value={data.numero}
              onChange={(e) => updateData({ numero: e.target.value })}
              placeholder="123"
              required
              className={`mt-1 ${requiredClass(data.numero)}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bairro">Bairro *</Label>
            <Input
              id="bairro"
              value={data.bairro}
              onChange={(e) => updateData({ bairro: e.target.value })}
              placeholder="Digite o bairro"
              required
              className={`mt-1 ${requiredClass(data.bairro)}`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="complemento">Complemento</Label>
            <Input
              id="complemento"
              value={data.complemento || ""}
              onChange={(e) => updateData({ complemento: e.target.value })}
              placeholder="Apartamento, Bloco, Referência"
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-md font-medium text-gray-900 mb-4">Logo para DANFE</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="logo_file">Logo (PNG até 200x200)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="logo_file"
                type="file"
                accept="image/png,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (onLogoSelected) onLogoSelected(f);
                }}
                className="sr-only"
              />
              <label
                htmlFor="logo_file"
                className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 cursor-pointer select-none"
              >
                <MousePointerClick className="w-4 h-4" />
                <span>Escolher arquivo</span>
              </label>
            </div>
            {Boolean(data.logo_url) && (
              <div className="mt-2">
                <img
                  src={data.logo_url}
                  alt="Pré-visualização do logo"
                  className="border rounded-md"
                  style={{ width: 200, height: 200, objectFit: 'contain', backgroundColor: '#fff' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-novura-primary/10 border border-novura-primary/20 rounded-lg p-4">
        <p className="text-sm text-novura-primary">
          <strong>Atenção:</strong> Todos os campos marcados com (*) são obrigatórios para prosseguir.
        </p>
      </div>
    </div>
  );
 }
