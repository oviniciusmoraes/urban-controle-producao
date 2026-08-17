# Checklist rápido — Urban Controle Produção

## A) Configurar (uma vez só) — ~15 min

**Google Cloud**
- [ ] Criar projeto em console.cloud.google.com
- [ ] Ativar a **Google Drive API** (APIs e serviços → Biblioteca)
- [ ] Criar **Conta de serviço** (APIs e serviços → Credenciais)
- [ ] Na conta de serviço → **Chaves → Criar chave → JSON** (baixa o arquivo)
- [ ] Anotar do JSON: `client_email` e `private_key`

**Google Drive** (a estrutura de pastas JÁ FOI CRIADA no seu Drive)
- [ ] Pasta principal: **"Urban Controle Produção - Relatórios"** — ID `1ATIdBmP_-1Sg-ocQ5DWCsIUHl8VTVzKw`
- [ ] **Compartilhar essa pasta principal** com o `client_email` como **Leitor** (as subpastas herdam o acesso)
- [ ] Usar o ID acima em `DRIVE_FOLDER_ID`
- Subpastas já prontas dentro dela: `1 - Inventario Stokki`, `2 - Full Shopee`, `3 - Full Mercado Livre`, `4 - Saidas Domuslog`, `5 - Producao`

**GitHub + Netlify**
- [ ] Subir os arquivos do projeto num repositório GitHub
- [ ] Netlify → **Add new site → Import from GitHub** → escolher o repo
- [ ] Cadastrar as 3 variáveis (Site configuration → Environment variables):
      `DRIVE_FOLDER_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
- [ ] Renomear o site para **urban-controle-producao**
- [ ] **Deploys → Clear cache and deploy site**
- [ ] Abrir `urban-controle-producao.netlify.app` e conferir o selo verde "Visão real"

---

## B) Uso no dia a dia (equipe)

**Para atualizar os números, suba cada relatório na SUA subpasta:**

- [ ] `1 - Inventario Stokki` → `inventario…`
- [ ] `2 - Full Shopee` → `Current Inventory Report…`
- [ ] `3 - Full Mercado Livre` → `stock_general…` **marcando "Converter para Planilhas Google"** ⭐
- [ ] `4 - Saidas Domuslog` → `saidas_por_produto…` (somente o **último mês fechado** da Stokki)
- [ ] `5 - Producao` → `pivot…`

> Pode manter versões antigas na pasta — o app sempre usa a **mais recente** de cada tipo.
> Depois de subir, é só abrir o app e clicar em **🔄 Carregar / atualizar visão real** (ou recarregar a página).

**Para testar algo sem afetar os outros:** use a aba **Importar → Importação manual** (vale só para você naquele momento).

---

## Erros comuns
- **"A pasta está vazia ou sem acesso"** → você esqueceu de compartilhar a pasta com o `client_email`.
- **ML não aparece (ml: 0)** → suba o arquivo do Mercado Livre convertendo para Planilhas Google.
- **"Configuração ausente"** → falta cadastrar/deploiar as 3 variáveis de ambiente no Netlify.
- **Chave inválida** → cole a `GOOGLE_PRIVATE_KEY` inteira, entre aspas e com os `\n`.
