BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_create_mock_orders_emissao_nf()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_company_id uuid;
  v_order uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_count int := 0;
  v_ix int := 1;

  mkt_list text[] := ARRAY[
    'Mercado Livre','Shopee','Amazon','Magalu','Americanas','Submarino','Casas Bahia','Carrefour','Extra','Ponto',
    'Mercado Livre','Shopee','Amazon','Magalu','Americanas','Submarino','Casas Bahia','Carrefour','Extra','Ponto',
    'Mercado Livre','Shopee','Amazon','Magalu','Americanas','Submarino','Casas Bahia','Carrefour','Extra','Ponto'
  ];
  mkt_code_list text[] := ARRAY[
    'MLB','SHP','AMZ','MGL','AMER','SUB','CBH','CRF','EXT','PNT',
    'MLB','SHP','AMZ','MGL','AMER','SUB','CBH','CRF','EXT','PNT',
    'MLB','SHP','AMZ','MGL','AMER','SUB','CBH','CRF','EXT','PNT'
  ];
  city_list text[] := ARRAY[
    'São Paulo','Campinas','Rio de Janeiro','Belo Horizonte','Porto Alegre','Salvador','Curitiba','Florianópolis','Recife','Fortaleza',
    'Goiânia','Brasília','Vitória','Natal','João Pessoa','Maceió','Aracaju','Manaus','Belém','São Luís',
    'Teresina','Campo Grande','Cuiabá','Palmas','Uberlândia','Ribeirão Preto','Guarulhos','Sorocaba','Santos','Niterói'
  ];
  state_list text[] := ARRAY[
    'São Paulo','São Paulo','Rio de Janeiro','Minas Gerais','Rio Grande do Sul','Bahia','Paraná','Santa Catarina','Pernambuco','Ceará',
    'Goiás','Distrito Federal','Espírito Santo','Rio Grande do Norte','Paraíba','Alagoas','Sergipe','Amazonas','Pará','Maranhão',
    'Piauí','Mato Grosso do Sul','Mato Grosso','Tocantins','Minas Gerais','São Paulo','São Paulo','São Paulo','São Paulo','Rio de Janeiro'
  ];
  uf_list text[] := ARRAY[
    'SP','SP','RJ','MG','RS','BA','PR','SC','PE','CE',
    'GO','DF','ES','RN','PB','AL','SE','AM','PA','MA',
    'PI','MS','MT','TO','MG','SP','SP','SP','SP','RJ'
  ];
  street_list text[] := ARRAY[
    'Av Paulista','Rua das Flores','Rua XV de Novembro','Av Afonso Pena','Rua da Praia','Av Sete de Setembro','Av Batel','Rua Hercílio Luz','Av Boa Viagem','Av Beira Mar',
    'Av Goiás','Esplanada dos Ministérios','Av Nossa Senhora da Penha','Av Salgado Filho','Av Epitácio Pessoa','Av Fernandes Lima','Av Augusto Franco','Av Djalma Batista','Av Nazaré','Av dos Holandeses',
    'Av Frei Serafim','Av Afonso Pena','Av Hist. Rubens de Mendonça','Av JK','Av Rondon Pacheco','Av João Fiúsa','Av Paulo Faccini','Av Dom Aguirre','Av Conselheiro Nébias','Av Amaral Peixoto'
  ];
  number_list text[] := ARRAY[
    '1000','200','1500','300','400','500','600','700','800','900',
    '100','200','300','400','500','600','700','800','900','1000',
    '1100','1200','1300','1400','1500','1600','1700','1800','1900','2000'
  ];
  neighborhood_list text[] := ARRAY[
    'Bela Vista','Centro','Copacabana','Savassi','Moinhos de Vento','Dois de Julho','Batel','Centro','Boa Viagem','Meireles',
    'Centro','Asa Sul','Praia do Canto','Lagoa Nova','Tambaú','Ponta Verde','Grageru','Chapada','Nazaré','Calhau',
    'Centro','Centro','Centro','Plano Diretor','Jardim Canadá','Jardim Paulista','Centro','Centro','Gonzaga','Icaraí'
  ];
  zip_list text[] := ARRAY[
    '01310000','13010000','20040030','30130010','90035712','40060000','80020010','88015030','51130140','60165080',
    '74000000','70000000','29055555','59000000','58000000','57000000','49000000','69000000','66000000','65000000',
    '64000000','79000000','78000000','77000000','38400000','14000000','07000000','18000000','11000000','24000000'
  ];
  billing_names text[] := ARRAY[
    'João Silva','Maria Souza','Carlos Pereira','Ana Lima','Pedro Santos','Paula Oliveira','Lucas Almeida','Mariana Costa','Felipe Ribeiro','Aline Fernandes',
    'Bruno Rocha','Camila Martins','Gustavo Araújo','Patrícia Carvalho','Rafael Teixeira','Bianca Moreira','Daniel Melo','Larissa Duarte','Thiago Barros','Vanessa Nunes',
    'André Gomes','Juliana Pinto','Marcelo Castro','Fernanda Vieira','Rodrigo Monteiro','Natália Figueiredo','Hugo Tavares','Renata Campos','Leandro Santana','Isabela Rezende'
  ];
  item_names text[] := ARRAY[
    'Teclado Mecânico','Mouse Óptico','Headset Gamer','Webcam HD','Monitor 24\"','SSD 1TB','HD 2TB','Placa de Vídeo','Fonte 600W','Gabinete ATX',
    'Notebook','Cabo HDMI','Hub USB','Microfone','Cadeira Gamer','Mousepad','Impressora','Scanner','Smartphone','Tablet',
    'Fone Bluetooth','Roteador','Switch','Adaptador USB','Carregador','Bateria','Suporte Monitor','Câmera','Tripé','Lâmpada Inteligente'
  ];
  variation_list text[] := ARRAY[
    'Preto','Branco','Azul','Vermelho','Verde','Cinza','RGB','Padrão','4K','Full HD',
    'SATA','NVMe','ATX','200mm','XL','M','P','64GB','128GB','256GB',
    'Wi-Fi','Gigabit','Bluetooth','USB-C','Lightning','48W','Pro','Plus','Mini','Smart'
  ];
  item_qtys int[] := ARRAY[
    3,2,1,4,2,3,1,2,3,1,
    2,1,3,2,1,4,2,1,3,2,
    1,2,3,1,2,3,1,4,2,1
  ];
  item_prices numeric[] := ARRAY[
    99.90,79.90,199.90,89.90,149.90,299.90,219.90,1299.00,349.90,499.90,
    2999.00,29.90,79.90,199.90,999.00,49.90,899.00,699.00,1899.00,1499.00,
    249.90,199.90,399.90,59.90,79.90,129.90,159.90,799.00,129.90,99.90
  ];

  v_marketplace text;
  v_marketplace_code text;
  v_city text;
  v_state text;
  v_uf text;
  v_street text;
  v_number text;
  v_neighborhood text;
  v_zip text;
  v_billing_name text;
  v_item_name text;
  v_variation text;
  v_item_sku text;
  v_item_qty int;
  v_item_price numeric;
  v_items_total numeric;
  v_mkt_order_id text;
  v_billing_doc text := '';
  digits int[] := ARRAY[0,0,0,0,0,0,0,0,0,0,0];
  s int := 0;
  i int := 0;
BEGIN
  PERFORM set_config('row_security','off', true);

  SELECT public.get_current_user_organization_id() INTO v_org_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para o usuário atual';
  END IF;

  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.organization_id = v_org_id
  ORDER BY c.is_active DESC NULLS LAST, c.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa encontrada para a organização %', v_org_id;
  END IF;

  SELECT COALESCE(COUNT(*), 0) INTO v_count
  FROM public.marketplace_orders_presented_new
  WHERE organizations_id = v_org_id
    AND status_interno = 'Emissao NF';
  v_ix := (v_count % 30) + 1;

  v_marketplace := mkt_list[v_ix];
  v_marketplace_code := mkt_code_list[v_ix];
  v_city := city_list[v_ix];
  v_state := state_list[v_ix];
  v_uf := uf_list[v_ix];
  v_street := street_list[v_ix];
  v_number := number_list[v_ix];
  v_neighborhood := neighborhood_list[v_ix];
  v_zip := zip_list[v_ix];
  v_billing_name := billing_names[v_ix];
  v_item_name := item_names[v_ix];
  v_variation := variation_list[v_ix];
  v_item_qty := item_qtys[v_ix];
  v_item_price := item_prices[v_ix];
  v_items_total := v_item_qty * v_item_price;
  v_item_sku := 'SKU-EM-' || LPAD(v_ix::text, 3, '0');
  v_mkt_order_id := v_marketplace_code || '-HOMO-' || LPAD(v_ix::text, 3, '0');

  FOR i IN 1..9 LOOP
    digits[i] := ((v_ix + i) * i) % 10;
  END LOOP;
  s := 0;
  FOR i IN 1..9 LOOP
    s := s + digits[i] * (10 - i);
  END LOOP;
  s := s % 11;
  digits[10] := CASE WHEN s < 2 THEN 0 ELSE 11 - s END;
  s := 0;
  FOR i IN 1..10 LOOP
    s := s + digits[i] * (11 - i);
  END LOOP;
  s := s % 11;
  digits[11] := CASE WHEN s < 2 THEN 0 ELSE 11 - s END;
  v_billing_doc := '';
  FOR i IN 1..11 LOOP
    v_billing_doc := v_billing_doc || digits[i]::text;
  END LOOP;

  INSERT INTO public.marketplace_orders_presented_new (
    id, organizations_id, company_id, marketplace, marketplace_order_id,
    status, status_interno, customer_name, items_total_quantity, items_total_amount,
    has_unlinked_items, created_at,
    shipping_city_name, shipping_state_name, shipping_state_uf,
    shipping_street_name, shipping_street_number, shipping_neighborhood_name, shipping_zip_code, shipping_address_line,
    billing_name, billing_doc_number, billing_doc_type, billing_email, billing_phone, billing_state_registration, billing_cust_type, billing_taxpayer_type, billing_is_normalized
  ) VALUES (
    v_order, v_org_id, v_company_id, v_marketplace, v_mkt_order_id,
    'Pendente', 'Emissao NF', v_billing_name, v_item_qty, v_items_total,
    false, v_now,
    v_city, v_state, v_uf,
    v_street, v_number, v_neighborhood, v_zip, (v_street || ', ' || v_number || ' - ' || v_neighborhood || ', ' || v_city || '/' || v_uf),
    v_billing_name, v_billing_doc, 'CPF',
    lower(replace(v_billing_name,' ','_')) || '@example.com', '+55 11 99999-0000',
    'ISENTO', 'PF', 'nao_contribuinte', true
  );

  INSERT INTO public.marketplace_order_items (
    id, model_sku_externo, model_id_externo, variation_name, pack_id,
    linked_products, item_name, quantity, unit_price, image_url
  ) VALUES (
    v_order, v_item_sku, ('VAR-' || v_marketplace_code || '-' || LPAD(v_ix::text, 3, '0')), v_variation, NULL,
    NULL, v_item_name, v_item_qty, v_item_price, 'https://placeholder.svg'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_mock_orders_emissao_nf() TO authenticated;

COMMIT;
