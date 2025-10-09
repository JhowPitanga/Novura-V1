import { useEffect, useState } from "react";
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
import { LineChart, Line, XAxis, YAxis, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { TrendingUp, DollarSign, Package, MapPin, Award, Calendar as CalendarIcon, Filter } from "lucide-react";
import { Routes, Route } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrdersSummary } from "@/hooks/useOrdersSummary";

const navigationItems = [
  { title: "Visão Geral", path: "", description: "Métricas principais" },
  { title: "Por Produto", path: "/produtos", description: "Desempenho individual" },
];

const chartData = [
  { day: "Seg", value: 2400, label: "R$ 2.400" },
  { day: "Ter", value: 1398, label: "R$ 1.398" },
  { day: "Qua", value: 9800, label: "R$ 9.800" },
  { day: "Qui", value: 3908, label: "R$ 3.908" },
  { day: "Sex", value: 4800, label: "R$ 4.800" },
  { day: "Sáb", value: 3800, label: "R$ 3.800" },
  { day: "Dom", value: 4300, label: "R$ 4.300" },
];

const produtosVendidos = [
  { id: 1, nome: "iPhone 15 Pro Max", pedidos: 15, unidades: 18, valor: 161999.82, margem: 23.5 },
  { id: 2, nome: "MacBook Air M3", pedidos: 8, unidades: 8, valor: 103999.92, margem: 18.2 },
  { id: 3, nome: "Samsung Galaxy S24", pedidos: 22, unidades: 25, valor: 149999.75, margem: 25.8 },
  { id: 4, nome: "iPad Pro 12.9", pedidos: 12, unidades: 14, valor: 132999.86, margem: 19.7 },
];

function VisaoGeral() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["vendas"]);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [activeQuick, setActiveQuick] = useState<"hoje" | "7dias" | "30dias" | null>(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("todos");
  const [mapZoom, setMapZoom] = useState(1);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-50, -15]);
  const [hoverInfo, setHoverInfo] = useState<{ name: string; total: number } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
  };

  const applyQuickRange = (key: "hoje" | "7dias" | "30dias") => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    if (key === "hoje") {
      setDateRange({ from: startOfToday, to: endOfToday });
    } else if (key === "7dias") {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      setDateRange({ from, to: endOfToday });
    } else {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      setDateRange({ from, to: endOfToday });
    }
    setActiveQuick(key);
    setIsDatePopoverOpen(false);
  };

  useEffect(() => {
    if (isDatePopoverOpen) {
      setTempDateRange(dateRange);
    }
  }, [isDatePopoverOpen]);

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) => (prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]));
  };

  const metricColors: Record<string, string> = {
    vendas: "#0ea5e9",
    unidades: "#8b5cf6",
    pedidos: "#a78bfa",
    ticketMedio: "#f59e0b",
    margem: "#22c55e",
  };

  const isSingleDay =
    !!dateRange?.from &&
    !!dateRange?.to &&
    dateRange.from.toDateString() === dateRange.to.toDateString();

  const generateChartData = () => {
    const data: any[] = [];
    if (isSingleDay) {
      for (let h = 0; h < 24; h++) {
        const label = `${String(h).padStart(2, "0")}:00`;
        const point: any = { label };
        point.vendas = Math.floor(Math.random() * 20) + (h % 5 === 0 ? 15 : 5);
        point.unidades = Math.floor(Math.random() * 15) + (h % 6 === 0 ? 10 : 3);
        point.pedidos = Math.floor(Math.random() * 12) + (h % 4 === 0 ? 8 : 2);
        point.ticketMedio = Math.floor(Math.random() * 200) + 120;
        point.margem = Math.floor(Math.random() * 15) + 10;
        data.push(point);
      }
    } else {
      const from = dateRange?.from ?? new Date();
      const to = dateRange?.to ?? new Date();
      const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      for (let i = 0; i < days; i++) {
        const d = new Date(from);
        d.setDate(from.getDate() + i);
        const label = format(d, "dd/MM", { locale: ptBR });
        const point: any = { label };
        point.vendas = Math.floor(Math.random() * 8000) + 2000;
        point.unidades = Math.floor(Math.random() * 120) + 20;
        point.pedidos = Math.floor(Math.random() * 90) + 10;
        point.ticketMedio = Math.floor(Math.random() * 200) + 100;
        point.margem = Math.floor(Math.random() * 15) + 8;
        data.push(point);
      }
    }
    return data;
  };

  const { breakdown: marketplaceBreakdown } = useOrdersSummary(dateRange, selectedMarketplace);
  // API de vendas por estado
  // Importação dinâmica para evitar ciclo durante HMR
  const [stateSales, setStateSales] = useState<{ state: string; total: number }[]>([]);
  const [regionSales, setRegionSales] = useState<{ region: string; total: number }[]>([]);
  const [totalStateSales, setTotalStateSales] = useState<number>(0);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await getSalesByState(dateRange, selectedMarketplace);
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
  }, [dateRange?.from?.toString(), dateRange?.to?.toString(), selectedMarketplace]);
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
        <Popover open={isDatePopoverOpen} onOpenChange={(open) => { setIsDatePopoverOpen(open); if (open) setTempDateRange(dateRange); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[320px] justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "dd MMM, y", { locale: ptBR })} -{" "}
                    {format(dateRange.to, "dd MMM, y", { locale: ptBR })}
                  </>
                ) : (
                  format(dateRange.from, "dd MMM, y", { locale: ptBR })
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
                defaultMonth={tempDateRange?.from || new Date(new Date().getFullYear(), 8, 1)}
                selected={tempDateRange}
                onSelect={setTempDateRange}
                numberOfMonths={1}
                fromMonth={new Date(new Date().getFullYear(), 8, 1)}
                toMonth={new Date(new Date().getFullYear(), 11, 1)}
              />
              <div className="flex justify-end">
                <Button onClick={() => { setDateRange(tempDateRange); setActiveQuick(null); setIsDatePopoverOpen(false); }}>
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
            <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
            <SelectItem value="amazon">Amazon</SelectItem>
            <SelectItem value="shopee">Shopee</SelectItem>
            <SelectItem value="magazineluiza">Magazine Luiza</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card onClick={() => toggleMetric("vendas")} className={`cursor-pointer ${selectedMetrics.includes("vendas") ? "ring-2 ring-[#0ea5e9]" : ""}`}>
          {selectedMetrics.includes("vendas") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.vendas }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Vendas</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">R$ 12.847</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              +18% vs ontem
            </p>
          </CardContent>
        </Card>

        <Card onClick={() => toggleMetric("unidades")} className={`cursor-pointer ${selectedMetrics.includes("unidades") ? "ring-2 ring-[#8b5cf6]" : ""}`}>
          {selectedMetrics.includes("unidades") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.unidades }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Unidades Vendidas</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">147</div>
            <p className="text-xs text-blue-600 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              +22% vs ontem
            </p>
          </CardContent>
        </Card>

        <Card onClick={() => toggleMetric("pedidos")} className={`cursor-pointer ${selectedMetrics.includes("pedidos") ? "ring-2 ring-[#a78bfa]" : ""}`}>
          {selectedMetrics.includes("pedidos") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.pedidos }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pedidos</CardTitle>
            <Package className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">89</div>
            <p className="text-xs text-purple-600 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              +12% vs ontem
            </p>
          </CardContent>
        </Card>

        <Card onClick={() => toggleMetric("ticketMedio")} className={`cursor-pointer ${selectedMetrics.includes("ticketMedio") ? "ring-2 ring-[#f59e0b]" : ""}`}>
          {selectedMetrics.includes("ticketMedio") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.ticketMedio }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Ticket Médio</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">R$ 144</div>
            <p className="text-xs text-orange-600 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              +5% vs ontem
            </p>
          </CardContent>
        </Card>

        <Card onClick={() => toggleMetric("margem")} className={`cursor-pointer ${selectedMetrics.includes("margem") ? "ring-2 ring-[#22c55e]" : ""}`}>
          {selectedMetrics.includes("margem") && <div className="h-1 w-full" style={{ backgroundColor: metricColors.margem }} />}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Margem</CardTitle>
            <Award className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">22.5%</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              +1.2% vs ontem
            </p>
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
              margem: { label: "Margem", color: metricColors.margem },
            }}
            className="h-[380px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={generateChartData()}>
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

      {/* Lista de Produtos Vendidos */}
      <Card>
        <CardHeader>
          <CardTitle>Produtos Vendidos no Período</CardTitle>
          <CardDescription>Lista completa de produtos vendidos</CardDescription>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtosVendidos.map((produto) => (
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
                </TableRow>
              ))}
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
