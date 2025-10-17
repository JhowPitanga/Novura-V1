-- Seed IPI (CST) codes into tax_rules_catalog based on previous frontend lists

insert into public.tax_rules_catalog (code, title, scope, active, payload)
values
('00','Entrada com crédito','IPI', true, '{"type":"CST","code":"00"}'),
('01','Tributada com alíquota zero','IPI', true, '{"type":"CST","code":"01"}'),
('02','Entrada isenta','IPI', true, '{"type":"CST","code":"02"}'),
('03','Entrada não-tributada','IPI', true, '{"type":"CST","code":"03"}'),
('04','Imune','IPI', true, '{"type":"CST","code":"04"}'),
('05','Suspensão','IPI', true, '{"type":"CST","code":"05"}'),
('49','Outras entradas','IPI', true, '{"type":"CST","code":"49"}'),
('50','Saída tributada','IPI', true, '{"type":"CST","code":"50"}'),
('51','Saída tributada com alíquota zero','IPI', true, '{"type":"CST","code":"51"}'),
('52','Saída isenta','IPI', true, '{"type":"CST","code":"52"}'),
('53','Saída não-tributada','IPI', true, '{"type":"CST","code":"53"}'),
('54','Saída imune','IPI', true, '{"type":"CST","code":"54"}'),
('55','Saída com suspensão','IPI', true, '{"type":"CST","code":"55"}'),
('99','Outras saídas','IPI', true, '{"type":"CST","code":"99"}')
on conflict (scope, code) do update set
  title = excluded.title,
  active = excluded.active,
  payload = excluded.payload,
  updated_at = now();