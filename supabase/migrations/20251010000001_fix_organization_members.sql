-- Correção urgente: Criar tabela organization_members se não existir
-- Esta migração garante que a tabela existe antes de outras operações

-- Criar tabela organization_members se não existir
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  permissions jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_organization_members_org_user ON public.organization_members(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_permissions ON public.organization_members USING gin (permissions);

-- Habilitar RLS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas (serão atualizadas por migrações posteriores)
DROP POLICY IF EXISTS "Members can view their memberships" ON public.organization_members;
CREATE POLICY "Members can view their memberships"
ON public.organization_members
FOR SELECT
USING (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "Owners/Admins can add members" ON public.organization_members;
CREATE POLICY "Owners/Admins can add members"
ON public.organization_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_id AND o.owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owners/Admins can update members" ON public.organization_members;
CREATE POLICY "Owners/Admins can update members"
ON public.organization_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_id AND o.owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owners/Admins can remove members" ON public.organization_members;
CREATE POLICY "Owners/Admins can remove members"
ON public.organization_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_id AND o.owner_user_id = auth.uid()
  )
);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER update_organization_members_updated_at
BEFORE UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Funções relacionadas à organization_members (agora que a tabela existe)
-- Função para verificar se usuário tem permissão específica
CREATE OR REPLACE FUNCTION public.has_module_permission(
  p_user_id uuid,
  p_organization_id uuid,
  p_module_name text,
  p_action_name text
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id
    AND (om.permissions->p_module_name->p_action_name)::boolean = true
  );
$$;

-- Função para verificar se usuário tem qualquer permissão em um módulo
CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id uuid,
  p_organization_id uuid,
  p_module_name text
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id
    AND om.permissions ? p_module_name
  );
$$;

-- Função para obter todas as permissões de um usuário em uma organização
CREATE OR REPLACE FUNCTION public.get_user_permissions(
  p_user_id uuid,
  p_organization_id uuid
)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT om.permissions
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id
  AND om.user_id = p_user_id;
$$;

-- Função para definir permissões de um usuário
CREATE OR REPLACE FUNCTION public.set_user_permissions(
  p_user_id uuid,
  p_organization_id uuid,
  p_permissions jsonb
)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.organization_members
  SET permissions = p_permissions,
      updated_at = now()
  WHERE organization_id = p_organization_id
  AND user_id = p_user_id;
$$;

-- Todas as funções necessárias criadas aqui para evitar problemas de dependência

-- Função para obter organização do usuário atual (com parâmetros)
CREATE OR REPLACE FUNCTION public.get_user_organization_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = p_user_id
  AND om.role IN ('owner', 'admin')
  LIMIT 1;
$$;

-- Função helper para obter organização do usuário atual (versão sem parâmetros)
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  AND om.role IN ('owner', 'admin', 'member')
  LIMIT 1;
$$;

-- Função helper para verificar se usuário tem permissão específica
CREATE OR REPLACE FUNCTION public.current_user_has_permission(
  p_module_name text,
  p_action_name text
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = public.get_current_user_organization_id()
    AND om.user_id = auth.uid()
    AND (om.permissions->p_module_name->p_action_name)::boolean = true
  );
$$;

-- Função helper para verificar se usuário tem acesso a qualquer ação do módulo
CREATE OR REPLACE FUNCTION public.current_user_has_module_access(p_module_name text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = public.get_current_user_organization_id()
    AND om.user_id = auth.uid()
    AND om.permissions ? p_module_name
  );
$$;

-- Funções de nível mais baixo (para casos específicos)
CREATE OR REPLACE FUNCTION public.has_module_permission(
  p_user_id uuid,
  p_organization_id uuid,
  p_module_name text,
  p_action_name text
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id
    AND (om.permissions->p_module_name->p_action_name)::boolean = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id uuid,
  p_organization_id uuid,
  p_module_name text
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id
    AND om.permissions ? p_module_name
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_permissions(
  p_user_id uuid,
  p_organization_id uuid
)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT om.permissions
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id
  AND om.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.set_user_permissions(
  p_user_id uuid,
  p_organization_id uuid,
  p_permissions jsonb
)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.organization_members
  SET permissions = p_permissions,
      updated_at = now()
  WHERE organization_id = p_organization_id
  AND user_id = p_user_id;
$$;
