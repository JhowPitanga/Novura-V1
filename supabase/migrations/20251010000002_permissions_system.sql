-- Sistema de permissões granulares para organizações
-- Esta migração cria um sistema completo de permissões baseado em módulos e ações

-- Tabela de módulos do sistema
CREATE TABLE IF NOT EXISTS public.system_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de ações possíveis dentro de cada módulo
CREATE TABLE IF NOT EXISTS public.module_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.system_modules(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module_id, name)
);

-- Inserir módulos do sistema
INSERT INTO public.system_modules (name, display_name, description) VALUES
  ('dashboard', 'Dashboard', 'Acesso ao painel principal e métricas'),
  ('produtos', 'Produtos', 'Gestão completa de produtos'),
  ('pedidos', 'Pedidos', 'Gestão de pedidos e vendas'),
  ('estoque', 'Estoque', 'Controle de estoque e armazenamento'),
  ('notas_fiscais', 'Notas Fiscais', 'Emissão e gestão de documentos fiscais'),
  ('anuncios', 'Anúncios', 'Gestão de campanhas publicitárias'),
  ('aplicativos', 'Aplicativos', 'Integrações com marketplaces'),
  ('recursos_seller', 'Recursos Seller', 'Ferramentas para vendedores'),
  ('desempenho', 'Desempenho', 'Relatórios e análises'),
  ('usuarios', 'Usuários', 'Gestão de usuários e permissões'),
  ('configuracoes', 'Configurações', 'Configurações do sistema'),
  ('comunidade', 'Comunidade', 'Acesso à comunidade e eventos'),
  ('equipe', 'Equipe', 'Gestão de equipe e tarefas'),
  ('pesquisa_mercado', 'Pesquisa de Mercado', 'Análise de mercado e concorrência')
ON CONFLICT (name) DO NOTHING;

-- Inserir ações para cada módulo
INSERT INTO public.module_actions (module_id, name, display_name, description)
SELECT
  m.id,
  action_data.action_name,
  action_data.display_name,
  action_data.description
FROM public.system_modules m
CROSS JOIN (
  VALUES
    ('dashboard', 'view', 'Visualizar', 'Pode visualizar o dashboard'),
    ('dashboard', 'view_metrics', 'Ver Métricas', 'Pode visualizar métricas detalhadas'),

    ('produtos', 'view', 'Visualizar', 'Pode visualizar produtos'),
    ('produtos', 'create', 'Criar', 'Pode criar novos produtos'),
    ('produtos', 'edit', 'Editar', 'Pode editar produtos existentes'),
    ('produtos', 'delete', 'Excluir', 'Pode excluir produtos'),
    ('produtos', 'import', 'Importar', 'Pode importar produtos'),
    ('produtos', 'export', 'Exportar', 'Pode exportar produtos'),

    ('pedidos', 'view', 'Visualizar', 'Pode visualizar pedidos'),
    ('pedidos', 'create', 'Criar', 'Pode criar pedidos'),
    ('pedidos', 'edit', 'Editar', 'Pode editar pedidos'),
    ('pedidos', 'cancel', 'Cancelar', 'Pode cancelar pedidos'),
    ('pedidos', 'print', 'Imprimir', 'Pode imprimir pedidos'),

    ('estoque', 'view', 'Visualizar', 'Pode visualizar estoque'),
    ('estoque', 'adjust', 'Ajustar', 'Pode ajustar quantidades'),
    ('estoque', 'transfer', 'Transferir', 'Pode transferir produtos'),
    ('estoque', 'manage_storage', 'Gerenciar Estoque', 'Pode gerenciar locais de estoque'),

    ('notas_fiscais', 'view', 'Visualizar', 'Pode visualizar notas fiscais'),
    ('notas_fiscais', 'create', 'Emitir', 'Pode emitir notas fiscais'),
    ('notas_fiscais', 'cancel', 'Cancelar', 'Pode cancelar notas fiscais'),

    ('anuncios', 'view', 'Visualizar', 'Pode visualizar anúncios'),
    ('anuncios', 'create', 'Criar', 'Pode criar anúncios'),
    ('anuncios', 'edit', 'Editar', 'Pode editar anúncios'),
    ('anuncios', 'delete', 'Excluir', 'Pode excluir anúncios'),
    ('anuncios', 'publish', 'Publicar', 'Pode publicar anúncios'),

    ('aplicativos', 'view', 'Visualizar', 'Pode visualizar integrações'),
    ('aplicativos', 'connect', 'Conectar', 'Pode conectar aplicativos'),
    ('aplicativos', 'disconnect', 'Desconectar', 'Pode desconectar aplicativos'),
    ('aplicativos', 'configure', 'Configurar', 'Pode configurar aplicativos'),

    ('recursos_seller', 'view', 'Visualizar', 'Pode acessar recursos seller'),
    ('recursos_seller', 'download', 'Baixar', 'Pode baixar recursos'),

    ('desempenho', 'view', 'Visualizar', 'Pode visualizar relatórios'),
    ('desempenho', 'export', 'Exportar', 'Pode exportar relatórios'),

    ('usuarios', 'view', 'Visualizar', 'Pode visualizar usuários'),
    ('usuarios', 'invite', 'Convidar', 'Pode convidar usuários'),
    ('usuarios', 'edit', 'Editar', 'Pode editar usuários'),
    ('usuarios', 'delete', 'Excluir', 'Pode excluir usuários'),
    ('usuarios', 'manage_permissions', 'Gerenciar Permissões', 'Pode gerenciar permissões'),

    ('configuracoes', 'view', 'Visualizar', 'Pode visualizar configurações'),
    ('configuracoes', 'edit', 'Editar', 'Pode editar configurações'),

    ('comunidade', 'view', 'Visualizar', 'Pode visualizar comunidade'),
    ('comunidade', 'post', 'Postar', 'Pode criar posts'),
    ('comunidade', 'comment', 'Comentar', 'Pode comentar'),

    ('equipe', 'view', 'Visualizar', 'Pode visualizar equipe'),
    ('equipe', 'manage', 'Gerenciar', 'Pode gerenciar tarefas e membros'),

    ('pesquisa_mercado', 'view', 'Visualizar', 'Pode visualizar pesquisas'),
    ('pesquisa_mercado', 'create', 'Criar', 'Pode criar pesquisas'),
    ('pesquisa_mercado', 'edit', 'Editar', 'Pode editar pesquisas')
) AS action_data(module_name, action_name, display_name, description)
WHERE m.name = action_data.module_name
ON CONFLICT (module_id, name) DO NOTHING;

-- Atualizar tabela organization_members para incluir permissões granulares (se existir)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'organization_members' AND table_schema = 'public') THEN
    ALTER TABLE public.organization_members
    ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}';

    -- Criar índice para otimizar consultas por permissões
    CREATE INDEX IF NOT EXISTS idx_organization_members_permissions
    ON public.organization_members USING gin (permissions);
  END IF;
END $$;

-- Nota: Todas as funções necessárias já foram criadas na migração anterior
-- 20251010000001_fix_organization_members.sql

-- Triggers para updated_at (exceto organization_members que pode não existir ainda)
DROP TRIGGER IF EXISTS update_system_modules_updated_at ON public.system_modules;
CREATE TRIGGER update_system_modules_updated_at
BEFORE UPDATE ON public.system_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_module_actions_updated_at ON public.module_actions;
CREATE TRIGGER update_module_actions_updated_at
BEFORE UPDATE ON public.module_actions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para organization_members (só criar se tabela existir)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'organization_members' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
    CREATE TRIGGER update_organization_members_updated_at
    BEFORE UPDATE ON public.organization_members
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
