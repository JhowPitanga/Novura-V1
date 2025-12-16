
import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Download, Eye, Plus, Search, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CleanNavigation } from "@/components/CleanNavigation";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

function extractXmlMeta(xml: string): { nfeNumber?: string; nfeKey?: string } {
  let nfeNumber: string | undefined = undefined;
  let nfeKey: string | undefined = undefined;
  try {
    const m = xml.match(/<nNF>(\d+)<\/nNF>/);
    if (m && m[1]) nfeNumber = m[1];
  } catch {}
  try {
    const m2 = xml.match(/Id="NFe(\d{44})"/);
    if (m2 && m2[1]) nfeKey = m2[1];
  } catch {}
  if (!nfeKey) {
    try {
      const m3 = xml.match(/<chNFe>(\d{44})<\/chNFe>/);
      if (m3 && m3[1]) nfeKey = m3[1];
    } catch {}
  }
  return { nfeNumber, nfeKey };
}

function extractXmlTotal(xml: string): number | undefined {
  try {
    const m = xml.match(/<vNF>([\d.,]+)<\/vNF>/);
    if (m && m[1]) {
      const raw = m[1].replace(/\./g, "").replace(",", ".");
      const num = parseFloat(raw);
      return isNaN(num) ? undefined : num;
    }
  } catch {}
  return undefined;
}

function normalizeTipo(tipoRaw: string): string {
  const t = String(tipoRaw || "").trim().toLowerCase();
  if (t === "saida" || t === "saída") return "Saída";
  if (t === "entrada") return "Entrada";
  if (t === "compra") return "Compra";
  return tipoRaw || "-";
}

function padLeftNum(value: string | number, size: number): string {
  const s = String(value ?? "").replace(/\D/g, "");
  if (!s) return "".padStart(size, "0");
  return s.padStart(size, "0");
}

function normalizeFocusUrl(path: string | null | undefined): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  try {
    const base = new URL("https://api.focusnfe.com.br/");
    return new URL(p, base).toString();
  } catch {
    return p;
  }
}

export default function NotasFiscais() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTipo, setSelectedTipo] = useState("todos");
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const [notasDb, setNotasDb] = useState<any[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [errorDb, setErrorDb] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotasFiscais = async () => {
      setLoadingDb(true);
      setErrorDb(null);
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .order("authorized_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) {
        setErrorDb(error.message);
        setNotasDb([]);
      } else {
        setNotasDb(Array.isArray(data) ? data : []);
      }
      setLoadingDb(false);
    };
    fetchNotasFiscais();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Autorizada":
        return <Badge variant="default">Autorizada</Badge>;
      case "Pendente":
        return <Badge className="bg-yellow-500">Pendente</Badge>;
      case "Cancelada":
        return <Badge variant="destructive">Cancelada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case "Entrada":
        return <Badge className="bg-blue-500">Entrada</Badge>;
      case "Saída":
        return <Badge className="bg-green-500">Saída</Badge>;
      case "Compra":
        return <Badge className="bg-purple-500">Compra</Badge>;
      default:
        return <Badge variant="secondary">{tipo}</Badge>;
    }
  };

  const getEnvioBadge = (status?: string) => {
    const s = String(status || "").toLowerCase();
    if (s === "sent") return <Badge className="bg-green-500 text-white">Enviado</Badge>;
    if (s === "error") return <Badge variant="destructive">Erro</Badge>;
    return <Badge variant="outline">Pendente</Badge>;
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          
          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Controle de Notas Fiscais</h1>
                <p className="text-gray-600">Gerencie todas as suas notas fiscais de entrada, saída e compras</p>
              </div>
            </div>

            <CleanNavigation
              items={[
                { title: "Todas", path: "/todas", description: "Todas as notas" },
                { title: "Saída", path: "/saidas", description: "Notas de saída" },
                { title: "Entrada", path: "/entrada", description: "Notas de entrada" },
              ]}
              basePath="/notas-fiscais"
            />

            <div className="mt-0">
              <Routes>
                <Route
                  path="todas"
                  element={<NotasTodas getStatusBadge={getStatusBadge} getTipoBadge={getTipoBadge} getEnvioBadge={getEnvioBadge} notas={notasDb} loading={loadingDb} error={errorDb} />}
                />
                <Route
                  path="saidas"
                  element={<NotasSaida getStatusBadge={getStatusBadge} getTipoBadge={getTipoBadge} notas={notasDb} loading={loadingDb} error={errorDb} />}
                />
                <Route
                  path="entrada"
                  element={<NotasEntrada getStatusBadge={getStatusBadge} getTipoBadge={getTipoBadge} notas={notasDb} loading={loadingDb} error={errorDb} />}
                />
                <Route index element={<Navigate to="todas" replace />} />
              </Routes>
            </div>

          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function NotasTodas({
  getStatusBadge,
  getTipoBadge,
  getEnvioBadge,
  notas,
  loading,
  error,
}: {
  getStatusBadge: (s: string) => JSX.Element;
  getTipoBadge: (t: string) => JSX.Element;
  getEnvioBadge: (s?: string) => JSX.Element;
  notas: any[];
  loading: boolean;
  error: string | null;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const filtered = (Array.isArray(notas) ? notas : []).filter((n) => {
    const numero = String(n?.nfe_number || "");
    const chave = String(n?.nfe_key || "");
    const marketplace = String(n?.marketplace || "");
    const tipoLabel = normalizeTipo(String(n?.tipo || ""));
    const term = searchTerm.trim().toLowerCase();
    const matchText = `${numero} ${chave} ${marketplace} ${tipoLabel}`.toLowerCase().includes(term);
    const sf = String(n?.status_focus || "").toLowerCase();
    const statusLabel = sf === "autorizado" ? "Autorizada" : sf === "cancelada" ? "Cancelada" : sf === "pendente" ? "Pendente" : sf;
    const matchStatus =
      selectedStatus === "todos" ||
      (selectedStatus === "autorizada" && statusLabel === "Autorizada") ||
      (selectedStatus === "pendente" && statusLabel === "Pendente") ||
      (selectedStatus === "cancelada" && statusLabel === "Cancelada");
    return matchText && matchStatus;
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por número, tipo ou marketplace"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="autorizada">Autorizada</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead>Série/Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Autorizada em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="py-6 text-center text-gray-600">Carregando notas fiscais...</div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="py-6 text-center text-red-600">{error}</div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && filtered.map((nota: any) => {
                const numero = String(nota?.nfe_number || "");
                const tipo = String(nota?.tipo || "");
                const marketplace = String(nota?.marketplace || "");
                const authorizedAt = nota?.authorized_at ? new Date(String(nota?.authorized_at)).toLocaleString("pt-BR") : "-";
                const sf = String(nota?.status_focus || "").toLowerCase();
                const statusLabel = sf === "autorizado" ? "Autorizada" : sf === "cancelada" ? "Cancelada" : sf === "pendente" ? "Pendente" : sf || "";
                const serie = String(nota?.serie || "");
                let valor: number | undefined = typeof nota?.total_value === "number" ? nota.total_value : undefined;
                if (valor == null) {
                  try {
                    const xmlText = nota?.xml_base64 ? atob(String(nota.xml_base64)) : "";
                    const v = xmlText ? extractXmlTotal(xmlText) : undefined;
                    valor = v;
                  } catch {}
                }
                const serieFmt = padLeftNum(serie, 3);
                const numeroFmt = padLeftNum(numero, 9);
                const tipoLabel = normalizeTipo(tipo);
                return (
                  <TableRow key={nota.id} className="hover:bg-gray-50/50">
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{serieFmt}</p>
                        <p className="text-xs text-gray-600">{numeroFmt}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getTipoBadge(tipoLabel)}
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-900">{marketplace || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {valor != null ? `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-600">{authorizedAt}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(statusLabel || "")}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = String(nota?.pdf_url || "");
                              if (url) {
                                window.open(url, "_blank", "noopener,noreferrer");
                                return;
                              }
                              try {
                                const pdfB64 = String(nota?.pdf_base64 || "");
                                if (!pdfB64) return;
                                const pdfBytes = Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0));
                                const blob = new Blob([pdfBytes], { type: "application/pdf" });
                                const objUrl = URL.createObjectURL(blob);
                                window.open(objUrl, "_blank", "noopener,noreferrer");
                              } catch {}
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              try {
                                const xmlB64 = String(nota?.xml_base64 || "");
                                const linksMeta: any = (nota as any)?.marketplace_submission_response || null;
                                const directUrl = normalizeFocusUrl(String(nota?.xml_url || (linksMeta?.links?.caminho_xml ?? linksMeta?.caminho_xml) || ""));
                                const nfeNumRaw = String(nota?.nfe_number || "").trim();
                                const nfeKeyRaw = String(nota?.nfe_key || "").trim();
                                let base = nfeNumRaw ? `nfe_${nfeNumRaw}` : (nfeKeyRaw ? `nfe_${nfeKeyRaw}` : "nfe");
                                if (xmlB64) {
                                  const xmlText = atob(xmlB64);
                                  if (base === "nfe") {
                                    const meta = extractXmlMeta(xmlText);
                                    const nfeNum = String(meta.nfeNumber || "").trim();
                                    const nfeKey = String(meta.nfeKey || "").trim();
                                    base = nfeNum ? `nfe_${nfeNum}` : (nfeKey ? `nfe_${nfeKey}` : "nfe");
                                  }
                                  const blob = new Blob([xmlText], { type: "application/xml" });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `${base}.xml`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                  return;
                                }
                                if (directUrl) {
                                  const payload = { xml_url: directUrl, filename: `${base}.xml`, company_id: (nota as any)?.company_id, emissao_ambiente: (nota as any)?.emissao_ambiente };
                                  ;(async () => {
                                    const { data: { session } } = await (supabase as any).auth.getSession();
                                    const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
                                    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
                                    try {
                                      const res = await supabase.functions.invoke("download-nfe-xml", { body: payload, headers });
                                      const b64 = String((res.data as any)?.content_base64 || "");
                                      if (b64) {
                                        const xmlText = atob(b64);
                                        const blob = new Blob([xmlText], { type: "application/xml" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `${base}.xml`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        return;
                                      }
                                      throw new Error("no_b64");
                                    } catch {
                                      try {
                                        const urlFn = `${SUPABASE_URL}/functions/v1/download-nfe-xml`;
                                        let resp = await fetch(urlFn, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                                          body: JSON.stringify(payload),
                                        });
                                        if (!resp.ok) {
                                          resp = await fetch(urlFn, {
                                            method: "POST",
                                            headers: { "Content-Type": "text/plain" },
                                            body: JSON.stringify(payload),
                                          });
                                        }
                                        const data = await resp.json().catch(() => ({}));
                                        const b64 = String((data as any)?.content_base64 || "");
                                        if (!b64) return;
                                        const xmlText = atob(b64);
                                        const blob = new Blob([xmlText], { type: "application/xml" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `${base}.xml`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } catch {}
                                    }
                                  })();
                                }
                              } catch {}
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download XML
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NotasSaida({
  getStatusBadge,
  getTipoBadge,
  notas,
  loading,
  error,
}: {
  getStatusBadge: (s: string) => JSX.Element;
  getTipoBadge: (t: string) => JSX.Element;
  notas: any[];
  loading: boolean;
  error: string | null;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const filtered = (Array.isArray(notas) ? notas : [])
    .filter((n) => String(n?.tipo || "").toLowerCase() === "saída" || String(n?.tipo || "").toLowerCase() === "saida")
    .filter((n) => {
      const numero = String(n?.nfe_number || "");
      const marketplace = String(n?.marketplace || "");
      const tipoLabel = normalizeTipo(String(n?.tipo || ""));
      const term = searchTerm.trim().toLowerCase();
      const matchText = `${numero} ${marketplace} ${tipoLabel}`.toLowerCase().includes(term);
      const sf = String(n?.status_focus || "").toLowerCase();
      const statusLabel = sf === "autorizado" ? "Autorizada" : sf === "cancelada" ? "Cancelada" : sf === "pendente" ? "Pendente" : sf || "";
      const matchStatus =
        selectedStatus === "todos" ||
        (selectedStatus === "autorizada" && statusLabel === "Autorizada") ||
        (selectedStatus === "pendente" && statusLabel === "Pendente") ||
        (selectedStatus === "cancelada" && statusLabel === "Cancelada");
      return matchText && matchStatus;
    });
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por número ou marketplace"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="autorizada">Autorizada</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead>Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Autorizada em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="py-6 text-center text-gray-600">Carregando notas fiscais...</div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="py-6 text-center text-red-600">{error}</div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && filtered.map((nota: any) => {
                const numero = String(nota?.nfe_number || "");
                const tipo = String(nota?.tipo || "");
                const marketplace = String(nota?.marketplace || "");
                const authorizedAt = nota?.authorized_at ? new Date(String(nota?.authorized_at)).toLocaleString("pt-BR") : "-";
                const sf = String(nota?.status_focus || "").toLowerCase();
                const statusLabel = sf === "autorizado" ? "Autorizada" : sf === "cancelada" ? "Cancelada" : sf === "pendente" ? "Pendente" : sf || "";
                const serie = String(nota?.serie || "");
                let valor: number | undefined = typeof nota?.total_value === "number" ? nota.total_value : undefined;
                if (valor == null) {
                  try {
                    const xmlText = nota?.xml_base64 ? atob(String(nota.xml_base64)) : "";
                    const v = xmlText ? extractXmlTotal(xmlText) : undefined;
                    valor = v;
                  } catch {}
                }
                const serieFmt = padLeftNum(serie, 3);
                const numeroFmt = padLeftNum(numero, 9);
                const tipoLabel = normalizeTipo(tipo);
                return (
                  <TableRow key={nota.id} className="hover:bg-gray-50/50">
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{serieFmt}</p>
                        <p className="text-xs text-gray-600">{numeroFmt}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getTipoBadge(tipoLabel)}</TableCell>
                    <TableCell>
                      <span className="text-gray-900">{marketplace || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {valor != null ? `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-600">{authorizedAt}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(statusLabel || "")}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = String(nota?.pdf_url || "");
                              if (url) {
                                window.open(url, "_blank", "noopener,noreferrer");
                                return;
                              }
                              try {
                                const pdfB64 = String(nota?.pdf_base64 || "");
                                if (!pdfB64) return;
                                const pdfBytes = Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0));
                                const blob = new Blob([pdfBytes], { type: "application/pdf" });
                                const objUrl = URL.createObjectURL(blob);
                                window.open(objUrl, "_blank", "noopener,noreferrer");
                              } catch {}
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              try {
                                const xmlB64 = String(nota?.xml_base64 || "");
                                const linksMeta: any = (nota as any)?.marketplace_submission_response || null;
                                const directUrl = normalizeFocusUrl(String(nota?.xml_url || (linksMeta?.links?.caminho_xml ?? linksMeta?.caminho_xml) || ""));
                                const nfeNumRaw = String(nota?.nfe_number || "").trim();
                                const nfeKeyRaw = String(nota?.nfe_key || "").trim();
                                let base = nfeNumRaw ? `nfe_${nfeNumRaw}` : (nfeKeyRaw ? `nfe_${nfeKeyRaw}` : "nfe");
                                if (xmlB64) {
                                  const xmlText = atob(xmlB64);
                                  if (base === "nfe") {
                                    const meta = extractXmlMeta(xmlText);
                                    const nfeNum = String(meta.nfeNumber || "").trim();
                                    const nfeKey = String(meta.nfeKey || "").trim();
                                    base = nfeNum ? `nfe_${nfeNum}` : (nfeKey ? `nfe_${nfeKey}` : "nfe");
                                  }
                                  const blob = new Blob([xmlText], { type: "application/xml" });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `${base}.xml`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                  return;
                                }
                                if (directUrl) {
                                  const payload = { xml_url: directUrl, filename: `${base}.xml`, company_id: (nota as any)?.company_id, emissao_ambiente: (nota as any)?.emissao_ambiente };
                                  ;(async () => {
                                    const { data: { session } } = await (supabase as any).auth.getSession();
                                    const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
                                    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
                                    try {
                                      const res = await supabase.functions.invoke("download-nfe-xml", { body: payload, headers });
                                      const b64 = String((res.data as any)?.content_base64 || "");
                                      if (b64) {
                                        const xmlText = atob(b64);
                                        const blob = new Blob([xmlText], { type: "application/xml" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `${base}.xml`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        return;
                                      }
                                      throw new Error("no_b64");
                                    } catch {
                                      try {
                                        const urlFn = `${SUPABASE_URL}/functions/v1/download-nfe-xml`;
                                        let resp = await fetch(urlFn, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                                          body: JSON.stringify(payload),
                                        });
                                        if (!resp.ok) {
                                          resp = await fetch(urlFn, {
                                            method: "POST",
                                            headers: { "Content-Type": "text/plain" },
                                            body: JSON.stringify(payload),
                                          });
                                        }
                                        const data = await resp.json().catch(() => ({}));
                                        const b64 = String((data as any)?.content_base64 || "");
                                        if (!b64) return;
                                        const xmlText = atob(b64);
                                        const blob = new Blob([xmlText], { type: "application/xml" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `${base}.xml`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } catch {}
                                    }
                                  })();
                                }
                              } catch {}
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download XML
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NotasEntrada({
  getStatusBadge,
  getTipoBadge,
  notas,
  loading,
  error,
}: {
  getStatusBadge: (s: string) => JSX.Element;
  getTipoBadge: (t: string) => JSX.Element;
  notas: any[];
  loading: boolean;
  error: string | null;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const filtered = (Array.isArray(notas) ? notas : [])
    .filter((n) => String(n?.tipo || "").toLowerCase() === "entrada")
    .filter((n) => {
      const numero = String(n?.nfe_number || "");
      const marketplace = String(n?.marketplace || "");
      const tipoLabel = normalizeTipo(String(n?.tipo || ""));
      const term = searchTerm.trim().toLowerCase();
      const matchText = `${numero} ${marketplace} ${tipoLabel}`.toLowerCase().includes(term);
      const sf = String(n?.status_focus || "").toLowerCase();
      const statusLabel = sf === "autorizado" ? "Autorizada" : sf === "cancelada" ? "Cancelada" : sf === "pendente" ? "Pendente" : sf || "";
      const matchStatus =
        selectedStatus === "todos" ||
        (selectedStatus === "autorizada" && statusLabel === "Autorizada") ||
        (selectedStatus === "pendente" && statusLabel === "Pendente") ||
        (selectedStatus === "cancelada" && statusLabel === "Cancelada");
      return matchText && matchStatus;
    });
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por número ou marketplace"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="autorizada">Autorizada</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Button className="bg-novura-primary hover:bg-novura-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Nova Nota Fiscal
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead>Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Autorizada em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="py-6 text-center text-gray-600">Carregando notas fiscais...</div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="py-6 text-center text-red-600">{error}</div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && filtered.map((nota: any) => {
                const numero = String(nota?.nfe_number || "");
                const tipo = String(nota?.tipo || "");
                const marketplace = String(nota?.marketplace || "");
                const authorizedAt = nota?.authorized_at ? new Date(String(nota?.authorized_at)).toLocaleString("pt-BR") : "-";
                const sf = String(nota?.status_focus || "").toLowerCase();
                const statusLabel = sf === "autorizado" ? "Autorizada" : sf === "cancelada" ? "Cancelada" : sf === "pendente" ? "Pendente" : sf || "";
                const serie = String(nota?.serie || "");
                let valor: number | undefined = typeof nota?.total_value === "number" ? nota.total_value : undefined;
                if (valor == null) {
                  try {
                    const xmlText = nota?.xml_base64 ? atob(String(nota.xml_base64)) : "";
                    const v = xmlText ? extractXmlTotal(xmlText) : undefined;
                    valor = v;
                  } catch {}
                }
                const serieFmt = padLeftNum(serie, 3);
                const numeroFmt = padLeftNum(numero, 9);
                const tipoLabel = normalizeTipo(tipo);
                return (
                  <TableRow key={nota.id} className="hover:bg-gray-50/50">
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{serieFmt}</p>
                        <p className="text-xs text-gray-600">{numeroFmt}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getTipoBadge(tipoLabel)}</TableCell>
                    <TableCell>
                      <span className="text-gray-900">{marketplace || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {valor != null ? `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-600">{authorizedAt}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(statusLabel || "")}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = String(nota?.pdf_url || "");
                              if (url) {
                                window.open(url, "_blank", "noopener,noreferrer");
                                return;
                              }
                              try {
                                const pdfB64 = String(nota?.pdf_base64 || "");
                                if (!pdfB64) return;
                                const pdfBytes = Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0));
                                const blob = new Blob([pdfBytes], { type: "application/pdf" });
                                const objUrl = URL.createObjectURL(blob);
                                window.open(objUrl, "_blank", "noopener,noreferrer");
                              } catch {}
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              try {
                                const xmlB64 = String(nota?.xml_base64 || "");
                                const linksMeta: any = (nota as any)?.marketplace_submission_response || null;
                                const directUrl = normalizeFocusUrl(String(nota?.xml_url || (linksMeta?.links?.caminho_xml ?? linksMeta?.caminho_xml) || ""));
                                const nfeNumRaw = String(nota?.nfe_number || "").trim();
                                const nfeKeyRaw = String(nota?.nfe_key || "").trim();
                                let base = nfeNumRaw ? `nfe_${nfeNumRaw}` : (nfeKeyRaw ? `nfe_${nfeKeyRaw}` : "nfe");
                                if (xmlB64) {
                                  const xmlText = atob(xmlB64);
                                  if (base === "nfe") {
                                    const meta = extractXmlMeta(xmlText);
                                    const nfeNum = String(meta.nfeNumber || "").trim();
                                    const nfeKey = String(meta.nfeKey || "").trim();
                                    base = nfeNum ? `nfe_${nfeNum}` : (nfeKey ? `nfe_${nfeKey}` : "nfe");
                                  }
                                  const blob = new Blob([xmlText], { type: "application/xml" });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `${base}.xml`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                  return;
                                }
                                if (directUrl) {
                                  const payload = { xml_url: directUrl, filename: `${base}.xml`, company_id: (nota as any)?.company_id, emissao_ambiente: (nota as any)?.emissao_ambiente };
                                  ;(async () => {
                                    const { data: { session } } = await (supabase as any).auth.getSession();
                                    const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
                                    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
                                    try {
                                      const res = await supabase.functions.invoke("download-nfe-xml", { body: payload, headers });
                                      const b64 = String((res.data as any)?.content_base64 || "");
                                      if (b64) {
                                        const xmlText = atob(b64);
                                        const blob = new Blob([xmlText], { type: "application/xml" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `${base}.xml`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        return;
                                      }
                                      throw new Error("no_b64");
                                    } catch {
                                      try {
                                        const urlFn = `${SUPABASE_URL}/functions/v1/download-nfe-xml`;
                                        let resp = await fetch(urlFn, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                                          body: JSON.stringify(payload),
                                        });
                                        if (!resp.ok) {
                                          resp = await fetch(urlFn, {
                                            method: "POST",
                                            headers: { "Content-Type": "text/plain" },
                                            body: JSON.stringify(payload),
                                          });
                                        }
                                        const data = await resp.json().catch(() => ({}));
                                        const b64 = String((data as any)?.content_base64 || "");
                                        if (!b64) return;
                                        const xmlText = atob(b64);
                                        const blob = new Blob([xmlText], { type: "application/xml" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `${base}.xml`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } catch {}
                                    }
                                  })();
                                }
                              } catch {}
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download XML
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
