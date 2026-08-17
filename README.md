# Urban Controle Produção

Painel de estoque e produção da Urban Zone Jeans, publicável no **Netlify**.

Dois modos de dados:

- **Visão real (Google Drive):** oficial e compartilhada. Você sobe os relatórios numa pasta do Drive e o app lê e interpreta sozinho (todo mundo vê o mesmo número). Roda por uma _Netlify Function_ com uma **conta de serviço** — ninguém precisa fazer login.
- **Importação manual:** cada pessoa pode subir planilhas no navegador para testar. Vale **só para a sessão daquela pessoa** e não altera a visão real dos outros.

---

## Estrutura do projeto

```
urban-controle-producao/
├── index.html                    # o app (frontend)
├── netlify.toml                  # configuração do Netlify
├── package.json                  # dependências da função
├── .gitignore
└── netlify/
    └── functions/
        └── drive.js              # lê e interpreta a pasta do Drive
```

---

## Parte 1 — Google Cloud (conta de serviço)

1. Acesse <https://console.cloud.google.com> e crie um projeto (ex.: `urban-controle`).
2. Menu **APIs e serviços → Biblioteca** → procure **Google Drive API** → **Ativar**.
3. Menu **APIs e serviços → Credenciais → Criar credenciais → Conta de serviço**.
   - Dê um nome (ex.: `leitor-relatorios`) e crie. Não precisa dar papéis.
4. Abra a conta de serviço criada → aba **Chaves → Adicionar chave → Criar nova chave → JSON**. Vai baixar um arquivo `.json`. Guarde-o.
   - Dentro dele estão os campos `client_email` e `private_key` que você vai usar no Netlify.

## Parte 2 — Pasta no Google Drive

1. Crie uma pasta no seu Drive (ex.: **Relatórios Urban**).
2. Clique em **Compartilhar** e adicione o **`client_email`** da conta de serviço (algo como `leitor-relatorios@urban-controle.iam.gserviceaccount.com`) como **Leitor**.
3. Copie o **ID da pasta**: está na URL quando você abre a pasta —
   `https://drive.google.com/drive/folders/`**`ESTE_TRECHO_É_O_ID`**.

### O que subir na pasta

Suba os relatórios **do jeito que eles vêm** (o app identifica cada um pelas colunas, não pelo nome):

| Relatório | Colunas que o app usa |
|---|---|
| Inventário Stokki (Domuslog) | `SKU`, `Disponível` |
| Full Shopee (Current Inventory Report) | `Seller SKU ID`, `Sellable`, `Pending ASN Inbound`, `unitsSoldInLast30Days` |
| Full Mercado Livre (stock_general) | `SKU`, `Aptas para venda`, `Entrada pendente`, `Vendas últimos 30 dias (un.)` |
| Saídas Domuslog (saidas_por_produto) | `SKU`, `Quantidade` — **use só o último mês fechado da Stokki** |
| Produção (pivot) | `Código de barras interno`, `Quantidade total disponível`, `Quantidade total produção` |

> **Dica importante (Mercado Livre):** o `.xlsx` do ML vem num formato que alguns leitores não abrem. Para não ter dor de cabeça, ao subir esse arquivo marque a opção **"Converter para Planilhas Google"** (ou, no Drive, abra-o com Planilhas Google uma vez). Assim o app lê 100%. Vale para qualquer arquivo problemático.

Sempre que subir uma versão nova de um relatório, o app passa a usar **a mais recente** automaticamente.

## Parte 3 — Publicar no Netlify

**Opção recomendada (GitHub):**

1. Crie um repositório no GitHub (ex.: `urban-controle-producao`) e suba estes arquivos.
2. Em <https://app.netlify.com> → **Add new site → Import an existing project** → conecte o GitHub e escolha o repositório.
3. Em **Build settings**, deixe o publish em `.` (ponto) e functions em `netlify/functions` (o `netlify.toml` já cuida disso).
4. Depois do primeiro deploy, vá em **Site configuration → Environment variables** e adicione:

   | Variável | Valor |
   |---|---|
   | `DRIVE_FOLDER_ID` | o ID da pasta (Parte 2) |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | o `client_email` do JSON |
   | `GOOGLE_PRIVATE_KEY` | o `private_key` do JSON (cole inteiro, **com** os `\n`) |

5. Em **Site configuration → Change site name**, coloque **`urban-controle-producao`** (a URL fica `urban-controle-producao.netlify.app`).
6. **Deploys → Trigger deploy → Clear cache and deploy site** para aplicar as variáveis.

Pronto. Ao abrir o site, ele carrega a **visão real** da pasta do Drive automaticamente. Se algo não estiver configurado, ele cai nos dados de exemplo e mostra o erro na aba **Importar**.

---

## Como funciona a consolidação (visão real)

Por SKU, cruzando todos os relatórios. O estoque aparece **separado por local** (sem soma duplicada):

| Coluna | De onde vem |
|---|---|
| **Domuslog** | `Disponível` (inventário Stokki) |
| **Full Shopee** | `Sellable` (Shopee) |
| **Full Mercado Livre** | `Aptas para venda` (ML) |
| **Em trânsito** | `Pending ASN Inbound` (Shopee) + `Entrada pendente` (ML) |
| **Estoque total** | soma dos 4 acima |
| **C. Mensal** | `Quantidade` (saídas Domuslog) + `unitsSoldInLast30Days` (Shopee) + `Vendas últimos 30 dias` (ML) |
| **Estq PE** | `Quantidade total disponível` (produção) |
| **Em Produção** | `Quantidade total produção` (produção) |

A Visão Geral também traz uma faixa **"Estoque por local"** com o total e o % de cada armazém.

A partir daí o app calcula estoque ideal, envio, situação (VAI ACABAR / ALERTA / OK), grade de venda × produção etc.

---

## Rodar localmente (opcional)

```
npm install
npx netlify dev
```
Crie um arquivo `.env` com as três variáveis acima para testar a função localmente.

---

## Resolução de problemas

- **`✗ Failed to fetch` / "não consegui falar com a função do Drive"** — a chamada não chegou à função. Causas:
  - Você está abrindo o app **fora do site publicado** (pré-visualização, arquivo local, ou site sem a função). No Netlify publicado funciona direto.
  - Para **testar de fora** (ex.: no seu PC apontando para o site já publicado): clique em **⚙️ URL da função** na aba Importar e cole `https://urban-controle-producao.netlify.app/.netlify/functions/drive`. A função já libera CORS.
  - Confirme que a função apareceu em **Netlify → Functions** (`drive`). Se não apareceu, o deploy da função falhou — veja os logs do deploy.
- **`Configuração ausente`** — falta cadastrar/re-deployar as 3 variáveis de ambiente.
- **`a função respondeu, mas a pasta não retornou dados`** — a pasta não foi compartilhada com o `client_email`, está vazia, ou os arquivos não foram reconhecidos.
- **Testar a função direto no navegador:** abra `https://SEU-SITE.netlify.app/.netlify/functions/drive` — deve devolver um JSON com `data`.

## Segurança

- A `private_key` fica **só** nas variáveis de ambiente do Netlify (servidor), nunca no navegador.
- A pasta do Drive é lida em **somente leitura** (`drive.readonly`). O app nunca escreve nem apaga nada.
