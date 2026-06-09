import { useToast } from '@/hooks/use-toast';
import { Session, User } from '@supabase/supabase-js';
import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import {
    loadAccessContext as loadAccessContextService,
    fetchAccessContext,
    ensureEditorRecord,
    ensurePublicUserRecord,
    bootstrapUserOrg,
    clearAccessContextCache,
    isAccessContextCacheFresh,
    type AccessContext,
} from '@/services/auth.service';
import {
    ACCESS_CONTEXT_POLL_INTERVAL_MS,
    ACCESS_CONTEXT_REALTIME_DEBOUNCE_MS,
} from '@/lib/accessContext';

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
    signIn: (email: string, password: string) => Promise<{ error: any; globalRole?: string | null }>;
    signOut: () => Promise<void>;
    refreshAccessContext: () => Promise<void>;
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
    const initPromiseRef = useRef<Promise<void> | null>(null);
    const loadContextInFlightRef = useRef<Promise<void> | null>(null);
    const userRef = useRef<User | null>(null);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const loadContext = useCallback(async (u: User | null, forceRefresh = false) => {
        if (!u) {
            setAuthState(emptyAuthState);
            return;
        }

        // Skip redundant network calls when cache is still valid (poll/focus/navigation).
        if (!forceRefresh && isAccessContextCacheFresh(u.id)) {
            const cached = await loadAccessContextService(u);
            if (cached) {
                setAuthState(applyAccessContext(cached));
                return;
            }
        }

        // Deduplicate concurrent loads for the same session (init race, rapid clicks).
        if (loadContextInFlightRef.current) {
            await loadContextInFlightRef.current;
            return;
        }

        const task = (async () => {
            try {
                const ctx = forceRefresh
                    ? await fetchAccessContext(u.id, { bypassCache: true })
                    : await loadAccessContextService(u);
                setAuthState(applyAccessContext(ctx));
            } catch {
                setAuthState({ ...emptyAuthState, permissions: {}, userRole: 'member' });
            }
        })();

        loadContextInFlightRef.current = task;
        try {
            await task;
        } finally {
            loadContextInFlightRef.current = null;
        }
    }, []);

    const refreshAccessContext = useCallback(async () => {
        const u = userRef.current;
        if (!u) return;
        await loadContext(u, true);
    }, [loadContext]);

    // Realtime + poll: module flags, org features, membership, global modules
    useEffect(() => {
        const u = user;
        const orgId = authState.organizationId;
        const isSuperAdmin = authState.globalRole === 'super_admin';

        if (!u?.id || !orgId || isSuperAdmin) return;

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadContext(u, true).catch((e) => {
                    console.warn('Failed to refresh access context:', e);
                });
            }, ACCESS_CONTEXT_REALTIME_DEBOUNCE_MS);
        };

        const channel = supabase
            .channel(`access-context-${u.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'organization_members',
                    filter: `user_id=eq.${u.id}`,
                },
                scheduleRefresh,
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'organization_features',
                    filter: `organization_id=eq.${orgId}`,
                },
                scheduleRefresh,
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'organization_status',
                    filter: `organization_id=eq.${orgId}`,
                },
                scheduleRefresh,
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'system_modules' },
                scheduleRefresh,
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'system_features' },
                scheduleRefresh,
            )
            .subscribe();

        const pollIfVisible = () => {
            if (document.visibilityState !== 'visible') return;
            // Only hit the network when the session cache has expired.
            if (isAccessContextCacheFresh(u.id)) return;
            loadContext(u, false).catch((e) => {
                console.warn('Failed to poll access context:', e);
            });
        };

        const pollId = window.setInterval(pollIfVisible, ACCESS_CONTEXT_POLL_INTERVAL_MS);
        const onFocus = () => pollIfVisible();
        const onVisibility = () => {
            if (document.visibilityState === 'visible') pollIfVisible();
        };

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            window.clearInterval(pollId);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
            try {
                supabase.removeChannel(channel);
            } catch {
                /* noop */
            }
        };
    }, [user?.id, authState.organizationId, authState.globalRole, loadContext]);

    useEffect(() => {
        const runInitOnce = (currentUser: User | null) => {
            if (initDoneRef.current) return Promise.resolve();
            if (initPromiseRef.current) return initPromiseRef.current;

            initPromiseRef.current = (async () => {
                await loadContext(currentUser);
                setLoading(false);
                initDoneRef.current = true;
            })().finally(() => {
                initPromiseRef.current = null;
            });

            return initPromiseRef.current;
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setSession(session);
                const currentUser = session?.user ?? null;
                setUser(currentUser);
                if (!initDoneRef.current) {
                    void runInitOnce(currentUser);
                } else if (event === 'SIGNED_IN' && currentUser) {
                    void loadContext(currentUser, true);
                }
            }
        );

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);
            void runInitOnce(currentUser);
        });

        return () => subscription.unsubscribe();
    }, [loadContext]);

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
                await loadContext(createdUser, true);
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
            let globalRole: string | null = null;

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
                    globalRole = String((currentUser.app_metadata as any)?.role || "") || null;
                    await ensureEditorRecord(currentUser);
                    await ensurePublicUserRecord(currentUser);
                    await loadContext(currentUser, true);
                }
            }

            return { error, globalRole };
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
            const userId = userRef.current?.id;
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                await supabase.auth.signOut({ scope: 'local' });
            } else {
                const { error } = await supabase.auth.signOut({ scope: 'global' });
                if (error) throw error;
            }

            if (userId) clearAccessContextCache(userId);
            resetAndToastLogout();
        } catch (err: any) {
            const msg = String(err?.message || '').toLowerCase();

            if (msg.includes('auth session missing')) {
                try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* no-op */ }
                if (userRef.current?.id) clearAccessContextCache(userRef.current.id);
                resetAndToastLogout();
                return;
            }

            if (err?.name === 'AbortError' || msg.includes('abort') || msg.includes('aborted')) {
                if (userRef.current?.id) clearAccessContextCache(userRef.current.id);
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
        refreshAccessContext,
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
