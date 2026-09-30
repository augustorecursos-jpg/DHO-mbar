# Trilha de Desenvolvimento · Âmbar Energia (DHO)

Plataforma de treinamento de colaboradores: aulas em PDF, provas com gabarito e
certificado automático para quem atinge **75%** de acerto (valor configurável por prova).

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

## Páginas

- **`/`** – home pública. O colaborador digita o CPF e clica em **Acessar Trilha**.
  CPF fora da base → *“Acesso negado. Procure o time de DHO.”*
- **`/trilha.html`** – painel do colaborador: carga da trilha, aulas feitas, provas abertas,
  certificados e progresso por módulo. Dentro do módulo: aulas em PDF (marcar como concluída),
  prova liberada após todas as aulas, e download do certificado quando aprovado.
- **`/admin.html`** – área do RH (senha):
  - **Colaboradores**: importa `.xlsx`/`.csv` com as colunas `CPF, NOME, CARGO, FILIAL, REGIONAL`
    (modelo em `public/exemplos/colaboradores-modelo.csv`). Modo *adicionar/atualizar* ou *substituir base*
    (quem sai da planilha perde o acesso, mas o histórico fica). Também dá para bloquear/liberar um CPF.
  - **Módulos & Conteúdos**: cria módulos, envia os PDFs das aulas e monta a prova com gabarito
    (formulário ou colando as questões em texto, marcando a correta com `*`).
  - **Resultados**: progresso por colaborador com filtro por regional/filial e exportação CSV.

## Regras implementadas

- CPF normalizado (aceita com ou sem pontuação e recupera zeros à esquerda que o Excel remove).
- O gabarito nunca vai para o navegador do colaborador; a correção é feita no servidor.
- Aprovação: nota ≥ nota mínima da prova (padrão 75%). Pode refazer; vale a melhor nota.
- Certificado em PDF com código de autenticidade, verificável em `/api/validar/<código>`.

## Estrutura

```
server.js        API (colaborador, admin) + arquivos estáticos
db.js            esquema SQLite
certificado.js   geração do certificado (pdf-lib)
scripts/         dados de demonstração
public/          home, painel do colaborador e área do RH (HTML/CSS/JS puro)
```
