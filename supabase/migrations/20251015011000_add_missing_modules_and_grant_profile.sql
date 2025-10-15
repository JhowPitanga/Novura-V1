-- Adiciona módulos faltantes ao system_modules e ações ao module_actions
-- Em seguida, concede todas as permissões de todos os módulos ao perfil especificado

BEGIN;

-- 1) Inserir módulos (idempotente)
INSERT INTO public.system_modules (name, display_name, description)
VALUES
  ('dashboard', 'Dashboard', 'Visão geral e métricas'),
  ('produtos', 'Produtos', 'Gestão de produtos'),
  ('pedidos', 'Pedidos', 'Gestão de pedidos'),
  ('anuncios', 'Anúncios', 'Central de anúncios'),
  ('sac', 'SAC', 'Atendimento ao cliente'),
  ('estoque', 'Estoque', 'Gestão de estoque'),
  ('notas_fiscais', 'Notas Fiscais', 'Emissão e gestão de notas fiscais'),
  ('aplicativos', 'Aplicativos', 'Integrações e apps'),
  ('novura_academy', 'Novura Academy', 'Conteúdos educacionais'),
  -- Garante também os já existentes
  ('recursos_seller', 'Recursos Seller', 'Ferramentas para vendedores'),
  ('desempenho', 'Desempenho', 'Relatórios e análises'),
  ('usuarios', 'Usuários', 'Gestão de usuários e permissões'),
  ('configuracoes', 'Configurações', 'Configurações do sistema'),
  ('comunidade', 'Comunidade', 'Acesso à comunidade e eventos'),
  ('equipe', 'Equipe', 'Gestão de equipe e tarefas'),
  ('pesquisa_mercado', 'Pesquisa de Mercado', 'Análise de mercado e concorrência')
ON CONFLICT (name) DO NOTHING;

-- 2) Inserir ações para os módulos (idempotente)
INSERT INTO public.module_actions (module_id, name, display_name, description)
SELECT m.id, a.name, a.display_name, a.description
FROM public.system_modules m
JOIN (
  VALUES
    ('dashboard','view','Visualizar','Pode visualizar o dashboard'),
    ('dashboard','view_metrics','Ver Métricas','Pode visualizar métricas detalhadas'),

    ('produtos','view','Visualizar','Pode visualizar produtos'),
    ('produtos','create','Criar','Pode criar novos produtos'),
    ('produtos','edit','Editar','Pode editar produtos existentes'),
    ('produtos','delete','Excluir','Pode excluir produtos'),
    ('produtos','import','Importar','Pode importar produtos'),
    ('produtos','export','Exportar','Pode exportar produtos'),

    ('pedidos','view','Visualizar','Pode visualizar pedidos'),
    ('pedidos','create','Criar','Pode criar pedidos'),
    ('pedidos','edit','Editar','Pode editar pedidos'),
    ('pedidos','cancel','Cancelar','Pode cancelar pedidos'),

    ('anuncios','view','Visualizar','Pode visualizar anúncios'),
    ('anuncios','create','Criar','Pode criar anúncios'),
    ('anuncios','edit','Editar','Pode editar anúncios'),
    ('anuncios','delete','Excluir','Pode excluir anúncios'),
    ('anuncios','publish','Publicar','Pode publicar anúncios'),

    ('sac','view','Visualizar','Pode visualizar tickets do SAC'),
    ('sac','reply','Responder','Pode responder tickets'),
    ('sac','manage','Gerenciar','Pode gerenciar tickets'),

    ('estoque','view','Visualizar','Pode visualizar estoque'),
    ('estoque','adjust','Ajustar','Pode ajustar quantidades'),
    ('estoque','transfer','Transferir','Pode transferir estoque'),
    ('estoque','manage_storage','Gerenciar Armazenamento','Pode gerenciar endereçamento'),

    ('notas_fiscais','view','Visualizar','Pode visualizar notas fiscais'),
    ('notas_fiscais','create','Criar','Pode criar notas fiscais'),
    ('notas_fiscais','edit','Editar','Pode editar notas fiscais'),

    ('aplicativos','view','Visualizar','Pode visualizar aplicativos'),

    ('novura_academy','view','Visualizar','Pode visualizar conteúdos da Novura Academy'),

    ('recursos_seller','view','Visualizar','Pode visualizar recursos'),
    ('recursos_seller','download','Baixar','Pode baixar recursos'),

    ('desempenho','view','Visualizar','Pode visualizar relatórios'),
    ('desempenho','export','Exportar','Pode exportar relatórios'),

    ('usuarios','view','Visualizar','Pode visualizar usuários'),
    ('usuarios','invite','Convidar','Pode convidar usuários'),
    ('usuarios','edit','Editar','Pode editar usuários'),
    ('usuarios','delete','Excluir','Pode excluir usuários'),
    ('usuarios','manage_permissions','Gerenciar Permissões','Pode gerenciar permissões'),

    ('configuracoes','view','Visualizar','Pode visualizar configurações'),
    ('configuracoes','edit','Editar','Pode editar configurações'),

    ('comunidade','view','Visualizar','Pode visualizar comunidade'),
    ('comunidade','post','Postar','Pode criar posts'),
    ('comunidade','comment','Comentar','Pode comentar'),

    ('equipe','view','Visualizar','Pode visualizar equipe'),
    ('equipe','manage','Gerenciar','Pode gerenciar tarefas e membros'),

    ('pesquisa_mercado','view','Visualizar','Pode visualizar pesquisas'),
    ('pesquisa_mercado','create','Criar','Pode criar pesquisas'),
    ('pesquisa_mercado','edit','Editar','Pode editar pesquisas')
) AS a(module_name, name, display_name, description)
ON m.name = a.module_name
ON CONFLICT (module_id, name) DO NOTHING;

-- 3) Conceder todas as permissões ao perfil alvo em todas as memberships
DO $$
DECLARE
  v_user_id uuid := '8b04ad0e-d533-477c-b86d-a9dde8399188';
  v_permissions jsonb;
BEGIN
  SELECT jsonb_object_agg(m.name, actions.actions_json) INTO v_permissions
  FROM public.system_modules m
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_object_agg(a.name, true), '{}'::jsonb) AS actions_json
    FROM public.module_actions a
    WHERE a.module_id = m.id
  ) actions;

  v_permissions := COALESCE(v_permissions, '{}'::jsonb);

  UPDATE public.organization_members om
  SET permissions = v_permissions
  WHERE om.user_id = v_user_id;
END
$$;

COMMIT;