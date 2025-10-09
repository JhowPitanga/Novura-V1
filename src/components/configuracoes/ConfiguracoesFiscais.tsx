import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Company {
  id: string;
  razao_social: string;
  cnpj: string;
  tipo_empresa: string;
  tributacao: string;
  inscricao_estadual: string | null;
  email: string;
  created_at: string;
}

export function ConfiguracoesFiscais() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompany = () => {
    navigate('/configuracoes/notas-fiscais/nova-empresa');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Notas Fiscais</h2>
            <p className="text-gray-600 mt-1">Configurações sobre emissão de notas fiscais</p>
          </div>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notas Fiscais</h2>
          <p className="text-gray-600 mt-1">Configurações sobre emissão de notas fiscais</p>
        </div>
        <Button 
          onClick={handleAddCompany}
          className="bg-novura-primary hover:bg-novura-primary/90"
          size="lg"
        >
          <Plus className="w-5 h-5 mr-2" />
          Adicionar Empresa
        </Button>
      </div>

      {companies.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="max-w-sm mx-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhuma empresa cadastrada
            </h3>
            <p className="text-gray-600 mb-4">
              Adicione uma empresa para começar a emitir notas fiscais
            </p>
            <Button 
              onClick={handleAddCompany}
              className="bg-novura-primary hover:bg-novura-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Primeira Empresa
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {companies.map((company) => (
            <Card key={company.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {company.razao_social}
                    </h3>
                    <Badge variant="secondary" className="text-xs">
                      {company.tipo_empresa}
                    </Badge>
                  </div>
                  <p className="text-gray-600">CNPJ: {company.cnpj}</p>
                  <p className="text-gray-600">Email: {company.email}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Tributação:</span>
                    <Badge variant="outline" className="text-xs">
                      {company.tributacao}
                    </Badge>
                  </div>
                  {company.inscricao_estadual && (
                    <p className="text-sm text-gray-500">
                      IE: {company.inscricao_estadual}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">
                    Criado em {new Date(company.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}