
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, Loader2, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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

  const defaultTab = searchParams.get('tab') || 'login';
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const switchTo = (tab: 'login' | 'signup') => {
    setActiveTab(tab);
    navigate(`/auth?tab=${tab}`, { replace: true });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (!error) {
      navigate('/', { replace: true });
    }
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="grid lg:grid-cols-2 h-full min-h-screen">
        {/* Lado esquerdo - boas-vindas e ilustração */}
        <div className="hidden lg:flex flex-col border-r bg-white/70 backdrop-blur-sm">
          <div className="px-10 pt-10">
            <div className="text-indigo-600 font-bold text-xl">Novura</div>
          </div>

          <div className="flex-1 flex items-center justify-center p-10">
            <div className="max-w-md">
              <h1 className="text-3xl font-bold mb-2">
                {activeTab === 'login' ? 'Olá, bem-vindo de volta' : 'Gerenciar o trabalho'}
              </h1>
              <p className="text-muted-foreground mb-8">
                Mais eficazmente com fluxos de trabalho otimizados.
              </p>
              <img
                src="/placeholder.svg"
                alt="Ilustração"
                className="rounded-xl shadow-md w-full"
              />

              <div className="mt-6 flex items-center gap-4 text-muted-foreground">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">★</span>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">✓</span>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">⚡</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lado direito - formulários */}
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-end text-sm">
              <HelpCircle className="mr-2 h-4 w-4 text-muted-foreground" />
              <a href="#" className="text-muted-foreground hover:underline">Precisa de ajuda?</a>
            </div>

            <Tabs value={activeTab} className="w-full">
              {/* LOGIN */}
              <TabsContent value="login">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold">Entre na sua conta</h2>
                  <p className="text-sm text-muted-foreground">
                    Não tem uma conta?{' '}
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => switchTo('signup')}
                    >
                      Comece agora mesmo
                    </button>
                  </p>
                </div>


                <Card>
                  <CardContent className="pt-6">
                    <form onSubmit={handleSignIn} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Endereço de email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="seu@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Senha</Label>
                          <a href="#" className="text-xs text-muted-foreground hover:underline">Esqueceu sua senha?</a>
                        </div>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Digite sua senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Entrar
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CADASTRO */}
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
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
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
