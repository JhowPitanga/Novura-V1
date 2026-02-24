// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { cnpj, days } = await req.json();
    const digits = (cnpj || "").replace(/\D/g, "").slice(0, 14);

    if (!digits || digits.length !== 14) {
      return jsonResponse({ error: "CNPJ inválido: forneça 14 dígitos" }, 400);
    }

    // Token seguro via variável de ambiente
    const token = Deno.env.get("RECEITAWS_TOKEN");

    // Endpoint conforme URL fornecida pelo usuário; adiciona token como query param se existir
    const baseUrl = `https://receitaws.com.br/v1/cnpj/${digits}`;
    const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;

    // Consulta server-side para evitar CORS/rate limit
    const resp = await fetch(url, { headers: { accept: "application/json" } });
    if (!resp.ok) {
      const msg = `Falha ao consultar CNPJ (status ${resp.status})`;
      return jsonResponse({ error: msg }, resp.status);
    }

    const data = await resp.json();

    if (data?.status === "ERROR") {
      const msg = data?.message || "Erro na consulta do CNPJ";
      return jsonResponse({ error: msg }, 400);
    }

    const tipoLower = String(data?.tipo || "").toLowerCase();

    let mapped = {
      razao_social: data?.nome || data?.fantasia || "",
      email: data?.email || "",
      cep: String(data?.cep || "").replace(/\D/g, ""),
      cidade: data?.municipio || "",
      estado: data?.uf || "",
      endereco: data?.logradouro || "",
      numero: String(data?.numero || ""),
      bairro: data?.bairro || "",
      complemento: data?.complemento || "",
      tipo_empresa: tipoLower === "matriz" || tipoLower === "filial" ? tipoLower : "",
      // Novos campos para auto-preencher IE e Tributação
      inscricao_estadual: "",
      tributacao: "",
      // Situação cadastral do CNPJ para validação no frontend
      situacao_cnpj: String(data?.situacao || ""),
    } as any;

    try {
      const simplesOpt = Boolean(data?.simples?.optante);
      const simeiOpt = Boolean(data?.simei?.optante);
      if (simeiOpt) {
        mapped.tributacao = "MEI";
      } else if (simplesOpt) {
        mapped.tributacao = "Simples Nacional";
      }
    } catch (_) {}

    // Fallback público: complementar IE/descrições se necessário
    if (!mapped.inscricao_estadual || !mapped.situacao_cnpj) {
      try {
        const altUrl = `https://publica.cnpj.ws/cnpj/${digits}`;
        const altResp = await fetch(altUrl, { headers: { accept: "application/json" } });
        if (altResp.ok) {
          const alt = await altResp.json();
          const sitDesc = String(
            alt?.estabelecimento?.descricao_situacao_cadastral ||
            alt?.descricao_situacao_cadastral ||
            alt?.estabelecimento?.situacao_cadastral?.descricao ||
            ""
          );
          if (sitDesc) {
            mapped.situacao_cnpj = sitDesc;
            // Complementar dados caso estejam ausentes
            mapped.estado = mapped.estado || String(alt?.estabelecimento?.estado?.sigla || "");
            mapped.cidade = mapped.cidade || String(alt?.estabelecimento?.cidade?.nome || "");
            // IE (se existir no primeiro registro)
            const ieReg = alt?.estabelecimento?.inscricoes_estaduais?.[0];
            if (ieReg) {
              mapped.inscricao_estadual = mapped.inscricao_estadual || String(ieReg?.inscricao_estadual || "");
            }
          }
        }
      } catch (_) {
        // Silencia falhas do fallback para não quebrar a consulta principal
      }
    }

    // Consulta CCC (Cadastro Centralizado de Contribuintes) para obter IE e regime ICMS usando token do ReceitaWS
    try {
      const daysNum = Number(days) > 0 ? Math.floor(Number(days)) : 365;
      if (token) {
        const cccUrl = `https://receitaws.com.br/v1/ccc/${digits}/days/${daysNum}?fallback=cacheOnError`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort("CCC timeout"), 9000);
        const cccResp = await fetch(cccUrl, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (cccResp.ok) {
          const cccJson = await cccResp.json();
          const ok = String(cccJson?.status || "").toUpperCase() === "OK";
          if (ok && Array.isArray(cccJson?.registros) && cccJson.registros.length > 0) {
            const registros = cccJson.registros as any[];
            const preferredUf = String(mapped.estado || "").toUpperCase();
            const normalize = (s: string) => String(s || "").toUpperCase();
            let record = registros.find((r) => normalize(r.uf) === preferredUf && String(r?.ie || "").length > 0)
              || registros.find((r) => String(r?.ie || "").length > 0)
              || registros.find((r) => /ATIV|HABIL|REGUL/.test(normalize(r?.situacao_ie)))
              || registros[0];

            if (record) {
              mapped.inscricao_estadual = String(record.ie || "");
              mapped.estado = mapped.estado || String(record.uf || "");
              mapped.situacao_cnpj = mapped.situacao_cnpj || String(record.situacao_cnpj || "");
              const regime = String(record.regime_icms || "");
              const regLower = regime.toLowerCase();
              let trib = "";
              if (regLower.includes("mei") || regLower.includes("simei") || regLower.includes("microempreendedor")) {
                trib = "MEI";
              } else if (regLower.includes("simples") || regLower.includes("sn") || regLower.includes("simples nacional")) {
                trib = "Simples Nacional";
              } else if (regLower) {
                trib = "Regime Normal";
              }
              // Não sobrescrever caso já definido por outra fonte
              mapped.tributacao = mapped.tributacao || trib;
            }
          }
        }
      }
    } catch (_) {
      // Silencia falhas do CCC para não quebrar a consulta principal
    }

    // Integração SintegraWS removida por solicitação — sem fallback, usamos apenas CCC ReceitaWS.

    return jsonResponse({ ok: true, data: mapped });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
