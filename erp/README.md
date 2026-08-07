# 🏮 NikkeyBox — Sistema de Gestão (ERP)

Sistema profissional de gestão de vendas, estoque, despesas e clientes integrado ao Firebase do site NikkeyBox.

## 📦 Instalação

### 1. Instalar dependências
```bash
cd erp
pip install -r requirements.txt
```

### 2. Configurar Firebase (OBRIGATÓRIO)

1. Acesse o [Firebase Console](https://console.firebase.google.com/project/nikkey-33f93/settings/serviceaccounts/adminsdk)
2. Vá em **Configurações do Projeto** → **Contas de Serviço**
3. Clique em **"Gerar nova chave privada"**
4. Salve o arquivo baixado como `firebase-credentials.json` na pasta `erp/`

### 3. Executar
```bash
streamlit run app.py
```

O navegador abrirá automaticamente com o sistema em `http://localhost:8501`

## 🗂️ Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| 📊 Dashboard | Visão geral com gráficos de vendas por mês, produto e categoria |
| 💰 Vendas Detalhadas | Análise completa com filtros por mês, produto e categoria + exportação Excel |
| 💸 Despesas | Registro de custos (ingredientes, potes, adesivos, frete, etc.) |
| 📋 Ficha Técnica | Custo exato de cada produto com cálculo automático de preço sugerido |
| 📦 Estoque | Controle de entrada/saída com alertas de estoque baixo |
| 👥 CRM Clientes | Clientes sincronizados do site + histórico de compras + sugestão de recompra |
| 📈 Resumo Financeiro | DRE completa (Bruto vs Líquido) + margem de contribuição por produto |
| 🛒 Lista de Compras | Lista automática baseada nas vendas + projeção de produção |
| 📄 Relatórios | Exportação em Excel de qualquer dado do sistema |

## 🔗 Integração com o Site

O sistema lê os dados diretamente do Firestore:
- **Coleção `orders`**: Pedidos feitos no site
- **Coleção `users`**: Clientes cadastrados no site

Dados exclusivos do ERP (não afetam o site):
- `erp_expenses` — Despesas
- `erp_supplies` — Insumos/Ingredientes cadastrados
- `erp_recipes` — Fichas técnicas dos produtos  
- `erp_stock` — Movimentações de estoque

## 💡 Dicas de Uso

1. **Primeiro passo**: Cadastre seus insumos na Ficha Técnica
2. **Segundo passo**: Monte a ficha técnica de cada produto
3. **Terceiro passo**: Registre suas despesas regularmente
4. **Resultado**: O Dashboard e o Resumo Financeiro calcularão tudo automaticamente

## 🌐 Acesso Remoto (Opcional)

Para acessar o sistema de qualquer lugar (ex: celular), suba o código em um repositório privado no GitHub e conecte ao [Streamlit Cloud](https://streamlit.io/cloud) — é gratuito!
