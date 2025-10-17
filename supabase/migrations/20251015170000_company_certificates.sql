-- Create secure table for company A1 certificates with org scoping and RLS
-- Stores only encrypted PFX content and validity metadata. Passwords are never stored.

CREATE TABLE IF NOT EXISTS public.company_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text,
  pfx_encrypted text NOT NULL, -- format: enc:gcm:<iv_b64>:<ct_b64>
  pfx_size_bytes integer,
  valid_from date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one active certificate per company
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_cert_active
ON public.company_certificates(company_id)
WHERE active = true;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_company_cert_org ON public.company_certificates(organizations_id);
CREATE INDEX IF NOT EXISTS idx_company_cert_company ON public.company_certificates(company_id);

-- Timestamps trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_cert_updated_at ON public.company_certificates;
CREATE TRIGGER trg_company_cert_updated_at
BEFORE UPDATE ON public.company_certificates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.company_certificates ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Members can view company certificates" ON public.company_certificates;
CREATE POLICY "Members can view company certificates"
ON public.company_certificates
FOR SELECT
USING (
  public.is_org_member(auth.uid(), organizations_id)
);

DROP POLICY IF EXISTS "Owners/Admins can insert company certificates" ON public.company_certificates;
CREATE POLICY "Owners/Admins can insert company certificates"
ON public.company_certificates
FOR INSERT
WITH CHECK (
  public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Owners/Admins can update company certificates" ON public.company_certificates;
CREATE POLICY "Owners/Admins can update company certificates"
ON public.company_certificates
FOR UPDATE
USING (
  public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Owners/Admins can delete company certificates" ON public.company_certificates;
CREATE POLICY "Owners/Admins can delete company certificates"
ON public.company_certificates
FOR DELETE
USING (
  public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);