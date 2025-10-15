import { useState, useEffect } from "react";
import { Plus, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CleanNavigation } from "@/components/CleanNavigation";
import { AdicionarImpostoModal, TaxRecord, CompanyOption } from "@/components/configuracoes/impostos/AdicionarImpostoModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const [activeSubTab, setActiveSubTab] = useState("empresas");
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [taxes, setTaxes] = useState<TaxRecord[]>([]);
  const [editingTax, setEditingTax] = useState<TaxRecord | null>(null);

  const subNavItems = [
    { title: "Empresas", path: "empresas", description: "Cadastro e gestão de empresas emissoras" },
    { title: "Configurações de Impostos", path: "impostos", description: "Regras, CFOP, CST e alíquotas" },
  ];

  useEffect(() => {
    loadCompanies();
    // Carregar impostos salvos (persistência local por enquanto)
    try {
      const saved: TaxRecord[] = JSON.parse(localStorage.getItem("impostos") || "[]");
      setTaxes(Array.isArray(saved) ? saved : []);
    } catch {
      setTaxes([]);
    }
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

  const handleAddTax = () => {
    setEditingTax(null);
    setIsTaxModalOpen(true);
  };

  const handleSaveTax = (record: TaxRecord) => {
    setTaxes(prev => {
      let next = prev.filter(t => t.id !== record.id);
      // garantir exclusividade de padrão por empresa
      if (record.isDefault && record.companyId) {
        next = next.map(t => t.companyId === record.companyId ? { ...t, isDefault: false } : t);
      }
      next.push(record);
      // manter ordenação por data
      next.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
      return next;
    });
  };

  const handleDefinirPadrao = (tax: TaxRecord) => {
    setTaxes(prev => {
      const next = prev.map(t => t.companyId === tax.companyId ? { ...t, isDefault: t.id === tax.id } : t);
      localStorage.setItem("impostos", JSON.stringify(next));
      toast.success("Imposto definido como padrão");
      return next;
    });
  };

  const handleExcluirTax = (tax: TaxRecord) => {
    setTaxes(prev => {
      const next = prev.filter(t => t.id !== tax.id);
      localStorage.setItem("impostos", JSON.stringify(next));
      toast.success("Imposto excluído");
      return next;
    });
  };

  const handleEditarTax = (tax: TaxRecord) => {
    setEditingTax(tax);
    setIsTaxModalOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-4">
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
      {/* Sub navegação para Configurações Fiscais */}
      <CleanNavigation items={subNavItems} activePath={activeSubTab} onNavigate={setActiveSubTab} />

      {activeSubTab === "empresas" ? (
        <>
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
        </>
      ) : (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Configurações de Impostos</h3>
                <p className="text-sm text-gray-500">Gerencie regras fiscais por empresa</p>
              </div>
              <Button onClick={handleAddTax} className="bg-novura-primary hover:bg-novura-primary/90" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Imposto
              </Button>
            </div>

            {taxes.length === 0 ? (
              <div className="p-8 text-center border rounded-md">
                <p className="text-gray-600 mb-4">Nenhum imposto cadastrado ainda.</p>
                <Button onClick={handleAddTax} className="bg-novura-primary hover:bg-novura-primary/90">
                  <Plus className="w-4 h-4 mr-2" />Cadastrar Primeiro Imposto
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código do imposto</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxes.map((t) => (
                      <TableRow key={t.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{t.id}</span>
                            {t.isDefault && (
                              <Badge variant="secondary" className="text-xs">Padrão</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{t.companyName || "—"}</span>
                            <span className="text-xs text-gray-500">{t.cnpj || ""}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span>{t.observacao || "—"}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleDefinirPadrao(t)}>Definir como padrão</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditarTax(t)}>Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleExcluirTax(t)}>Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <AdicionarImpostoModal
            open={isTaxModalOpen}
            onOpenChange={(open) => {
              setIsTaxModalOpen(open);
              if (!open) setEditingTax(null);
            }}
            companies={companies as unknown as CompanyOption[]}
            initialData={editingTax}
            onSave={(rec) => {
              handleSaveTax(rec);
              // garantir persistência local
              try {
                const arr: TaxRecord[] = JSON.parse(localStorage.getItem("impostos") || "[]");
                const merged = [...arr.filter(a => a.id !== rec.id), rec];
                localStorage.setItem("impostos", JSON.stringify(merged));
              } catch {}
            }}
          />
        </div>
      )}
    </div>
  );
}