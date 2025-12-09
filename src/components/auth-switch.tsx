"use client";

import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function AuthSwitch() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailLogin, setEmailLogin] = useState("");
  const [passwordLogin, setPasswordLogin] = useState("");
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
    const container = document.querySelector(".container");
    if (!container) return;
    if (isSignUp) container.classList.add("sign-up-mode");
    else container.classList.remove("sign-up-mode");
  }, [isSignUp]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const { error: err } = await signIn(emailLogin, passwordLogin);
      if (err) {
        setError(err.message || "Erro ao fazer login");
      } else {
        navigate("/", { replace: true });
      }
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
        full_name: fullName,
        first_name: first,
        last_name: last,
        phone: phone.replace(/\D/g, ""),
      });
      if (err) {
        setError(err.message || "Erro ao criar conta");
      } else {
        setOtpOpen(true);
        setOtpValue("");
        setOtpMessage("");
        setTimeLeft(60);
        setCanResend(false);
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

  const handleOtpVerify = async () => {
    const token = otpValue.trim();
    if (!token || token.length < 6) {
      setOtpMessage("Informe o código completo");
      return;
    }
    const { error: vErr } = await supabase.auth.verifyOtp({ email: emailSignup, token, type: "signup" as any });
    if (vErr) {
      setOtpMessage("Código inválido ou expirado");
      return;
    }

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
        const payload = {
          email: emailSignup,
          full_name: fullName,
          first_name: first,
          last_name: last,
          phone: phone.replace(/\D/g, ""),
        };
        const { error: fnErr } = await supabase.functions.invoke("auth-on-signup", { body: payload, headers } as any);
        if (fnErr) {
          setOtpMessage("Verificado. Falha ao registrar usuário no sistema.");
        } else {
          setOtpMessage("Cadastro concluído com sucesso. Redirecionando...");
        }
      } else {
        setOtpMessage("Verificado. Sessão não encontrada para finalizar cadastro.");
      }
    } catch (e) {
      setOtpMessage("Verificado. Não foi possível concluir o pós-cadastro.");
    }

    setTimeout(() => setIsSignUp(false), 800);
  };

  const handleOtpResend = async () => {
    const { error: rErr } = await supabase.auth.resend({ type: "signup", email: emailSignup } as any);
    if (rErr) {
      setOtpMessage("Falha ao reenviar código");
      return;
    }
    setOtpMessage("Código reenviado para o seu email");
    setTimeLeft(60);
    setCanResend(false);
    setOtpValue("");
  };

  return (
    <>
      <style>{`
        html, body, #root {
          width: 100%;
          height: 100%;
        }
        #root {
          width: 100%;
          min-height: 100vh;
          display: block;
        }
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          background: linear-gradient(135deg, #ffffff 0%, #ffffffff 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0px;
          overflow: hidden;
        }
        .brand {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 7;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: left 1s ease, right 0.6s ease, transform 0.6s ease, opacity 0.6s ease;
        }
        .brand img {
          height: 32px;
        }
        .forms-container {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
        }

        .container, .container * {
          font-family: "Roboto", sans-serif;
        }

        .signin-signup {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          left: 75%;
          width: 50%;
          transition: 1s 0.7s ease-in-out;
          
          /* Corrigido para layout simples na posição padrão */
          display: grid; 
          grid-template-columns: 1fr;
          z-index: 5;
        }

        form {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          padding: 0 5rem;
          transition: all 0.2s 0.7s;
          overflow: hidden;
          grid-column: 1 / 2;
          grid-row: 1 / 2;
        }

        form.sign-in-form {
          z-index: 2;
        }

        form.sign-up-form {
          opacity: 0;
          z-index: 1;
        }

        .title {
          font-size: 2.2rem;
          color: #7c3aed;
          margin-bottom: 10px;
          font-weight: 700;
        }
        
        /* Novo estilo para a sub-frase */
        .form-subtitle {
            font-size: 1rem;
            color: #4a4a4a;
            margin-bottom: 25px;
            margin-top: -10px;
            text-align: center;
            max-width: 350px;
            line-height: 1.3;
        }

        .error {
          color: #e11d48;
          font-size: 0.9rem;
          margin-top: 6px;
        }

        .input-field {
          max-width: 380px;
          width: 100%;
          background-color: #e0e0e0ff;
          margin: 10px 0;
          height: 55px;
          border-radius: 55px;
          display: grid;
          grid-template-columns: 1fr;
          padding: 0 1rem;
          position: relative;
          transition: 0.3s;
        }

        .input-field:focus-within {
          background-color: #e8e8e8;
          box-shadow: 0 0 0 2px #7c3aed;
        }

        .input-field i {
          text-align: center;
          line-height: 55px;
          color: #666;
          transition: 0.5s;
          font-size: 1.1rem;
        }

        .input-field input {
          background: none;
          outline: none;
          border: none;
          line-height: 1;
          font-weight: 500;
          font-size: 1rem;
          color: #333;
          width: 100%;
        }

        .input-field input::placeholder {
          color: #aaa;
          font-weight: 400;
        }

        .btn {
          width: 165px;
          background-color: #7c3aed;
          border: none;
          outline: none;
          height: 49px;
          border-radius: 49px;
          color: #fff;
          text-transform: uppercase;
          font-weight: 600;
          margin: 10px 0;
          cursor: pointer;
          transition: 0.5s;
          font-size: 0.9rem;
        }

        .btn:hover {
          background-color: #7c3aed;
          transform: translateY(-5px);
          box-shadow: 0 5px 15px rgba(255, 255, 255, 0.4);
        }

        .panels-container {
          position: absolute;
          height: 100%;
          width: 100%;
          top: 0;
          left: -12%;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
        }

        .panel {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: space-around;
          text-align: center;
          z-index: 6;
        }

        .left-panel {
          pointer-events: all;
          padding: 3rem 17% 2rem 12%;
        }

        .right-panel {
          pointer-events: none;
          padding: 3rem 12% 2rem 17%;
        }

        .panel .content {
          color: #fff;
          transition: transform 0.9s ease-in-out;
          transition-delay: 0.6s;
        }

        .panel h3 {
          font-weight: 600;
          line-height: 1;
          font-size: 1.5rem;
          margin-bottom: 10px;
        }

        .panel p {
          font-size: 0.95rem;
          padding: 0.7rem 0;
        }

        .btn.transparent {
          margin: 0;
          background: none;
          border: 2px solid #fff;
          width: 130px;
          height: 41px;
          font-weight: 600;
          font-size: 0.8rem;
        }

        .btn.transparent:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-2px);
        }

        .right-panel .content {
          transform: translateX(800px);
        }

        .container.sign-up-mode:before {
          transform: translate(100%, -50%);
          right: 52%;
        }

        .container.sign-up-mode .left-panel .content {
          transform: translateX(-800px);
        }

        .container.sign-up-mode .signin-signup {
          left: 25%;
        }

        .container.sign-up-mode form.sign-up-form {
          opacity: 1;
          z-index: 2;
        }

        .container.sign-up-mode form.sign-in-form {
          opacity: 0;
          z-index: 1;
        }

        .container.sign-up-mode .right-panel .content {
          transform: translateX(0%);
        }

        .container.sign-up-mode .left-panel {
          pointer-events: none;
        }

        .container.sign-up-mode .right-panel {
          pointer-events: all;
        }

        .container:before {
          content: "";
          position: absolute;
          height: 2000px;
          width: 2000px;
          top: -10%;
          right: 48%;
          transform: translateY(-50%);
          background: linear-gradient(-45deg, #7c3aed 0%, #7c3aed 100%);
          transition: 1.8s ease-in-out;
          border-radius: 50%;
          z-index: 6;
        }

        .social-text {
          padding: 0.7rem 0;
          font-size: 1rem;
          color: #666;
        }

        .social-media {
          display: flex;
          justify-content: center;
          gap: 15px;
        }

        .social-icon {
          height: 46px;
          width: 46px;
          display: flex;
          justify-content: center;
          align-items: center;
          border: 1px solid #ddd;
          border-radius: 50%;
          color: #7c3aed;
          font-size: 1.2rem;
          transition: 0.3s;
          cursor: pointer;
        }

        .social-icon:hover {
          border-color: #7426e4;
          transform: translateY(-3px);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }

        .social-icon svg {
          transition: 0.3s;
        }

        @media (max-width: 870px) {
          .container {
            min-height: 800px;
            height: 100vh;
          }
          .signin-signup {
            width: 100%;
            top: 95%;
            transform: translate(-50%, -100%);
            transition: 1s 0.8s ease-in-out;
          }
          .signin-signup,
          .container.sign-up-mode .signin-signup {
            left: 50%;
          }
          .panels-container {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 2fr 1fr;
          }
          .panel {
            flex-direction: row;
            justify-content: space-around;
            align-items: center;
            padding: 2.5rem 8%;
            grid-column: 1 / 2;
          }
          .right-panel {
            grid-row: 3 / 4;
          }
          .left-panel {
            grid-row: 1 / 2;
          }
          .panel .content {
            padding-right: 15%;
            transition: transform 0.9s ease-in-out;
            transition-delay: 0.8s;
          }
          .panel h3 {
            font-size: 1.2rem;
          }
          .panel p {
            font-size: 0.7rem;
            padding: 0.5rem 0;
          }
          .btn.transparent {
            width: 110px;
            height: 35px;
            font-size: 0.7rem;
          }
          .container:before {
            width: 1500px;
            height: 1500px;
            transform: translateX(-50%);
            left: 30%;
            bottom: 68%;
            right: initial;
            top: initial;
            transition: 2s ease-in-out;
          }
          .container.sign-up-mode:before {
            transform: translate(-50%, 100%);
            bottom: 32%;
            right: initial;
          }
          .container.sign-up-mode .left-panel .content {
            transform: translateY(-300px);
          }
          .container.sign-up-mode .right-panel .content {
            transform: translateY(0px);
          }
          .right-panel .content {
            transform: translateY(300px);
          }
          .container.sign-up-mode .signin-signup {
            top: 5%;
            transform: translate(-50%, 0);
          }
        }

        @media (max-width: 570px) {
          form {
            padding: 0 1.5rem;
          }
          .panel .content {
            padding: 0.5rem 1rem;
          }
        }
      `}</style>

      <div className="container">
        <div className="brand">
          <img src="/novura-erp-logo.svg" alt="Novura ERP" />
        </div>
        <div className="forms-container">
          <div className="signin-signup">
            <form className="sign-in-form" onSubmit={handleSignIn}>
              <h2 className="title">Boas vindas ao Novura</h2>
              <p className="form-subtitle">
                  Faça login para continuar.
              </p>
              <div className="input-field">
                <input type="email" placeholder="E-mail" value={emailLogin} onChange={(e) => setEmailLogin(e.target.value)} required />
              </div>
              <div className="input-field">
                <input type="password" placeholder="Senha" value={passwordLogin} onChange={(e) => setPasswordLogin(e.target.value)} required />
              </div>
              {error && !isSignUp && <div className="error">{error}</div>}
              <button type="submit" className="btn solid" disabled={isLoading}>{isLoading ? "Entrando..." : "Entrar"}</button>
            </form>

            <form className="sign-up-form" onSubmit={handleSignUp}>
              <h2 className="title">Comece agora seu teste grátis</h2>
              <p className="form-subtitle">transforme sua gestão de forma simples e rápida!</p>

              {!otpOpen && (
                <>
                  <div className="input-field">
                    <input type="text" placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="input-field">
                    <input type="email" placeholder="E-mail" value={emailSignup} onChange={(e) => setEmailSignup(e.target.value)} required />
                  </div>
                  <div className="input-field">
                    <input
                      type="tel"
                      placeholder="Telefone (XX) 9XXXX-XXXX"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="input-field">
                    <input type="password" placeholder="Senha" value={passwordSignup} onChange={(e) => setPasswordSignup(e.target.value)} required />
                  </div>
                  {error && isSignUp && <div className="error">{error}</div>}
                  <button type="submit" className="btn" disabled={isLoading}>{isLoading ? "Criando..." : "Começa grátis"}</button>
                </>
              )}

              {otpOpen && (
                <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: '12px' }}>
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
                  {otpMessage && <div className="error" style={{ marginTop: 0 }}>{otpMessage}</div>}
                  <button type="button" className="btn" onClick={handleOtpVerify}>Verificar código</button>
                  <button type="button" className="btn transparent" onClick={handleOtpResend} disabled={!canResend}>
                    {canResend ? "Reenviar código" : `Reenviar em ${String(Math.floor(timeLeft/60)).padStart(2,'0')}:${String(timeLeft%60).padStart(2,'0')}`}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="panels-container">
          <div className="panel left-panel">
            <div className="content">
              <h3>Novo por aqui?</h3>
              <p>Crie sua conta e comece em segundos.</p>
              <button className="btn transparent" onClick={() => setIsSignUp(true)}>
                Cadastrar-se
              </button>
            </div>
          </div>

          <div className="panel right-panel">
            <div className="content">
              <h3>Já tem conta?</h3>
              <p>Bem-vindo ao Novura! Faça login para continuar.</p>
              <button className="btn transparent" onClick={() => setIsSignUp(false)}>
                Entrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
