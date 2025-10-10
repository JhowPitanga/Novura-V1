import { useToast } from '@/hooks/use-toast';
import { Session, User } from '@supabase/supabase-js';
import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
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

    async function resolveOrganizationId(u: User | null) {
        try {
            if (!u) {
                setOrganizationId(null);
                setPermissions(null);
                setUserRole(null);
                return;
            }
            const metaOrg = (u.user_metadata as any)?.organization_id as string | undefined;
            if (metaOrg) {
                setOrganizationId(metaOrg);
                await loadUserPermissionsAndRole(u.id, metaOrg);
                return;
            }
            const { data } = await supabase
                .from('users')
                .select('organization_id')
                .eq('id', u.id)
                .maybeSingle();
            const orgId = (data as any)?.organization_id;
            setOrganizationId(orgId ?? null);
            if (orgId) {
                await loadUserPermissionsAndRole(u.id, orgId);
            } else {
                setPermissions(null);
                setUserRole(null);
            }
        } catch (e) {
            console.warn('Falha ao resolver organization_id do usuário', e);
            setOrganizationId(null);
            setPermissions(null);
            setUserRole(null);
        }
    }

    async function loadUserPermissionsAndRole(userId: string, orgId: string) {
        try {
            const { data: memberData, error } = await supabase
                .from('organization_members')
                .select('permissions, role')
                .eq('organization_id', orgId)
                .eq('user_id', userId)
                .single();

            if (error) {
                console.warn('Erro ao carregar permissões do usuário:', error);
                setPermissions({});
                setUserRole('member');
                return;
            }

            setPermissions(memberData?.permissions || {});
            setUserRole(memberData?.role || 'member');
        } catch (e) {
            console.warn('Falha ao carregar permissões e role do usuário', e);
            setPermissions({});
            setUserRole('member');
        }
    }

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                console.log('Auth state changed:', event, session?.user?.email);
                setSession(session);
                const currentUser = session?.user ?? null;
                setUser(currentUser);
                resolveOrganizationId(currentUser);
                setLoading(false);
            }
        );

        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log('Initial session:', session?.user?.email);
            setSession(session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);
            resolveOrganizationId(currentUser);
            setLoading(false);
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
            const { error } = await supabase.auth.signOut();
            if (error) throw error;

            toast({
                title: "Logout realizado",
                description: "Você foi desconectado com sucesso.",
            });
            setOrganizationId(null);
            setPermissions(null);
            setUserRole(null);
        } catch (err) {
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