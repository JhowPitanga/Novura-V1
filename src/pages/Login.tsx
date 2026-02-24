import { useState, useEffect } from "react";
import { Eye, EyeOff, ArrowRight, Loader2, TrendingUp } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');

  @keyframes orb-a {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33%       { transform: translate(32px, -44px) scale(1.1); }
    66%       { transform: translate(-22px, 22px) scale(0.9); }
  }
  @keyframes orb-b {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50%       { transform: translate(-38px, -28px) rotate(180deg); }
  }
  @keyframes orb-c {
    0%, 100% { transform: translate(0, 0); }
    25%       { transform: translate(26px, 32px); }
    75%       { transform: translate(-18px, -18px); }
  }
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes card-in {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }

  .login-orb-a { animation: orb-a 14s ease-in-out infinite; }
  .login-orb-b { animation: orb-b 10s ease-in-out infinite; }
  .login-orb-c { animation: orb-c  8s ease-in-out infinite; }
  .login-card  { animation: card-in 0.7s 0.35s ease-out both; }

  .login-su-0 { animation: slide-up 0.55s 0.00s ease-out both; }
  .login-su-1 { animation: slide-up 0.55s 0.08s ease-out both; }
  .login-su-2 { animation: slide-up 0.55s 0.16s ease-out both; }
  .login-su-3 { animation: slide-up 0.55s 0.24s ease-out both; }
  .login-su-4 { animation: slide-up 0.55s 0.32s ease-out both; }
  .login-su-5 { animation: slide-up 0.55s 0.40s ease-out both; }

  .n-input {
    width: 100%;
    padding: 13px 16px;
    background: #F7F5FF;
    border: 1.5px solid #EAE6FF;
    border-radius: 11px;
    font-size: 14.5px;
    color: #0D0814;
    outline: none;
    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
    font-family: 'DM Sans', sans-serif;
    box-sizing: border-box;
  }
  .n-input:focus {
    border-color: #7C3AED;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(124,58,237,0.1);
  }
  .n-input::placeholder { color: #B5AFD4; }

  .n-btn {
    width: 100%;
    padding: 14px;
    background: #7C3AED;
    color: #fff;
    border: none;
    border-radius: 11px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
    font-family: 'DM Sans', sans-serif;
    letter-spacing: -0.2px;
  }
  .n-btn:hover:not(:disabled) {
    background: #6B2FDB;
    transform: translateY(-1px);
    box-shadow: 0 8px 28px rgba(124,58,237,0.38);
  }
  .n-btn:active:not(:disabled) { transform: translateY(0); }
  .n-btn:disabled { opacity: 0.65; cursor: not-allowed; }

  .n-back-link:hover { color: #8782A6 !important; }
  .n-forgot-link:hover { text-decoration: underline; }
  .n-register-link:hover { text-decoration: underline; }
`;

const NovuraLogo = ({ size = 38 }: { size?: number }) => (
  <div style={{
    width: size, height: size,
    background: "linear-gradient(135deg, #7C3AED, #A855F7)",
    borderRadius: Math.round(size * 0.24),
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  }}>
    <svg width={size * 0.47} height={size * 0.47} viewBox="0 0 24 24" fill="none">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" strokeLinejoin="round" />
    </svg>
  </div>
);

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);
    if (!error) navigate("/");
  };

  return (
    <>
      <style>{STYLES}</style>

      <div style={{ minHeight: "100vh", display: "flex" }}>

        {/* ─── LEFT PANEL ─── */}
        <div
          className="hidden lg:flex flex-col justify-between"
          style={{
            width: "48%",
            background: "linear-gradient(155deg, #0A0618 0%, #130B28 50%, #1C0A3A 100%)",
            padding: "44px 48px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Grid texture */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 0,
            backgroundImage:
              "linear-gradient(rgba(124,58,237,0.07) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(124,58,237,0.07) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }} />

          {/* Glow orbs */}
          <div className="login-orb-a" style={{
            position: "absolute", top: "8%", left: "20%", zIndex: 1,
            width: 340, height: 340,
            background: "radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 70%)",
            borderRadius: "50%", filter: "blur(50px)",
          }} />
          <div className="login-orb-b" style={{
            position: "absolute", bottom: "15%", right: "5%", zIndex: 1,
            width: 260, height: 260,
            background: "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)",
            borderRadius: "50%", filter: "blur(55px)",
          }} />
          <div className="login-orb-c" style={{
            position: "absolute", top: "50%", left: "-5%", zIndex: 1,
            width: 200, height: 200,
            background: "radial-gradient(circle, rgba(75,29,166,0.35) 0%, transparent 70%)",
            borderRadius: "50%", filter: "blur(35px)",
          }} />

          {/* Logo */}
          <div style={{ position: "relative", zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <NovuraLogo size={38} />
              <span style={{
                color: "white", fontSize: 19, fontWeight: 700,
                fontFamily: "'Syne', 'DM Sans', sans-serif",
                letterSpacing: "-0.3px",
              }}>
                Novura
              </span>
            </div>
          </div>

          {/* Headline + features */}
          <div style={{ position: "relative", zIndex: 10 }}>
            {/* Status badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "rgba(124,58,237,0.2)",
              border: "1px solid rgba(168,85,247,0.3)",
              borderRadius: 100, padding: "5px 13px", marginBottom: 28,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#A855F7", boxShadow: "0 0 8px #A855F7",
              }} />
              <span style={{
                color: "#C084FC", fontSize: 11, fontWeight: 600,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                ERP Inteligente
              </span>
            </div>

            <h1 style={{
              fontFamily: "'Syne', 'DM Sans', sans-serif",
              color: "white", fontSize: 42, fontWeight: 800,
              lineHeight: 1.1, letterSpacing: "-1.5px", marginBottom: 18,
            }}>
              Venda mais.{" "}
              <span style={{
                color: "transparent",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                backgroundImage: "linear-gradient(135deg, #A855F7, #C084FC)",
              }}>
                Gerencie tudo.
              </span>
            </h1>

            <p style={{
              color: "rgba(255,255,255,0.45)", fontSize: 15,
              lineHeight: 1.75, maxWidth: 330, marginBottom: 32,
            }}>
              Pedidos, estoque, notas fiscais e integrações com Shopee e Mercado Livre — tudo em um painel.
            </p>

            {/* Feature pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 40 }}>
              {["Shopee", "Mercado Livre", "NFe", "Estoque", "Analytics"].map(tag => (
                <span key={tag} style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, padding: "5px 11px",
                  color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 500,
                  backdropFilter: "blur(4px)",
                }}>
                  {tag}
                </span>
              ))}
            </div>

            {/* Floating metric card */}
            <div className="login-card" style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16, padding: "20px 22px",
              backdropFilter: "blur(16px)",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{
                width: 44, height: 44,
                background: "rgba(124,58,237,0.3)",
                borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <TrendingUp size={20} color="#C084FC" />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Faturamento médio por vendedor
                </div>
                <div style={{
                  color: "white", fontSize: 22, fontWeight: 700,
                  fontFamily: "'Syne', 'DM Sans', sans-serif",
                  letterSpacing: "-0.5px",
                  display: "flex", alignItems: "baseline", gap: 8,
                }}>
                  R$ 84.320
                  <span style={{ color: "#4ADE80", fontSize: 12, fontWeight: 600 }}>
                    ↑ 18% este mês
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT PANEL ─── */}
        <div style={{
          flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "48px 24px",
          background: "#FEFEFE",
        }}>
          <div style={{ width: "100%", maxWidth: 390 }}>

            {/* Mobile logo (only visible below lg) */}
            <div className="flex lg:hidden justify-center" style={{ marginBottom: 40 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <NovuraLogo size={34} />
                <span style={{
                  fontFamily: "'Syne', 'DM Sans', sans-serif",
                  fontSize: 18, fontWeight: 700, color: "#0D0814",
                }}>
                  Novura
                </span>
              </div>
            </div>

            {/* Heading */}
            <div className="login-su-0" style={{ marginBottom: 32 }}>
              <h2 style={{
                fontFamily: "'Syne', 'DM Sans', sans-serif",
                fontSize: 27, fontWeight: 800, color: "#0D0814",
                letterSpacing: "-0.8px", marginBottom: 7,
              }}>
                Bem-vindo de volta
              </h2>
              <p style={{ color: "#8782A6", fontSize: 14.5, lineHeight: 1.6 }}>
                Acesse sua conta para gerenciar suas vendas
              </p>
            </div>

            <form onSubmit={handleLogin}>
              {/* Email */}
              <div className="login-su-1" style={{ marginBottom: 14 }}>
                <label style={{
                  display: "block", fontSize: 13, fontWeight: 600,
                  color: "#3D3560", marginBottom: 7,
                }}>
                  E-mail
                </label>
                <input
                  type="email"
                  className="n-input"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="login-su-2" style={{ marginBottom: 10 }}>
                <label style={{
                  display: "block", fontSize: 13, fontWeight: 600,
                  color: "#3D3560", marginBottom: 7,
                }}>
                  Senha
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="n-input"
                    placeholder="Sua senha"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{ paddingRight: 46 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute", right: 13, top: "50%",
                      transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "#B5AFD4", padding: 4,
                      display: "flex", alignItems: "center",
                      transition: "color 0.15s",
                    }}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Forgot password */}
              <div className="login-su-3" style={{ textAlign: "right", marginBottom: 26 }}>
                <Link
                  to="/recuperar-senha"
                  className="n-forgot-link"
                  style={{ fontSize: 13, color: "#7C3AED", fontWeight: 500, textDecoration: "none" }}
                >
                  Esqueceu a senha?
                </Link>
              </div>

              {/* Submit */}
              <div className="login-su-4">
                <button type="submit" className="n-btn" disabled={isLoading}>
                  {isLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> Entrando...</>
                  ) : (
                    <>Entrar <ArrowRight size={16} /></>
                  )}
                </button>
              </div>
            </form>

            {/* Register link */}
            <div className="login-su-5" style={{ textAlign: "center", marginTop: 26 }}>
              <span style={{ color: "#8782A6", fontSize: 13.5 }}>
                Não tem uma conta?{" "}
              </span>
              <Link
                to="/cadastro"
                className="n-register-link"
                style={{ color: "#7C3AED", fontWeight: 600, fontSize: 13.5, textDecoration: "none" }}
              >
                Criar conta grátis
              </Link>
            </div>

            {/* Back to site */}
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <Link
                to="/"
                className="n-back-link"
                style={{
                  color: "#C4BFD9", fontSize: 12.5, textDecoration: "none",
                  display: "inline-flex", alignItems: "center", gap: 4,
                  transition: "color 0.15s",
                }}
              >
                ← Voltar ao site
              </Link>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
