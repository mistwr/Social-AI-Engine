# Social AI Engine

SaaS multiempresa para automação de Instagram/Meta, IA, publicação, captação de leads e integrações CRM.

## Stack

- Next.js 16
- Netlify
- Supabase Auth + Postgres + RLS
- Meta Graph API / Webhooks

## Objetivo

Cada empresa liga as suas próprias contas sociais e trabalha num workspace isolado. O motor pode enviar leads para SD Dialer, PARCENDi ou qualquer CRM por webhook/API.

## Estado V0.1

- Base Next.js pronta para Netlify
- Endpoint `GET/POST /api/meta/webhook`
- Validação `X-Hub-Signature-256` com `META_APP_SECRET`
- Modelo multiempresa Supabase
- RLS por organização
- Estrutura para organizações, membros, contas sociais, automações, conversas, mensagens e leads

## Configuração local

1. `npm install`
2. Copiar `.env.example` para `.env.local`
3. Preencher as variáveis Supabase e Meta
4. Aplicar `supabase/schema.sql` num projeto Supabase de desenvolvimento
5. `npm run dev`

## Variáveis

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — apenas servidor; nunca expor ao browser
- `META_APP_SECRET` — apenas servidor
- `META_VERIFY_TOKEN`
- `META_ACCESS_TOKEN` — V0.1; depois substituir por credenciais por organização num cofre server-side
- `META_GRAPH_API_VERSION`

## Próximos passos

1. Meta OAuth por organização
2. Cofre de tokens server-side
3. Persistência e fila de eventos dos webhooks
4. Inbox de Instagram
5. Comentário → DM e keywords
6. Agendamento/publicação
7. Agente IA por empresa
8. Lead scoring + integração SD Dialer/PARCENDi
9. Analytics
10. Billing e planos SaaS

## Segurança

Não guardar tokens Meta diretamente em tabelas expostas ao cliente. As tabelas públicas têm RLS e o `service_role` deve existir apenas no ambiente server-side.
