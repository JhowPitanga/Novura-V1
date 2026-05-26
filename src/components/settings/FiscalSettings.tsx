import { useState, useEffect } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  is_default: boolean;
  focus_status: "pending" | "synced" | "error";
  focus_company_id: string | null;
}

function FocusStatusBadge({ status }: { status: Company["focus_status"] }) {
  if (status === "synced") return (
    <Badge variant="secondary" className="gap-1 text-xs text-green-700 bg-green-50 border-green-200">
      <CheckCircle2 className="w-3 h-3" /> Focus sincronizado
    </Badge>
  );
  if (status === "error") return (
    <Badge variant="destructive" className="gap-1 text-xs">
      <AlertCircle className="w-3 h-3" /> Erro Focus
    </Badge>
  );
  return null;
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
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const subNavItems = [
    { title: "Empresas", path: "empresas", description: "Gestão de empresas" },
    { title: "Classes de impostos", path: "impostos", description: "Regras, CFOP, CST e alíquotas" },
  ];

  useEffect(() => {
    loadCompanies();
    loadTaxes();
  }, [organizationId]);

  const loadCompanies = async () => {
    try {
      let query = (supabase as any)
        .from('companies')
        .select('*')
        .eq('is_active', true);
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setCompanies((data || []) as Company[]);
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

      const companyIds = Array.from(new Set(rows.map((r) => String(r.company_id)).filter(Boolean)));
      let companyMap = new Map<string, { razao_social: string; cnpj: string }>();
      if (companyIds.length > 0) {
        const { data: compRows } = await (supabase as any)
          .from('companies')
          .select('id, razao_social, cnpj')
          .in('id', companyIds);
        const arr: Array<{ id: string; razao_social: string; cnpj: string }> = Array.isArray(compRows) ? compRows : [];
        companyMap = new Map(arr.map((c) => [String(c.id), { razao_social: c.razao_social, cnpj: c.cnpj }]));
      }

      const mapped: TaxRecord[] = rows.map(r => {
        const cm = companyMap.get(String(r.company_id));
        return {
          id: String(r.id),
          companyId: String(r.company_id),
          companyName: cm?.razao_social || "—",
          cnpj: cm?.cnpj || "",
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
    navigate('/configuracoes/empresa');
  };

  const handleAddTax = () => {
    setEditingTax(null);
    setIsTaxModalOpen(true);
  };

  const handleSaveTax = (_record: TaxRecord) => {
    void loadTaxes();
  };

  const handleDefinirPadraoTax = (tax: TaxRecord) => {
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

  // Soft-deletes a company via the company-delete edge function (validates all business rules)
  const handleDesativarEmpresa = async (companyId: string) => {
    setDeactivatingId(companyId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const { data, error } = await supabase.functions.invoke("company-delete", {
        body: { company_id: companyId },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (error) throw error;
      if ((data as any)?.blocked) {
        toast.error((data as any).reason || "Exclusão bloqueada por regras de negócio");
        return;
      }
      setCompanies(prev => prev.filter(c => c.id !== companyId));
      toast.success("Empresa desativada com sucesso");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao desativar empresa");
    } finally {
      setDeactivatingId(null);
      setConfirmDeactivateId(null);
    }
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

  const confirmDeactivateCompany = companies.find(c => c.id === confirmDeactivateId);

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
          {/* Header with Add button */}
          {companies.length > 0 && (
            <div className="flex justify-end">
              <Button
                onClick={handleAddCompany}
                className="bg-novura-primary hover:bg-novura-primary/90"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Empresa
              </Button>
            </div>
          )}

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
                  <div className="flex justify-between items-start gap-4">
                    {/* Left: company data */}
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {company.razao_social}
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          {company.tipo_empresa}
                        </Badge>
                        <FocusStatusBadge status={company.focus_status ?? "pending"} />
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
                          <span className="text-sm text-gray-500">%</span>
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

                    {/* Right: actions */}
                    <div className="flex flex-col gap-2 items-end shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/configuracoes/empresa?companyId=${company.id}`)}
                      >
                        Atualizar empresa
                      </Button>

                      {companies.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={!!deactivatingId}
                          onClick={() => setConfirmDeactivateId(company.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Desativar
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Confirm deactivation dialog */}
          <AlertDialog
            open={!!confirmDeactivateId}
            onOpenChange={(open) => !open && setConfirmDeactivateId(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desativar empresa?</AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmDeactivateCompany
                    ? `A empresa "${confirmDeactivateCompany.razao_social}" será desativada. Esta ação pode ser bloqueada se existirem pedidos, integrações ou notas fiscais pendentes.`
                    : "A empresa será desativada."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => confirmDeactivateId && handleDesativarEmpresa(confirmDeactivateId)}
                  disabled={!!deactivatingId}
                >
                  {deactivatingId ? "Desativando..." : "Desativar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                              <DropdownMenuItem onClick={() => handleDefinirPadraoTax(t)}>Definir como padrão</DropdownMenuItem>
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
