-- Criar tabela para kits (produtos compostos)
CREATE TABLE public.product_kits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela para itens que compõem os kits
CREATE TABLE public.product_kit_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id UUID NOT NULL REFERENCES public.product_kits(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.product_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_kit_items ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para product_kits
CREATE POLICY "Users can view product kits" 
ON public.product_kits 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create product kits" 
ON public.product_kits 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update product kits" 
ON public.product_kits 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete product kits" 
ON public.product_kits 
FOR DELETE 
USING (true);

-- Políticas RLS para product_kit_items
CREATE POLICY "Users can view product kit items" 
ON public.product_kit_items 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create product kit items" 
ON public.product_kit_items 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update product kit items" 
ON public.product_kit_items 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete product kit items" 
ON public.product_kit_items 
FOR DELETE 
USING (true);

-- Adicionar triggers para atualização automática de updated_at
CREATE TRIGGER update_product_kits_updated_at
BEFORE UPDATE ON public.product_kits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_kit_items_updated_at
BEFORE UPDATE ON public.product_kit_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Função para calcular estoque disponível de kits
CREATE OR REPLACE FUNCTION public.calculate_kit_stock(kit_product_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    min_stock INTEGER := 999999999;
    item_stock INTEGER;
    kit_rec RECORD;
BEGIN
    -- Busca todos os itens do kit
    FOR kit_rec IN 
        SELECT pki.product_id, pki.quantity
        FROM public.product_kits pk
        JOIN public.product_kit_items pki ON pk.id = pki.kit_id
        WHERE pk.product_id = kit_product_id
    LOOP
        -- Calcula o estoque disponível para este item
        SELECT COALESCE(SUM(ps.current), 0) / kit_rec.quantity
        INTO item_stock
        FROM public.products_stock ps
        WHERE ps.product_id = kit_rec.product_id;
        
        -- Atualiza o estoque mínimo
        IF item_stock < min_stock THEN
            min_stock := item_stock;
        END IF;
    END LOOP;
    
    -- Se não há itens no kit, retorna 0
    IF min_stock = 999999999 THEN
        RETURN 0;
    END IF;
    
    RETURN min_stock;
END;
$$;

-- Função para duplicar produto
CREATE OR REPLACE FUNCTION public.duplicate_product(original_product_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_product_id UUID;
    original_product RECORD;
    new_sku TEXT;
    counter INTEGER := 1;
    kit_rec RECORD;
    variant_rec RECORD;
    stock_rec RECORD;
BEGIN
    -- Busca o produto original
    SELECT * INTO original_product 
    FROM public.products 
    WHERE id = original_product_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado: %', original_product_id;
    END IF;
    
    -- Gera um novo SKU único
    new_sku := original_product.sku || '_COPY';
    WHILE EXISTS(SELECT 1 FROM public.products WHERE sku = new_sku) LOOP
        counter := counter + 1;
        new_sku := original_product.sku || '_COPY_' || counter;
    END LOOP;
    
    -- Cria o novo produto
    INSERT INTO public.products (
        name, sku, type, description, cost_price, sell_price, barcode,
        ncm, cest, tax_origin_code, weight, weight_type, package_length,
        package_width, package_height, user_id, image_urls, color, size,
        custom_attributes, category_id, brand_id
    )
    SELECT 
        name || ' (Cópia)',
        new_sku,
        type,
        description,
        cost_price,
        sell_price,
        barcode + 1, -- Incrementa o código de barras
        ncm,
        cest,
        tax_origin_code,
        weight,
        weight_type,
        package_length,
        package_width,
        package_height,
        user_id,
        image_urls,
        color,
        size,
        custom_attributes,
        category_id,
        brand_id
    FROM public.products 
    WHERE id = original_product_id
    RETURNING id INTO new_product_id;
    
    -- Se for um kit, duplicar os itens do kit
    IF original_product.type = 'ITEM' THEN
        -- Criar entrada na tabela de kits
        INSERT INTO public.product_kits (product_id)
        VALUES (new_product_id);
        
        -- Copiar itens do kit
        FOR kit_rec IN 
            SELECT pki.*
            FROM public.product_kits pk
            JOIN public.product_kit_items pki ON pk.id = pki.kit_id
            WHERE pk.product_id = original_product_id
        LOOP
            INSERT INTO public.product_kit_items (kit_id, product_id, quantity)
            SELECT pk.id, kit_rec.product_id, kit_rec.quantity
            FROM public.product_kits pk
            WHERE pk.product_id = new_product_id;
        END LOOP;
    END IF;
    
    -- Se for um produto pai de variações, duplicar as variações
    IF original_product.type = 'VARIACAO_PAI' THEN
        FOR variant_rec IN 
            SELECT p.*
            FROM public.product_group_members pgm
            JOIN public.products p ON pgm.product_id = p.id
            WHERE pgm.product_group_id = original_product_id
        LOOP
            -- Duplicar cada variação
            PERFORM public.duplicate_product(variant_rec.id);
            
            -- Vincular a nova variação ao novo produto pai
            INSERT INTO public.product_group_members (product_group_id, product_id)
            SELECT new_product_id, duplicate_product(variant_rec.id);
        END LOOP;
    END IF;
    
    -- Duplicar estoque inicial (opcional - pode começar zerado)
    FOR stock_rec IN 
        SELECT * FROM public.products_stock WHERE product_id = original_product_id
    LOOP
        INSERT INTO public.products_stock (product_id, storage_id, current, reserved, in_transit)
        VALUES (new_product_id, stock_rec.storage_id, 0, 0, 0); -- Começa com estoque zerado
    END LOOP;
    
    RETURN new_product_id;
END;
$$;