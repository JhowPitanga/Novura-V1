import { useToast } from '@/hooks/use-toast';
import { Session, User } from '@supabase/supabase-js';
import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import {
    loadAccessContext as loadAccessContextService,
    ensureEditorRecord,
    ensurePublicUserRecord,
    bootstrapUserOrg,
    cacheAccessContext,
    type AccessContext,
} from '@/services/auth.service';

interface AuthState {
    organizationId: string | null;
    permissions: Record<string, Record<string, boolean>> | null;
    userRole: string | null;
    globalRole: string | null;
    moduleSwitches: Record<string, any> | null;
    displayName: string | null;
}

const emptyAuthState: AuthState = {
    organizationId: null,
    permissions: null,
    userRole: null,
    globalRole: null,
    moduleSwitches: null,
    displayName: null,
};

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

function applyAccessContext(ctx: AccessContext | null): AuthState {
    if (!ctx) return emptyAuthState;
    return {
        organizationId: ctx.organization_id,
        permissions: ctx.permissions,
        userRole: ctx.role,
        globalRole: ctx.global_role,
        moduleSwitches: ctx.module_switches,
        displayName: ctx.display_name,
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [authState, setAuthState] = useState<AuthState>(emptyAuthState);
    const { toast } = useToast();
    const initDoneRef = useRef(false);

    async function loadContext(u: User | null) {
        try {
            const ctx = await loadAccessContextService(u);
            setAuthState(applyAccessContext(ctx));
        } catch {
            setAuthState({ ...emptyAuthState, permissions: {}, userRole: 'member' });
        }
    }

    // Real-time membership updates
    useEffect(() => {
        if (!user || !authState.organizationId) return;

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
                        if (row?.organization_id !== authState.organizationId) return;

                        setAuthState(prev => ({
                            ...prev,
                            permissions: row?.permissions || {},
                            userRole: row?.role || 'member',
                            moduleSwitches: row?.module_switches || {},
                        }));

                        // Update cache
                        const cacheKey = `access_context:${user.id}`;
                        const raw = sessionStorage.getItem(cacheKey);
                        let prev: any = null;
                        if (raw) { try { prev = JSON.parse(raw); } catch {} }
                        cacheAccessContext(user.id, {
                            ...(prev || {}),
                            organization_id: authState.organizationId,
                            permissions: row?.permissions || {},
                            role: row?.role || 'member',
                            module_switches: row?.module_switches || {},
                        });
                    } catch (e) {
                        console.warn('Failed to process real-time permission update:', e);
                    }
                }
            )
            .subscribe();

        return () => {
            try { supabase.removeChannel(channel); } catch { /* noop */ }
        };
    }, [user?.id, authState.organizationId]);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setSession(session);
                const currentUser = session?.user ?? null;
                setUser(currentUser);
                (async () => {
                    if (!initDoneRef.current) {
                        await loadContext(currentUser);
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
                await loadContext(currentUser);
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
                await bootstrapUserOrg(createdUser.id);
                await loadContext(createdUser);
            }

            return { error: null, userId: createdUser?.id };
        } catch (err) {
            console.error('SignUp error:', err);
            return { error: err };
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

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

                toast({ title: "Erro no login", description: message, variant: "destructive" });
            } else {
                toast({ title: "Login realizado com sucesso!", description: "Bem-vindo de volta." });
                const currentUser = data?.user ?? (await supabase.auth.getUser()).data.user;
                if (currentUser) {
                    await ensureEditorRecord(currentUser);
                    await ensurePublicUserRecord(currentUser);
                    await loadContext(currentUser);
                }
            }

            return { error };
        } catch (err) {
            console.error('SignIn error:', err);
            return { error: err };
        }
    };

    const resetAndToastLogout = () => {
        setAuthState(emptyAuthState);
        toast({ title: "Logout realizado", description: "Você foi desconectado com sucesso." });
    };

    const signOut = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                await supabase.auth.signOut({ scope: 'local' });
            } else {
                const { error } = await supabase.auth.signOut({ scope: 'global' });
                if (error) throw error;
            }

            resetAndToastLogout();
        } catch (err: any) {
            const msg = String(err?.message || '').toLowerCase();

            if (msg.includes('auth session missing')) {
                try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* no-op */ }
                resetAndToastLogout();
                return;
            }

            if (err?.name === 'AbortError' || msg.includes('abort') || msg.includes('aborted')) {
                resetAndToastLogout();
                return;
            }

            console.error('SignOut error:', err);
            toast({ title: "Erro", description: "Erro ao fazer logout.", variant: "destructive" });
        }
    };

    const value: AuthContextType = {
        user,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        organizationId: authState.organizationId,
        permissions: authState.permissions,
        userRole: authState.userRole,
        globalRole: authState.globalRole,
        moduleSwitches: authState.moduleSwitches,
        displayName: authState.displayName,
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
