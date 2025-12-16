import { useToast } from '@/hooks/use-toast';
import { Session, User } from '@supabase/supabase-js';
import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signUp: (email: string, password: string, meta?: Record<string, any>) => Promise<{ error: any, userId?: string }>; 
    signIn: (email: string, password: string) => Promise<{ error: any }>; 
    signOut: () => Promise<void>; 
    organizationId: string | null; 
    permissions: Record<string, Record<string, boolean>> | null; 
    userRole: string | null; 
    globalRole: string | null; 
    moduleSwitches: Record<string, any> | null;
    displayName: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);



export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>> | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [globalRole, setGlobalRole] = useState<string | null>(null);
    const [moduleSwitches, setModuleSwitches] = useState<Record<string, any> | null>(null);
    const [displayName, setDisplayName] = useState<string | null>(null);
    const initDoneRef = useRef(false);
    async function loadAccessContext(u: User | null) {
        try {
            if (!u) {
                setOrganizationId(null);
                setPermissions(null);
                setUserRole(null);
                setGlobalRole(null);
                setModuleSwitches(null);
                return;
            }

            const cacheKey = `access_context:${u.id}`;
            const raw = sessionStorage.getItem(cacheKey);
            let fromCache: any = null;
            if (raw) {
                try { fromCache = JSON.parse(raw); } catch {}
            }
            const now = Date.now();
            const ttlMs = 5 * 60 * 1000;
            const validCache = fromCache && typeof fromCache === 'object' && Number.isFinite(fromCache.cachedAt) && (now - fromCache.cachedAt) < ttlMs;

            if (validCache) {
                setOrganizationId(fromCache.organization_id || null);
                setPermissions(fromCache.permissions || {});
                setUserRole(fromCache.role || 'member');
                setGlobalRole(fromCache.global_role || null);
                setModuleSwitches(fromCache.module_switches || {});
                setDisplayName(fromCache.display_name || null);
                return;
            }

            // @ts-expect-error – RPC not typed by Supabase codegen yet
            const { data, error } = await supabase.rpc('rpc_get_user_access_context', { p_user_id: u.id });
            if (error) {
                setOrganizationId(null);
                setPermissions({});
                setUserRole('member');
                setGlobalRole(null);
                setModuleSwitches({});
                return;
            }
            const ctx = Array.isArray(data) ? (data?.[0] as any) : (data as any);
            setOrganizationId(ctx?.organization_id || null);
            setPermissions(ctx?.permissions || {});
            setUserRole(ctx?.role || 'member');
            setGlobalRole(ctx?.global_role || null);
            setModuleSwitches(ctx?.module_switches || {});
            setDisplayName(ctx?.display_name || null);
            sessionStorage.setItem(cacheKey, JSON.stringify({ ...(ctx || {}), cachedAt: Date.now() }));
        } catch (e) {
            setOrganizationId(null);
            setPermissions({});
            setUserRole('member');
            setGlobalRole(null);
            setModuleSwitches({});
            setDisplayName(null);
        }
    }

    // Atualiza permissões/role em tempo real quando houver alterações no registro de membership
    useEffect(() => {
        if (!user || !organizationId) return;

        const channel = supabase
            .channel(`org-membership-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'organization_members',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    try {
                        const row = (payload.new as any) ?? (payload.old as any) ?? {};
                        const newOrg = row?.organization_id;
                        if (newOrg === organizationId) {
                            setPermissions(row?.permissions || {});
                            setUserRole(row?.role || 'member');
                            setModuleSwitches(row?.module_switches || {});
                            const cacheKey = `access_context:${user.id}`;
                            const raw = sessionStorage.getItem(cacheKey);
                            let prev: any = null;
                            if (raw) { try { prev = JSON.parse(raw); } catch {} }
                            const next = { ...(prev || {}), organization_id: organizationId, permissions: row?.permissions || {}, role: row?.role || 'member', module_switches: row?.module_switches || {} };
                            sessionStorage.setItem(cacheKey, JSON.stringify({ ...next, cachedAt: Date.now() }));
                        }
                    } catch (e) {
                        console.warn('Falha ao processar atualização de permissões em tempo real:', e);
                    }
                }
            )
            .subscribe();

        return () => {
            try { supabase.removeChannel(channel); } catch { /* noop */ }
        };
    }, [user?.id, organizationId]);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setSession(session);
                const currentUser = session?.user ?? null;
                setUser(currentUser);
                (async () => {
                    if (!initDoneRef.current) {
                        await loadAccessContext(currentUser);
                        setLoading(false);
                        initDoneRef.current = true;
                    }
                })();
            }
        );

        supabase.auth.getSession().then(async ({ data: { session } }) => {
            setSession(session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);
            if (!initDoneRef.current) {
                await loadAccessContext(currentUser);
                setLoading(false);
                initDoneRef.current = true;
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signUp = async (email: string, password: string, meta?: Record<string, any>) => {
        try {
            const { data, error } = await supabase.auth.signUp({ email, password, options: { data: meta || {} } });

            let message = 'Erro ao criar conta';
            if (error) {
                if (error.message?.includes('already registered')) {
                    message = 'Este email já está cadastrado. Tente fazer login.';
                } else if (error.message?.includes('password')) {
                    message = 'A senha deve ter pelo menos 6 caracteres.';
                } else if (error.message?.includes('email')) {
                    message = 'Por favor, insira um email válido.';
                } else if (String(error.message || '').includes('Unexpected status code returned from hook')) {
                    message = 'Falha no hook de cadastro. Tente novamente em alguns minutos.';
                } else if ((error as any).status === 500) {
                    message = 'Erro interno no serviço de autenticação. Verifique as configurações de Authentication > Email no Supabase.';
                }

                toast({ title: "Erro no cadastro", description: message, variant: "destructive" });
                return { error };
            }

            toast({
                title: "Conta criada com sucesso!",
                description: "Verifique seu email para confirmar com o código.",
            });

            const createdUser = data?.user ?? (await supabase.auth.getUser()).data.user;
            if (createdUser) {
                await ensureEditorRecord(createdUser);
                await ensurePublicUserRecord(createdUser);
                try {
                    await supabase.rpc('rpc_bootstrap_user_org', { p_user_id: createdUser.id });
                } catch (_) { }
                    await loadAccessContext(createdUser);
            }

            return { error: null, userId: createdUser?.id };
        } catch (err) {
            console.error('SignUp error:', err);
            return { error: err };
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                let message = 'Erro ao fazer login';
                if (error.message.includes('Invalid login credentials')) {
                    message = 'Email ou senha incorretos.';
                } else if (error.message.includes('Email not confirmed')) {
                    message = 'Por favor, confirme seu email antes de fazer login.';
                } else if (error.message.includes('Refresh Token')) {
                    try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
                    message = 'Sessão inválida. Tente novamente.';
                }

                toast({
                    title: "Erro no login",
                    description: message,
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "Login realizado com sucesso!",
                    description: "Bem-vindo de volta.",
                });
                const currentUser = data?.user ?? (await supabase.auth.getUser()).data.user;
                if (currentUser) {
                    await ensureEditorRecord(currentUser);
                    await ensurePublicUserRecord(currentUser);
                    await loadAccessContext(currentUser);
                }
            }

            return { error };
        } catch (err) {
            console.error('SignIn error:', err);
            return { error: err };
        }
    };

    const signOut = async () => {
        try {
            // Verifica se existe sessão antes de deslogar globalmente
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                // Sem sessão: limpa apenas armazenamento local
                await supabase.auth.signOut({ scope: 'local' });
            } else {
                // Com sessão: encerra globalmente (revoga tokens) 
                const { error } = await supabase.auth.signOut({ scope: 'global' });
                if (error) throw error;
            }

            toast({
                title: "Logout realizado",
                description: "Você foi desconectado com sucesso.",
            });
            setOrganizationId(null);
            setPermissions(null);
            setUserRole(null);
            setGlobalRole(null);
            setModuleSwitches(null);
            setDisplayName(null);
        } catch (err: any) {
            // Trata caso específico: Auth session missing
            const msg = String(err?.message || '').toLowerCase();
            if (msg.includes('auth session missing')) {
                try {
                    await supabase.auth.signOut({ scope: 'local' });
                } catch (_) { /* no-op */ }
                toast({
                    title: "Logout realizado",
                    description: "Você foi desconectado com sucesso.",
                });
                setOrganizationId(null);
                setPermissions(null);
                setUserRole(null);
                setGlobalRole(null);
                setModuleSwitches(null);
                setDisplayName(null);
                return;
            }

            // Silencia erros de requisição abortada (ex.: navegação interrompe a call)
            if (err?.name === 'AbortError' || msg.includes('abort') || msg.includes('aborted')) {
                setOrganizationId(null);
                setPermissions(null);
                setUserRole(null);
                setGlobalRole(null);
                setModuleSwitches(null);
                setDisplayName(null);
                toast({
                    title: "Logout realizado",
                    description: "Você foi desconectado com sucesso.",
                });
                return;
            }

            console.error('SignOut error:', err);
            toast({
                title: "Erro",
                description: "Erro ao fazer logout.",
                variant: "destructive",
            });
        }
    };

    const value = {
        user,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        organizationId,
        permissions,
        userRole,
        globalRole,
        moduleSwitches,
        displayName,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

async function ensureEditorRecord(user: User) {
    try {
        const { data: existing } = await supabase
            .from('editor' as any)
            .select('user_id')
            .eq('user_id', user.id)
            .limit(1);

        if (!existing || existing.length === 0) {
            const payload: any = {
                user_id: user.id,
                email: user.email,
            };

            await supabase
                .from('editor' as any)
                .insert(payload);
        }
    } catch (e) {
        console.error('Falha ao garantir editor:', e);
    }
}

async function ensurePublicUserRecord(user: User) {
    try {
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('id', user.id)
            .limit(1);

        if (!existing || existing.length === 0) {
            await supabase
                .from('users')
                .insert({ id: user.id });
        }
    } catch (e) {
        console.error('Falha ao garantir registro em users:', e);
    }
}
