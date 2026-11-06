# Aniversários no WhatsApp · Âmbar Energia

Envia a imagem padrão de aniversário (`imagens/aniversario.jpg`), com uma legenda contendo o nome do
colaborador, ao **grupo do WhatsApp** dos colaboradores.

Funcionamento:

```
n8n (todo dia às 9h) → lê o Excel → filtra aniversariantes do dia → POST /aniversario  ──►  este serviço  ──►  grupo do WhatsApp
```

O serviço usa o [Baileys](https://github.com/WhiskeySockets/Baileys), que conecta um número de WhatsApp como um
**aparelho vinculado** (igual ao WhatsApp Web), lendo um QR Code. Ele fala direto com o WhatsApp, sem abrir navegador,
por isso usa pouca memória (~100–150 MB) e cabe no plano mais barato do Render. Assim ele envia para qualquer grupo de que esse número participe, o que a API oficial da Meta
não permite.

> ⚠️ É uma integração **não oficial**. Use um **chip exclusivo** para a automação (ex.: "Âmbar DHO") e não o número de
> uma pessoa. Com uma mensagem por dia o risco de bloqueio é baixo, mas existe.

---

## 1. Requisitos

- Um celular com o chip da automação e o WhatsApp (ou WhatsApp Business) instalado. Esse número precisa **estar no grupo**
  dos colaboradores.
- Um lugar que fique ligado 24h para rodar o serviço, com **disco permanente** (a sessão do WhatsApp fica salva em
  `DATA_DIR`; sem disco permanente, é preciso escanear o QR Code de novo a cada reinício).
- O n8n precisa conseguir acessar o serviço por HTTP:
  - **n8n Cloud** → o serviço precisa de uma URL pública com HTTPS (ex.: Render, VPS);
  - **n8n self-hosted** → pode rodar na mesma máquina/rede (`http://localhost:3001` ou `http://whatsapp:3001`).

## 2. Variáveis de ambiente

| Variável | Para quê | Padrão |
|---|---|---|
| `API_KEY` | Chave que o n8n envia no cabeçalho `x-api-key` (mín. 16 caracteres) | **obrigatória** |
| `GROUP_ID` | ID do grupo (termina em `@g.us`). Veja o passo 4 | – |
| `PORT` | Porta HTTP | `3001` |
| `DATA_DIR` | Onde fica salvo o login do WhatsApp | `./.sessao` |
| `IMAGE_PATH` | Imagem enviada | `./imagens/aniversario.jpg` |
| `MESSAGE_TEMPLATE` | Legenda; `{nome}` é trocado pelo nome | "🎉 Hoje é dia de celebrar *{nome}*! …" |

Para gerar uma chave forte:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

## 3. Subir o serviço

### Opção A: servidor/PC da empresa (Windows ou Linux) com Node.js 22.9+

```bash
cd whatsapp-aniversario
npm install
cp .env.example .env      # edite API_KEY e, depois do passo 4, GROUP_ID
npm start
```

O QR Code aparece no terminal. Para manter rodando depois de fechar o terminal e reiniciar sozinho com a máquina, use o
[pm2](https://pm2.keymetrics.io):

```bash
npm install -g pm2
pm2 start npm --name whatsapp-aniversario -- start
pm2 save
```

### Opção B: Docker (VPS, servidor com n8n self-hosted etc.)

```bash
docker build -t whatsapp-aniversario .
docker run -d --name whatsapp-aniversario --restart unless-stopped \
  -p 3001:3001 -v whatsapp-sessao:/data \
  -e API_KEY=SUA_CHAVE -e GROUP_ID=SEU_GRUPO@g.us \
  whatsapp-aniversario
docker logs -f whatsapp-aniversario    # mostra o QR Code
```

### Opção C: Render (URL pública, ideal para n8n Cloud)

1. render.com → **New → Web Service** → este repositório → **Language: Docker**.
2. **Root Directory:** `whatsapp-aniversario`.
3. **Instance type:** **Starter** (US$ 7, 512 MB) é suficiente. O Free não serve: dorme e não aceita disco.
4. **Advanced → Add Disk:** mount path `/data`, 1 GB.
5. **Environment:** `API_KEY` e (depois do passo 4) `GROUP_ID`.
6. Após o deploy, abra `https://SEU-SERVICO.onrender.com/qr?key=SUA_API_KEY` para escanear o QR Code.

## 4. Conectar o WhatsApp e descobrir o ID do grupo

1. Abra `http://SEU-SERVIDOR:3001/qr?key=SUA_API_KEY` (ou use o QR que aparece no terminal).
2. No celular da automação: **WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo** e escaneie.
   A página passa a mostrar **✅ Conectado**.
3. Liste os grupos:
   ```bash
   curl -H "x-api-key: SUA_API_KEY" http://SEU-SERVIDOR:3001/grupos
   ```
   Copie o `id` do grupo dos colaboradores (ex.: `120363012345678901@g.us`), coloque em `GROUP_ID` e reinicie o serviço.
4. Teste o envio. Para não incomodar o grupo, faça o primeiro teste em um grupo de teste, passando `grupoId`:
   ```bash
   curl -X POST http://SEU-SERVIDOR:3001/aniversario \
     -H "x-api-key: SUA_API_KEY" -H "Content-Type: application/json" \
     -d '{"nome": "Maria Silva", "grupoId": "ID_DO_GRUPO_DE_TESTE@g.us"}'
   ```

## 5. Ajustar o fluxo do n8n

O fluxo atual (**Todo dia às 9h → Ler aniversariantes → Aniversariantes de hoje → Enviar imagem no WhatsApp**) continua
igual. Mudam só dois pontos:

**a) Nó "Aniversariantes de hoje" (Code)**: cole o conteúdo de [`n8n/aniversariantes-de-hoje.js`](n8n/aniversariantes-de-hoje.js)
(modo *Run Once for All Items*) e ajuste `COL_NOME` / `COL_DATA` para os cabeçalhos da sua planilha. Ele aceita datas
como número do Excel, `25/03/1990` ou `1990-03-25`, usa o fuso de Brasília e devolve um item `{ nome }` por aniversariante.

**b) Nó "Enviar imagem no WhatsApp" (HTTP Request)**: troque a chamada da Z-API por:

| Campo | Valor |
|---|---|
| Method | `POST` |
| URL | `https://SEU-SERVICO/aniversario` |
| Authentication | *Generic Credential Type* → *Header Auth* → Name: `x-api-key`, Value: sua `API_KEY` |
| Send Body | ligado → *JSON* → *Using JSON* |
| JSON | `{ "nome": "{{ $json.nome }}" }` |
| Options → Retry on Fail | ligado (3 tentativas, 30 s), opcional |

**c) Nó "Link da imagem"**: pode ser **removido**. A imagem já está no serviço. Para trocar de arte, substitua
`imagens/aniversario.jpg` (ou mande `"imagemUrl": "https://…"` no JSON).

Confira também, em **Workflow → Settings → Timezone**, se está `America/Sao_Paulo`, para o "9h" ser o horário de Brasília.

> **Uma mensagem para todos os aniversariantes do dia** (em vez de uma por pessoa): no Code, guarde o resultado em
> `const lista = $input.all().filter(...).map(...)` e termine com
> `return lista.length ? [{ json: { nomes: lista.map((i) => i.json.nome) } }] : [];`.
> No HTTP, use o JSON `{ "nomes": {{ JSON.stringify($json.nomes) }} }`. A legenda fica "*Ana, Bia e Carlos*".

## 6. Endpoints

| Rota | Chave? | Descrição |
|---|---|---|
| `GET /healthz` | não | Saúde do serviço e status do WhatsApp |
| `GET /status` | sim | Status, número conectado, grupo padrão |
| `GET /qr` | sim | Página com o QR Code (atualiza a cada 10 s) |
| `GET /grupos` | sim | Grupos do número conectado (`id`, `nome`, `participantes`) |
| `POST /aniversario` | sim | Envia a imagem. Corpo: `nome` **ou** `nomes` (lista) **ou** `legenda`; opcionais `grupoId`, `imagemUrl` |

A chave vai no cabeçalho `x-api-key` (ou `?key=` na URL, para abrir o `/qr` no navegador).
Se o WhatsApp estiver desconectado, `/aniversario` responde **503**: o n8n marca a execução como erro e dá para ver em
*Executions*.

## 7. Manutenção

- **Desconectou?** O serviço tenta reconectar sozinho. Se a sessão foi encerrada no celular, abra `/qr` e escaneie de novo.
- **Mantenha o celular da automação ligado** e com internet de vez em quando. Se ficar ~14 dias offline, o WhatsApp
  desconecta os aparelhos vinculados.
- **Atualizações:** quando o WhatsApp muda o protocolo, às vezes é preciso atualizar a biblioteca
  (`npm install @whiskeysockets/baileys@latest`), enviar ao GitHub e o Render faz o deploy sozinho.
