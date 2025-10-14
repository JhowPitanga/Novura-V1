-- Migração para otimizar estrutura de usuários e perfis
-- Esta migração adiciona tabelas específicas para configurações do usuário

-- Tabela para configurações pessoais do usuário (não relacionadas à organização)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  phone text,
  timezone text DEFAULT 'America/Sao_Paulo',
  language text DEFAULT 'pt-BR',
  theme text DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  notifications_enabled boolean DEFAULT true,
  email_notifications boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela para configurações específicas do usuário por organização
CREATE TABLE IF NOT EXISTS public.user_organization_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dashboard_layout jsonb DEFAULT '{}',
  default_storage_id uuid,
  default_company_id uuid,
  quick_actions jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Tabela para auditoria de ações do usuário (opcional, mas recomendado)
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  details jsonb DEFAULT '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON public.user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_organization_settings_user_org ON public.user_organization_settings(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_created ON public.user_activity_log(user_id, created_at DESC);

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_organization_settings_updated_at ON public.user_organization_settings;
CREATE TRIGGER update_user_organization_settings_updated_at
BEFORE UPDATE ON public.user_organization_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver/editar apenas seu próprio perfil
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
CREATE POLICY "Users can insert their own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Configurações por organização - usuários podem ver apenas suas próprias configurações
DROP POLICY IF EXISTS "Users can view their org settings" ON public.user_organization_settings;
CREATE POLICY "Users can view their org settings" ON public.user_organization_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their org settings" ON public.user_organization_settings;
CREATE POLICY "Users can update their org settings" ON public.user_organization_settings
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their org settings" ON public.user_organization_settings;
CREATE POLICY "Users can insert their org settings" ON public.user_organization_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Apenas usuários com permissão de auditoria podem ver logs
DROP POLICY IF EXISTS "Users with audit permission can view logs" ON public.user_activity_log;
CREATE POLICY "Users with audit permission can view logs" ON public.user_activity_log
  FOR SELECT USING (
    public.current_user_has_permission('usuarios', 'manage_permissions')
    OR user_id = auth.uid()
  );

-- Nota: Triggers removidos conforme solicitado
-- Toda a lógica de criação de perfis e configurações será gerenciada
-- pela edge function create-user para maior controle e confiabilidade
