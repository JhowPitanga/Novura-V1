-- Ajustes solicitados para nomenclaturas e ações de módulos

-- 1) Anúncios: atualizar descrição
UPDATE public.system_modules
SET description = 'Gestão de anúncios de marketplaces'
WHERE name = 'anuncios';

-- 2) Configurações: renomear para Configurações fiscais e descrever escopo
UPDATE public.system_modules
SET display_name = 'Configurações fiscais',
    description = 'Permite criar e alterar empresas e impostos'
WHERE name = 'configuracoes';

-- 3) Recursos Seller: adicionar ação "buy" (Comprar)
INSERT INTO public.module_actions (module_id, name, display_name, description)
SELECT m.id, 'buy', 'Comprar', 'Pode comprar insumos'
FROM public.system_modules m
WHERE m.name = 'recursos_seller'
ON CONFLICT (module_id, name) DO NOTHING;

-- Observação: "Pesquisa de Mercado" permanece com ações existentes; a UI exibirá um único checkbox agregador de acesso.