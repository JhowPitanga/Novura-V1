-- Seed ICMS (CSOSN) codes into tax_rules_catalog based on previous frontend lists

-- Ensure uniqueness on (scope, code)
create unique index if not exists tax_rules_catalog_scope_code_unique on public.tax_rules_catalog (scope, code);

insert into public.tax_rules_catalog (code, title, description, scope, active, payload)
values
('101','Tributada com permissão de crédito','CSOSN 101','ICMS', true, '{"type":"CSOSN","code":"101"}'),
('102','Tributada sem permissão de crédito','CSOSN 102','ICMS', true, '{"type":"CSOSN","code":"102"}'),
('103','Isenção do ICMS para faixa de receita bruta','CSOSN 103','ICMS', true, '{"type":"CSOSN","code":"103"}'),
('201','Tributada com ST e com permissão de crédito','CSOSN 201','ICMS', true, '{"type":"CSOSN","code":"201"}'),
('203','Isenção com ST','CSOSN 203','ICMS', true, '{"type":"CSOSN","code":"203"}'),
('300','Imune','CSOSN 300','ICMS', true, '{"type":"CSOSN","code":"300"}'),
('400','Não tributada','CSOSN 400','ICMS', true, '{"type":"CSOSN","code":"400"}'),
('500','ICMS cobrado anteriormente por ST','CSOSN 500','ICMS', true, '{"type":"CSOSN","code":"500"}'),
('900','Outros','CSOSN 900','ICMS', true, '{"type":"CSOSN","code":"900"}')
on conflict (scope, code) do update set
  title = excluded.title,
  description = excluded.description,
  active = excluded.active,
  payload = excluded.payload,
  updated_at = now();