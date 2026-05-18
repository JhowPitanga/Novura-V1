# PRD — Fluxo Completo do Usuário: Onboarding ao Operacional

> **Status:** Rascunho v1 — 2026-02-28
> **Scope:** MVP completo (Cycle 0 + Cycle 1). Itens pós-MVP estão sinalizados como `[POST-MVP]`.
> **Audiência:** Time de produto e engenharia.

---

## ⚠️ Premissa Fundamental — Leia Antes de Implementar Qualquer Coisa

**A maior parte do frontend já existe.** Este PRD não é um projeto de design do zero.

O Novura já tem telas funcionais para: detalhes de pedido (com breakdown de valores e margem), listagem de anúncios, painel de pedidos, tela de produtos, e outros módulos. O visual, os componentes, a paleta de cores e a estrutura de navegação já estão construídos e aprovados.

**O que este PRD descreve é majoritariamente:**
1. **Refatoração de backend** — novos modelos de dados (Cycle 0), novas edge functions, nova lógica de polling/webhook
2. **Rewiring do frontend** — conectar as telas existentes às novas queries/tabelas ao invés das antigas
3. **Novas telas pontuais** — onboarding (cadastro, CNPJ, loading, diagnóstico) e checklist operacional, que ainda não existem

**O que NÃO está no escopo por padrão:**
- Redesign de componentes existentes
- Mudança de cores, tipografia, espaçamentos ou layout de telas já aprovadas
- Criação de novos componentes visuais onde um componente existente já serve

**Regra para qualquer agente ou desenvolvedor implementando a partir deste PRD:**
> Antes de criar uma nova tela ou componente, verificar se já existe um equivalente em `src/pages/` ou `src/components/`. Se existir, a tarefa é **adaptar a fonte de dados**, não redesenhar. Alterações de frontend motivadas por mudanças de backend devem se limitar à camada de serviço (`services/`) e hooks (`hooks/`) — não à camada de apresentação (JSX, CSS, Tailwind classes).

---

## 1. Problem Statement

### Situação atual
ERPs brasileiros para e-commerce (Bling, Tiny) exigem que o vendedor configure o sistema antes de ver qualquer valor. O vendedor passa horas inserindo produtos, configurando impostos e vinculando anúncios antes de entender se o ERP resolve o problema dele. A maioria abandona no meio.

### Dores do usuário-alvo
O perfil é o vendedor pequeno de Mercado Livre com faturamento ~R$100k/mês:

- **Não sabe exatamente quanto ganha** — vê a receita bruta no ML, mas comissões, frete e devoluções ficam ocultos
- **Perda de tempo operacional** — emitir NFe, imprimir etiqueta e marcar como enviado são ações manuais, repetidas dezenas de vezes por dia
- **Medo de configurar** — a curva de aprendizado do Bling/Tiny é alta; muitos desistem antes de ativar a emissão de NFe
- **Sem visão de margem real** — sabem o preço de custo, mas nunca somaram comissão + frete + imposto por produto

### Aposta central do Novura
Inverter o fluxo: **mostrar o diagnóstico antes de pedir qualquer configuração**. O vendedor conecta o ML, vê em menos de 5 minutos quanto dinheiro está deixando na mesa, e decide se quer operar por aqui. Só depois de decidido ele configura o que precisa para operar.

### Impacto no negócio
- Reduzir abandono no onboarding (benchmark: Bling/Tiny estimado em >60% antes da primeira NFe)
- Aumentar conversão free → pago pelo "aha moment" do diagnóstico
- Reduzir tempo até primeira NFe emitida (meta: < 30 minutos após cadastro)

---

## 2. Modelo de Dados — Decisões Arquiteturais que Impactam o Fluxo

Essas decisões precisam estar claras antes de implementar qualquer tela.

### 2.1 Hierarquia de entidades

```
auth.users (pessoa física — Supabase Auth)
  └── organization_members (papel: owner, admin, operator)
        └── organizations (conta no Novura)
              └── companies (CNPJ — suporta múltiplos desde o início)
                    └── marketplace_integrations (ML, Shopee, etc.)
```

**Decisão:** `organization_id` é criada no passo de cadastro (auth), não no passo de CNPJ. O CNPJ enriquece a `company` que já existe como registro vazio. Isso permite multi-CNPJ no futuro sem refatoração.

### 2.2 Modelo de Produtos e Variações

**Padrão da indústria (Shopify, Bling, Tiny, Omie, ML):**

```
products (produto pai — a "coisa" que você vende)
  ├── nome, descrição, categoria, fotos, marca
  └── product_variations (SKUs filhos — cada combinação única)
        ├── sku, barcode (EAN/GTIN)
        ├── atributos: tamanho, cor, voltagem, etc.
        ├── custo unitário (pode variar por variação)
        └── products_stock (estoque por variação por armazém)

product_kits (bundle — dois produtos distintos vendidos juntos)
  └── kit_items
        ├── product_variation_id (qual SKU entra no kit)
        └── quantity (quantas unidades desse SKU)
```

**Regras:**
- Um produto **sempre** tem ao menos uma variação (mesmo que "sem variação" seja a única)
- Variações compartilham nome e fotos do pai, mas têm estoque e custo independentes
- Kit **não tem estoque próprio** — seu estoque é derivado do componente mais escasso
- Quando um pedido de kit é processado, a baixa de estoque ocorre em cada componente individualmente

**Mapeamento com ML:**
- 1 anúncio ML → 1 produto pai
- 1 variação do anúncio ML → 1 `product_variation`
- 1 anúncio de kit no ML → 1 `product_kit` com N `kit_items`

### 2.3 Webhook vs Polling

| Situação | Mecanismo | Dados processados |
|---|---|---|
| Onboarding (todos os usuários) | Polling único, 90 dias | Pedidos históricos + anúncios + diagnóstico |
| Operação contínua (todos os usuários) | Webhook em tempo real | Novos pedidos, atualizações de status |
| Lacuna durante setup | Polling pontual | Pedidos entre webhook ativo e fim da configuração |

**Decisão:** Webhook é ativado imediatamente na conexão OAuth, independente de plano. O usuário free vê pedidos em tempo real (somente leitura). Funcionalidades operacionais (emitir NFe, imprimir etiqueta) ficam bloqueadas até assinar.

---

## 3. Fluxo Completo do Usuário

---

### ETAPA 1 — Cadastro

**O que acontece:**
- Usuário acessa `novuraerp.com.br`
- Dois métodos de cadastro disponíveis:
  - Google OAuth (menor atrito — recomendado como CTA principal)
  - Email + senha (link secundário "Cadastrar com email")
- Supabase Auth cria o registro em `auth.users`
- Automaticamente cria: `organizations` (vazio) + `organization_members` (papel: `owner`) + `companies` (vazio, aguardando CNPJ)

**UX:**
- Tela única, limpa. Logo + CTA "Entrar com Google" + link "Usar email".
- Sem formulários longos. Sem "confirme sua senha".
- Verificação de email: enviada em background, não bloqueia o fluxo. O usuário avança para ETAPA 2 imediatamente.

**Critério de aceite:**
- [ ] Usuário que entra com Google vai direto para ETAPA 2 (sem tela intermediária)
- [ ] Usuário que usa email recebe verificação, mas pode continuar sem clicar no link
- [ ] `organization_id` já existe quando ETAPA 2 começa

---

### ETAPA 2 — CNPJ e Enriquecimento Automático

**O que acontece:**

O usuário digita o CNPJ. O sistema bate na API (ReceitaWS ou Minha Receita) e auto-preenche:

| Dado | Fonte | Uso |
|---|---|---|
| Razão social | ReceitaWS | Campo empresa pré-preenchido |
| Nome fantasia | ReceitaWS | Nome exibido no sistema |
| Endereço completo | ReceitaWS | Obrigatório para NFe |
| CNAE principal | ReceitaWS | Infere atividade + sugere CFOP |
| Porte (MEI, ME, EPP) | ReceitaWS | Sugere regime tributário |
| Situação cadastral | ReceitaWS | Bloqueia se CNPJ inapto/suspenso |
| Data de abertura | ReceitaWS | Contexto do diagnóstico |

**Sugestão de regime tributário (confirmar com o usuário):**
- MEI → Simples Nacional (MEI), CRT = 1
- ME/EPP → Pergunta: "Simples Nacional ou Lucro Presumido?" (CNAE e porte orientam a sugestão)
- Demais → "Lucro Presumido" como padrão, editável

**O usuário confirma ou ajusta:**
- Razão social ✓
- Regime tributário (dropdown pré-selecionado)
- Número de inscrição estadual (IE) — campo livre, obrigatório para NFe mas pode pular agora

**CPF:** Se o usuário tentar CPF → "No momento aceitamos apenas CNPJ. Pessoa física ainda não está disponível." (sem formulário adicional, sem promessa de data).

**Critério de aceite:**
- [ ] CNPJ válido → campos preenchidos em < 2 segundos
- [ ] CNPJ inapto/suspenso → mensagem clara e bloqueio de avanço
- [ ] Regime tributário pré-selecionado com base no porte
- [ ] IE pode ser pulada (banner amarelo avisando que será necessária para NFe)
- [ ] `companies` atualizada com todos os dados ao confirmar

---

### ETAPA 3 — Conectar Mercado Livre

**O que acontece:**
- Tela simples: "Agora conecte sua conta do Mercado Livre para importar seus dados."
- Botão "Conectar Mercado Livre" → abre popup OAuth (fluxo PKCE, já implementado)
- Após autorização:
  - `marketplace_integrations` criada com tokens encriptados
  - Webhook registrado imediatamente (todos os planos)
  - OAuth scope inclui: `read_orders`, `read_listings`, `read_metrics`, `read_ads`
  - Sistema inicia ETAPA 4 automaticamente

**UX:**
- Explicação do que vai ser importado: "Vamos buscar seus pedidos dos últimos 90 dias, seus anúncios e suas métricas de desempenho."
- Tranquilizador: "Não publicamos nada. Apenas leitura."

**Multi-marketplace (infra desde o início, UI no MVP só com ML):**
- A tela mostra cards de marketplace. ML ativo. Shopee, Amazon com badge "Em breve".

**Critério de aceite:**
- [ ] OAuth completa em < 5 segundos após autorização
- [ ] Webhook registrado no ML antes de redirecionar para ETAPA 4
- [ ] Tokens armazenados encriptados (AES-GCM-256)
- [ ] Falha de OAuth → mensagem clara, botão "Tentar novamente"

---

### ETAPA 4 — Polling Inicial e Loading Narrativo

**O que acontece:**
Importação assíncrona em background com feedback visual em tempo real.

**O que é importado:**
| Dado | Período | Tabela de destino |
|---|---|---|
| Pedidos | Últimos 90 dias | `orders`, `order_items`, `order_shipping` |
| Anúncios | Todos ativos | `marketplace_items` |
| Saúde dos anúncios | Snapshot atual | `marketplace_items.quality_score` |
| Métricas de ADS | Últimos 90 dias | `marketplace_metrics` |
| Reputação do vendedor | Snapshot atual | `marketplace_integrations.config` |
| Cancelamentos e reclamações | Últimos 90 dias | `orders` com status cancelado |

**UX — Loading narrativo (não barra de progresso técnica):**

```
✅ Conectado ao Mercado Livre
⏳ Importando seus pedidos dos últimos 90 dias... (247 pedidos encontrados)
✅ 247 pedidos importados
⏳ Analisando seus 83 anúncios...
✅ 83 anúncios importados · 12 com qualidade abaixo do ideal
⏳ Calculando suas taxas e comissões...
⏳ Preparando seu diagnóstico...
✅ Diagnóstico pronto!
```

Cada linha aparece conforme o processo avança. Dura entre 20–90 segundos dependendo do volume.

**Estado vazio (vendedor sem pedidos nos últimos 90 dias):**
- "Não encontramos pedidos nos últimos 90 dias. Vamos mostrar seus anúncios e você pode começar a configurar seus produtos."
- Não é um erro — segue para o diagnóstico adaptado (foco em anúncios e configuração).

**Critério de aceite:**
- [ ] Cada etapa do loading atualiza em tempo real (polling de status ou websocket)
- [ ] Timeout máximo de 3 minutos → mensagem "Ainda processando, você receberá um email quando estiver pronto"
- [ ] Estado vazio tratado graciosamente
- [ ] Dados salvos nas tabelas corretas do Cycle 0 (não na `marketplace_orders_presented_new`)

---

### ETAPA 5 — Diagnóstico ("Momento Aha")

**Objetivo:** Causar reação emocional, não só informar. O usuário deve pensar "não sabia que estava perdendo tanto".

**Estrutura da tela:**

**Header:**
> "Você vendeu **R$ 47.832** nos últimos 90 dias."
> "Mas ficou com **R$ 31.204** depois das taxas. Veja onde foram os outros **R$ 16.628**."

**Cards principais:**

| Card | Dado | Por que funciona |
|---|---|---|
| 💸 Comissões ML | R$X (Y% da receita) | Sempre choca — é o maior custo oculto |
| 📦 Frete | R$X (Z pedidos com frete grátis que você pagou) | Segundo maior custo invisível |
| ❌ Cancelamentos | X pedidos · R$X perdido | Gera urgência para melhorar |
| ⭐ Melhor produto | Produto com maior receita | Positivo — balanceia o choque |
| 📉 Atenção necessária | Produto com maior custo de frete relativo | Gancho para inserir custo |

**Saúde da conta ML:**

```
Sua reputação: 🟢 Verde (95% de avaliações positivas)
Taxa de cancelamento: 2.1% (meta ML: < 3%) ✓
Taxa de reclamações: 0.8% (meta ML: < 2%) ✓
12 anúncios com qualidade abaixo do ideal — Ver quais →
```

**Gancho para margem real:**

> "Esses números consideram apenas as taxas do Mercado Livre. **Adicione o custo dos seus produtos** para ver sua margem real."

CTA: "Inserir custo dos produtos" (leva para ETAPA 8 — disponível apenas no plano pago, com paywall contextual).

**Análise de ADS (se tiver campanhas ativas):**

> "Seus ADS custaram **R$ 1.240** e geraram **R$ 8.750** em vendas. ROAS: 7,1x"
> "Mas 3 campanhas têm ROAS abaixo de 3x. Veja quais estão desperdiçando dinheiro → [PAGO]"

**Critério de aceite:**
- [ ] Tela carrega em < 2 segundos após polling completo
- [ ] Valores calculados são corretos (testado contra dados reais de ML)
- [ ] Cards de ADS aparecem apenas se o usuário tem campanhas ativas
- [ ] Estado vazio (sem pedidos) mostra versão adaptada focada em anúncios

---

### ETAPA 6 — Navegação Principal (Plano Free — Somente Leitura)

**Princípio:** Mesmas telas que o plano pago. Ações operacionais bloqueadas com paywalls contextuais. O usuário vê exatamente o que vai ter, não uma versão empobrecida.

**Menu disponível:**

| Módulo | Free | Pago |
|---|---|---|
| Diagnóstico | ✅ completo | ✅ completo |
| Pedidos | ✅ leitura | ✅ + emitir NFe, imprimir etiqueta |
| Anúncios | ✅ leitura | ✅ + editar preço, estoque, criar novo |
| Margem por produto | ✅ proporcional* | ✅ todos os produtos |
| ADS — diagnóstico inicial | ✅ | ✅ |
| ADS — monitoramento contínuo | ❌ paywall | ✅ |
| Estoque | ❌ paywall | ✅ |
| NFe / Fiscal | ❌ paywall | ✅ |
| Relatórios avançados | ❌ paywall | ✅ |

*\*Margem proporcional — regra: `min(5, max(1, floor(total_anuncios * 0.2)))` — para 10 anúncios libera 2, para 25 anúncios libera 5.*

**Paywalls contextuais (não banners passivos):**

| Ação do usuário | Mensagem do paywall |
|---|---|
| Clica "Emitir NFe" | "Emissão de NFe disponível no Novura Pro. Automatize suas notas e economize horas por semana." |
| Clica "Editar preço" no anúncio | "Gerencie seus anúncios diretamente no Novura com o plano Pro." |
| Quer ver margem do produto #6+ | "Veja a margem de todos os seus produtos. Assine o Novura Pro." |
| Tenta criar etiqueta | "Impressão de etiquetas disponível no plano Pro." |

Cada paywall tem: **título claro**, **benefício específico**, botão "Assinar agora", link "Ver o que está incluído".

**Critério de aceite:**
- [ ] Botões bloqueados têm tooltip ou abrem modal — nunca simplesmente não respondem
- [ ] Paywall contextual menciona especificamente o que o usuário estava tentando fazer
- [ ] Navegação entre módulos funciona normalmente no free

---

### ETAPA 7 — Conversão (Assinatura)

**Trial:** 14 dias grátis após o pagamento (cartão necessário para ativar). Sem trial sem cartão.

**Como o usuário chega aqui:**
- Paywall contextual → botão "Assinar agora"
- Menu lateral → badge "PRO" clicável
- Banner fixo discreto no topo (apenas após 3+ interações com paywalls)

**Fluxo de assinatura:**
1. Tela de plano (único plano MVP — valor a definir)
2. Input de cartão (Stripe Elements)
3. Confirmação → trial de 14 dias ativo
4. Redirect para ETAPA 8

**Nota sobre Focus NFe — Estratégia de planos:**

**Decisão: NÃO construir emissor próprio de NFe.** Ver análise completa abaixo.

---

#### Comparativo Focus vs Nuvem Fiscal

| | Focus Start | Focus Growth | Nuvem Fiscal I | Nuvem Fiscal II |
|---|---|---|---|---|
| **Preço/mês** | R$113,90 | R$548,00 | R$180,00 | R$600,00 |
| **CNPJs** | 3 + R$37,90 cada | Ilimitados | Ilimitados | Ilimitados |
| **Ops incluídas** | 100/CNPJ | 4.000 total | 10.000 total | 100.000 total |
| **Op adicional** | R$0,10 | R$0,12 | — (verificar) | — (verificar) |
| **Queries CNPJ** | ❌ | ❌ | ✅ 150.000 | ✅ 500.000 |
| **Queries CEP** | ❌ | ❌ | ✅ 200.000 | ✅ 700.000 |
| **Trial** | 30 dias | 30 dias | — (verificar) | — (verificar) |

#### Por que Nuvem Fiscal vence economicamente

**Custo por cliente em escala — Focus Growth vs Nuvem Fiscal:**

| Clientes | Ops/cliente | Total ops | Focus Growth | Nuvem Fiscal | Diferença |
|---|---|---|---|---|---|
| 20 | 200 | 4.000 | R$548 | R$180 (I) | **-R$368/mês** |
| 50 | 200 | 10.000 | R$548 + R$720 = R$1.268 | R$180 (I, no limite) | **-R$1.088/mês** |
| 50 | 300 | 15.000 | R$548 + R$1.320 = R$1.868 | R$600 (II) | **-R$1.268/mês** |
| 100 | 300 | 30.000 | R$548 + R$3.120 = R$3.668 | R$600 (II) | **-R$3.068/mês** |
| 100 | 500 | 50.000 | R$548 + R$5.520 = R$6.068 | R$600 (II) | **-R$5.468/mês** |

**Margem bruta com Nuvem Fiscal Fiscal II a R$149/cliente:**

| Clientes | Custo NF/cliente | Margem bruta |
|---|---|---|
| 50 | R$12,00 | R$137 **(92%)** |
| 100 | R$6,00 | R$143 **(96%)** |
| 200 | R$3,00 | R$146 **(98%)** |

A Nuvem Fiscal tem modelo de custo fixo (flat rate por volume de ops) — quanto mais clientes, menor o custo por cliente. Focus tem custo variável por nota — quanto mais clientes, maior o custo proporcional.

#### Vantagem adicional: CNPJ e CEP já incluídos

O Nuvem Fiscal inclui queries de CNPJ (150k/mês no Fiscal I) e CEP (200k/mês). Isso significa que a **Etapa 2 do onboarding** (enriquecimento automático via CNPJ) pode usar a própria API da Nuvem Fiscal — eliminando a dependência do ReceitaWS como serviço separado.

Stack simplificado:
- ~~ReceitaWS~~ → Nuvem Fiscal CNPJ query
- ~~ViaCEP~~ → Nuvem Fiscal CEP query
- NFe/NFSe/CTe → Nuvem Fiscal fiscal operations

#### ❓ Perguntas abertas — Nuvem Fiscal (BLOQUEANTES para decisão de provedor)

> **Para quem ler este PRD:** As perguntas abaixo precisam ser feitas ao suporte ou comercial da Nuvem Fiscal antes de qualquer decisão de integração. Sem essas respostas, não é possível validar os números de custo e margem acima. Alguém da equipe precisa contatar a Nuvem Fiscal (site: nuvemfiscal.com.br) e registrar as respostas aqui.

---

**Pergunta 1 — Contagem de operações (impacto alto no volume estimado)**
> O recebimento de NFe e CTe de terceiros via MDe (Manifestação do Destinatário) conta como uma operação fiscal no plano? Um vendedor que recebe notas de fornecedores pode ter volume de recebimento igual ou maior que o de emissão. Se contar, o volume real por cliente pode dobrar e o plano Fiscal I (10.000 ops) alcançaria o limite com ~25 clientes ao invés de 50.
>
> ✏️ **Resposta:** _______________

---

**Pergunta 2 — Custo de excedente (não publicado no site)**
> Qual o custo por operação fiscal excedente acima do limite do plano? O site não publica esse valor. Sem saber isso, não é possível projetar custo para meses de pico (ex: Black Friday, onde o volume de notas pode triplicar).
>
> ✏️ **Resposta:** _______________

---

**Pergunta 3 — Trial gratuito**
> Existe período de testes gratuito? A Focus oferece 30 dias. Para o MVP, precisamos de pelo menos 30 dias de testes em ambiente de homologação e produção sem custo, para validar a integração antes de commitar com o plano.
>
> ✏️ **Resposta:** _______________

---

**Pergunta 4 — Profundidade da API de CNPJ (impacto no onboarding)**
> A API de consulta de CNPJ inclusa no plano retorna: Inscrição Estadual (IE), quadro societário e situação cadastral estadual (ativo/inapto)? Se retornar IE, eliminamos a dependência de APIs estaduais do SEFAZ para o enriquecimento automático do onboarding (Etapa 2 do PRD). Se não retornar, precisamos de um serviço adicional para buscar a IE.
>
> ✏️ **Resposta:** _______________

#### Estratégia de plano recomendada

| Fase | Plano | Trigger para migrar |
|---|---|---|
| MVP (0–20 clientes) | Focus Start trial → depois Nuvem Fiscal I | Imediato após confirmar os 4 pontos acima |
| Crescimento (20–50 clientes) | Nuvem Fiscal I | Até 10.000 ops/mês |
| Escala (50+ clientes) | Nuvem Fiscal II | Quando superar 10.000 ops/mês |

---

#### Por que NÃO construir emissor próprio de NFe

Construir um emissor próprio é tecnicamente possível, mas o ROI é negativo para um SaaS. Razões:

**Complexidade técnica:**
- Assinatura de XML com certificado digital A1 (PKCS#12) — manipulação criptográfica de certificados
- Comunicação com os endpoints SOAP/REST das SEFAZs de 27 estados + DF — cada um com comportamento ligeiramente diferente
- NFSe é municipal: **5.000+ prefeituras com sistemas distintos**, cada uma com sua API, schema e autenticação
- Modo de contingência (quando a SEFAZ cai, emite offline e sincroniza depois)
- Gerenciamento de validade de certificados (A1 expira em 1 ano — precisa renovar sem interromper a operação de ninguém)

**Manutenção contínua:**
- A SEFAZ publica Notas Técnicas (NTs) ~2x/ano que alteram o schema XML — se você não implementar no prazo, todas as notas dos clientes são rejeitadas
- Endpoints de homologação e produção mudam
- Cada tipo (NFe, NFSe, CTe, MDFe, NFCom) tem seu próprio schema e ciclo de atualização

**Conclusão:** O que a Focus e a Nuvem Fiscal levaram anos para construir com equipe dedicada custa R$180–600/mês. Esse é o melhor investimento de infraestrutura fiscal que existe para um SaaS em estágio inicial.

**Critério de aceite:**
- [ ] Stripe Checkout ou Elements integrado
- [ ] Trial de 14 dias ativo imediatamente após inserir cartão
- [ ] Email de boas-vindas com o que está disponível
- [ ] Falha de pagamento → mensagem clara, sem perda de dados

---

### ETAPA 8 — Setup Pós-Assinatura: Produtos

**Objetivo:** Mínimo de esforço para o usuário ter produtos cadastrados com custo inserido.

#### 8A — Engine de pré-criação de produtos a partir dos anúncios

O sistema já tem os anúncios importados. Ao invés de pedir para o usuário criar produtos do zero, o Novura **sugere produtos pré-preenchidos** baseados nos anúncios:

| Campo | Fonte |
|---|---|
| Nome | Título do anúncio (normalizável) |
| Fotos | Fotos do anúncio (importadas) |
| SKU | SKU do anúncio (se preenchido) |
| Variações | Variações do anúncio ML (tamanho, cor, etc.) |
| Preço de venda | Preço atual do anúncio |
| Barcode | GTIN do anúncio (se preenchido) |
| NCM | Sugestão por categoria do ML (requer confirmação) |

**O usuário só precisa adicionar:**
- ✏️ Custo unitário por variação
- ✏️ Estoque inicial por variação
- ✏️ Confirmar/ajustar NCM

Tudo em uma tabela editável inline — sem formulários por produto.

#### 8B — Modelo de variações (explicação para o usuário)

**Produto simples** (sem variação): Produto → 1 SKU → 1 estoque
**Produto com variações** (ex: camiseta P/M/G): Produto pai → N SKUs filhos → N estoques independentes
**Kit** (ex: "Kit Caneta + Caderno"): Produto especial → lista de componentes com quantidade → estoque calculado do componente mais escasso

**UX da tela de produtos:**

```
📦 Importamos 83 anúncios do Mercado Livre.
   Criamos 83 produtos sugeridos. Revise e adicione o custo para ver sua margem.

[Filtros: Todos | Precisa de custo | Com variações | Kits]

Produto          | Variações | Custo unit. | Estoque | Ação
Camiseta Polo    | P, M, G, GG | R$ ___   | ___     | ✏️ Editar
Tênis Running    | 38,39,40,41 | R$ ___   | ___     | ✏️ Editar
Kit Escolar      | —           | —        | —       | 🔗 Configurar kit
...
```

**Importação via planilha** (alternativa para quem tem muitos produtos):
- Template CSV com colunas: nome, sku, variação, custo, estoque inicial
- Upload → preview → confirmar

**Critério de aceite:**
- [ ] Produtos pré-criados a partir dos anúncios imediatamente após ETAPA 7
- [ ] Custo pode ser inserido em massa (selecionar vários → aplicar custo)
- [ ] Variações do ML mapeadas corretamente para `product_variations`
- [ ] Kit configurável: UI para adicionar componentes + quantidade
- [ ] CSV upload como alternativa

---

### ETAPA 9 — Vínculo Produto ↔ Anúncio (Match Engine)

**O que acontece:**
O sistema analisa os produtos criados na ETAPA 8 e os anúncios importados e **sugere vínculos automaticamente** usando:
- SKU igual entre produto e anúncio
- GTIN/EAN igual
- Similaridade de título (> 85% match)

**UX do processo:**

```
🔗 Vínculos automáticos

Encontramos 83 anúncios.
✅ 67 vinculados automaticamente
⚠️  16 precisam da sua confirmação

[Ver os 67 automáticos →]  [Confirmar os 16 →]
```

**Tela de confirmação dos incertos:**

```
Anúncio: "Camiseta Polo Masculina Azul M"
Sugestão: Camiseta Polo → Variação: M-Azul  [✅ Confirmar] [🔄 Escolher outro] [➕ Criar novo produto]

Anúncio: "Kit Caneta + Caderno Escolar"
Sugestão: (não encontrado — provavelmente kit)  [🔗 Configurar como kit] [➕ Criar produto]
```

**Critério de aceite:**
- [ ] Match automático funciona com SKU, GTIN e título
- [ ] Usuário pode confirmar em lote (selecionar todos → confirmar)
- [ ] Anúncio sem produto vinculado fica marcado como `has_unlinked_items = true`
- [ ] Pedidos com itens não vinculados ficam visíveis mas sem cálculo de margem

---

### ETAPA 10 — Checklist de Prontidão Operacional

**Problema:** O usuário quer emitir NFe mas faltam configurações. Em vez de deixar ele descobrir o erro na hora de emitir, mostramos exatamente o que falta **antes**.

**Componente "Pronto para operar"** — visível na tela de pedidos e na tela de configurações:

```
Para emitir NFe você precisa:
✅ Empresa configurada (CNPJ, razão social, endereço)
✅ Regime tributário definido (Simples Nacional)
⚪ Certificado digital A1 — Fazer upload →
✅ 83 produtos com NCM
⚪ 3 produtos sem tributação definida — Resolver agora →
⚪ Inscrição Estadual (IE) — Informar →

Progresso: 3/6 itens ✓
```

Cada item é clicável e leva direto à tela de configuração do item específico.

**Configuração fiscal obrigatória para emitir NFe:**

| Item | Obrigatório | Pode pular no onboarding? |
|---|---|---|
| CNPJ + Razão Social + Endereço | Sim | Não (vem do passo 2) |
| IE (Inscrição Estadual) | Sim (para ICMS) | Sim — bloqueia NFe |
| CRT (Regime tributário) | Sim | Não (vem do passo 2) |
| Certificado digital A1 | Sim | Sim — bloqueia NFe |
| NCM por produto | Sim | Sim — bloqueia NFe do produto |
| Tributação por produto | Sim | Sim — bloqueia NFe do produto |

**Clientes/destinatários:** São criados automaticamente a partir dos dados do pedido (CPF/CNPJ, nome, endereço vêm do ML). O usuário nunca cria cliente manualmente para pedidos do ML.

**Pedidos que chegaram durante o setup (gap entre webhook ativo e configuração concluída):**
- Todos os pedidos aparecem na tela de pedidos
- Status: "Aguardando configuração fiscal"
- Quando a configuração é concluída, ficam disponíveis para emissão normalmente
- NFes já emitidas pelo vendedor diretamente no ML: o sistema busca o `fiscal_key` via API do ML e importa o XML automaticamente — o vendedor não perde o histórico

**Critério de aceite:**
- [ ] Checklist visível na página de pedidos e na página de configurações
- [ ] Cada item do checklist leva direto à tela de resolução
- [ ] Botão "Emitir NFe" desabilitado com tooltip explicando o que falta
- [ ] NFes importadas do ML (emitidas externamente) aparecem no histórico

---

### ETAPA 11 — Operação Contínua

**O que o usuário faz diariamente:**

**Tela de pedidos:**
- Lista em tempo real (webhook ativo)
- Colunas: número do pedido, comprador, valor, margem (se custo inserido), status, ação
- Ações por pedido: Emitir NFe, Imprimir etiqueta, Marcar enviado
- Ação em lote: selecionar N pedidos → emitir NFe em lote

**Margem em tempo real:**
- Para pedidos com produto vinculado e custo inserido: margem aparece na coluna
- Pedidos com margem < X% ficam marcados em vermelho (limiar configurável)
- Banner: "3 pedidos hoje com margem negativa — Ver detalhes"

**Estoque:**
- 1 armazém no MVP (multi-armazém é pós-MVP)
- Baixa automática quando pedido muda para "Enviado"
- Alerta de estoque baixo (limiar configurável por produto)

**Critério de aceite:**
- [ ] Pedidos em tempo real via webhook
- [ ] Margem calculada por pedido (valor bruto - comissão ML - frete - custo produto)
- [ ] NFe emitida via Focus API, XML salvo, chave de acesso registrada
- [ ] Etiqueta gerada e impressa (formato Mercado Envios)
- [ ] Baixa de estoque automática por variação

---

## 4. Freemium → Pago: Mapa de Ativação

```
Signup
  └── CNPJ                           ← dados enriquecidos, valor imediato
        └── Conectar ML               ← OAuth + webhook ativo
              └── Polling             ← 90 dias importados
                    └── Diagnóstico   ← MOMENTO AHA (free)
                          └── Navegar ← leitura + paywalls contextuais (free)
                                └── Paywall hit → Assinar
                                      └── Setup produtos (8, 9, 10) (pago)
                                            └── Operação contínua (11) (pago)
```

**Métrica de ativação:** Usuário que completa ETAPA 5 (viu o diagnóstico) tem X vezes mais chance de converter do que usuário que não completou o onboarding. Medir isso desde o primeiro dia.

---

## 5. Requisitos Técnicos

| Requisito | Detalhe |
|---|---|
| Auth | Supabase Auth — email/senha + Google OAuth |
| CNPJ API | ReceitaWS ou Minha Receita (gratuita, sem chave) |
| ML OAuth | PKCE flow já implementado — adicionar scope `read_ads` |
| Polling | Edge function `sync-marketplace-orders` — chamada once no onboarding |
| Webhook | Edge function já existe — ativar no momento da conexão |
| NFe | Focus NFe API — plano a definir |
| Pagamentos | Stripe — subscriptions + trial de 14 dias |
| Match engine | Algoritmo de similaridade de strings (Levenshtein ou embeddings simples) |
| Estoque | 1 armazém MVP — tabela `storage` já existe |

---

## 6. Métricas de Sucesso

| Métrica | Meta MVP | Como medir |
|---|---|---|
| Completion rate do onboarding (signup → diagnóstico) | > 70% | Eventos de analytics por etapa |
| Tempo até diagnóstico | < 5 minutos | Timestamp signup → timestamp diagnóstico visto |
| Conversão diagnóstico → assinatura (30 dias) | > 20% | Cohort de usuários que viram o diagnóstico |
| Tempo até primeira NFe emitida (pós-assinatura) | < 30 minutos | Timestamp assinatura → timestamp primeira NFe |
| Churn no primeiro mês | < 10% | Cancelamentos / total assinaturas |

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| ReceitaWS fora do ar | Média | Alto (bloqueia ETAPA 2) | Cache + fallback manual (usuário digita os dados) |
| ML muda estrutura de API | Baixa | Alto (quebra polling) | Versionamento de API + alertas de erro |
| Polling timeout (muito volume) | Média | Médio (UX ruim) | Processing em background + email quando pronto |
| Focus NFe instabilidade | Média | Alto (NFe não emite) | Retry automático + status visível para o usuário |
| Custo da Focus absorvido | Alta | Médio (margem de produto) | Definir pricing considerando X NFes/mês |

---

## 8. Itens Pós-MVP `[POST-MVP]`

Os itens abaixo são importantes mas melhor alocados após o MVP estar operacional:

### [POST-MVP] Saúde da conta ML
Monitoramento contínuo de reputação, taxa de cancelamento, taxa de reclamação, posição nos resultados de busca. Alertas automáticos quando indicadores pioram.

### [POST-MVP] Gestão de devoluções
Fluxo completo: solicitação de devolução ML → aprovação/rejeição pelo vendedor → entrada do produto em estoque → NFe de devolução. Hoje as devoluções ficam como pedidos cancelados sem tratamento específico.

### [POST-MVP] Convite de equipe e perfis de acesso
Multi-usuário com papéis: `owner`, `admin`, `operator` (emite NFe e imprime etiqueta), `viewer` (somente leitura). Definir o mínimo de permissões para o operador de loja conseguir trabalhar sem acesso a financeiro.

### [POST-MVP] Notificações e alertas
Push/email/WhatsApp quando: novo pedido com SLA próximo de vencer, estoque chegando a zero, nova reclamação no ML, margem de pedido negativa. O vendedor não fica no ERP o dia todo — os alertas trazem ele quando necessário.

### [POST-MVP] Migração de Bling / Tiny
Importação de cadastro de produtos via API do Bling/Tiny para vendedores que já têm base cadastrada. Para o MVP, o CSV é suficiente.

### [POST-MVP] Multi-armazém
Hoje: 1 armazém por organização. Futuro: N armazéns (CD próprio + fulfillment ML). O modelo de dados já suporta desde o início (`storage` table com `organizations_id`).

### [POST-MVP] Análise de precificação competitiva
Monitoramento de preços dos concorrentes para os mesmos produtos. Sugestão de repricing baseada em margem mínima configurável.

### [POST-MVP] Fiscal avançado
Substituição tributária, DIFAL, ICMS interestadual, relatórios SPED. O MVP emite NFe simples (venda a consumidor final, Simples Nacional). Regimes mais complexos ficam para depois.

### [POST-MVP] Shopee
Cycle 3 do roadmap. Infra e data model suportam desde o início (multi-marketplace), mas UI e configurações específicas do Shopee ficam depois do ML estar sólido.

---

## 9. Open Questions

- [ ] **Verificação de email:** bloqueante ou não-bloqueante? Recomendação: não-bloqueante para não travar o onboarding.
- [ ] **Custo da Focus NFe:** qual plano atual? Precisamos saber o custo por NFe para definir o preço do plano Novura Pro.
- [ ] **Limite de polling:** o ML tem rate limit por hora para busca histórica de pedidos. Para vendedores com volume alto (1000+ pedidos/90 dias), o polling pode demorar. Definir estratégia (fila + processamento em batches). **Não testado ainda — validar antes do lançamento.**
- [ ] **NCM sugerido:** usar base própria de NCM por categoria ML ou chamar uma API externa? ReceitaWS tem endpoint de NCM.
- [x] **IE (Inscrição Estadual):** **Decidido: não obrigatório no onboarding.** Tentar puxar via APIs estaduais do SEFAZ (cobertura inconsistente — priorizar SP, RJ, MG, RS, SC, PR que concentram a maioria dos vendedores ML). Se não encontrar, campo fica vazio com aviso no checklist operacional: "IE necessária para emitir NFe — preencher antes de operar."
