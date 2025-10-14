-- Create RLS policies for all product-related tables

-- Enable RLS on all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage ENABLE ROW LEVEL SECURITY;

-- Categories policies (users can see all categories, but only manage their own)
CREATE POLICY "Users can view all categories" 
ON public.categories 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create their own categories" 
ON public.categories 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own categories" 
ON public.categories 
FOR UPDATE 
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete their own categories" 
ON public.categories 
FOR DELETE 
USING (auth.uid() = user_id OR user_id IS NULL);

-- Products policies
CREATE POLICY "Users can view their own products" 
ON public.products 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own products" 
ON public.products 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products" 
ON public.products 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products" 
ON public.products 
FOR DELETE 
USING (auth.uid() = user_id);

-- Product groups policies
CREATE POLICY "Users can view all product groups" 
ON public.product_groups 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create product groups" 
ON public.product_groups 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update product groups" 
ON public.product_groups 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete product groups" 
ON public.product_groups 
FOR DELETE 
USING (true);

-- Product group members policies
CREATE POLICY "Users can view all product group members" 
ON public.product_group_members 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create product group members" 
ON public.product_group_members 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update product group members" 
ON public.product_group_members 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete product group members" 
ON public.product_group_members 
FOR DELETE 
USING (true);

-- Products stock policies
CREATE POLICY "Users can view their products stock" 
ON public.products_stock 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.products 
  WHERE products.id = products_stock.product_id 
  AND products.user_id = auth.uid()
));

CREATE POLICY "Users can create stock for their products" 
ON public.products_stock 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products 
  WHERE products.id = products_stock.product_id 
  AND products.user_id = auth.uid()
));

CREATE POLICY "Users can update stock for their products" 
ON public.products_stock 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.products 
  WHERE products.id = products_stock.product_id 
  AND products.user_id = auth.uid()
));

CREATE POLICY "Users can delete stock for their products" 
ON public.products_stock 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.products 
  WHERE products.id = products_stock.product_id 
  AND products.user_id = auth.uid()
));

-- Storage policies
CREATE POLICY "Users can view all storage" 
ON public.storage 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create storage" 
ON public.storage 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update storage" 
ON public.storage 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete storage" 
ON public.storage 
FOR DELETE 
USING (true);

-- Insert default categories
INSERT INTO public.categories (name, user_id) VALUES 
('Eletrônicos', NULL),
('Roupas', NULL),
('Casa e Jardim', NULL),
('Livros', NULL),
('Esportes', NULL),
('Beleza e Cuidados Pessoais', NULL),
('Brinquedos', NULL),
('Automotivo', NULL),
('Ferramentas', NULL),
('Alimentação', NULL);

-- Insert default storage locations
INSERT INTO public.storage (name) VALUES 
('Armazém Principal'),
('Depósito A'),
('Depósito B'),
('Loja Física');

-- Create function to handle product creation with proper validations
CREATE OR REPLACE FUNCTION public.create_product_with_stock(
  p_name TEXT,
  p_sku TEXT,
  p_type TEXT,
  p_description TEXT,
  p_cost_price NUMERIC,
  p_sell_price NUMERIC,
  p_barcode SMALLINT,
  p_ncm SMALLINT,
  p_cest SMALLINT,
  p_package_height SMALLINT,
  p_package_width SMALLINT,
  p_package_length SMALLINT,
  p_weight NUMERIC,
  p_weight_type TEXT,
  p_tax_origin_code SMALLINT,
  p_category_id UUID,
  p_brand_id UUID,
  p_color TEXT,
  p_size TEXT,
  p_image_urls TEXT[],
  p_custom_attributes JSONB,
  p_stock_current SMALLINT,
  p_storage_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_product_id UUID;
BEGIN
  -- Insert the product
  INSERT INTO public.products (
    name, sku, type, description, cost_price, sell_price, barcode, ncm, cest,
    package_height, package_width, package_length, weight, weight_type,
    tax_origin_code, category_id, brand_id, color, size, image_urls,
    custom_attributes, user_id
  ) VALUES (
    p_name, p_sku, p_type, p_description, p_cost_price, p_sell_price, p_barcode, p_ncm, p_cest,
    p_package_height, p_package_width, p_package_length, p_weight, p_weight_type,
    p_tax_origin_code, p_category_id, p_brand_id, p_color, p_size, p_image_urls,
    p_custom_attributes, auth.uid()
  ) RETURNING id INTO new_product_id;

  -- Insert initial stock if provided
  IF p_stock_current IS NOT NULL AND p_storage_id IS NOT NULL THEN
    INSERT INTO public.products_stock (
      product_id, storage_id, current
    ) VALUES (
      new_product_id, p_storage_id, p_stock_current
    );
  END IF;

  RETURN new_product_id;
END;
$$;