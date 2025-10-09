-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create companies table for fiscal configuration
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  razao_social TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  tipo_empresa TEXT NOT NULL CHECK (tipo_empresa IN ('Matriz', 'Filial')),
  tributacao TEXT NOT NULL CHECK (tributacao IN ('MEI', 'Simples Nacional', 'Simples Nacional - Excesso de sublimite de receita bruta', 'Regime Normal')),
  inscricao_estadual TEXT,
  email TEXT NOT NULL,
  cep TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  endereco TEXT NOT NULL,
  numero TEXT NOT NULL,
  bairro TEXT NOT NULL,
  certificado_a1_url TEXT,
  certificado_validade DATE,
  certificado_senha TEXT,
  lojas_associadas JSONB DEFAULT '[]'::jsonb,
  numero_serie TEXT,
  proxima_nfe INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_invitations table for user management
CREATE TABLE public.user_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invited_by_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativo', 'inativo')),
  invitation_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on companies table
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Create policies for companies
CREATE POLICY "Users can view their own companies" 
ON public.companies 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own companies" 
ON public.companies 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own companies" 
ON public.companies 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own companies" 
ON public.companies 
FOR DELETE 
USING (auth.uid() = user_id);

-- Enable RLS on user_invitations table
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- Create policies for user_invitations
CREATE POLICY "Users can view invitations they created" 
ON public.user_invitations 
FOR SELECT 
USING (auth.uid() = invited_by_user_id);

CREATE POLICY "Users can create invitations" 
ON public.user_invitations 
FOR INSERT 
WITH CHECK (auth.uid() = invited_by_user_id);

CREATE POLICY "Users can update invitations they created" 
ON public.user_invitations 
FOR UPDATE 
USING (auth.uid() = invited_by_user_id);

CREATE POLICY "Users can delete invitations they created" 
ON public.user_invitations 
FOR DELETE 
USING (auth.uid() = invited_by_user_id);

-- Create trigger for automatic timestamp updates on companies
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for automatic timestamp updates on user_invitations
CREATE TRIGGER update_user_invitations_updated_at
BEFORE UPDATE ON public.user_invitations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();