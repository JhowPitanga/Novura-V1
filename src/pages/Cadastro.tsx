
import { useState } from "react";
import { Eye, EyeOff, ArrowLeft, Mail, Lock, User, Building, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function Cadastro() {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    senha: "",
    confirmarSenha: ""
  });
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpMessage, setOtpMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [canResend, setCanResend] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.senha !== formData.confirmarSenha) {
      // opcional: mostrar toast de senha diferente
      return;
    }
    setIsLoading(true);
    const { error } = await signUp(formData.email, formData.senha, { full_name: formData.nome });
    setIsLoading(false);
    if (!error) {
      setOtp(["", "", "", "", "", ""]);
      setTimeLeft(60);
      setCanResend(false);
      setOtpMessage("");
      setOtpOpen(true);
      setTimeout(() => {
        try { document.getElementById("otp-0")?.focus(); } catch {}
      }, 50);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleOtpChange = (value: string, index: number) => {
    if (/^\d?$/.test(value)) {
      const updated = [...otp];
      updated[index] = value;
      setOtp(updated);
      if (value && index < otp.length - 1) {
        const nextInput = document.getElementById(`otp-${index + 1}`) as HTMLInputElement | null;
        nextInput?.focus();
      }
    }
  };

  const handleOtpVerify = async () => {
    const token = otp.join("");
    if (!token || otp.some((d) => d === "")) {
      setOtpMessage("Informe todo o código");
      return;
    }
    try {
      const { error } = await supabase.auth.verifyOtp({ email: formData.email, token, type: 'signup' as any });
      if (error) {
        setOtpMessage("Código inválido ou expirado");
        return;
      }
      setOtpMessage("Verificação concluída. Você pode fazer login.");
      setTimeout(() => navigate('/auth'), 600);
    } catch {
      setOtpMessage("Falha ao verificar o código");
    }
  };

  const handleOtpResend = async () => {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: formData.email } as any);
      if (error) {
        setOtpMessage("Falha ao reenviar código");
        return;
      }
      setOtp(["", "", "", "", "", ""]);
      setTimeLeft(60);
      setCanResend(false);
      setOtpMessage("Código reenviado para o seu email");
      setTimeout(() => {
        try { document.getElementById("otp-0")?.focus(); } catch {}
      }, 50);
    } catch {
      setOtpMessage("Falha ao reenviar código");
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  useState(() => {
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setCanResend(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao site</span>
          </Link>
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-novura-primary to-purple-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Novura</h1>
              <p className="text-sm text-gray-500">ERP Inteligente</p>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Crie sua conta grátis</h2>
          <p className="text-gray-600">Comece sua jornada de sucesso hoje mesmo</p>
        </div>

        {/* Signup Form */}
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-center text-lg">Criar nova conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Seu nome completo"
                    value={formData.nome}
                    onChange={(e) => handleInputChange("nome", e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              

              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="senha"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={formData.senha}
                    onChange={(e) => handleInputChange("senha", e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmarSenha">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="confirmarSenha"
                    type="password"
                    placeholder="Confirme sua senha"
                    value={formData.confirmarSenha}
                    onChange={(e) => handleInputChange("confirmarSenha", e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox id="terms" className="mt-1" checked={termsAccepted} onCheckedChange={(v) => setTermsAccepted(Boolean(v))} required />
                <Label htmlFor="terms" className="text-sm text-gray-600 leading-relaxed">
                  Eu aceito os{" "}
                  <Link to="/termos" className="text-novura-primary hover:underline">
                    Termos de Uso
                  </Link>{" "}
                  e{" "}
                  <Link to="/privacidade" className="text-novura-primary hover:underline">
                    Política de Privacidade
                  </Link>
                </Label>
              </div>

              <Button type="submit" className="w-full bg-novura-primary hover:bg-novura-primary/90" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Conta Grátis
              </Button>
            </form>

            {/* OAuth providers removed */}

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Já tem uma conta?{" "}
                <Link to="/auth" className="text-novura-primary hover:underline font-medium">
                  Fazer login
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={otpOpen} onOpenChange={setOtpOpen}>
        <DialogContent className="sm:max-w-sm rounded-xl p-6 z-[10000]">
          <DialogHeader className="text-center mb-4">
            <DialogTitle className="text-lg font-semibold">Verificação OTP</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              Digite o código enviado para <strong>{formData.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <p className="text-center text-xs text-muted-foreground mb-4">Etapa 1 de 1: Verifique sua conta</p>
          <div className="flex justify-center gap-3 mb-4">
            {otp.map((digit, idx) => (
              <Input
                key={idx}
                id={`otp-${idx}`}
                value={digit}
                onChange={(e) => handleOtpChange(e.target.value, idx)}
                className="w-12 h-12 text-center text-lg font-medium rounded-md border border-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                maxLength={1}
              />
            ))}
          </div>
          {!canResend && (
            <p className="text-center text-xs text-muted-foreground mb-2">
              Você pode reenviar em <strong>{formatTime(timeLeft)}</strong>
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Button className="w-full" onClick={handleOtpVerify}>Verificar OTP</Button>
            <Button variant="outline" className="w-full flex justify-between items-center" onClick={handleOtpResend} disabled={!canResend}>
              {canResend ? "Enviar novamente" : "Reenviar OTP"}
              {!canResend && (<span className="text-xs text-muted-foreground">{formatTime(timeLeft)}</span>)}
            </Button>
          </div>
          {otpMessage && (<p className="mt-3 text-center text-sm text-muted-foreground">{otpMessage}</p>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
