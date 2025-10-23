# 🧪 Função de Dados de Teste do Mercado Livre

Esta função permite criar e testar dados do Mercado Livre de forma automatizada, incluindo usuários de teste, itens e pedidos.

## 📋 Funcionalidades

- **create_test_users**: Criar usuários vendedor e comprador de teste
- **create_test_item**: Criar item de teste para um vendedor (sincroniza automaticamente com banco)
- **simulate_order**: Simular compra com cartão de teste
- **test_webhook**: Testar notificação de webhook
- **full_test**: Executar teste completo (usuários + item + pedido + webhook)
- **check_integration**: Verificar status da integração e validar tokens
- **sync_test_items**: Sincronizar itens de teste existentes no banco

## 🚀 Como Usar

### 1. Criar Usuários de Teste

```javascript
const response = await fetch(
  "https://seu-projeto.supabase.co/functions/v1/mercado-livre-test-data",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer seu-token",
    },
    body: JSON.stringify({
      action: "create_test_users",
      organizationId: "sua-org-id",
    }),
  }
);

const result = await response.json();
console.log("Usuários criados:", result);
```

### 2. Criar Item de Teste

```javascript
const response = await fetch(
  "https://seu-projeto.supabase.co/functions/v1/mercado-livre-test-data",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer seu-token",
    },
    body: JSON.stringify({
      action: "create_test_item",
      organizationId: "sua-org-id",
      sellerId: "seller-test-id",
      sellerPassword: "seller-password",
    }),
  }
);

const result = await response.json();
console.log("Item criado:", result);
```

### 3. Simular Pedido

```javascript
const response = await fetch(
  "https://seu-projeto.supabase.co/functions/v1/mercado-livre-test-data",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer seu-token",
    },
    body: JSON.stringify({
      action: "simulate_order",
      organizationId: "sua-org-id",
      buyerId: "buyer-test-id",
      buyerPassword: "buyer-password",
      itemId: "item-test-id",
    }),
  }
);

const result = await response.json();
console.log("Pedido simulado:", result);
```

### 4. Testar Webhook

```javascript
const response = await fetch(
  "https://seu-projeto.supabase.co/functions/v1/mercado-livre-test-data",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer seu-token",
    },
    body: JSON.stringify({
      action: "test_webhook",
      organizationId: "sua-org-id",
      orderId: "order-test-id",
      sellerId: "seller-test-id",
    }),
  }
);

const result = await response.json();
console.log("Webhook testado:", result);
```

### 5. Teste Completo

```javascript
const response = await fetch(
  "https://seu-projeto.supabase.co/functions/v1/mercado-livre-test-data",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer seu-token",
    },
    body: JSON.stringify({
      action: "full_test",
      organizationId: "sua-org-id",
    }),
  }
);

const result = await response.json();
console.log("Teste completo:", result);
```

### 6. Verificar Integração

```javascript
const response = await fetch(
  "https://seu-projeto.supabase.co/functions/v1/mercado-livre-test-data",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer seu-token",
    },
    body: JSON.stringify({
      action: "check_integration",
      organizationId: "sua-org-id",
    }),
  }
);

const result = await response.json();
console.log("Status da integração:", result);
```

### 7. Sincronizar Itens de Teste

```javascript
const response = await fetch(
  "https://seu-projeto.supabase.co/functions/v1/mercado-livre-test-data",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer seu-token",
    },
    body: JSON.stringify({
      action: "sync_test_items",
      organizationId: "sua-org-id",
    }),
  }
);

const result = await response.json();
console.log("Sincronização:", result);
```

## 🔧 Variáveis de Ambiente Necessárias

Certifique-se de que estas variáveis estão configuradas no Supabase:

```
MERCADO_LIVRE_CLIENT_ID=seu_client_id
MERCADO_LIVRE_CLIENT_SECRET=seu_client_secret
MERCADO_LIVRE_APP_ID=seu_app_id
```

## 📊 Integração com Tabelas Existentes

A função utiliza as tabelas normais do sistema:

- **marketplace_items**: Para itens criados de teste (já existe)
- **marketplace_integrations**: Para obter tokens de acesso (já existe)
- **companies**: Para empresas da organização (já existe)
- **organizations**: Para organizações (já existe)

**Nota**: A tabela `marketplace_orders` ainda não existe no sistema. Os pedidos de teste são criados diretamente no Mercado Livre e podem ser sincronizados quando a tabela for criada.

## ⚠️ Importante

- Os usuários de teste são criados no ambiente sandbox do Mercado Livre
- Os itens de teste têm o título "Item de Teste – Por favor, NÃO OFERTAR!"
- Os cartões de teste são específicos do ambiente sandbox
- Os dados são sincronizados automaticamente com as tabelas normais do sistema

## 🎯 Exemplo de Resposta

```json
{
  "success": true,
  "seller": {
    "id": "123456789",
    "nickname": "TEST_USER_123456789",
    "password": "testpass123"
  },
  "buyer": {
    "id": "987654321",
    "nickname": "TEST_USER_987654321",
    "password": "testpass456"
  }
}
```
