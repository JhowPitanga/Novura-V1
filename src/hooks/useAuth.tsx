import { useToast } from '@/hooks/use-toast';
import { Session, User } from '@supabase/supabase-js';
import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signUp: (email: string, password: string) => Promise<{ error: any }>;
    signIn: (email: string, password: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    organizationId: string | null;
    permissions: Record<string, Record<string, boolean>> | null;
    userRole: string | null;
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
    const initDoneRef = useRef(false);

    async function resolveOrganizationId(u: User | null) {
        try {
            if (!u) {
                setOrganizationId(null);
                setPermissions(null);
                setUserRole(null);
                return;
            }

            // 1) Tenta via metadados do usuário
            const metaOrg = (u.user_metadata as any)?.organization_id as string | undefined;
            if (metaOrg) {
                setOrganizationId(metaOrg);
                await loadUserPermissionsAndRole(u.id, metaOrg);
                return;
            }

            // 2) Tenta via RPC que resolve organização atual por membership (evita criar org indevida)
            const { data: rpcOrgId, error: rpcErr } = await supabase.rpc('get_current_user_organization_id');
            if (rpcErr) {
                const m = String((rpcErr as any)?.message || (rpcErr as any)?.name || '').toLowerCase();
                if (!m.includes('abort') && !m.includes('aborted')) {
                    console.warn('Falha ao obter organização via RPC get_current_user_organization_id:', rpcErr);
                }
            }
            const orgIdFromRpc = Array.isArray(rpcOrgId) ? (rpcOrgId?.[0] as string | undefined) : (rpcOrgId as string | undefined);
            if (orgIdFromRpc) {
                setOrganizationId(orgIdFromRpc);
                await loadUserPermissionsAndRole(u.id, orgIdFromRpc);
                return;
            }

            // 3) Sem organização resolvida: manter contexto vazio (evita chamadas RPC não tipadas)
            setOrganizationId(null);
            setPermissions(null);
            setUserRole(null);
        } catch (e) {
            const m = String((e as any)?.message || (e as any)?.name || '').toLowerCase();
            if (!m.includes('abort') && !m.includes('aborted')) {
                console.warn('Falha ao resolver organization_id do usuário', e);
            }
            setOrganizationId(null);
            setPermissions(null);
            setUserRole(null);
        }
    }

    async function loadUserPermissionsAndRole(userId: string, orgId: string) {
        try {
            const { data: perms, error: permsErr } = await supabase.rpc('get_user_permissions', {
                p_user_id: userId,
                p_organization_id: orgId,
            });
            if (permsErr) {
                console.warn('Erro ao carregar permissões do usuário (RPC):', permsErr);
                setPermissions({});
            } else {
                const p = Array.isArray(perms) ? (perms[0] as any) : (perms as any);
                setPermissions(p || {});
            }

            const { data: memberRow } = await supabase
                .from('organization_members')
                .select('role')
                .eq('organization_id', orgId)
                .eq('user_id', userId)
                .maybeSingle();
            setUserRole((memberRow as any)?.role || 'member');
        } catch (e) {
            console.warn('Falha ao carregar permissões e role do usuário (RPC)', e);
            setPermissions({});
            setUserRole('member');
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
                        const newOrg = (payload.new as any)?.organization_id ?? (payload.old as any)?.organization_id;
                        if (newOrg === organizationId) {
                            loadUserPermissionsAndRole(user.id, organizationId);
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
                        await resolveOrganizationId(currentUser);
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
            await resolveOrganizationId(currentUser);
            setLoading(false);
            initDoneRef.current = true;
        });

        return () => subscription.unsubscribe();
    }, []);

    const signUp = async (email: string, password: string) => {
        try {
            // Cadastro mínimo (sem chamar Edge Function). Funciona imediatamente quando "Confirmar email" está desativado.
            const { data, error } = await supabase.auth.signUp({ email, password });

            let message = 'Erro ao criar conta';
            if (error) {
                if (error.message?.includes('already registered')) {
                    message = 'Este email já está cadastrado. Tente fazer login.';
                } else if (error.message?.includes('password')) {
                    message = 'A senha deve ter pelo menos 6 caracteres.';
                } else if (error.message?.includes('email')) {
                    message = 'Por favor, insira um email válido.';
                } else if ((error as any).status === 500) {
                    message = 'Erro interno no serviço de autenticação. Verifique as configurações de Authentication > Email no Supabase.';
                }

                toast({
                    title: "Erro no cadastro",
                    description: message,
                    variant: "destructive",
                });
                return { error };
            }

            toast({
                title: "Conta criada com sucesso!",
                description: "Cadastro concluído.",
            });

            const createdUser = data?.user ?? (await supabase.auth.getUser()).data.user;
            if (createdUser) {
                await ensureEditorRecord(createdUser);
                await ensurePublicUserRecord(createdUser);
                await resolveOrganizationId(createdUser);
            }

            return { error: null };
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
                    await resolveOrganizationId(currentUser);
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
                return;
            }

            // Silencia erros de requisição abortada (ex.: navegação interrompe a call)
            if (err?.name === 'AbortError' || msg.includes('abort') || msg.includes('aborted')) {
                setOrganizationId(null);
                setPermissions(null);
                setUserRole(null);
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