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
}

interface EmpresaStep1Props {
  data: EmpresaData;
  updateData: (data: Partial<EmpresaData>) => void;
}

export function EmpresaStep1({ data, updateData }: EmpresaStep1Props) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuração da Empresa</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="razao_social">Razão Social *</Label>
            <Input
              id="razao_social"
              value={data.razao_social}
              onChange={(e) => updateData({ razao_social: e.target.value })}
              placeholder="Digite a razão social"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ *</Label>
            <Input
              id="cnpj"
              value={data.cnpj}
              onChange={(e) => updateData({ cnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo_empresa">Tipo de Empresa *</Label>
            <Select value={data.tipo_empresa} onValueChange={(value) => updateData({ tipo_empresa: value })}>
              <SelectTrigger>
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
              <SelectTrigger>
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
            <Label htmlFor="inscricao_estadual">Inscrição Estadual (IE)</Label>
            <Input
              id="inscricao_estadual"
              value={data.inscricao_estadual}
              onChange={(e) => updateData({ inscricao_estadual: e.target.value })}
              placeholder="000.000.000.000"
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
            />
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Atenção:</strong> Todos os campos marcados com (*) são obrigatórios para prosseguir.
        </p>
      </div>
    </div>
  );
}