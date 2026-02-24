import { Link } from "react-router-dom";
import { ArrowRight, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function WelcomeCard() {
  const { user } = useAuth();
  const firstName =
    (user?.user_metadata as any)?.first_name ||
    (user?.user_metadata as any)?.full_name?.split(" ")[0] ||
    "Vendedor";

  return (
    <>
      <style>{`
        .wc-cta {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: white;
          color: #7C3AED;
          padding: 10px 20px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: transform 0.15s, box-shadow 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .wc-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }
        @keyframes wc-orb {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%       { transform: translate(-20px,-15px) scale(1.1); }
        }
        .wc-orb { animation: wc-orb 10s ease-in-out infinite; }
      `}</style>

      <div style={{
        background: "linear-gradient(155deg, #0A0618 0%, #130B28 50%, #1C0A3A 100%)",
        borderRadius: 16,
        padding: "36px 40px",
        marginBottom: 24,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Grid texture */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage:
            "linear-gradient(rgba(124,58,237,0.06) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(124,58,237,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* Glow orb */}
        <div className="wc-orb" style={{
          position: "absolute", top: "-40%", right: "8%",
          width: 300, height: 300,
          background: "radial-gradient(circle, rgba(124,58,237,0.28) 0%, transparent 70%)",
          borderRadius: "50%", filter: "blur(40px)",
        }} />

        <div style={{
          position: "relative", zIndex: 1,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
        }}>
          <div>
            {/* Badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.3)",
              borderRadius: 100, padding: "4px 12px", marginBottom: 16,
            }}>
              <div style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "#A855F7", boxShadow: "0 0 6px #A855F7",
              }} />
              <span style={{ color: "#C084FC", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Painel
              </span>
            </div>

            <h2 style={{
              fontFamily: "'Syne', 'DM Sans', sans-serif",
              color: "white", fontSize: 28, fontWeight: 800,
              letterSpacing: "-0.8px", marginBottom: 8,
            }}>
              Olá, {firstName}! 👋
            </h2>

            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, marginBottom: 24, lineHeight: 1.5, maxWidth: 420 }}>
              Gerencie sua empresa em um só lugar com desempenho e simplicidade.
            </p>

            <Link to="/novura-academy" className="wc-cta">
              Explorar Novura <ArrowRight size={15} />
            </Link>
          </div>

          {/* Icon accent — hidden on small screens */}
          <div className="hidden md:flex" style={{
            width: 110, height: 110,
            background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: "50%",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Zap size={44} color="#A855F7" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </>
  );
}
