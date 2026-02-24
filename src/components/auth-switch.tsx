"use client";

import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Eye, EyeOff, ArrowRight, Loader2, TrendingUp, Check, Mail } from "lucide-react";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');

  @keyframes as-orb-a {
    0%, 100% { transform: translate(0,0) scale(1); }
    33%       { transform: translate(30px,-42px) scale(1.1); }
    66%       { transform: translate(-20px,20px) scale(0.9); }
  }
  @keyframes as-orb-b {
    0%, 100% { transform: translate(0,0); }
    50%       { transform: translate(-36px,-26px); }
  }
  @keyframes as-orb-c {
    0%, 100% { transform: translate(0,0); }
    25%       { transform: translate(24px,30px); }
    75%       { transform: translate(-18px,-16px); }
  }
  @keyframes as-fade-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes as-fade-x {
    from { opacity: 0; transform: translateX(-10px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes as-card-in {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .as-orb-a { animation: as-orb-a 14s ease-in-out infinite; }
  .as-orb-b { animation: as-orb-b 10s ease-in-out infinite; }
  .as-orb-c { animation: as-orb-c  8s ease-in-out infinite; }
  .as-panel  { animation: as-fade-x  0.4s ease-out both; }
  .as-metric { animation: as-card-in 0.7s 0.3s ease-out both; }
  .as-view   { animation: as-fade-up 0.4s ease-out both; }
  .as-0 { animation: as-fade-up 0.5s 0.00s ease-out both; }
  .as-1 { animation: as-fade-up 0.5s 0.07s ease-out both; }
  .as-2 { animation: as-fade-up 0.5s 0.14s ease-out both; }
  .as-3 { animation: as-fade-up 0.5s 0.21s ease-out both; }
  .as-4 { animation: as-fade-up 0.5s 0.28s ease-out both; }
  .as-5 { animation: as-fade-up 0.5s 0.35s ease-out both; }
  .as-6 { animation: as-fade-up 0.5s 0.42s ease-out both; }
  .as-7 { animation: as-fade-up 0.5s 0.49s ease-out both; }

  .as-input {
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
  .as-input:focus {
    border-color: #7C3AED;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(124,58,237,0.1);
  }
  .as-input::placeholder { color: #B5AFD4; }

  .as-btn {
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
  }
  .as-btn:hover:not(:disabled) {
    background: #6B2FDB;
    transform: translateY(-1px);
    box-shadow: 0 8px 28px rgba(124,58,237,0.38);
  }
  .as-btn:active:not(:disabled) { transform: translateY(0); }
  .as-btn:disabled { opacity: 0.65; cursor: not-allowed; }

  .as-btn-ghost {
    width: 100%;
    padding: 13px;
    background: transparent;
    color: #7C3AED;
    border: 1.5px solid #E4DDFF;
    border-radius: 11px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 0.2s, border-color 0.2s;
    font-family: 'DM Sans', sans-serif;
  }
  .as-btn-ghost:hover:not(:disabled) { background: #F7F5FF; border-color: #C4B8FF; }
  .as-btn-ghost:disabled { opacity: 0.45; cursor: not-allowed; }

  .as-switch-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #7C3AED;
    font-weight: 600;
    font-size: 13.5px;
    font-family: 'DM Sans', sans-serif;
    padding: 0;
  }
  .as-switch-btn:hover { text-decoration: underline; }
`;

const NovuraLogo = ({ size = 38 }: { size?: number }) => (
  <div style={{
    width: size, height: size,
    background: "linear-gradient(135deg, #7C3AED, #A855F7)",
    borderRadius: Math.round(size * 0.24),
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  }}>
    <svg width={size * 0.47} height={size * 0.47} viewBox="0 0 24 24" fill="none">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" strokeLinejoin="round" />
    </svg>
  </div>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3D3560", marginBottom: 7 }}>
    {children}
  </label>
);

const ErrorMsg = ({ msg }: { msg: string }) =>
  msg ? <div style={{ color: "#DC2626", fontSize: 13, marginTop: 6 }}>{msg}</div> : null;

const PwToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    style={{
      position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
      background: "none", border: "none", cursor: "pointer",
      color: "#B5AFD4", padding: 4, display: "flex", alignItems: "center",
      transition: "color 0.15s",
    }}
    aria-label={show ? "Ocultar senha" : "Mostrar senha"}
  >
    {show ? <EyeOff size={16} /> : <Eye size={16} />}
  </button>
);

export default function AuthSwitch() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailLogin, setEmailLogin] = useState("");
  const [passwordLogin, setPasswordLogin] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [fullName, setFullName] = useState("");
  const [emailSignup, setEmailSignup] = useState("");
  const [passwordSignup, setPasswordSignup] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    const mode = (searchParams.get("mode") || searchParams.get("cadastro")) || "";
    if (mode === "signup" || mode === "1") setIsSignUp(true);
  }, []);

  useEffect(() => {
    if (!otpOpen) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setCanResend(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [otpOpen]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const { error: err } = await signIn(emailLogin, passwordLogin);
      if (err) setError(err.message || "Erro ao fazer login");
      else navigate("/", { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const parts = fullName.trim().split(/\s+/);
      const first = parts[0] || "";
      const last = parts.slice(1).join(" ") || "";
      const { error: err } = await signUp(emailSignup, passwordSignup, {
        full_name: fullName, first_name: first, last_name: last,
        phone: phone.replace(/\D/g, ""),
      });
      if (err) setError(err.message || "Erro ao criar conta");
      else {
        setOtpOpen(true); setOtpValue(""); setOtpMessage("");
        setTimeLeft(60); setCanResend(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhoneBR = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    const d0 = digits.slice(0, 2);
    const d1 = digits.slice(2, 7);
    const d2 = digits.slice(7, 11);
    let out = "";
    if (d0) out += `(${d0}`;
    if (digits.length >= 3) out += ") ";
    if (d1) out += d1;
    if (digits.length >= 8) out += "-";
    if (d2) out += d2;
    return out;
  };

  const handleOtpVerify = async () => {
    const token = otpValue.trim();
    if (!token || token.length < 6) { setOtpMessage("Informe o código completo"); return; }
    const { error: vErr } = await supabase.auth.verifyOtp({ email: emailSignup, token, type: "signup" as any });
    if (vErr) { setOtpMessage("Código inválido ou expirado"); return; }
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0] || "";
    const last = parts.slice(1).join(" ") || "";
    const { error: sErr } = await (supabase as any).auth.signInWithPassword({ email: emailSignup, password: passwordSignup });
    if (sErr) {
      setOtpMessage("Verificado. Falha ao abrir sessão para finalizar cadastro.");
      setTimeout(() => setIsSignUp(false), 1000);
      return;
    }
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const accessToken: string | undefined = sessionRes?.session?.access_token;
      if (accessToken) {
        const headers: Record<string, string> = {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        };
        const payload = { email: emailSignup, full_name: fullName, first_name: first, last_name: last, phone: phone.replace(/\D/g, "") };
        const { error: fnErr } = await supabase.functions.invoke("auth-on-signup", { body: payload, headers } as any);
        if (fnErr) setOtpMessage("Verificado. Falha ao registrar usuário no sistema.");
        else setOtpMessage("Cadastro concluído com sucesso. Redirecionando...");
      } else {
        setOtpMessage("Verificado. Sessão não encontrada para finalizar cadastro.");
      }
    } catch {
      setOtpMessage("Verificado. Não foi possível concluir o pós-cadastro.");
    }
    setTimeout(() => setIsSignUp(false), 800);
  };

  const handleOtpResend = async () => {
    const { error: rErr } = await supabase.auth.resend({ type: "signup", email: emailSignup } as any);
    if (rErr) { setOtpMessage("Falha ao reenviar código"); return; }
    setOtpMessage("Código reenviado para o seu email");
    setTimeLeft(60); setCanResend(false); setOtpValue("");
  };

  const switchToSignUp = () => { setIsSignUp(true); setError(""); };
  const switchToSignIn = () => { setIsSignUp(false); setError(""); };
  const viewKey = isSignUp ? (otpOpen ? "otp" : "signup") : "signin";

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ minHeight: "100vh", display: "flex" }}>

        {/* ── LEFT PANEL ── */}
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

          {/* Orbs */}
          <div className="as-orb-a" style={{
            position: "absolute", top: "8%", left: "20%", zIndex: 1,
            width: 340, height: 340,
            background: "radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 70%)",
            borderRadius: "50%", filter: "blur(50px)",
          }} />
          <div className="as-orb-b" style={{
            position: "absolute", bottom: "15%", right: "5%", zIndex: 1,
            width: 260, height: 260,
            background: "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)",
            borderRadius: "50%", filter: "blur(55px)",
          }} />
          <div className="as-orb-c" style={{
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
                fontFamily: "'Syne', 'DM Sans', sans-serif", letterSpacing: "-0.3px",
              }}>
                Novura
              </span>
            </div>
          </div>

          {/* Adaptive content — remounts on mode change to trigger animation */}
          <div key={isSignUp ? "signup" : "signin"} className="as-panel" style={{ position: "relative", zIndex: 10 }}>
            {!isSignUp ? (
              <>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  background: "rgba(124,58,237,0.2)", border: "1px solid rgba(168,85,247,0.3)",
                  borderRadius: 100, padding: "5px 13px", marginBottom: 28,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#A855F7", boxShadow: "0 0 8px #A855F7" }} />
                  <span style={{ color: "#C084FC", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
                    WebkitBackgroundClip: "text", backgroundClip: "text",
                    backgroundImage: "linear-gradient(135deg, #A855F7, #C084FC)",
                  }}>
                    Gerencie tudo.
                  </span>
                </h1>

                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 15, lineHeight: 1.75, maxWidth: 330, marginBottom: 32 }}>
                  Pedidos, estoque, notas fiscais e integrações com Shopee e Mercado Livre — tudo em um painel.
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 40 }}>
                  {["Shopee", "Mercado Livre", "NFe", "Estoque", "Analytics"].map(tag => (
                    <span key={tag} style={{
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8, padding: "5px 11px",
                      color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 500,
                    }}>{tag}</span>
                  ))}
                </div>

                <div className="as-metric" style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 16, padding: "20px 22px", backdropFilter: "blur(16px)",
                  display: "flex", alignItems: "center", gap: 16,
                }}>
                  <div style={{
                    width: 44, height: 44, background: "rgba(124,58,237,0.3)",
                    borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <TrendingUp size={20} color="#C084FC" />
                  </div>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                      Faturamento médio por vendedor
                    </div>
                    <div style={{
                      color: "white", fontSize: 22, fontWeight: 700,
                      fontFamily: "'Syne', 'DM Sans', sans-serif", letterSpacing: "-0.5px",
                      display: "flex", alignItems: "baseline", gap: 8,
                    }}>
                      R$ 84.320
                      <span style={{ color: "#4ADE80", fontSize: 12, fontWeight: 600 }}>↑ 18% este mês</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  background: "rgba(124,58,237,0.2)", border: "1px solid rgba(168,85,247,0.3)",
                  borderRadius: 100, padding: "5px 13px", marginBottom: 28,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#A855F7", boxShadow: "0 0 8px #A855F7" }} />
                  <span style={{ color: "#C084FC", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    14 dias grátis
                  </span>
                </div>

                <h1 style={{
                  fontFamily: "'Syne', 'DM Sans', sans-serif",
                  color: "white", fontSize: 42, fontWeight: 800,
                  lineHeight: 1.1, letterSpacing: "-1.5px", marginBottom: 18,
                }}>
                  Comece grátis.{" "}
                  <span style={{
                    color: "transparent",
                    WebkitBackgroundClip: "text", backgroundClip: "text",
                    backgroundImage: "linear-gradient(135deg, #A855F7, #C084FC)",
                  }}>
                    Sem complicação.
                  </span>
                </h1>

                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 15, lineHeight: 1.75, maxWidth: 330, marginBottom: 32 }}>
                  Cadastro em menos de 1 minuto. Sem cartão de crédito. Cancele quando quiser.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
                  {[
                    "Integração automática com Shopee e ML",
                    "Emissão de NFe em 1 clique",
                    "Controle de estoque em tempo real",
                    "Analytics de desempenho avançado",
                  ].map(benefit => (
                    <div key={benefit} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: "rgba(124,58,237,0.35)", border: "1px solid rgba(168,85,247,0.4)",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <Check size={11} color="#C084FC" strokeWidth={3} />
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>{benefit}</span>
                    </div>
                  ))}
                </div>

                <div className="as-metric" style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 16, padding: "20px 22px", backdropFilter: "blur(16px)",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.6, fontStyle: "italic", marginBottom: 14 }}>
                    "Aumentei minhas vendas em 43% no primeiro mês usando o Novura."
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, color: "white", fontWeight: 700, flexShrink: 0,
                    }}>M</div>
                    <div>
                      <div style={{ color: "white", fontSize: 13, fontWeight: 600 }}>Mariana S.</div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>São Paulo • Shopee Seller</div>
                    </div>
                    <div style={{ marginLeft: "auto", color: "#FBBF24", fontSize: 13 }}>★★★★★</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{
          flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "48px 24px", background: "#FEFEFE",
        }}>
          <div style={{ width: "100%", maxWidth: 400 }}>

            {/* Mobile logo */}
            <div className="flex lg:hidden justify-center" style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <NovuraLogo size={34} />
                <span style={{ fontFamily: "'Syne','DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: "#0D0814" }}>
                  Novura
                </span>
              </div>
            </div>

            {/* Keyed so the entrance animation replays on view change */}
            <div key={viewKey} className="as-view">

              {/* ── SIGN-IN ── */}
              {!isSignUp && (
                <>
                  <div className="as-0" style={{ marginBottom: 32 }}>
                    <h2 style={{
                      fontFamily: "'Syne','DM Sans',sans-serif",
                      fontSize: 27, fontWeight: 800, color: "#0D0814",
                      letterSpacing: "-0.8px", marginBottom: 7,
                    }}>
                      Boas vindas ao Novura
                    </h2>
                    <p style={{ color: "#8782A6", fontSize: 14.5, lineHeight: 1.6 }}>
                      Faça login para continuar.
                    </p>
                  </div>

                  <form onSubmit={handleSignIn}>
                    <div className="as-1" style={{ marginBottom: 14 }}>
                      <FieldLabel>E-mail</FieldLabel>
                      <input
                        type="email" className="as-input" placeholder="seu@email.com"
                        value={emailLogin} onChange={e => setEmailLogin(e.target.value)}
                        required autoComplete="email"
                      />
                    </div>

                    <div className="as-2" style={{ marginBottom: 26 }}>
                      <FieldLabel>Senha</FieldLabel>
                      <div style={{ position: "relative" }}>
                        <input
                          type={showLoginPw ? "text" : "password"} className="as-input"
                          placeholder="Sua senha" value={passwordLogin}
                          onChange={e => setPasswordLogin(e.target.value)}
                          required autoComplete="current-password" style={{ paddingRight: 46 }}
                        />
                        <PwToggle show={showLoginPw} onToggle={() => setShowLoginPw(v => !v)} />
                      </div>
                      <ErrorMsg msg={error} />
                    </div>

                    <div className="as-3">
                      <button type="submit" className="as-btn" disabled={isLoading}>
                        {isLoading
                          ? <><Loader2 size={16} className="animate-spin" /> Entrando...</>
                          : <>Entrar <ArrowRight size={16} /></>}
                      </button>
                    </div>
                  </form>

                  <div className="as-4" style={{ textAlign: "center", marginTop: 24 }}>
                    <span style={{ color: "#8782A6", fontSize: 13.5 }}>Não tem uma conta? </span>
                    <button className="as-switch-btn" onClick={switchToSignUp}>Cadastrar-se</button>
                  </div>
                </>
              )}

              {/* ── SIGN-UP ── */}
              {isSignUp && !otpOpen && (
                <>
                  <div className="as-0" style={{ marginBottom: 28 }}>
                    <h2 style={{
                      fontFamily: "'Syne','DM Sans',sans-serif",
                      fontSize: 27, fontWeight: 800, color: "#0D0814",
                      letterSpacing: "-0.8px", marginBottom: 7,
                    }}>
                      Comece agora seu teste grátis
                    </h2>
                    <p style={{ color: "#8782A6", fontSize: 14, lineHeight: 1.6 }}>
                      Transforme sua gestão de forma simples e rápida!
                    </p>
                  </div>

                  <form onSubmit={handleSignUp}>
                    <div className="as-1" style={{ marginBottom: 12 }}>
                      <FieldLabel>Nome completo</FieldLabel>
                      <input
                        type="text" className="as-input" placeholder="Seu nome completo"
                        value={fullName} onChange={e => setFullName(e.target.value)} required
                      />
                    </div>
                    <div className="as-2" style={{ marginBottom: 12 }}>
                      <FieldLabel>E-mail</FieldLabel>
                      <input
                        type="email" className="as-input" placeholder="seu@email.com"
                        value={emailSignup} onChange={e => setEmailSignup(e.target.value)}
                        required autoComplete="email"
                      />
                    </div>
                    <div className="as-3" style={{ marginBottom: 12 }}>
                      <FieldLabel>Telefone</FieldLabel>
                      <input
                        type="tel" className="as-input" placeholder="(XX) 9XXXX-XXXX"
                        value={phone} onChange={e => setPhone(formatPhoneBR(e.target.value))}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="as-4" style={{ marginBottom: 24 }}>
                      <FieldLabel>Senha</FieldLabel>
                      <div style={{ position: "relative" }}>
                        <input
                          type={showSignupPw ? "text" : "password"} className="as-input"
                          placeholder="Crie uma senha" value={passwordSignup}
                          onChange={e => setPasswordSignup(e.target.value)}
                          required autoComplete="new-password" style={{ paddingRight: 46 }}
                        />
                        <PwToggle show={showSignupPw} onToggle={() => setShowSignupPw(v => !v)} />
                      </div>
                      <ErrorMsg msg={error} />
                    </div>

                    <div className="as-5">
                      <button type="submit" className="as-btn" disabled={isLoading}>
                        {isLoading
                          ? <><Loader2 size={16} className="animate-spin" /> Criando conta...</>
                          : <>Começa grátis <ArrowRight size={16} /></>}
                      </button>
                    </div>
                  </form>

                  <div className="as-6" style={{ textAlign: "center", marginTop: 22 }}>
                    <span style={{ color: "#8782A6", fontSize: 13.5 }}>Já tem uma conta? </span>
                    <button className="as-switch-btn" onClick={switchToSignIn}>Entrar</button>
                  </div>
                </>
              )}

              {/* ── OTP VERIFICATION ── */}
              {isSignUp && otpOpen && (
                <>
                  <div className="as-0" style={{ marginBottom: 28 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 13,
                      background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
                    }}>
                      <Mail size={24} color="#7C3AED" />
                    </div>
                    <h2 style={{
                      fontFamily: "'Syne','DM Sans',sans-serif",
                      fontSize: 25, fontWeight: 800, color: "#0D0814",
                      letterSpacing: "-0.6px", marginBottom: 8,
                    }}>
                      Verifique seu e-mail
                    </h2>
                    <p style={{ color: "#8782A6", fontSize: 14, lineHeight: 1.6 }}>
                      Enviamos um código de 6 dígitos para{" "}
                      <span style={{ color: "#3D3560", fontWeight: 600 }}>{emailSignup}</span>
                    </p>
                  </div>

                  <div className="as-1" style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                    <InputOTP maxLength={6} value={otpValue} onChange={setOtpValue}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {otpMessage && (
                    <div className="as-2" style={{
                      padding: "10px 14px", borderRadius: 10, marginBottom: 16,
                      background: otpMessage.includes("sucesso") ? "rgba(34,197,94,0.08)" : "rgba(220,38,38,0.08)",
                      border: `1px solid ${otpMessage.includes("sucesso") ? "rgba(34,197,94,0.2)" : "rgba(220,38,38,0.2)"}`,
                      color: otpMessage.includes("sucesso") ? "#16A34A" : "#DC2626",
                      fontSize: 13, textAlign: "center",
                    }}>
                      {otpMessage}
                    </div>
                  )}

                  <div className="as-3" style={{ marginBottom: 12 }}>
                    <button type="button" className="as-btn" onClick={handleOtpVerify}>
                      Verificar código <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="as-4">
                    <button type="button" className="as-btn-ghost" onClick={handleOtpResend} disabled={!canResend}>
                      {canResend
                        ? "Reenviar código"
                        : `Reenviar em ${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`}
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>

      </div>
    </>
  );
}
