-- Tabela para armazenar descrições atuais dos anúncios do Mercado Livre
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_item_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_name text NOT NULL DEFAULT 'Mercado Livre',
  marketplace_item_id text NOT NULL,
  plain_text text,
  html text,
  last_updated timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Evita duplicações por org+marketplace+item (sempre mantém a versão mais recente)
ALTER TABLE public.marketplace_item_descriptions
  ADD CONSTRAINT uq_marketplace_item_descriptions_org_marketplace_item UNIQUE (organizations_id, marketplace_name, marketplace_item_id);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_marketplace_item_descriptions_org ON public.marketplace_item_descriptions(organizations_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_item_descriptions_item ON public.marketplace_item_descriptions(marketplace_item_id);

-- RLS
ALTER TABLE public.marketplace_item_descriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Item descriptions: members can view" ON public.marketplace_item_descriptions;
CREATE POLICY "Item descriptions: members can view"
ON public.marketplace_item_descriptions
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

DROP POLICY IF EXISTS "Item descriptions: owners/admins can insert" ON public.marketplace_item_descriptions;
CREATE POLICY "Item descriptions: owners/admins can insert"
ON public.marketplace_item_descriptions
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Item descriptions: owners/admins can update" ON public.marketplace_item_descriptions;
CREATE POLICY "Item descriptions: owners/admins can update"
ON public.marketplace_item_descriptions
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Item descriptions: owners/admins can delete" ON public.marketplace_item_descriptions;
CREATE POLICY "Item descriptions: owners/admins can delete"
ON public.marketplace_item_descriptions
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- Realtime publication
ALTER TABLE public.marketplace_item_descriptions REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_item_descriptions';
  END IF;
END $$;

COMMIT;