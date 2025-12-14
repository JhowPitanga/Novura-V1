import { useState, useEffect, useRef } from "react";
import * as forge from "node-forge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { NavigationButtons } from "@/components/produtos/criar/NavigationButtons";
import { EmpresaStep1 } from "@/components/configuracoes/empresa/EmpresaStep1";
import { EmpresaStep2 } from "@/components/configuracoes/empresa/EmpresaStep2";
import { EmpresaStep3 } from "@/components/configuracoes/empresa/EmpresaStep3";
import { EmpresaStep4 } from "@/components/configuracoes/empresa/EmpresaStep4";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { useAuth } from "@/hooks/useAuth";

const steps = [
  { id: 1, title: "Configuração", description: "Dados da empresa" },
  { id: 2, title: "Certificado A1", description: "Certificado digital" },
  { id: 3, title: "NF-e", description: "Configurações fiscais" },
  { id: 4, title: "Associações", description: "Lojas integradas" }
];

interface EmpresaData {
  razao_social: string;
  cnpj: string;
  tipo_empresa: string;
  tributacao: string;
  inscricao_estadual: string;
  email: string;
  cep: string;
  cidade: string;
  estado: string;
  endereco: string;
  numero: string;
  bairro: string;
  complemento?: string;
  certificado_a1_url?: string;
  certificado_senha?: string;
  certificado_validade?: string;
  lojas_associadas: string[];
  numero_serie: string;
  proxima_nfe: number;
  situacao_cnpj?: string; // novo campo para validação de situação
}

// Representa uma loja conectada via "Aplicativos"
interface ConnectedStore {
  id: string;          // id da integração (marketplace_integrations.id)
  name: string;        // nome da loja (config.storeName)
  marketplace: string; // nome do marketplace (ex.: "Mercado Livre")
  logo?: string;       // URL do logo do app (apps_public_view.logo_url)
}

export function NovaEmpresa() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isCnpjLoading, setIsCnpjLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [cnpjBlocked, setCnpjBlocked] = useState(false);
  const [cnpjBlockMessage, setCnpjBlockMessage] = useState("");
  const debounceRef = useRef<number | null>(null);
  const lastFetchedRef = useRef<string>("");
  const pfxFileRef = useRef<File | null>(null);
  type VerifyStatus = 'idle' | 'checking' | 'valid' | 'invalid';
  const [certVerifyStatus, setCertVerifyStatus] = useState<VerifyStatus>('idle');
  const { organizationId, user, session } = useAuth();
  const [searchParams] = useSearchParams();
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [empresaData, setEmpresaData] = useState<EmpresaData>({
    razao_social: "",
    cnpj: "",
    tipo_empresa: "",
    tributacao: "",
    inscricao_estadual: "",
    email: "",
    cep: "",
    cidade: "",
    estado: "",
    endereco: "",
    numero: "",
    bairro: "",
    complemento: "",
    lojas_associadas: [],
    numero_serie: "",
    proxima_nfe: 0,
    situacao_cnpj: "",
  });
  const [connectedStores, setConnectedStores] = useState<ConnectedStore[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const navigate = useNavigate();

  const updateEmpresaData = (data: Partial<EmpresaData>) => {
    setEmpresaData(prev => ({ ...prev, ...data }));
  };

  // Validação de dígito verificador de CNPJ
  const isValidCNPJ = (cnpj: string) => {
    const digits = (cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(digits)) return false; // rejeita todos os dígitos iguais
  
    const calcDV = (length: number) => {
      const weights = length === 12
        ? [5,4,3,2,9,8,7,6,5,4,3,2]
        : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      let sum = 0;
      for (let i = 0; i < weights.length; i++) {
        sum += parseInt(digits[i], 10) * weights[i];
      }
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
  
    const dv1 = calcDV(12);
    if (dv1 !== parseInt(digits[12], 10)) return false;
    const dv2 = calcDV(13);
    if (dv2 !== parseInt(digits[13], 10)) return false;
    return true;
  };

  // Normaliza texto da situação
  const normalizeSituacao = (s: string) => {
    const noAccents = String(s || "").normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return noAccents.trim().toUpperCase();
  };

  const getCnpjBlockInfo = (situacao: string) => {
    const norm = normalizeSituacao(situacao);
    const rules: { re: RegExp; msg: string }[] = [
      { re: /BAIXAD[OA]/, msg: "Empresa foi encerrada. Um CNPJ baixado não pode ser reativado." },
      { re: /\bNULA\b/, msg: "CNPJ inválido ou anulado pela Receita Federal, geralmente por fraude ou duplicidade." },
      { re: /SUSPENS[OA]/, msg: "Empresa com pendências cadastrais/fiscais. É necessário regularizar para voltar a operar." },
      { re: /INAPT[OA]/, msg: "CNPJ declarado inapto por omissão prolongada de declarações ou irregularidades." },
      // Bloqueio total conforme solicitado
      { re: /ATIVA.*NAO.*REGULAR/, msg: "CNPJ ATIVA NÃO REGULAR. Bloqueio total até regularização cadastral." },
      { re: /PROCESSO.*BAIXA/, msg: "CNPJ EM PROCESSO DE BAIXA. Bloqueio total para emissão de NF-e." },
      { re: /SITUACAO.*ESPECIAL/, msg: "CNPJ em SITUAÇÃO ESPECIAL. Bloqueio total até normalização." },
    ];
    for (const r of rules) {
      if (r.re.test(norm)) return r.msg;
    }
    return null;
  };

  // Busca automática de dados pelo CNPJ via Edge Function
  const fetchCompanyDataFromCNPJ = async (cnpjDigits: string): Promise<Partial<EmpresaData> | null> => {
    setIsCnpjLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cnpj-lookup", {
        body: { cnpj: cnpjDigits, days: 365 },
      });
      if (error) {
        throw new Error(typeof error === "string" ? error : (error.message || "Erro na função cnpj-lookup"));
      }
      if (data?.ok && data?.data) {
        return data.data as Partial<EmpresaData>;
      }
      throw new Error(data?.error || "Resposta inesperada da função cnpj-lookup");
    } catch (err: any) {
      console.error("Falha na consulta do CNPJ:", err);
      const msg = String(err?.message || err);
      if (msg.includes("Failed to send a request")) {
        toast.error("Falha de rede ao acessar a Edge Function. Verifique se 'cnpj-lookup' está implantada no seu projeto Supabase.");
      } else {
        toast.error("Não foi possível consultar o CNPJ agora. Tente novamente.");
      }
      return null;
    } finally {
      setIsCnpjLoading(false);
    }
  };

  useEffect(() => {
    const digits = (empresaData.cnpj || "").replace(/\D/g, "");
    if (digits.length === 14) {
      if (!isValidCNPJ(digits)) {
        // Evita chamadas desnecessárias quando o CNPJ é inválido
        toast.error("CNPJ inválido. Verifique os dígitos e tente novamente.");
        return;
      }
      if (digits !== lastFetchedRef.current) {
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(async () => {
          const result = await fetchCompanyDataFromCNPJ(digits);
          if (result) {
            updateEmpresaData(result);
            lastFetchedRef.current = digits;
            // Avalia situação e aplica bloqueio se necessário
            const situRaw = String((result as any).situacao_cnpj || empresaData.situacao_cnpj || "");
            const norm = normalizeSituacao(situRaw);
            const msg = getCnpjBlockInfo(situRaw);
            console.log("[CNPJ] avaliação situação", { situRaw, norm, msg });
            if (msg) {
              setCnpjBlocked(true);
              setCnpjBlockMessage(msg);
            } else {
              setCnpjBlocked(false);
              setCnpjBlockMessage("");
            }
            toast.success("Dados do CNPJ carregados automaticamente");
          }
        }, 600);
      }
    }
    // Cleanup do debounce quando cnpj muda ou componente desmonta
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [empresaData.cnpj]);

  useEffect(() => {
    // Detecta modo edição via query params: ?companyId=...&step=2
    const companyId = searchParams.get('companyId');
    const stepParam = parseInt(searchParams.get('step') || '', 10);
    if (companyId) {
      setEditCompanyId(companyId);
      void loadCompany(companyId);
    }
    if (!isNaN(stepParam) && stepParam >= 1 && stepParam <= 4) {
      setCurrentStep(stepParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega lojas conectadas (via Aplicativos) para uso no Step 3
  useEffect(() => {
    let cancelled = false;
    const loadConnectedStores = async () => {
      if (!organizationId) return;
      setLoadingStores(true);
      try {
        // 1) Carrega catálogo de apps para obter logos
        const { data: appsView, error: appsErr } = await supabase
          .from('apps_public_view')
          .select('*');

        const appLogoByName = new Map<string, string>();
        if (!appsErr && Array.isArray(appsView)) {
          for (const row of appsView as any[]) {
            if (row?.name && row?.logo_url) appLogoByName.set(row.name, row.logo_url);
          }
        }

        // 2) Carrega integrações de marketplace para a organização
        const { data: integrations, error: intErr } = await supabase
          .from('marketplace_integrations')
          .select('id, marketplace_name, config')
          .eq('organizations_id', organizationId);

        if (intErr) throw intErr;

        const mapped: ConnectedStore[] = (integrations || []).map((row: any) => {
          const displayName = row.marketplace_name === 'mercado_livre' ? 'Mercado Livre' : row.marketplace_name;
          const storeName = row?.config?.storeName || 'Minha Loja';
          const logo = appLogoByName.get(displayName);
          return {
            id: String(row.id),
            name: String(storeName),
            marketplace: String(displayName),
            logo: logo ? String(logo) : undefined,
          } as ConnectedStore;
        });

        if (!cancelled) setConnectedStores(mapped);
      } catch (e) {
        console.error('Falha ao carregar lojas conectadas:', e);
        if (!cancelled) setConnectedStores([]);
      } finally {
        if (!cancelled) setLoadingStores(false);
      }
    };
    loadConnectedStores();
    return () => { cancelled = true; };
  }, [organizationId]);

  const loadCompany = async (companyId: string) => {
    try {
      const { data: company, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      if (!company) return;

      // Mapeia para EmpresaData (com segurança para campos ausentes)
      const mapped: Partial<EmpresaData> = {
        razao_social: company.razao_social || "",
        cnpj: company.cnpj || "",
        tipo_empresa: company.tipo_empresa || "",
        tributacao: company.tributacao || "",
        inscricao_estadual: company.inscricao_estadual || "",
        email: company.email || "",
        cep: company.cep || "",
        cidade: company.cidade || "",
        estado: company.estado || "",
        endereco: company.endereco || "",
        numero: company.numero || "",
        bairro: company.bairro || "",
        complemento: company.complemento || "",
        lojas_associadas: Array.isArray(company.lojas_associadas) ? company.lojas_associadas : [],
        numero_serie: company.numero_serie || "",
        proxima_nfe: company.proxima_nfe || 1,
        situacao_cnpj: company.situacao_cnpj || "",
      };
      setEmpresaData(prev => ({ ...prev, ...mapped }));

      // Carrega configuração NF-e normalizada, se existir, para sobrescrever
      const { data: nfConf } = await supabase
        .from('company_nf_configs')
        .select('numero_serie, proxima_nfe')
        .eq('company_id', companyId)
        .maybeSingle();
      if (nfConf) {
        setEmpresaData(prev => ({
          ...prev,
          numero_serie: nfConf.numero_serie || prev.numero_serie || "",
          proxima_nfe: nfConf.proxima_nfe ?? prev.proxima_nfe ?? 1,
        }));
      }

      // Carrega certificado ativo para preencher Step 2 (somente metadados)
      const { data: cert } = await supabase
        .from('company_certificates')
        .select('valid_to, file_name')
        .eq('company_id', companyId)
        .eq('active', true)
        .maybeSingle();
      if (cert) {
        const parseToBR = (iso: string) => {
          const ymd = String(iso || '').slice(0,10);
          const [y,m,d] = ymd.split('-');
          return (y && m && d) ? `${d}/${m}/${y}` : '';
        };
        setEmpresaData(prev => ({
          ...prev,
          certificado_validade: cert.valid_to ? parseToBR(String(cert.valid_to)) : "",
          certificado_a1_url: cert.file_name || undefined,
        }));
      }
    } catch (e) {
      console.error('Falha ao carregar empresa para edição:', e);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        if (cnpjBlocked) return false;
        return empresaData.razao_social && empresaData.cnpj && empresaData.tipo_empresa && 
               empresaData.tributacao && empresaData.email && empresaData.cep && 
               empresaData.cidade && empresaData.estado && empresaData.endereco && 
               empresaData.numero && empresaData.bairro;
      case 2:
        if (pfxFileRef.current) {
          return certVerifyStatus === 'valid';
        }
        return true;
      case 3:
        return empresaData.numero_serie && empresaData.proxima_nfe; // NF-e obrigatório
      case 4:
        return true; // Lojas são opcionais
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!canProceed()) {
      setShowErrors(true);
      const baseMsg = cnpjBlocked
        ? `CNPJ em situação '${empresaData.situacao_cnpj || ""}'. Não é possível prosseguir.`
        : "Preencha todos os campos obrigatórios antes de prosseguir.";
      toast.error(baseMsg);
      return;
    }
    setShowErrors(false);
    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
    } else if (currentStep === 4) {
      handleSave();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove prefix data:...;base64,
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const formatDateBR = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const ddmmyyyyToISO = (s?: string | null) => {
    const v = String(s || '').trim();
    const m = v.match(/^([0-3]\d)\/(0\d|1[0-2])\/(\d{4})$/);
    if (!m) return null;
    const dd = m[1], mm = m[2], yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleVerifyCertPassword = async () => {
    if (!pfxFileRef.current) {
      toast.error('Selecione um arquivo .pfx para verificar');
      return;
    }
    if (!empresaData.certificado_senha) {
      toast.error('Informe a senha do certificado');
      return;
    }
    try {
      setCertVerifyStatus('checking');
      const startedAt = Date.now();
      const buf = await pfxFileRef.current.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const asn1Obj = forge.asn1.fromDer(binary);
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1Obj, empresaData.certificado_senha);
      let notAfter: Date | undefined;
      for (const sc of p12.safeContents) {
        for (const bag of sc.safeBags) {
          if (bag.type === forge.pki.oids.certBag && (bag as any).cert) {
            const cert = (bag as any).cert as forge.pki.Certificate;
            notAfter = cert.validity.notAfter;
          }
        }
      }
      const ensureMinDelay = async (start: number, minMs: number) => {
        const elapsed = Date.now() - start;
        if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
      };
      if (notAfter) {
        await ensureMinDelay(startedAt, 500);
        setEmpresaData(prev => ({ ...prev, certificado_validade: formatDateBR(notAfter!) }));
        setCertVerifyStatus('valid');
        toast.success('Senha verificada e validade preenchida');
      } else {
        await ensureMinDelay(startedAt, 500);
        setCertVerifyStatus('invalid');
        toast.error('Não foi possível identificar a validade do certificado');
      }
    } catch (err) {
      console.error('Falha ao verificar senha do PFX:', err);
      // Garante feedback por pelo menos 500ms
      await new Promise((r) => setTimeout(r, 500));
      setCertVerifyStatus('invalid');
      toast.error('Senha inválida ou arquivo .pfx não pôde ser lido');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Garante usuário autenticado
      const sessionUser = user; // via useAuth
      if (!sessionUser) throw new Error('Usuário não autenticado');

      // Evita inserir dados sensíveis na tabela companies
      const { certificado_a1_url, certificado_senha, certificado_validade, complemento, numero_serie, proxima_nfe, ...companyPayload } = empresaData as any;
      // Normaliza enums para respeitar constraints do banco
      const safeCompanyPayload = {
        ...companyPayload,
        tipo_empresa: normalizeTipoEmpresa(companyPayload.tipo_empresa),
        tributacao: normalizeTributacao(companyPayload.tributacao),
      };
      if (editCompanyId) {
        // Atualização
        const updatePayload: any = {
          ...safeCompanyPayload,
        };
        if (organizationId) updatePayload.organization_id = organizationId;

        const { data: updated, error: updErr } = await supabase
          .from('companies')
          .update(updatePayload)
          .eq('id', editCompanyId)
          .select('id, organization_id')
          .single();

        if (updErr) throw updErr;

        // Upsert de configuração de NF-e na tabela normalizada
        const { error: nfUpdErr } = await supabase
          .from('company_nf_configs')
          .upsert([
            {
              company_id: updated.id,
              organizations_id: updated.organization_id || organizationId || null,
              numero_serie: empresaData.numero_serie,
              proxima_nfe: empresaData.proxima_nfe,
            }
          ], { onConflict: 'company_id' });
        if (nfUpdErr) throw nfUpdErr;

        if (pfxFileRef.current) {
          try {
            const base64 = await readFileAsBase64(pfxFileRef.current);
            const { error: fnError } = await supabase.functions.invoke('upload-company-certificate', {
              body: {
                company_id: updated.id,
                organization_id: updated.organization_id || organizationId || null,
                pfx_base64: base64,
                file_name: pfxFileRef.current.name,
                valid_to: ddmmyyyyToISO(empresaData.certificado_validade) || empresaData.certificado_validade || null,
              },
              headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
            });
            if (fnError) throw fnError;
          } catch (fnErr) {
            console.error('Falha ao salvar certificado com segurança:', fnErr);
            toast.error('Empresa atualizada, mas houve erro ao salvar o certificado A1. Tente novamente.');
          }
        }

        toast.success('Empresa atualizada com sucesso!');
        navigate('/configuracoes');
      } else {
        // Inserção
        const insertPayload: any = {
          ...safeCompanyPayload
        };
        if (organizationId) insertPayload.organization_id = organizationId;

        const { data: inserted, error: insertErr } = await supabase
          .from('companies')
          .insert([insertPayload])
          .select('id, organization_id')
          .single();

        if (insertErr) throw insertErr;

        // Upsert de configuração de NF-e na tabela normalizada
        const { error: nfInsErr } = await supabase
          .from('company_nf_configs')
          .upsert([
            {
              company_id: inserted.id,
              organizations_id: inserted.organization_id || organizationId || null,
              numero_serie: empresaData.numero_serie,
              proxima_nfe: empresaData.proxima_nfe,
            }
          ], { onConflict: 'company_id' });
        if (nfInsErr) throw nfInsErr;

        // Opcional: se o usuário selecionou um PFX, envia para função segura com criptografia
        if (pfxFileRef.current) {
          try {
            const base64 = await readFileAsBase64(pfxFileRef.current);
            const { error: fnError } = await supabase.functions.invoke('upload-company-certificate', {
              body: {
                company_id: inserted.id,
                organization_id: inserted.organization_id || organizationId || null,
                pfx_base64: base64,
                file_name: pfxFileRef.current.name,
                valid_to: ddmmyyyyToISO(empresaData.certificado_validade) || empresaData.certificado_validade || null,
              },
              headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
            });
            if (fnError) throw fnError;
          } catch (fnErr) {
            console.error('Falha ao salvar certificado com segurança:', fnErr);
            // Não falha o cadastro da empresa, apenas alerta o usuário
            toast.error('Empresa criada, mas houve erro ao salvar o certificado A1. Você pode tentar novamente nas configurações.');
          }
        }

        toast.success('Empresa cadastrada com sucesso!');
        navigate('/configuracoes');
      }
    } catch (error) {
      console.error('Erro ao salvar empresa:', error);
      toast.error('Erro ao salvar empresa');
    } finally {
      setLoading(false);
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <EmpresaStep1 data={empresaData} updateData={updateEmpresaData} showErrors={showErrors} cnpjBlocked={cnpjBlocked} />;
      case 2:
        return (
          <EmpresaStep2
            data={empresaData}
            updateData={updateEmpresaData}
            onPfxSelected={(file) => {
              pfxFileRef.current = file;
              setCertVerifyStatus('idle');
              if (file) {
                setEmpresaData(prev => ({ ...prev, certificado_validade: '' }));
              }
            }}
            onCertPasswordChange={(pwd) => {
              setEmpresaData(prev => ({ ...prev, certificado_senha: pwd }));
              setCertVerifyStatus('idle');
            }}
            onVerifyPassword={handleVerifyCertPassword}
            verifyStatus={certVerifyStatus}
          />
        );
      case 3:
        return <EmpresaStep4 data={empresaData} updateData={updateEmpresaData} />; // NF-e agora no Step 3
      case 4:
        return (
          <EmpresaStep3
            data={empresaData}
            updateData={updateEmpresaData}
            connectedStores={connectedStores}
            loadingStores={loadingStores}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 p-6 overflow-auto">
            <div className="p-8 max-w-4xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{editCompanyId ? 'Editar Empresa' : 'Adicionar Nova Empresa'}</h1>
                <p className="text-gray-600">{editCompanyId ? 'Atualize os dados da empresa e renove o certificado A1' : 'Configure uma nova empresa para emissão de notas fiscais'}</p>
              </div>
  
              <StepIndicator steps={steps} currentStep={currentStep} clickable={!!editCompanyId} onStepClick={(id) => setCurrentStep(id)} />
  
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 relative">
                {isCnpjLoading && (
                  <div className="absolute inset-0 bg-novura-primary/10 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="flex items-center gap-3 text-novura-primary">
                      {/* Simple SVG spinner */}
                      <svg className="animate-spin h-6 w-6 text-novura-primary" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      <span>Consultando dados do CNPJ na ReceitaWS...</span>
                    </div>
                  </div>
                )}

                {cnpjBlocked && (
                  <div className="mb-6 rounded-md border border-red-300 bg-red-50 p-4">
                    <p className="text-red-700 font-medium">
                      CNPJ em situação {empresaData.situacao_cnpj || ""}
                    </p>
                    <p className="text-red-700 text-sm">
                      {cnpjBlockMessage} Não podemos prosseguir com a emissão de NF-e com este CNPJ.
                    </p>
                  </div>
                )}

                {renderCurrentStep()}

                <div className="mt-8 flex items-center justify-between">
                  <NavigationButtons
                    currentStep={currentStep}
                    maxSteps={4}
                    productType="company"
                    loading={loading}
                    onNext={handleNext}
                    onBack={handleBack}
                    onSave={handleSave}
                    canProceedCompany={canProceed}
                    saveLabel={editCompanyId ? "Salvar alterações" : "Salvar Empresa"}
                  />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default NovaEmpresa;

// Normalização para atender constraints do banco
const normalizeTipoEmpresa = (v: string) => {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'matriz' || s === 'matríZ') return 'Matriz';
  if (s === 'filial') return 'Filial';
  // fallback seguro
  return 'Matriz';
};

const normalizeTributacao = (v: string) => {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'mei') return 'MEI';
  if (s === 'simples nacional') return 'Simples Nacional';
  if (s.includes('excesso') || s.includes('sublimite')) return 'Simples Nacional - Excesso de sublimite de receita bruta';
  if (s === 'regime normal' || s === 'normal') return 'Regime Normal';
  // fallback comum
  return 'Simples Nacional';
};
