# Trilha de Desenvolvimento · Âmbar Energia (DHO)

Plataforma de treinamento de colaboradores: temas com materiais em PDF, avaliações com gabarito e
certificado automático para quem atinge **pelo menos 70%** de acerto em uma avaliação (regra única da trilha).

Visual baseado no template institucional da Âmbar Energia: azul-marinho `#0e3b5c`, laranja `#ec6b24`,
fundo claro, ondas nos cantos, padrão pontilhado e torres/placas solares em traço cinza.
As cores ficam centralizadas em `public/css/base.css`.

## Como rodar

Requisito: **Node.js 22.5+** (usa o SQLite nativo do Node, sem banco externo).

```bash
npm install
npm run seed      # opcional: cria dados de demonstração
npm start         # http://localhost:3000
```

| Variável | Para quê | Padrão |
|---|---|---|
| `ADMIN_PASSWORD` | Senha da área do RH (`/admin.html`) | `ambar-dho` (**troque antes de publicar**) |
| `PORT` | Porta HTTP | `3000` |
| `DATA_DIR` | Pasta do banco (`trilha.db`) e dos PDFs enviados | `./data` |
| `SESSION_SECRET` | Chave dos cookies de sessão | gerada e salva em `data/` |
| `NODE_ENV=production` | Cookies só via HTTPS | – |

CPFs de demonstração (após `npm run seed`): `123.456.789-09`, `987.654.321-00`, `111.444.777-35`.

## Publicação (acesso pelos colaboradores de todas as regionais)

A plataforma é um único serviço web com HTTPS e um disco permanente para o banco e os PDFs.

**Render (recomendado)** – o arquivo `render.yaml` já descreve tudo:
1. Em render.com → **New → Blueprint**, escolha este repositório.
2. Informe o valor de `ADMIN_PASSWORD` quando o Render pedir.
3. Após o deploy, o Render gera o link `https://….onrender.com`; em **Settings → Custom Domains**
   é possível usar um domínio da empresa (ex.: `trilha.ambarenergia.com.br`).

Custo aproximado: plano Starter (US$ 7/mês) + disco de 5 GB (US$ 1,25/mês). O Render faz snapshot diário do disco.

**Servidor próprio / outra nuvem** – use o `Dockerfile`:
```bash
docker build -t trilha-dho .
docker run -d -p 3000:3000 -v trilha-dados:/data -e ADMIN_PASSWORD=... trilha-dho
```
e coloque um proxy com HTTPS (Nginx, IIS, load balancer da nuvem) na frente.

Em produção (`NODE_ENV=production`) o servidor só inicia com `ADMIN_PASSWORD` definido, envia cookies apenas
via HTTPS e limita tentativas de login com falha por IP. A área do RH tem o botão **Backup** (em Resultados),
que baixa uma cópia completa do banco.

## Páginas

- **`/`** – home pública. O colaborador digita o CPF e clica em **Acessar Trilha**.
  CPF fora da base → *“Acesso negado. Procure o time de DHO.”* O link **“Primeira vez aqui? Veja o guia de acesso”**
  abre o e-book `public/guia/guia-de-acesso.pdf` (também no menu lateral do painel, em **Guia de acesso**).
- **`/trilha.html`** – painel do colaborador: menu lateral com os temas da trilha (cada tema reúne seus PDFs), progresso geral, materiais estudados, avaliações pendentes
  e certificados. Dentro do tema: materiais em PDF (marcar como concluído), avaliação liberada após
  todos os materiais, e download do certificado quando aprovado.
- **`/admin.html`** – área do RH (senha):
  - **Indicadores**: colaboradores ativos, acessos, conclusão da trilha, certificados, nota média e aprovação;
    conclusão por tema e por regional, certificados por semana, desempenho por avaliação e tabela por filial,
    com filtro por regional e filial.
  - **Colaboradores**: importa `.xlsx`/`.csv` com as colunas `CPF, NOME, CARGO, FILIAL, REGIONAL`
    (modelo em `public/exemplos/colaboradores-modelo.csv`). Modo *adicionar/atualizar* ou *substituir base*
    (quem sai da planilha perde o acesso, mas o histórico fica). Também dá para bloquear/liberar um CPF.
  - **Temas & Materiais**: cria os temas (itens do menu lateral), envia os PDFs e monta **quantas avaliações quiser
    por tema**, com gabarito (formulário ou colando as questões em texto, marcando a correta com `*`). Cada avaliação
    pode ser liberada após um material específico ou após todos os materiais do tema.
  - **Avaliação de Reação**: formulário único com seções e perguntas de quatro tipos (escala 1 a 5, nota 0 a 10,
    múltipla escolha e texto livre). Aparece ao final da avaliação de cada módulo, fica disponível na página do módulo
    e pode ser respondido a qualquer momento, inclusive pelo **QR Code** de cada módulo (`/reacao.html?modulo=<id>`),
    que pede o CPF. Cada colaborador responde uma vez por módulo. Resultados por pergunta (média e distribuição,
    contagem das opções e respostas abertas), com filtro por módulo.
  - **Resultados**: progresso por colaborador com filtro por regional/filial e exportação CSV.

## Regras implementadas

- CPF normalizado (aceita com ou sem pontuação e recupera zeros à esquerda que o Excel remove).
- O gabarito nunca vai para o navegador do colaborador; a correção é feita no servidor.
- Aprovação: nota ≥ 70% (regra fixa, definida em `db.js`). Pode refazer; vale a melhor nota.
  Cada avaliação aprovada gera o seu próprio certificado.
- Atualizações do banco são automáticas na inicialização e sempre salvam antes uma cópia
  (`trilha-antes-<versão>-<data>.db`) na pasta de dados.
- Certificado em PDF com código de autenticidade, verificável em `/api/validar/<código>`.
- Materiais exibidos exatamente como o PDF enviado, desenhados pelo pdf.js dentro da plataforma (sem a barra
  do leitor do navegador). O visualizador bloqueia impressão, menu de contexto, arrastar, Ctrl+P/S/C e borra o
  conteúdo ao perder o foco ou ao pressionar Print Screen.

## Guia de acesso (e-book)

O PDF do guia é gerado com prints reais da plataforma, a partir de um banco temporário com conteúdo fictício
(o banco de produção não é usado). Depois de mudar telas, gere de novo com:

```bash
node scripts/guia/gerar-guia.js   # requer o Playwright instalado globalmente
```

O texto e a diagramação ficam em `scripts/guia/conteudo-guia.js`; os prints e marcações, em `scripts/guia/capturar.js`.

## Estrutura

```
server.js        API (colaborador, admin) + arquivos estáticos
db.js            esquema SQLite
certificado.js   geração do certificado (pdf-lib)
scripts/         dados de demonstração
public/          home, painel do colaborador e área do RH (HTML/CSS/JS puro)
```
