import { useState, useEffect } from "react";
import { Plus, MoreHorizontal, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CleanNavigation } from "@/components/CleanNavigation";
import { AddTaxModal, TaxRecord, CompanyOption } from "@/components/settings/taxes/AddTaxModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

interface Company {
  id: string;
  razao_social: string;
  cnpj: string;
  tipo_empresa: string;
  tributacao: string;
  inscricao_estadual: string | null;
  email: string;
  created_at: string;
  imposto_pago?: number | null;
}

export function FiscalSettings() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState("empresas");
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [taxes, setTaxes] = useState<TaxRecord[]>([]);
  const [editingTax, setEditingTax] = useState<TaxRecord | null>(null);
  const { organizationId } = useAuth();
  const [editingImpostoCompanyId, setEditingImpostoCompanyId] = useState<string | null>(null);
  const [impostoPagoValue, setImpostoPagoValue] = useState<string>("0");

  const subNavItems = [
    { title: "Empresas", path: "empresas", description: "Gestão de empresas" },
    { title: "Classes de impostos", path: "impostos", description: "Regras, CFOP, CST e alíquotas" },
  ];

  useEffect(() => {
    loadCompanies();
    loadTaxes();
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

  const loadTaxes = async () => {
    try {
      if (!organizationId) return;
      const { data, error } = await (supabase as any)
        .from('company_tax_configs')
        .select('id, company_id, observacao, is_default, payload, created_at')
        .eq('organizations_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data as any[] : [];
      const mapCompany = (cid: string) => {
        const c = companies.find(c => c.id === cid);
        return { companyName: c?.razao_social || "—", cnpj: c?.cnpj || "" };
      };
      const mapped: TaxRecord[] = rows.map(r => {
        const cm = mapCompany(String(r.company_id));
        return {
          id: String(r.id),
          companyId: String(r.company_id),
          companyName: cm.companyName,
          cnpj: cm.cnpj,
          isDefault: !!r.is_default,
          observacao: r.observacao || "",
          payload: r.payload,
          createdAt: r.created_at,
        };
      });
      setTaxes(mapped);
    } catch (e: any) {
      console.error('Erro ao carregar impostos:', e);
      toast.error(e?.message || 'Erro ao carregar impostos');
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
    // Recarrega da base após salvar via modal
    void loadTaxes();
  };

  const handleDefinirPadrao = (tax: TaxRecord) => {
    const run = async () => {
      try {
        await (supabase as any)
          .from('company_tax_configs')
          .update({ is_default: false })
          .eq('company_id', tax.companyId);
        await (supabase as any)
          .from('company_tax_configs')
          .update({ is_default: true })
          .eq('id', tax.id);
        toast.success("Imposto definido como padrão");
        await loadTaxes();
      } catch (e: any) {
        toast.error(e?.message || "Falha ao definir padrão");
      }
    };
    void run();
  };

  const handleExcluirTax = (tax: TaxRecord) => {
    const run = async () => {
      try {
        await (supabase as any)
          .from('company_tax_configs')
          .delete()
          .eq('id', tax.id);
        toast.success("Imposto excluído");
        await loadTaxes();
      } catch (e: any) {
        toast.error(e?.message || "Falha ao excluir imposto");
      }
    };
    void run();
  };

  const handleEditarTax = (tax: TaxRecord) => {
    setEditingTax(tax);
    setIsTaxModalOpen(true);
  };

  const formatPercent = (v?: number | null) => {
    const n = typeof v === "number" ? v : 0;
    const s = Number.isFinite(n) ? n : 0;
    const rounded = Math.round(s * 100) / 100;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}%`;
  };

  const startEditImpostoPago = (company: Company) => {
    setEditingImpostoCompanyId(company.id);
    setImpostoPagoValue(String(company.imposto_pago ?? 0));
  };

  const cancelEditImpostoPago = () => {
    setEditingImpostoCompanyId(null);
    setImpostoPagoValue("0");
  };

  const saveImpostoPago = async (companyId: string) => {
    try {
      const num = parseFloat(String(impostoPagoValue).replace(",", "."));
      const value = isNaN(num) ? 0 : Math.max(0, Math.min(100, num));
      const { error } = await (supabase as any)
        .from('companies')
        .update({ imposto_pago: value })
        .eq('id', companyId);
      if (error) throw error;
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, imposto_pago: value } : c));
      toast.success("Imposto pago atualizado");
      cancelEditImpostoPago();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar imposto pago");
    }
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Imposto pago:</span>
                        <Badge variant="outline" className="text-xs">
                          {formatPercent(company.imposto_pago)}
                        </Badge>
                        <button
                          type="button"
                          className="inline-flex items-center"
                          onClick={() => startEditImpostoPago(company)}
                          aria-label="Editar imposto pago"
                          title="Editar imposto pago"
                        >
                          <Pencil className="w-4 h-4 text-novura-primary" />
                        </button>
                      </div>
                      {editingImpostoCompanyId === company.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            value={impostoPagoValue}
                            onChange={(e) => setImpostoPagoValue(e.target.value)}
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className="w-24"
                            placeholder="0"
                          />
                          <span className="text-sm text-gray-500">% </span>
                          <Button
                            size="sm"
                            className="bg-novura-primary hover:bg-novura-primary/90"
                            onClick={() => saveImpostoPago(company.id)}
                          >
                            Salvar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={cancelEditImpostoPago}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/configuracoes/notas-fiscais/nova-empresa?companyId=${company.id}&step=1`)}
                      >
                        Atualizar empresa
                      </Button>
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

          <AddTaxModal
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
