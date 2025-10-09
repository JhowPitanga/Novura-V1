-- Tabela para atributos de produtos variantes
CREATE TABLE IF NOT EXISTS public.products_variantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color TEXT,
  size TEXT,
  voltage TEXT,
  custom_attributes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.products_variantes ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (ajuste conforme necessidade de segurança)
CREATE POLICY "Users can view product variants" 
ON public.products_variantes 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create product variants" 
ON public.products_variantes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update product variants" 
ON public.products_variantes 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete product variants" 
ON public.products_variantes 
FOR DELETE 
USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_products_variantes_updated_at
BEFORE UPDATE ON public.products_variantes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();