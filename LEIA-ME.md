# Painel de Automação de DM do Instagram

Um painel web com login e um motor de respostas automáticas no direct do Instagram:
alguém comenta uma palavra no seu post, recebe uma DM com botão, toca no botão, a
conversa segue (mais mensagens, um link ou um arquivo) e o contato fica salvo.

## O que tem nesta pasta

```
frontend/                  o painel (HTML, CSS e JS puro, hospeda em qualquer lugar)
  index.html               as duas páginas: login e o sistema
  config.js                SUPABASE_URL e SUPABASE_ANON_KEY (públicas)
  app.js                   login, menu, Início, Métricas, lista de automações
  editor.js                editor de automação + construtor de conversa + prévia
  styles.css               visual (troque a cor de destaque em --accent)
supabase/sql/              rode na ordem: 01, 02, 03, 04
supabase/functions/        as Edge Functions
  instagram-webhook/       o cérebro (recebe comentários, mensagens e botões)
  ig-scheduler/            o carteiro (fila do freio e envios com atraso)
  ig-token-refresh/        renova o token (1x por semana)
  ig-insights/             métricas pro painel
  ig-media/                lista os posts pro editor
  _shared/ig.ts            peças comuns (envio com botões e fallback)
servidor-local.ps1         servidor local pro Windows (sem Python nem Node)
```

---

## Passo 0: testar agora, sem configurar nada

1. Suba um servidor local na pasta `frontend` e abra `http://localhost:5173`:
   - Windows: `powershell -ExecutionPolicy Bypass -File servidor-local.ps1`
   - Mac/Linux: `cd frontend && python3 -m http.server 5173`
2. Entre com **qualquer e-mail** e **uma senha de 5 dígitos** (ex: 12345).
3. Navegue à vontade: Início, Calendário, Instagram, Métricas, Automações, o editor
   e a prévia ao vivo.

No modo de teste local nada é gravado (o botão Salvar avisa isso). Os passos abaixo
são pra colocar no ar de verdade, com login e dados salvos.

---

## Passo 1: criar o projeto no Supabase e rodar os SQLs

1. Crie uma conta e um projeto em supabase.com.
2. Abra **SQL Editor > New query** e rode, NESTA ORDEM, cada arquivo de `supabase/sql/`:
   - `01_tabelas.sql`: as tabelas (inclui a linha inicial do freio em `ig_send_budget`).
   - `02_freio.sql`: as funções `take_send_slot` e `record_send_result`.
   - `03_rls.sql`: as regras de acesso.
   - `06_interacoes.sql`: contador de interações e a visão da aba Interações (`ig_leads_painel`).
   - `07_analises.sql`: base da aba Análises (foto diária dos seguidores e cache). Troque SEU_PROJETO e SEU_SCHED_SECRET antes, igual ao 04.
   - `08_agenda_e_site.sql`: a agenda (tabela `tarefas`) e as métricas do site do portfólio (`site_eventos` e `site_resumo`).
   - (o `04_agendamento.sql` fica pro Passo 5)

> **ATENÇÃO:** o `02_freio.sql` é obrigatório. Sem as funções do freio, ele falha
> fechado e NENHUMA DM por comentário sai: tudo vai pra fila e a fila nunca anda.

## Passo 2: criar o usuário admin

Em **Authentication > Users > Add user**, crie o seu e-mail e senha (marque "Auto
Confirm User"). É esse login que vale quando o site estiver no ar. Não existe tela de
cadastro público, de propósito.

Recomendado: em **Authentication > Sign In / Providers**, desligue "Allow new users to
sign up", pra ninguém criar conta pela API.

## Passo 3: configurar os segredos das Edge Functions

Em **Edge Functions > Secrets** (ou pela CLI com `supabase secrets set NOME=valor`):

| Segredo | O que é |
|---|---|
| `IG_ACCESS_TOKEN` | token long-lived do Instagram (Passo 6) |
| `IG_ACCOUNT_ID` | id numérico da sua conta do Instagram (Passo 6) |
| `APP_SECRET` | segredo do app do Meta (App settings > Basic) |
| `APP_SECRET_ENFORCE` | `false` no começo; `true` depois de testar (Passo 10) |
| `VERIFY_TOKEN` | uma senha que você inventa (aperto de mão do webhook) |
| `GRAPH_API_VERSION` | `v21.0` |
| `SCHED_SECRET` | outra senha que você inventa (protege os robôs agendados) |
| `TEST_IG_ACCOUNTS` | ids numéricos das contas de teste, separados por vírgula |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm prontas dentro das Edge Functions,
não precisa (nem dá pra) cadastrar.

## Passo 4: publicar as Edge Functions

Com a CLI do Supabase instalada (`npm i -g supabase` ou veja supabase.com/docs/guides/cli),
dentro desta pasta:

```bash
supabase login
supabase link --project-ref SEU_PROJETO

supabase functions deploy instagram-webhook --no-verify-jwt
supabase functions deploy ig-scheduler      --no-verify-jwt
supabase functions deploy ig-token-refresh  --no-verify-jwt
supabase functions deploy ig-insights
supabase functions deploy ig-media
```

- A `instagram-webhook` **precisa ser pública** (`--no-verify-jwt`; no painel: desligar
  "Verify JWT"), senão o Meta não consegue chamar.
- `ig-scheduler` e `ig-token-refresh` também vão sem JWT: quem protege elas é o
  `SCHED_SECRET` (header `x-sched-key`).
- `ig-insights` e `ig-media` ficam com JWT e só respondem a usuário logado no painel.

## Passo 5: agendar os robôs (pg_cron)

1. Abra `supabase/sql/04_agendamento.sql` e troque:
   - `SEU_PROJETO` pelo id do seu projeto;
   - `SEU_SCHED_SECRET` pela mesma senha do segredo `SCHED_SECRET`.
2. Rode no SQL Editor. Ele liga as extensões `pg_cron` e `pg_net` e agenda:
   - `ig-scheduler` a cada 1 minuto;
   - `ig-token-refresh` toda segunda às 06:00 (UTC).
3. Depois do 04, rode também o `05_retencao.sql`: apaga dados com mais de 12 meses, como promete a Política de Privacidade.
4. Pra conferir: `select * from cron.job_run_details order by start_time desc limit 20;`

## Passo 6: app no Meta for Developers

1. Em developers.facebook.com, crie um app do tipo **Business** e adicione o produto
   **Instagram > API setup with Instagram login**.
2. Conecte sua conta **profissional** do Instagram (Business ou Creator).
3. Libere as permissões: `instagram_business_basic`,
   `instagram_business_manage_comments`, `instagram_business_manage_messages`
   (e `instagram_business_manage_insights` pras métricas).
4. Gere o token da conta (ele já vem long-lived, cerca de 60 dias) e copie o **id
   numérico** da conta. Coloque nos segredos `IG_ACCESS_TOKEN` e `IG_ACCOUNT_ID`.
5. No app do Instagram (celular), em Configurações > Mensagens, ative
   **"Permitir acesso às mensagens"** pra ferramentas conectadas.

## Passo 7: cadastrar o webhook no Meta

Em **Instagram > API setup > Configure webhooks**:

- **Callback URL:** `https://SEU_PROJETO.supabase.co/functions/v1/instagram-webhook`
- **Verify token:** o mesmo valor do segredo `VERIFY_TOKEN`
- Clique em verificar e depois **ASSINE os três campos**:
  - `comments`
  - `messages`
  - `messaging_postbacks` (é ele que faz os botões da conversa funcionarem)

## Passo 8: publicar o painel

1. Edite `frontend/config.js` com a sua `SUPABASE_URL` e a `SUPABASE_ANON_KEY`
   (Project Settings > API). A chave anônima pode ficar pública: quem tranca o banco é o
   RLS. **Nunca** coloque a chave service_role no frontend.
2. Publique a pasta `frontend` em qualquer host estático (ex: GitHub Pages: suba a pasta
   num repositório e ative Pages em Settings > Pages).
3. Fora do localhost, o login é pelo Supabase, com o usuário do Passo 2.

## Passo 9: testar

1. Crie uma automação no painel (ex: palavra "quero", botão com link).
2. Com uma **SEGUNDA conta** (a sua própria é ignorada de propósito), comente "quero"
   num post seu.
3. A segunda conta deve receber a DM com o botão. Pra testar várias vezes seguidas,
   coloque o id dela em `TEST_IG_ACCOUNTS` (assim ela ignora a regra do 1 por dia).
4. Se não chegar, olhe: **Edge Functions > instagram-webhook > Logs** e a tabela
   `ig_deliveries` (coluna `motivo`).

## Passo 10: ligar a trava da assinatura

Quando tudo funcionar, mude o segredo `APP_SECRET_ENFORCE` pra `true`. A partir daí,
requisições sem a assinatura correta do Meta são recusadas.

---

## Regras e limites (pra não tomar bloqueio)

- **Opt-in sempre:** o sistema só responde quem comentou ou falou com você. Nada de
  spam, disparo em massa ou lista comprada.
- **1 por dia:** cada pessoa recebe no máximo 1 DM por comentário a cada 24h (contas em
  `TEST_IG_ACCOUNTS` ignoram).
- **Freio de envio:** no máximo 6 por minuto, 60 por hora e 180 por dia (bem abaixo do
  teto do Instagram, que gira em torno de 200 a 300 respostas privadas por dia). O que
  passar vai pra fila e sai depois. Se o Instagram bloquear 3 vezes seguidas, os envios
  pausam por 3 horas. Pra mudar os tetos:
  `update ig_send_budget set cap_day = 150 where id = 'private_reply';`
- **Janela de 24h:** fora de uma interação recente não dá pra mandar DM. O comentário e
  o toque no botão abrem a janela.
- **Depois da resposta a um comentário**, o Instagram só libera a próxima mensagem
  quando a pessoa responde (ou toca no botão). Por isso arquivos chegam com mais garantia
  da Mensagem 2 em diante.
- **Token:** vence em cerca de 60 dias. O `ig-token-refresh` renova toda semana e guarda o
  novo em `ig_token_status`.
- **Limites:** nome de botão até 20 caracteres; no máximo 3 botões anexados por mensagem
  (se o Instagram recusar os botões anexados, o sistema tenta pílulas e depois texto puro);
  texto de mensagem com botão até 640 caracteres; resposta a comentário só vale por cerca
  de 7 dias; o banco devolve no máximo 1000 linhas por consulta (pagine em tabelas grandes).

## Como a conversa é guardada (campo `flow`)

```json
{
  "steps": [
    { "id": 1, "message": "Oi! Toque abaixo", "buttons": [{ "title": "Quero", "next": 2 }] },
    { "id": 2, "message": "Prefere A ou B?", "buttons": [
        { "title": "A", "next": 3 },
        { "title": "Ver o site", "url": "https://exemplo.com" }
    ]},
    { "id": 3, "message": "Qual seu e-mail?", "collect": { "field": "email", "next": null } }
  ]
}
```

- A Mensagem 1 é sempre o **primeiro** item de `steps`.
- Um botão tem `next` (vai pra outro passo) **ou** `url` (abre link). Sem nenhum dos
  dois = encerra (não é enviado).
- O toque no botão chega como `STEP:idDaAutomacao:proximoPasso`.

---

## Checklist pra colocar no ar

- [ ] `frontend/config.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- [ ] Segredos: `IG_ACCESS_TOKEN`, `IG_ACCOUNT_ID`, `APP_SECRET`, `APP_SECRET_ENFORCE=false`,
      `VERIFY_TOKEN`, `GRAPH_API_VERSION=v21.0`, `SCHED_SECRET`, `TEST_IG_ACCOUNTS`
- [ ] SQLs 01, 02, 03 rodados; 04 rodado com `SEU_PROJETO` e `SEU_SCHED_SECRET` trocados
- [ ] Usuário admin criado no Auth
- [ ] Edge Functions publicadas (webhook, scheduler e token-refresh com `--no-verify-jwt`)
- [ ] Webhook no Meta com `comments`, `messages` e `messaging_postbacks` assinados
- [ ] Teste com uma segunda conta
- [ ] `APP_SECRET_ENFORCE=true`
