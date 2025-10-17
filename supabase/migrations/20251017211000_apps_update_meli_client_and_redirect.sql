-- Update Mercado Livre app to set client_id and store redirect in config

update public.apps
set client_id = '8272938861648337',
    auth_url = coalesce(auth_url, 'https://auth.mercadolivre.com.br/authorization'),
    config = (coalesce(config, '{}'::jsonb) || jsonb_build_object('redirect_uri', 'https://novuraerp.com.br/oauth/mercado-livre/callback'))
where name = 'Mercado Livre';