# Focus NFe — API de Empresas (referência)

Documentação de suporte à criação e manutenção de empresas na Focus NFe para emissão de NFe, NFCe e NFSe.

## Endpoints principais

| Método | URL | Ação |
|--------|-----|------|
| POST | `https://api.focusnfe.com.br/v2/empresas` | Cria uma nova empresa |
| GET | `https://api.focusnfe.com.br/v2/empresas` | Lista empresas |
| GET | `https://api.focusnfe.com.br/v2/empresas/{ID}` | Consulta por ID |
| PUT | `https://api.focusnfe.com.br/v2/empresas/{ID}` | Altera dados |
| DELETE | `https://api.focusnfe.com.br/v2/empresas/{ID}` | Exclui empresa |

## Ambiente e dry run

- A API de empresas opera em **produção**; use `?dry_run=1` para simular criação/alteração sem persistir.
- Após criar a empresa em produção, é possível emitir em homologação e produção com essa empresa.

## Autenticação

Basic Auth: usuário = token obtido no cadastro da conta Focus; senha em branco.

Exemplo (curl):

```bash
curl -u "SEU_TOKEN:" \
  -H "Content-Type: application/json" \
  -d @empresa.json \
  https://api.focusnfe.com.br/v2/empresas
```

## Resposta de sucesso (criação)

HTTP 200 — corpo inclui `id` da empresa na Focus (armazenar na base), além de `token_producao` e `token_homologacao` quando aplicável.

## Integração no Novura

- Edge Function `focus-company-create` mapeia dados de `companies` para o payload Focus e persiste tokens em `companies`.
- Ver PRD `MULTI-COMPANY-ARCHITECTURE.md` (lifecycle Focus, `focus_company_id`, dry-run em duas fases).

## Documentação oficial

Texto completo (campos, tabelas, erros 401/404/422): portal e documentação Focus NFe — seção **Empresas**.
