import { useEffect, useMemo, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { getSalesByState } from "@/hooks/useSalesByState";
import { getOrdersMetrics } from "@/hooks/useOrdersMetrics";
import { getListingsRanking, type ListingRankingItem } from "@/hooks/useListingsRanking";
import { LineChart, Line, XAxis, YAxis, PieChart, Pie, Cell, ResponsiveContainer, CartesianGrid } from "recharts";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { TrendingUp, DollarSign, Package, MapPin, Award, Calendar as CalendarIcon, Filter } from "lucide-react";
import { Routes, Route } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const navigationItems = [
  { title: "Visão Geral", path: "", description: "Métricas principais" },
  { title: "Por Produto", path: "/produtos", description: "Desempenho individual" },
];

// Dados mock removidos: gráficos, totais e ranking serão calculados por hooks

function VisaoGeral() {
  // Período padrão: últimos 7 dias
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 6);
  const defaultRange: DateRange = { from: defaultFrom, to: now };

  // Range aplicado (usado nas consultas) e range temporário (UI do popover)
  const [appliedDateRange, setAppliedDateRange] = useState<DateRange | undefined>(defaultRange);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["vendas"]);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(defaultRange);
  const [activeQuick, setActiveQuick] = useState<"hoje" | "7dias" | "30dias" | null>("7dias");
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("todos");
  const [mapZoom, setMapZoom] = useState(1);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-50, -15]);
  const [hoverInfo, setHoverInfo] = useState<{ name: string; total: number } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Métricas reais
  const [totals, setTotals] = useState({ vendas: 0, unidades: 0, pedidos: 0, ticketMedio: 0 });
  const [series, setSeries] = useState<any[]>([]);
  const [marketplaceBreakdown, setMarketplaceBreakdown] = useState<{ marketplace: string; total: number }[]>([]);
  const [topListings, setTopListings] = useState<ListingRankingItem[]>([]);
  const [loadingTop, setLoadingTop] = useState<boolean>(false);

  const { organizationId } = useAuth();
  const [connectedMarketplaces, setConnectedMarketplaces] = useState<Array<{ display: string; slug: string }>>([]);

  // Map raw names or slugs to a consistent display name used in the DB
  const toDisplayMarketplaceName = (name: string): string => {
    if (!name) return name;
    const n = name.toLowerCase();
    if (n === 'mercado_livre' || n === 'mercadolivre' || n === 'mercado livre') return 'Mercado Livre';
    if (n === 'amazon') return 'Amazon';
    if (n === 'shopee') return 'Shopee';
    if (n === 'magalu' || n === 'magazineluiza' || n === 'magazine luiza' || n === 'magazine_luiza') return 'Magazine Luiza';
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const slugify = (display: string): string => {
    return display
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!organizationId) return;
      try {
        const { data, error } = await (supabase as any)
          .from('marketplace_integrations')
          .select('marketplace_name')
          .eq('organizations_id', organizationId);
        if (error) throw error;
        const names = (data || []).map((r: any) => toDisplayMarketplaceName(String(r?.marketplace_name || ''))).filter(Boolean);
        const uniq = Array.from(new Set(names));
        const list = uniq.map((dn) => ({ display: dn, slug: slugify(dn) }));
        if (!mounted) return;
        setConnectedMarketplaces(list);
      } catch (_) {
        if (!mounted) return;
        setConnectedMarketplaces([]);
      }
    };
    load();
    return () => { mounted = false; };
  }, [organizationId]);

  // Compute the actual display name to query on orders table
  const selectedMarketplaceDisplay = useMemo(() => {
    if (!selectedMarketplace || selectedMarketplace === 'todos') return 'todos';
    return toDisplayMarketplaceName(selectedMarketplace);
  }, [selectedMarketplace]);

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setAppliedDateRange(range);
  };

  const applyQuickRange = (key: "hoje" | "7dias" | "30dias") => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    if (key === "hoje") {
      setTempDateRange({ from: startOfToday, to: endOfToday });
    } else if (key === "7dias") {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      setTempDateRange({ from, to: endOfToday });
    } else {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      setTempDateRange({ from, to: endOfToday });
    }
    setActiveQuick(key);
    // Não fecha e não aplica automaticamente; aplicar no botão "Aplicar"
  };

  useEffect(() => {
    if (isDatePopoverOpen) {
      setTempDateRange(appliedDateRange);
    }
  }, [isDatePopoverOpen, appliedDateRange?.from?.toString(), appliedDateRange?.to?.toString()]);

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) => (prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]));
  };

  const metricColors: Record<string, string> = {
    vendas: "#7c3aed",
    unidades: "#a78bfa",
    pedidos: "#c4b5fd",
    ticketMedio: "#6d28d9",
  };

  const isSingleDay =
    !!appliedDateRange?.from &&
    !!appliedDateRange?.to &&
    appliedDateRange.from.toDateString() === appliedDateRange.to.toDateString();

  // Buscar métricas reais (filtradas por data de pagamento e marketplace)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await getOrdersMetrics(appliedDateRange, selectedMarketplaceDisplay, organizationId);
        if (!mounted) return;
        setTotals(res.totals);
        setSeries(res.series);
        setMarketplaceBreakdown(res.byMarketplace);
      } catch (e) {
        if (!mounted) return;
        setTotals({ vendas: 0, unidades: 0, pedidos: 0, ticketMedio: 0 });
        setSeries([]);
        setMarketplaceBreakdown([]);
      }
    };
    load();
    return () => { mounted = false; };
  }, [appliedDateRange?.from?.toString(), appliedDateRange?.to?.toString(), selectedMarketplaceDisplay, organizationId]);

  // Ranking de anúncios mais vendidos (com margem), filtrado por data de pagamento
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!organizationId) { setTopListings([]); return; }
      setLoadingTop(true);
      try {
        const data = await getListingsRanking(appliedDateRange, selectedMarketplaceDisplay, organizationId, 50);
        if (!mounted) return;
        setTopListings(data);
      } catch (_) {
        if (!mounted) return;
        setTopListings([]);
      } finally {
        if (!mounted) return;
        setLoadingTop(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [appliedDateRange?.from?.toString(), appliedDateRange?.to?.toString(), selectedMarketplaceDisplay, organizationId]);

  // API de vendas por estado
  // Importação dinâmica para evitar ciclo durante HMR
  const [stateSales, setStateSales] = useState<{ state: string; total: number }[]>([]);
  const [regionSales, setRegionSales] = useState<{ region: string; total: number }[]>([]);
  const [totalStateSales, setTotalStateSales] = useState<number>(0);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await getSalesByState(appliedDateRange, selectedMarketplaceDisplay);
        if (!mounted) return;
        setStateSales(res.byState);
        setRegionSales(res.byRegion);
        setTotalStateSales(res.total);
      } catch (e) {
        setStateSales([]);
        setRegionSales([]);
        setTotalStateSales(0);
      }
    };
    load();
    return () => { mounted = false; };
  }, [appliedDateRange?.from?.toString(), appliedDateRange?.to?.toString(), selectedMarketplaceDisplay]);
  const salesSources = marketplaceBreakdown.map((m) => ({ name: m.marketplace, value: m.total }));
  const totalSources = salesSources.reduce((acc, s) => acc + s.value, 0);
  const pieData = salesSources.length ? salesSources.map((s) => ({ name: s.name, value: s.value })) : [{ name: "Sem dados", value: 1 }];
  const zeroPie = totalSources === 0;
  const piePalette = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#7c3aed", "#6d28d9", "#4c1d95"];
  const pieConfig = Object.fromEntries(
    pieData.map((entry, index) => [
      entry.name,
      { label: entry.name, color: piePalette[index % piePalette.length] },
    ])
  );

  const brGeoUrl = "https://raw.githubusercontent.com/deldersveld/topojson/master/countries/brazil/brazil-states.json";
  const NAME_TO_UF: Record<string, string> = {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE",
    "Distrito Federal": "DF", "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT",
    "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
    "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS",
    "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC", "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO"
  };
  const totalsByUf: Record<string, number> = Object.fromEntries(stateSales.map(s => [s.state, s.total]));
  const maxStateTotal = Math.max(...stateSales.map(s => s.total), 1);
  const colorScale = scaleLinear<number, string>().domain([0, maxStateTotal]).range(["#E0F2FE", "#1D4ED8"]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex items-center space-x-4">
        <Popover open={isDatePopoverOpen} onOpenChange={(open) => { setIsDatePopoverOpen(open); if (open) setTempDateRange(appliedDateRange); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[320px] justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {appliedDateRange?.from ? (
                appliedDateRange.to ? (
                  <>
                    {format(appliedDateRange.from, "dd MMM, y", { locale: ptBR })} -{" "}
                    {format(appliedDateRange.to, "dd MMM, y", { locale: ptBR })}
                  </>
                ) : (
                  format(appliedDateRange.from, "dd MMM, y", { locale: ptBR })
                )
              ) : (
                "Selecione o período"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[380px]" align="start">
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  className={activeQuick === "hoje" ? "bg-violet-600 text-white hover:bg-violet-700" : ""}
                  onClick={() => applyQuickRange("hoje")}
                >
                  Hoje
                </Button>
                <Button
                  variant="secondary"
                  className={activeQuick === "7dias" ? "bg-violet-600 text-white hover:bg-violet-700" : ""}
                  onClick={() => applyQuickRange("7dias")}
                >
                  Últimos 7 dias
                </Button>
                <Button
                  variant="secondary"
                  className={activeQuick === "30dias" ? "bg-violet-600 text-white hover:bg-violet-700" : ""}
                  onClick={() => applyQuickRange("30dias")}
                >
                  Últimos 30 dias
                </Button>
              </div>
              <div className="text-sm text-gray-600">Personalizar data</div>
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={tempDateRange?.from || new Date()}
                selected={tempDateRange}
                onSelect={setTempDateRange}
                numberOfMonths={1}
              />
              <div className="flex justify-end">
                <Button onClick={() => { handleDateRangeChange(tempDateRange); setActiveQuick(null); setIsDatePopoverOpen(false); }}>
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Select value={selectedMarketplace} onValueChange={setSelectedMarketplace}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Marketplace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {connectedMarketplaces.map((m) => (
              <SelectItem key={m.slug} value={m.slug}>{m.display}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card onClick={() => toggleMetric("vendas")} className={`cursor-pointer ${selectedMetrics.includes("vendas") ? "ring-2 ring-[#7c3aed]" : ""}`}>
          {selectedMetrics.includes("vendas") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.vendas }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Vendas</CardTitle>
            <DollarSign className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">R$ {totals.vendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>

        <Card onClick={() => toggleMetric("unidades")} className={`cursor-pointer ${selectedMetrics.includes("unidades") ? "ring-2 ring-[#a78bfa]" : ""}`}>
          {selectedMetrics.includes("unidades") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.unidades }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Unidades Vendidas</CardTitle>
            <Package className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{totals.unidades}</div>
          </CardContent>
        </Card>

        <Card onClick={() => toggleMetric("pedidos")} className={`cursor-pointer ${selectedMetrics.includes("pedidos") ? "ring-2 ring-[#c4b5fd]" : ""}`}>
          {selectedMetrics.includes("pedidos") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.pedidos }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pedidos</CardTitle>
            <Package className="h-4 w-4 text-violet-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{totals.pedidos}</div>
          </CardContent>
        </Card>

        <Card onClick={() => toggleMetric("ticketMedio")} className={`cursor-pointer ${selectedMetrics.includes("ticketMedio") ? "ring-2 ring-[#6d28d9]" : ""}`}>
          {selectedMetrics.includes("ticketMedio") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.ticketMedio }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Ticket Médio</CardTitle>
            <DollarSign className="h-4 w-4 text-violet-700" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">R$ {totals.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>

      </div>

      {/* Gráfico Principal */}
      <Card>
        <CardHeader>
          <CardTitle>Trajetória de Desempenho</CardTitle>
          <CardDescription>{isSingleDay ? "Hoje (00:00 - 23:59)" : "Período selecionado"}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              vendas: { label: "Vendas", color: metricColors.vendas },
              unidades: { label: "Unidades", color: metricColors.unidades },
              pedidos: { label: "Pedidos", color: metricColors.pedidos },
              ticketMedio: { label: "Ticket Médio", color: metricColors.ticketMedio },
            }}
            className="h-[380px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                {selectedMetrics.map((metric) => (
                  <Line key={metric} type="monotone" dataKey={metric} stroke={metricColors[metric]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Fonte de Vendas */}
      <Card>
        <CardHeader>
          <CardTitle>Fonte de vendas</CardTitle>
          <CardDescription>Percentual por marketplace/aplicativo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="space-y-3">
              {salesSources.length === 0 ? (
                <div className="p-4 border rounded-lg text-sm text-gray-600">Sem dados de marketplace para o período selecionado.</div>
              ) : (
                salesSources.map((s) => (
                  <TooltipProvider key={s.name}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline">{s.name}</Badge>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">R$ {s.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-gray-500">{totalSources === 0 ? 0 : Math.round((s.value / totalSources) * 100)}%</p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Vendas totais do marketplace no período</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))
              )}
            </div>
            <ChartContainer config={pieConfig} className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie dataKey="value" data={pieData} innerRadius={60} outerRadius={90}>
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={zeroPie ? "#E9D5FF" : piePalette[index % piePalette.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      {/* Ranking de Anúncios Vendidos */}
      <Card>
        <CardHeader>
          <CardTitle>Anúncios Vendidos no Período</CardTitle>
          <CardDescription>Mais vendidos no período filtrado (por data de pagamento)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anúncio</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Pedidos</TableHead>
                <TableHead>Unidades Vendidas</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead>Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTop ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-gray-600">Carregando ranking de anúncios...</TableCell>
                </TableRow>
              ) : topListings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-gray-600">Sem vendas no período selecionado.</TableCell>
                </TableRow>
              ) : (
                topListings.map((ad) => (
                  <TableRow key={ad.marketplace_item_id}>
                    <TableCell className="font-medium">{ad.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ad.marketplace}</Badge>
                    </TableCell>
                    <TableCell>{ad.pedidos}</TableCell>
                    <TableCell>{ad.unidades}</TableCell>
                    <TableCell>R$ {ad.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={ad.margem >= 0 ? "default" : "secondary"}>
                        {(ad.margem * 100).toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Localização de Vendas */}
      <Card>
        <CardHeader>
          <CardTitle>Localização de vendas</CardTitle>
          <CardDescription>Mapa interativo por estado e ranking ao lado</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mapa interativo por estado */}
            <div className="relative border rounded-lg p-2">
              <div className="text-sm text-gray-600 mb-2 px-2">Mapa do Brasil por estado (zoom e arraste)</div>
              <ComposableMap projection="geoMercator" projectionConfig={{ scale: 600 }} style={{ width: "100%", height: 380 }}>
                <ZoomableGroup zoom={mapZoom} center={mapCenter} onMoveEnd={({ zoom, center }) => { setMapZoom(zoom as number); setMapCenter(center as [number, number]); }}>
                  <Geographies geography={brGeoUrl}>
                    {({ geographies }) => (
                      geographies.map((geo) => {
                        const name = (geo.properties as any).name || (geo.properties as any).NAME_1;
                        const uf = NAME_TO_UF[name] || name;
                        const val = totalsByUf[uf] || 0;
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onMouseEnter={(e) => { setHoverInfo({ name, total: val }); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                            onMouseLeave={() => { setHoverInfo(null); setHoverPos(null); }}
                            style={{
                              default: { fill: colorScale(val), stroke: "#CBD5E1", outline: "none" },
                              hover: { fill: "#3B82F6", stroke: "#0F172A", outline: "none" },
                              pressed: { fill: "#1D4ED8", stroke: "#0F172A", outline: "none" },
                            }}
                          />
                        );
                      })
                    )}
                  </Geographies>
                </ZoomableGroup>
              </ComposableMap>
              <div className="absolute left-3 bottom-3 flex flex-col space-y-2">
                <Button size="icon" variant="outline" onClick={() => setMapZoom((z) => Math.min(z + 0.4, 8))}>+</Button>
                <Button size="icon" variant="outline" onClick={() => setMapZoom((z) => Math.max(z - 0.4, 1))}>-</Button>
              </div>
              {hoverInfo && hoverPos && (
                <div className="pointer-events-none absolute bg-white border rounded-md shadow px-3 py-2 text-sm" style={{ left: hoverPos.x - 60, top: hoverPos.y - 90 }}>
                  <div className="font-medium">{hoverInfo.name}</div>
                  <div className="text-gray-700">R$ {hoverInfo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </div>
              )}
            </div>

            {/* Ranking por estado */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-600">Total do período: <span className="font-medium">R$ {totalStateSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
              </div>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estado</TableHead>
                      <TableHead>Valor de Vendas</TableHead>
                      <TableHead>% do Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stateSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-gray-600">Sem dados de vendas por estado no período.</TableCell>
                      </TableRow>
                    ) : (
                      [...stateSales].sort((a, b) => b.total - a.total).map((s) => (
                        <TableRow key={s.state}>
                          <TableCell className="font-medium">{s.state}</TableCell>
                          <TableCell>R$ {s.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell>{totalStateSales === 0 ? 0 : Math.round((s.total / totalStateSales) * 100)}%</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PorProduto() {
  const [activeTab, setActiveTab] = useState("produtos");

  const produtosData = [
    { id: 1, nome: "iPhone 15 Pro Max", pedidos: 15, unidades: 18, valor: 161999.82, margem: 23.5, vinculos: 5 },
    { id: 2, nome: "MacBook Air M3", pedidos: 8, unidades: 8, valor: 103999.92, margem: 18.2, vinculos: 3 },
  ];

  const anunciosData = [
    { id: 1, titulo: "iPhone 15 Pro Max 256GB Titânio", marketplace: "Mercado Livre", vendas: 12, valor: 8999.99 },
    { id: 2, titulo: "iPhone 15 Pro Max Azul Titânio", marketplace: "Amazon", vendas: 8, valor: 9299.99 },
  ];

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("produtos")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "produtos" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Produtos
        </button>
        <button
          onClick={() => setActiveTab("anuncios")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "anuncios" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Anúncios
        </button>
      </div>

      {activeTab === "produtos" && (
        <Card>
          <CardHeader>
            <CardTitle>Produtos por Desempenho</CardTitle>
            <CardDescription>Lista de produtos vendidos no período</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Pedidos</TableHead>
                  <TableHead>Unidades Vendidas</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Margem</TableHead>
                  <TableHead>Vínculos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtosData.map((produto) => (
                  <TableRow key={produto.id}>
                    <TableCell className="font-medium">{produto.nome}</TableCell>
                    <TableCell>{produto.pedidos}</TableCell>
                    <TableCell>{produto.unidades}</TableCell>
                    <TableCell>R$ {produto.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={produto.margem > 20 ? "default" : "secondary"}>
                        {produto.margem}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Drawer>
                        <DrawerTrigger asChild>
                          <Button variant="outline" size="sm">
                            {produto.vinculos} vínculos
                          </Button>
                        </DrawerTrigger>
                        <DrawerContent>
                          <DrawerHeader>
                            <DrawerTitle>Anúncios Vinculados</DrawerTitle>
                            <DrawerDescription>
                              Lista de anúncios para {produto.nome}
                            </DrawerDescription>
                          </DrawerHeader>
                          <div className="p-6">
                            <div className="space-y-4">
                              {anunciosData.map((anuncio) => (
                                <div key={anuncio.id} className="flex justify-between items-center p-4 border rounded-lg">
                                  <div>
                                    <h4 className="font-medium">{anuncio.titulo}</h4>
                                    <Badge variant="outline">{anuncio.marketplace}</Badge>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold">{anuncio.vendas} vendas</p>
                                    <p className="text-sm text-gray-600">R$ {anuncio.valor}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </DrawerContent>
                      </Drawer>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "anuncios" && (
        <Card>
          <CardHeader>
            <CardTitle>Anúncios por Desempenho</CardTitle>
            <CardDescription>Lista de anúncios vendidos no período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4 mb-4">
              <Select defaultValue="todos">
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Marketplace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                  <SelectItem value="amazon">Amazon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead>Vendas</TableHead>
                  <TableHead>Valor Unitário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anunciosData.map((anuncio) => (
                  <TableRow key={anuncio.id}>
                    <TableCell className="font-medium">{anuncio.titulo}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{anuncio.marketplace}</Badge>
                    </TableCell>
                    <TableCell>{anuncio.vendas}</TableCell>
                    <TableCell>R$ {anuncio.valor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProdutosEmAlta() {
  const [selectedMarketplace, setSelectedMarketplace] = useState("mercadolivre");

  const topProdutos = [
    { categoria: "Eletrônicos", produtos: ["iPhone 15", "Samsung Galaxy S24", "MacBook Air"] },
    { categoria: "Casa e Jardim", produtos: ["Aspirador Robot", "Panela Elétrica", "Ventilador"] },
    { categoria: "Moda", produtos: ["Tênis Nike", "Relógio Smart", "Óculos Sol"] },
  ];

  return (
    <div className="space-y-6">
      {/* Navigation por Marketplace */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        {["mercadolivre", "amazon", "shopee", "magazineluiza"].map((marketplace) => (
          <button
            key={marketplace}
            onClick={() => setSelectedMarketplace(marketplace)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              selectedMarketplace === marketplace ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {marketplace === "mercadolivre" ? "Mercado Livre" : 
             marketplace === "magazineluiza" ? "Magazine Luiza" : marketplace}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>TOP 30 - Últimos 30 dias</CardTitle>
          <CardDescription>Produtos em alta no {selectedMarketplace}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {topProdutos.map((item, index) => (
              <div key={index}>
                <h3 className="text-lg font-semibold mb-3">{item.categoria}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {item.produtos.map((produto, idx) => (
                    <div key={idx} className="p-4 border rounded-lg">
                      <h4 className="font-medium">{produto}</h4>
                      <p className="text-sm text-gray-600">#{idx + 1} em {item.categoria}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RankingVendas() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ranking de Vendas</CardTitle>
          <CardDescription>Top performers por marketplace</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">Conteúdo em desenvolvimento...</p>
        </CardContent>
      </Card>
    </div>
  );
}

function PorLocalizacao() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vendas por Localização</CardTitle>
          <CardDescription>Distribuição geográfica das vendas</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">Conteúdo em desenvolvimento...</p>
        </CardContent>
      </Card>
    </div>
  );
}

const Desempenho = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <GlobalHeader />

          {/* Navigation */}
          <CleanNavigation items={navigationItems} basePath="/desempenho" />

          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            <Routes>
              <Route path="" element={<VisaoGeral />} />
              <Route path="/produtos" element={<PorProduto />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Desempenho;
