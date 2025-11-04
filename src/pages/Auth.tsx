
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, Loader2, HelpCircle, Mail, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import LoadingOverlay from "@/components/LoadingOverlay";

// Animated eye pupil component
interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}
const Pupil = ({ size = 12, maxDistance = 5, pupilColor = "black", forceLookX, forceLookY }: PupilProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const pupilRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { setMouseX(e.clientX); setMouseY(e.clientY); };
    window.addEventListener("mousemove", handleMouseMove);
    return () => { window.removeEventListener("mousemove", handleMouseMove); };
  }, []);
  const calculatePupilPosition = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) { return { x: forceLookX, y: forceLookY }; }
    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;
    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    return { x, y };
  };
  const pupilPosition = calculatePupilPosition();
  return (
    <div ref={pupilRef} className="rounded-full" style={{ width: `${size}px`, height: `${size}px`, backgroundColor: pupilColor, transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`, transition: 'transform 0.1s ease-out' }} />
  );
};

// Animated eyeball component
interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}
const EyeBall = ({ size = 48, pupilSize = 16, maxDistance = 10, eyeColor = "white", pupilColor = "black", isBlinking = false, forceLookX, forceLookY }: EyeBallProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const eyeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { setMouseX(e.clientX); setMouseY(e.clientY); };
    window.addEventListener("mousemove", handleMouseMove);
    return () => { window.removeEventListener("mousemove", handleMouseMove); };
  }, []);
  const calculatePupilPosition = () => {
    if (!eyeRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) { return { x: forceLookX, y: forceLookY }; }
    const eye = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = eye.left + eye.width / 2;
    const eyeCenterY = eye.top + eye.height / 2;
    const deltaX = mouseX - eyeCenterX;
    const deltaY = mouseY - eyeCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    return { x, y };
  };
  const pupilPosition = calculatePupilPosition();
  return (
    <div ref={eyeRef} className="rounded-full flex items-center justify-center transition-all duration-150" style={{ width: `${size}px`, height: isBlinking ? '2px' : `${size}px`, backgroundColor: eyeColor, overflow: 'hidden' }}>
      {!isBlinking && (
        <div className="rounded-full" style={{ width: `${pupilSize}px`, height: `${pupilSize}px`, backgroundColor: pupilColor, transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`, transition: 'transform 0.1s ease-out' }} />
      )}
    </div>
  );
};

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const [error, setError] = useState<string>('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const loginLoadingTimeoutRef = useRef<number | null>(null);
  const loginLoadingShownAtRef = useRef<number | null>(null);
  const MIN_LOGIN_LOADER_MS = 5000;

  // Redirect if already authenticated
  useEffect(() => { if (user && !isLoginLoading) { navigate('/', { replace: true }); } }, [user, isLoginLoading, navigate]);

  // Animation states
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  const defaultTab = searchParams.get('tab') || 'login';
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Redirect if already authenticated
  useEffect(() => { if (user) { navigate('/', { replace: true }); } }, [user, navigate]);

  const switchTo = (tab: 'login' | 'signup') => { setActiveTab(tab); navigate(`/auth?tab=${tab}`, { replace: true }); };

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { setMouseX(e.clientX); setMouseY(e.clientY); };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Blinking effects
  useEffect(() => {
    const scheduleBlink = () => {
      const timeout = setTimeout(() => {
        setIsPurpleBlinking(true);
        setTimeout(() => { setIsPurpleBlinking(false); scheduleBlink(); }, 150);
      }, Math.random() * 4000 + 3000);
      return timeout;
    };
    const t = scheduleBlink();
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const scheduleBlink = () => {
      const timeout = setTimeout(() => {
        setIsBlackBlinking(true);
        setTimeout(() => { setIsBlackBlinking(false); scheduleBlink(); }, 150);
      }, Math.random() * 4000 + 3000);
      return timeout;
    };
    const t = scheduleBlink();
    return () => clearTimeout(t);
  }, []);

  // Look at each other effect when typing
  useEffect(() => {
    if (isTyping) {
      setIsLookingAtEachOther(true);
      const timer = setTimeout(() => { setIsLookingAtEachOther(false); }, 800);
      return () => clearTimeout(timer);
    } else {
      setIsLookingAtEachOther(false);
    }
  }, [isTyping]);

  // Purple peeking when password is visible
  useEffect(() => {
    if (password.length > 0 && showPassword) {
      const schedulePeek = () => {
        const timeout = setTimeout(() => {
          setIsPurplePeeking(true);
          setTimeout(() => { setIsPurplePeeking(false); }, 800);
        }, Math.random() * 3000 + 2000);
        return timeout;
      };
      const t = schedulePeek();
      return () => clearTimeout(t);
    } else {
      setIsPurplePeeking(false);
    }
  }, [password, showPassword]);

  const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;
    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;
    const faceX = Math.max(-15, Math.min(15, deltaX / 20));
    const faceY = Math.max(-10, Math.min(10, deltaY / 30));
    const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));
    return { faceX, faceY, bodySkew };
  };
  const purplePos = calculatePosition(purpleRef);
  const blackPos = calculatePosition(blackRef);
  const yellowPos = calculatePosition(yellowRef);
  const orangePos = calculatePosition(orangeRef);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setIsLoading(true);
    setIsLoginLoading(true);
    loginLoadingShownAtRef.current = Date.now();
    if (loginLoadingTimeoutRef.current) {
      clearTimeout(loginLoadingTimeoutRef.current);
    }
    loginLoadingTimeoutRef.current = window.setTimeout(() => {
      setIsLoginLoading(false);
      loginLoadingTimeoutRef.current = null;
    }, 5000);

    const { error: signInError } = await signIn(email, password);
    setIsLoading(false);

    // Garante tempo mínimo de exibição do loader
    const shownAt = loginLoadingShownAtRef.current ?? Date.now();
    const elapsed = Date.now() - shownAt;
    const remaining = Math.max(0, MIN_LOGIN_LOADER_MS - elapsed);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    if (loginLoadingTimeoutRef.current) {
      clearTimeout(loginLoadingTimeoutRef.current);
      loginLoadingTimeoutRef.current = null;
    }
    setIsLoginLoading(false);
    loginLoadingShownAtRef.current = null;

    if (signInError) {
      setError(signInError.message || 'Falha ao entrar.');
      return;
    }
    navigate('/', { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email,
          password,
          metadata: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (error) {
        console.error('Erro na função create-user:', error);
      } else if ((data as any)?.error) {
        console.error('Erro retornado pela função create-user:', (data as any).error);
      }
    } catch (err) {
      console.error('Falha ao invocar create-user:', err);
    } finally {
      setIsLoading(false);
    }
    // Não redireciona no cadastro - usuário precisa confirmar o email
  };

  return (
    <div className="min-h-screen bg-background">
      {activeTab === 'login' && isLoginLoading && <LoadingOverlay fullscreen />}
      <div className="grid lg:grid-cols-2 h-full min-h-screen">
        {/* Lado esquerdo - animação personalizada para Login; mantém original no Signup */}
        <div className="hidden lg:flex flex-col border-r bg-white/70 backdrop-blur-sm relative">
          {activeTab === 'login' ? (
            <div className="relative flex-1 flex flex-col justify-between bg-gradient-to-br from-primary/90 via-primary to-primary/80 p-12 text-primary-foreground">
              <div className="relative z-20">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <div className="size-8 rounded-lg bg-primary-foreground/10 backdrop-blur-sm flex items-center justify-center">
                    <Sparkles className="size-4" />
                  </div>
                  <span>Novura</span>
                </div>
              </div>
              <div className="relative z-20 flex items-end justify-center h-[500px]">
                <div className="relative" style={{ width: '550px', height: '400px' }}>
                  {/* Purple */}
                  <div ref={purpleRef} className="absolute bottom-0 transition-all duration-700 ease-in-out" style={{ left: '70px', width: '180px', height: (isTyping || (password.length > 0 && !showPassword)) ? '440px' : '400px', backgroundColor: '#6C3FF5', borderRadius: '10px 10px 0 0', zIndex: 1, transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : (isTyping || (password.length > 0 && !showPassword)) ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px)` : `skewX(${purplePos.bodySkew || 0}deg)`, transformOrigin: 'bottom center' }}>
                    <div className="absolute flex gap-8 transition-all duration-700 ease-in-out" style={{ left: (password.length > 0 && showPassword) ? `${20}px` : isLookingAtEachOther ? `${55}px` : `${45 + purplePos.faceX}px`, top: (password.length > 0 && showPassword) ? `${35}px` : isLookingAtEachOther ? `${65}px` : `${40 + purplePos.faceY}px` }}>
                      <EyeBall size={18} pupilSize={7} maxDistance={5} eyeColor="white" pupilColor="#2D2D2D" isBlinking={isPurpleBlinking} forceLookX={(password.length > 0 && showPassword) ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined} forceLookY={(password.length > 0 && showPassword) ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined} />
                      <EyeBall size={18} pupilSize={7} maxDistance={5} eyeColor="white" pupilColor="#2D2D2D" isBlinking={isPurpleBlinking} forceLookX={(password.length > 0 && showPassword) ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined} forceLookY={(password.length > 0 && showPassword) ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined} />
                    </div>
                  </div>
                  {/* Black */}
                  <div ref={blackRef} className="absolute bottom-0 transition-all duration-700 ease-in-out" style={{ left: '240px', width: '120px', height: '310px', backgroundColor: '#2D2D2D', borderRadius: '8px 8px 0 0', zIndex: 2, transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : isLookingAtEachOther ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(20px)` : (isTyping || (password.length > 0 && !showPassword)) ? `skewX(${(blackPos.bodySkew || 0) * 1.5}deg)` : `skewX(${blackPos.bodySkew || 0}deg)`, transformOrigin: 'bottom center' }}>
                    <div className="absolute flex gap-6 transition-all duration-700 ease-in-out" style={{ left: (password.length > 0 && showPassword) ? `${10}px` : isLookingAtEachOther ? `${32}px` : `${26 + blackPos.faceX}px`, top: (password.length > 0 && showPassword) ? `${28}px` : isLookingAtEachOther ? `${12}px` : `${32 + blackPos.faceY}px` }}>
                      <EyeBall size={16} pupilSize={6} maxDistance={4} eyeColor="white" pupilColor="#2D2D2D" isBlinking={isBlackBlinking} forceLookX={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? 0 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? -4 : undefined} />
                      <EyeBall size={16} pupilSize={6} maxDistance={4} eyeColor="white" pupilColor="#2D2D2D" isBlinking={isBlackBlinking} forceLookX={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? 0 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? -4 : undefined} />
                    </div>
                  </div>
                  {/* Orange */}
                  <div ref={orangeRef} className="absolute bottom-0 transition-all duration-700 ease-in-out" style={{ left: '0px', width: '240px', height: '200px', zIndex: 3, backgroundColor: '#FF9B6B', borderRadius: '120px 120px 0 0', transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : `skewX(${orangePos.bodySkew || 0}deg)`, transformOrigin: 'bottom center' }}>
                    <div className="absolute flex gap-8 transition-all duration-200 ease-out" style={{ left: (password.length > 0 && showPassword) ? `${50}px` : `${82 + (orangePos.faceX || 0)}px`, top: (password.length > 0 && showPassword) ? `${85}px` : `${90 + (orangePos.faceY || 0)}px` }}>
                      <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                      <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                    </div>
                  </div>
                  {/* Yellow */}
                  <div ref={yellowRef} className="absolute bottom-0 transition-all duration-700 ease-in-out" style={{ left: '310px', width: '140px', height: '230px', backgroundColor: '#E8D754', borderRadius: '70px 70px 0 0', zIndex: 4, transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : `skewX(${yellowPos.bodySkew || 0}deg)`, transformOrigin: 'bottom center' }}>
                    <div className="absolute flex gap-6 transition-all duration-200 ease-out" style={{ left: (password.length > 0 && showPassword) ? `${20}px` : `${52 + (yellowPos.faceX || 0)}px`, top: (password.length > 0 && showPassword) ? `${35}px` : `${40 + (yellowPos.faceY || 0)}px` }}>
                      <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                      <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                    </div>
                    <div className="absolute w-20 h-[4px] bg-[#2D2D2D] rounded-full transition-all duration-200 ease-out" style={{ left: (password.length > 0 && showPassword) ? `${10}px` : `${40 + (yellowPos.faceX || 0)}px`, top: (password.length > 0 && showPassword) ? `${88}px` : `${88 + (yellowPos.faceY || 0)}px` }} />
                  </div>
                </div>
              </div>
              <div className="relative z-20 flex items-center gap-8 text-sm text-primary-foreground/60">
                <a href="#" className="hover:text-primary-foreground transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-primary-foreground transition-colors">Terms of Service</a>
                <a href="#" className="hover:text-primary-foreground transition-colors">Contact</a>
              </div>
              <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
              <div className="absolute top-1/4 right-1/4 size-64 bg-primary-foreground/10 rounded-full blur-3xl" />
              <div className="absolute bottom-1/4 left-1/4 size-96 bg-primary-foreground/5 rounded-full blur-3xl" />
            </div>
          ) : (
            <div className="px-10 pt-10">
              <div className="text-primary font-bold text-xl">Novura</div>
            </div>
          )}
        </div>

        {/* Lado direito - formulários */}
        <div className="flex items-center justify-center p-6 bg-background">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-end text-sm">
              <HelpCircle className="mr-2 h-4 w-4 text-muted-foreground" />
              <a href="#" className="text-muted-foreground hover:underline">Precisa de ajuda?</a>
            </div>
            <Tabs value={activeTab} className="w-full">
              {/* LOGIN */}
              <TabsContent value="login">
                <div className="text-center mb-10">
                  <h1 className="text-3xl font-bold tracking-tight mb-2">Bem-vindo de volta!</h1>
                  <p className="text-muted-foreground text-sm">Digite seus detalhes para entrar</p>
                </div>
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                    <Input id="email" type="email" placeholder="seu@email.com" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} onFocus={() => setIsTyping(true)} onBlur={() => setIsTyping(false)} required className="h-12 bg-background border-border/60 focus:border-primary" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12 pr-10 bg-background border-border/60 focus:border-primary" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPassword ? (<EyeOff className="size-5" />) : (<Eye className="size-5" />)}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="remember" />
                      <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">Lembrar por 30 dias</Label>
                    </div>
                    <a href="#" className="text-sm text-primary hover:underline font-medium">Esqueceu a senha?</a>
                  </div>
                  {error && (
                    <div className="p-3 text-sm text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg">{error}</div>
                  )}
                  <Button type="submit" className="w-full h-12 text-base font-medium" size="lg" disabled={isLoading}>
                    {isLoading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
                <div className="mt-6">
                  <Button variant="outline" className="w-full h-12 bg-background border-border/60 hover:bg-accent" type="button">
                    <Mail className="mr-2 size-5" />
                    Entrar com Google
                  </Button>
                </div>
                <div className="text-center text-sm text-muted-foreground mt-8">
                  Não tem uma conta?{" "}
                  <button type="button" className="text-foreground font-medium hover:underline" onClick={() => switchTo('signup')}>
                    Cadastre-se
                  </button>
                </div>
              </TabsContent>

              {/* CADASTRO (mantém o design e lógica atuais) */}
              <TabsContent value="signup">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold">Comece totalmente grátis</h2>
                  <p className="text-sm text-muted-foreground">
                    Já tem uma conta?{' '}
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => switchTo('login')}
                    >
                      Comece já!
                    </button>
                  </p>
                </div>

                <Card>
                  <CardContent className="pt-6">
                    <form onSubmit={handleSignUp} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="first-name">Primeiro nome</Label>
                          <Input
                            id="first-name"
                            placeholder="Seu nome"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="last-name">Sobrenome</Label>
                          <Input
                            id="last-name"
                            placeholder="Seu sobrenome"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-email">Endereço de email</Label>
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-password">Senha</Label>
                        <div className="relative">
                          <Input
                            id="signup-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="6+ caracteres"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="size-5" />
                            ) : (
                              <Eye className="size-5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Criar uma conta
                      </Button>

                      <p className="text-xs text-muted-foreground text-center">
                        Ao me inscrever, concordo com os <a href="#" className="underline">Termos de serviço</a> e a <a href="#" className="underline">Política de privacidade</a>.
                      </p>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}