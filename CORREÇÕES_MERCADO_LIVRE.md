# Correções Implementadas - Erro 403 Mercado Livre

## Problema Identificado
A função `mercado-livre-sync-items` estava retornando erro 403 (forbidden) devido a tokens de acesso expirados ou inválidos.

## Causa Raiz
1. **Tokens Expirados**: Os tokens de acesso do Mercado Livre expiram em 6 horas
2. **Falta de Verificação**: O sistema não verificava se o token estava expirado antes de fazer chamadas à API
3. **Ausência de Renovação Automática**: Não havia mecanismo para renovar tokens automaticamente

## Soluções Implementadas

### 1. Verificação de Expiração de Token
- Adicionada verificação de data de expiração antes de usar o token
- Comparação entre data atual e `expires_in` armazenado no banco

### 2. Renovação Automática de Token
- Implementada lógica para renovar token automaticamente quando expirado
- Uso do `refresh_token` para obter novo `access_token`
- Atualização automática dos tokens no banco de dados

### 3. Tratamento de Erro 403
- Detecção de erro 403 durante chamadas à API
- Tentativa automática de refresh do token
- Retry da requisição original com novo token
- Fallback para busca pública se refresh falhar

### 4. Função Auxiliar Reutilizável
- Criado arquivo `supabase/functions/_shared/token-utils.ts`
- Função `checkAndRefreshToken()` para reutilização em outras funções
- Helpers de criptografia AES-GCM centralizados

## Arquivos Modificados

### `supabase/functions/mercado-livre-sync-items/index.ts`
- Adicionada verificação de expiração de token
- Implementada renovação automática
- Melhorado tratamento de erro 403
- Adicionada função `aesGcmEncryptToString`

### `supabase/functions/_shared/token-utils.ts` (NOVO)
- Funções auxiliares de criptografia
- Função `checkAndRefreshToken()` reutilizável
- Interface `TokenRefreshResult` para tipagem

## Fluxo de Funcionamento

1. **Verificação Inicial**: Sistema verifica se token está expirado
2. **Renovação Automática**: Se expirado, renova usando refresh_token
3. **Atualização no Banco**: Salva novos tokens criptografados
4. **Chamada à API**: Usa token válido para chamadas ao Mercado Livre
5. **Tratamento de Erro 403**: Se ainda der erro, tenta refresh novamente
6. **Fallback**: Se tudo falhar, usa busca pública

## Benefícios

- ✅ **Eliminação do Erro 403**: Tokens são renovados automaticamente
- ✅ **Maior Confiabilidade**: Sistema funciona sem intervenção manual
- ✅ **Melhor UX**: Usuários não precisam reconectar constantemente
- ✅ **Código Reutilizável**: Funções auxiliares podem ser usadas em outras integrações
- ✅ **Logs Detalhados**: Melhor rastreabilidade de problemas

## Próximos Passos

1. **Teste da Solução**: Verificar se erro 403 foi resolvido
2. **Aplicar em Outras Funções**: Usar `token-utils.ts` em outras funções do Mercado Livre
3. **Monitoramento**: Acompanhar logs para identificar outros problemas
4. **Documentação**: Atualizar documentação da API

## Configuração Necessária

Certifique-se de que as seguintes variáveis de ambiente estão configuradas:

```bash
SUPABASE_URL=https://frwnfukydjwilfobxxhw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TOKENS_ENCRYPTION_KEY=your_encryption_key
```

## Teste da Correção

Para testar se a correção funcionou:

1. Execute a função `mercado-livre-sync-items`
2. Verifique os logs para confirmar renovação de token
3. Confirme que não há mais erro 403
4. Valide que os dados são sincronizados corretamente
