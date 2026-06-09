-- ============================================================
-- Stock Sync Motor: Migration 4/7
-- PGMQ queue creation for Bulkhead pattern.
-- Each channel gets an isolated queue: a failure in one channel
-- cannot block or contaminate processing in another channel.
-- ============================================================

-- Channel queues (Bulkhead): one per outbound marketplace.
SELECT pgmq.create('fila_sincronizacao_shopee');
SELECT pgmq.create('fila_sincronizacao_mercadolivre');

-- Audit queue: receives a copy of every dispatched event for full traceability.
SELECT pgmq.create('fila_auditoria_estoque');
