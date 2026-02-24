import { Link } from "react-router-dom";
import { Link2, FileText, Printer, Truck, CheckCircle2 } from "lucide-react";

interface StatusCounts {
  vincular: number;
  emissao: number;
  impressao: number;
  coleta: number;
  enviado: number;
}

interface DelayedFlags {
  vincular: boolean;
  emissao: boolean;
  impressao: boolean;
  coleta: boolean;
}

interface OrderStatusGridProps {
  counts?: StatusCounts;
  delayed?: DelayedFlags;
}

const defaultCounts: StatusCounts = { vincular: 0, emissao: 0, impressao: 0, coleta: 0, enviado: 0 };
const defaultDelayed: DelayedFlags = { vincular: false, emissao: false, impressao: false, coleta: false };

const STATUS_CONFIG = [
  { key: "vincular"  as const, label: "Vincular",    href: "/pedidos?status=a-vincular",        Icon: Link2,       color: "#F59E0B", bg: "rgba(245,158,11,0.09)",  border: "rgba(245,158,11,0.22)" },
  { key: "emissao"   as const, label: "Para emitir", href: "/pedidos/emissao_nfe/emitir",       Icon: FileText,    color: "#7C3AED", bg: "rgba(124,58,237,0.09)",  border: "rgba(124,58,237,0.22)" },
  { key: "impressao" as const, label: "Imprimir",    href: "/pedidos?status=impressao",         Icon: Printer,     color: "#3B82F6", bg: "rgba(59,130,246,0.09)",  border: "rgba(59,130,246,0.22)" },
  { key: "coleta"    as const, label: "Coleta",      href: "/pedidos?status=aguardando-coleta", Icon: Truck,       color: "#14B8A6", bg: "rgba(20,184,166,0.09)",  border: "rgba(20,184,166,0.22)" },
  { key: "enviado"   as const, label: "Enviado",     href: "/pedidos?status=enviado",           Icon: CheckCircle2,color: "#22C55E", bg: "rgba(34,197,94,0.09)",   border: "rgba(34,197,94,0.22)"  },
];

const DELAYED_COLOR  = "#DC2626";
const DELAYED_BG     = "rgba(220,38,38,0.07)";
const DELAYED_BORDER = "rgba(220,38,38,0.2)";

export function OrderStatusGrid({ counts = defaultCounts, delayed = defaultDelayed }: OrderStatusGridProps) {
  return (
    <>
      <style>{`
        .osg-tile {
          background: white;
          border-radius: 14px;
          padding: 18px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          border-width: 1.5px;
          border-style: solid;
          transition: transform 0.15s, box-shadow 0.15s;
          cursor: pointer;
        }
        .osg-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.08);
        }
      `}</style>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A1730", letterSpacing: "-0.3px" }}>
            Status dos Pedidos
          </h3>
          <Link to="/pedidos" style={{ fontSize: 12.5, color: "#7C3AED", fontWeight: 600, textDecoration: "none" }}>
            Ver todos →
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {STATUS_CONFIG.map(({ key, label, href, Icon, color, bg, border }) => {
            const isDelayed = key !== "enviado" && delayed[key as keyof DelayedFlags];
            const count = counts[key];
            const activeColor  = isDelayed ? DELAYED_COLOR  : color;
            const activeBg     = isDelayed ? DELAYED_BG     : bg;
            const activeBorder = isDelayed ? DELAYED_BORDER : border;

            return (
              <Link
                key={key}
                to={href}
                className="osg-tile"
                style={{ borderColor: activeBorder }}
              >
                {/* Icon chip */}
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: activeBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={18} color={activeColor} strokeWidth={2} />
                </div>

                {/* Count */}
                <div style={{
                  fontSize: 26, fontWeight: 800, color: activeColor,
                  letterSpacing: "-1px", lineHeight: 1,
                  fontFamily: "'Syne', 'DM Sans', sans-serif",
                }}>
                  {count}
                </div>

                {/* Label */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: isDelayed ? DELAYED_COLOR : "#6B7280", fontWeight: 500 }}>
                    {label}
                  </div>
                  {isDelayed && (
                    <div style={{ fontSize: 10, color: DELAYED_COLOR, fontWeight: 600, marginTop: 2 }}>
                      ● Atrasado
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
