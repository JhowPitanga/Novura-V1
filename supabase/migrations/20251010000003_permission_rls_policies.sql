-- RLS Policies baseadas em permissões granulares
-- Esta migração adiciona políticas de segurança baseadas no sistema de permissões

-- Políticas baseadas em permissões granulares
-- Criar função necessária antes de usar

CREATE OR REPLACE FUNCTION public.current_user_has_permission(
  p_module_name text,
  p_action_name text
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = (
      SELECT om2.organization_id
      FROM public.organization_members om2
      WHERE om2.user_id = auth.uid()
      AND om2.role IN ('owner', 'admin', 'member')
      ORDER BY CASE om2.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
      LIMIT 1
    )
    AND om.user_id = auth.uid()
    AND (
      COALESCE((om.permissions->p_module_name->p_action_name)::boolean, false) = true
      OR om.role IN ('owner', 'admin')
    )
  );
$$;

-- Atualizar políticas da tabela products
DROP POLICY IF EXISTS "Users can view products" ON public.products;
DROP POLICY IF EXISTS "Users can create products" ON public.products;
DROP POLICY IF EXISTS "Users can update products" ON public.products;
DROP POLICY IF EXISTS "Users can delete products" ON public.products;

-- Políticas baseadas em permissões granulares
DROP POLICY IF EXISTS "Users with produtos.view can view products" ON public.products;
CREATE POLICY "Users with produtos.view can view products" ON public.products
  FOR SELECT USING (
    public.current_user_has_permission('produtos', 'view')
    OR public.current_user_has_permission('produtos', 'edit')
    OR public.current_user_has_permission('produtos', 'create')
    OR public.current_user_has_permission('produtos', 'delete')
  );

DROP POLICY IF EXISTS "Users with produtos.create can create products" ON public.products;
CREATE POLICY "Users with produtos.create can create products" ON public.products
  FOR INSERT WITH CHECK (
    public.current_user_has_permission('produtos', 'create')
  );

DROP POLICY IF EXISTS "Users with produtos.edit can update products" ON public.products;
CREATE POLICY "Users with produtos.edit can update products" ON public.products
  FOR UPDATE USING (
    public.current_user_has_permission('produtos', 'edit')
  );

DROP POLICY IF EXISTS "Users with produtos.delete can delete products" ON public.products;
CREATE POLICY "Users with produtos.delete can delete products" ON public.products
  FOR DELETE USING (
    public.current_user_has_permission('produtos', 'delete')
  );

-- Atualizar políticas da tabela orders
DROP POLICY IF EXISTS "Users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete orders" ON public.orders;

DROP POLICY IF EXISTS "Users with pedidos.view can view orders" ON public.orders;
CREATE POLICY "Users with pedidos.view can view orders" ON public.orders
  FOR SELECT USING (
    public.current_user_has_permission('pedidos', 'view')
    OR public.current_user_has_permission('pedidos', 'edit')
    OR public.current_user_has_permission('pedidos', 'create')
    OR public.current_user_has_permission('pedidos', 'cancel')
  );

DROP POLICY IF EXISTS "Users with pedidos.create can create orders" ON public.orders;
CREATE POLICY "Users with pedidos.create can create orders" ON public.orders
  FOR INSERT WITH CHECK (
    public.current_user_has_permission('pedidos', 'create')
  );

DROP POLICY IF EXISTS "Users with pedidos.edit can update orders" ON public.orders;
CREATE POLICY "Users with pedidos.edit can update orders" ON public.orders
  FOR UPDATE USING (
    public.current_user_has_permission('pedidos', 'edit')
  );

DROP POLICY IF EXISTS "Users with pedidos.cancel can cancel orders" ON public.orders;
CREATE POLICY "Users with pedidos.cancel can cancel orders" ON public.orders
  FOR UPDATE USING (
    public.current_user_has_permission('pedidos', 'cancel')
  );

-- Atualizar políticas da tabela companies
DROP POLICY IF EXISTS "Members can view companies" ON public.companies;
DROP POLICY IF EXISTS "Members can create companies" ON public.companies;
DROP POLICY IF EXISTS "Members can update companies" ON public.companies;
DROP POLICY IF EXISTS "Members can delete companies" ON public.companies;

DROP POLICY IF EXISTS "Users with config.view can view companies" ON public.companies;
CREATE POLICY "Users with config.view can view companies" ON public.companies
  FOR SELECT USING (
    -- Política básica: usuários podem ver empresas (será refinada depois)
    true
  );

DROP POLICY IF EXISTS "Users with config.edit can create companies" ON public.companies;
CREATE POLICY "Users with config.edit can create companies" ON public.companies
  FOR INSERT WITH CHECK (
    public.current_user_has_permission('configuracoes', 'edit')
  );

DROP POLICY IF EXISTS "Users with config.edit can update companies" ON public.companies;
CREATE POLICY "Users with config.edit can update companies" ON public.companies
  FOR UPDATE USING (
    public.current_user_has_permission('configuracoes', 'edit')
  );

DROP POLICY IF EXISTS "Users with config.edit can delete companies" ON public.companies;
CREATE POLICY "Users with config.edit can delete companies" ON public.companies
  FOR DELETE USING (
    public.current_user_has_permission('configuracoes', 'edit')
  );

-- Atualizar políticas da tabela categories
DROP POLICY IF EXISTS "Users can view categories" ON public.categories;
DROP POLICY IF EXISTS "Users can create categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete categories" ON public.categories;

DROP POLICY IF EXISTS "Users with produtos.view can view categories" ON public.categories;
CREATE POLICY "Users with produtos.view can view categories" ON public.categories
  FOR SELECT USING (
    public.current_user_has_permission('produtos', 'view')
    OR public.current_user_has_permission('produtos', 'create')
    OR public.current_user_has_permission('produtos', 'edit')
  );

DROP POLICY IF EXISTS "Users with produtos.create can create categories" ON public.categories;
CREATE POLICY "Users with produtos.create can create categories" ON public.categories
  FOR INSERT WITH CHECK (
    public.current_user_has_permission('produtos', 'create')
  );

DROP POLICY IF EXISTS "Users with produtos.edit can update categories" ON public.categories;
CREATE POLICY "Users with produtos.edit can update categories" ON public.categories
  FOR UPDATE USING (
    public.current_user_has_permission('produtos', 'edit')
  );

DROP POLICY IF EXISTS "Users with produtos.edit can delete categories" ON public.categories;
CREATE POLICY "Users with produtos.edit can delete categories" ON public.categories
  FOR DELETE USING (
    public.current_user_has_permission('produtos', 'edit')
  );

-- Políticas básicas para tabela organization_members (se existir)
-- Nota: Políticas avançadas serão adicionadas posteriormente quando as funções estiverem disponíveis
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'organization_members' AND table_schema = 'public') THEN

    DROP POLICY IF EXISTS "Members can view their memberships" ON public.organization_members;
    DROP POLICY IF EXISTS "Owners/Admins can add members" ON public.organization_members;
    DROP POLICY IF EXISTS "Owners/Admins can update members" ON public.organization_members;
    DROP POLICY IF EXISTS "Owners/Admins can remove members" ON public.organization_members;

    -- Políticas básicas iniciais
    DROP POLICY IF EXISTS "Users can view their memberships" ON public.organization_members;
    CREATE POLICY "Users can view their memberships" ON public.organization_members
      FOR SELECT USING (
        auth.uid() = user_id
      );

    DROP POLICY IF EXISTS "Owners can manage members" ON public.organization_members;
    CREATE POLICY "Owners can manage members" ON public.organization_members
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.organizations o
          WHERE o.id = organization_id AND o.owner_user_id = auth.uid()
        )
      );

  END IF;
END $$;

-- Políticas para tabela user_invitations
DROP POLICY IF EXISTS "Org owners/admins can view invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Org owners/admins can create invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Org owners/admins can update invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Org owners/admins can delete invitations" ON public.user_invitations;

DROP POLICY IF EXISTS "Users with usuarios.view can view invitations" ON public.user_invitations;
CREATE POLICY "Users with usuarios.view can view invitations" ON public.user_invitations
  FOR SELECT USING (
    -- Política básica: usuários podem ver convites que criaram
    invited_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users with usuarios.invite can create invitations" ON public.user_invitations;
CREATE POLICY "Users with usuarios.invite can create invitations" ON public.user_invitations
  FOR INSERT WITH CHECK (
    -- Política básica: usuários podem criar convites
    invited_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users with usuarios.invite can update invitations" ON public.user_invitations;
CREATE POLICY "Users with usuarios.invite can update invitations" ON public.user_invitations
  FOR UPDATE USING (
    -- Política básica: usuários podem atualizar convites que criaram
    invited_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users with usuarios.invite can delete invitations" ON public.user_invitations;
CREATE POLICY "Users with usuarios.invite can delete invitations" ON public.user_invitations
  FOR DELETE USING (
    -- Política básica: usuários podem deletar convites que criaram
    invited_by_user_id = auth.uid()
  );

-- Políticas para tabela notas_fiscais
DROP POLICY IF EXISTS "Users can view notas_fiscais" ON public.notas_fiscais;
DROP POLICY IF EXISTS "Users can create notas_fiscais" ON public.notas_fiscais;
DROP POLICY IF EXISTS "Users can update notas_fiscais" ON public.notas_fiscais;
DROP POLICY IF EXISTS "Users can delete notas_fiscais" ON public.notas_fiscais;

DROP POLICY IF EXISTS "Users with notas_fiscais.view can view notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "Users with notas_fiscais.view can view notas_fiscais" ON public.notas_fiscais
  FOR SELECT USING (
    -- Política básica: usuários podem ver notas fiscais (será refinada depois)
    true
  );

DROP POLICY IF EXISTS "Users with notas_fiscais.create can create notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "Users with notas_fiscais.create can create notas_fiscais" ON public.notas_fiscais
  FOR INSERT WITH CHECK (
    public.current_user_has_permission('notas_fiscais', 'create')
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = (
        SELECT c.organization_id
        FROM public.companies c
        WHERE c.id = notas_fiscais.company_id
      )
    )
  );

DROP POLICY IF EXISTS "Users with notas_fiscais.cancel can cancel notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "Users with notas_fiscais.cancel can cancel notas_fiscais" ON public.notas_fiscais
  FOR UPDATE USING (
    public.current_user_has_permission('notas_fiscais', 'cancel')
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = (
        SELECT c.organization_id
        FROM public.companies c
        WHERE c.id = notas_fiscais.company_id
      )
    )
  );

-- Políticas para tabela order_items (herda das políticas de orders)
DROP POLICY IF EXISTS "Users can view order_items" ON public.order_items;
DROP POLICY IF EXISTS "Users can create order_items" ON public.order_items;
DROP POLICY IF EXISTS "Users can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Users can delete order_items" ON public.order_items;

DROP POLICY IF EXISTS "Users with pedidos.view can view order_items" ON public.order_items;
CREATE POLICY "Users with pedidos.view can view order_items" ON public.order_items
  FOR SELECT USING (
    -- Política básica: usuários podem ver itens de pedidos (será refinada depois)
    true
  );

DROP POLICY IF EXISTS "Users with pedidos.create can create order_items" ON public.order_items;
CREATE POLICY "Users with pedidos.create can create order_items" ON public.order_items
  FOR INSERT WITH CHECK (
    public.current_user_has_permission('pedidos', 'create')
  );

DROP POLICY IF EXISTS "Users with pedidos.edit can update order_items" ON public.order_items;
CREATE POLICY "Users with pedidos.edit can update order_items" ON public.order_items
  FOR UPDATE USING (
    public.current_user_has_permission('pedidos', 'edit')
  );

DROP POLICY IF EXISTS "Users with pedidos.edit can delete order_items" ON public.order_items;
CREATE POLICY "Users with pedidos.edit can delete order_items" ON public.order_items
  FOR DELETE USING (
    public.current_user_has_permission('pedidos', 'edit')
  );

-- Políticas para tabela products_stock (estoque)
DROP POLICY IF EXISTS "Users can view products_stock" ON public.products_stock;
DROP POLICY IF EXISTS "Users can create products_stock" ON public.products_stock;
DROP POLICY IF EXISTS "Users can update products_stock" ON public.products_stock;
DROP POLICY IF EXISTS "Users can delete products_stock" ON public.products_stock;

DROP POLICY IF EXISTS "Users with estoque.view can view products_stock" ON public.products_stock;
CREATE POLICY "Users with estoque.view can view products_stock" ON public.products_stock
  FOR SELECT USING (
    -- Política básica: usuários podem ver estoque (será refinada depois)
    true
  );

DROP POLICY IF EXISTS "Users with estoque.adjust can adjust products_stock" ON public.products_stock;
CREATE POLICY "Users with estoque.adjust can adjust products_stock" ON public.products_stock
  FOR UPDATE USING (
    public.current_user_has_permission('estoque', 'adjust')
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = (
        SELECT c.organization_id
        FROM public.companies c
        WHERE c.id = products_stock.company_id
      )
    )
  );

-- Políticas para tabela storage
DROP POLICY IF EXISTS "Users can view storage" ON public.storage;
DROP POLICY IF EXISTS "Users can create storage" ON public.storage;
DROP POLICY IF EXISTS "Users can update storage" ON public.storage;
DROP POLICY IF EXISTS "Users can delete storage" ON public.storage;

DROP POLICY IF EXISTS "Users with estoque.view can view storage" ON public.storage;
CREATE POLICY "Users with estoque.view can view storage" ON public.storage
  FOR SELECT USING (
    -- Política básica: usuários podem ver locais de estoque (será refinada depois)
    true
  );

DROP POLICY IF EXISTS "Users with estoque.manage_storage can manage storage" ON public.storage;
CREATE POLICY "Users with estoque.manage_storage can manage storage" ON public.storage
  FOR ALL USING (
    public.current_user_has_permission('estoque', 'manage_storage')
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = storage.organizations_id
    )
  );

-- Políticas para tabela apps (aplicativos/integrações)
DROP POLICY IF EXISTS "Users can view apps" ON public.apps;
DROP POLICY IF EXISTS "Users can create apps" ON public.apps;
DROP POLICY IF EXISTS "Users can update apps" ON public.apps;
DROP POLICY IF EXISTS "Users can delete apps" ON public.apps;

DROP POLICY IF EXISTS "Users with aplicativos.view can view apps" ON public.apps;
CREATE POLICY "Users with aplicativos.view can view apps" ON public.apps
  FOR SELECT USING (
    -- Política básica: usuários podem ver aplicativos (será refinada depois)
    true
  );

DROP POLICY IF EXISTS "Users with aplicativos.configure can manage apps" ON public.apps;
DO $$
BEGIN
  -- Criar política somente se a coluna user_id existir na tabela apps
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'apps'
      AND column_name = 'user_id'
  ) THEN
    CREATE POLICY "Users with aplicativos.configure can manage apps" ON public.apps
      FOR ALL USING (
        -- Política básica: usuários podem gerenciar seus próprios aplicativos
        auth.uid() = user_id
      );
  ELSE
    RAISE NOTICE 'Skipping policy "Users with aplicativos.configure can manage apps" because public.apps.user_id does not exist';
  END IF;
END $$;

-- Políticas para tabela marketplace_integrations
DROP POLICY IF EXISTS "Users can view marketplace_integrations" ON public.marketplace_integrations;
DROP POLICY IF EXISTS "Users can create marketplace_integrations" ON public.marketplace_integrations;
DROP POLICY IF EXISTS "Users can update marketplace_integrations" ON public.marketplace_integrations;
DROP POLICY IF EXISTS "Users can delete marketplace_integrations" ON public.marketplace_integrations;

DROP POLICY IF EXISTS "Users with aplicativos.view can view marketplace_integrations" ON public.marketplace_integrations;
CREATE POLICY "Users with aplicativos.view can view marketplace_integrations" ON public.marketplace_integrations
  FOR SELECT USING (
    -- Política básica: usuários podem ver integrações (será refinada depois)
    true
  );

DROP POLICY IF EXISTS "Users with aplicativos.configure can manage marketplace_integrations" ON public.marketplace_integrations;
CREATE POLICY "Users with aplicativos.configure can manage marketplace_integrations" ON public.marketplace_integrations
  FOR ALL USING (
    public.current_user_has_permission('aplicativos', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = (
        SELECT c.organization_id
        FROM public.companies c
        WHERE c.id = marketplace_integrations.company_id
      )
    )
  );

-- Políticas para tabela ads (anúncios)
DROP POLICY IF EXISTS "Users can view ads" ON public.ads;
DROP POLICY IF EXISTS "Users can create ads" ON public.ads;
DROP POLICY IF EXISTS "Users can update ads" ON public.ads;
DROP POLICY IF EXISTS "Users can delete ads" ON public.ads;

DROP POLICY IF EXISTS "Users with anuncios.view can view ads" ON public.ads;
CREATE POLICY "Users with anuncios.view can view ads" ON public.ads
  FOR SELECT USING (
    -- Política básica: usuários podem ver anúncios (será refinada depois)
    true
  );

DROP POLICY IF EXISTS "Users with anuncios.create can create ads" ON public.ads;
CREATE POLICY "Users with anuncios.create can create ads" ON public.ads
  FOR INSERT WITH CHECK (
    -- Política básica: usuários podem criar anúncios
    auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users with anuncios.edit can update ads" ON public.ads;
CREATE POLICY "Users with anuncios.edit can update ads" ON public.ads
  FOR UPDATE USING (
    -- Política básica: usuários podem editar seus próprios anúncios
    auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users with anuncios.delete can delete ads" ON public.ads;
CREATE POLICY "Users with anuncios.delete can delete ads" ON public.ads
  FOR DELETE USING (
    -- Política básica: usuários podem deletar seus próprios anúncios
    auth.uid() = user_id
  );

-- Política especial para usuários poderem ver apenas seus próprios dados pessoais
-- (independentemente das permissões)
DROP POLICY IF EXISTS "Users can always view their own user data" ON public.users;
CREATE POLICY "Users can always view their own user data" ON public.users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Política especial para organização atual - usuários podem ver dados da própria organização
DROP POLICY IF EXISTS "Users can view their organization data" ON public.organizations;
CREATE POLICY "Users can view their organization data" ON public.organizations
  FOR SELECT USING (
    id = public.get_current_user_organization_id()
  );
