"""
🏮 NikkeyBox - Sistema de Gestão (ERP)
================================================
Sistema profissional de gestão de vendas, estoque, 
despesas e clientes integrado ao Firebase.

Executar: streamlit run app.py
"""

import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from datetime import datetime, timedelta
from collections import defaultdict
import json
import io
import requests as http_requests
from pathlib import Path

from firebase_service import (
    get_firebase_db,
    get_all_orders, get_all_users,
    save_expense, get_all_expenses, delete_expense,
    save_supply, get_all_supplies, delete_supply,
    save_product_recipe, get_all_recipes, delete_recipe,
    save_stock_entry, get_all_stock, update_stock_item, delete_stock_item,
    create_coupon, get_all_coupons, delete_coupon, toggle_coupon_active,
    update_order_status_erp, update_order_tracking,
    get_whatsapp_api_url, save_whatsapp_api_url,
)

COMPANY_PROFILE_PATH = Path(__file__).resolve().parents[1] / "shared" / "company-profile.json"
with COMPANY_PROFILE_PATH.open(encoding="utf-8") as profile_file:
    COMPANY_PROFILE = json.load(profile_file)

# =====================================================
# CONFIGURAÇÃO DA PÁGINA
# =====================================================
st.set_page_config(
    page_title="NikkeyBox - ERP",
    page_icon="🏮",
    layout="wide",
    initial_sidebar_state="expanded",
)

# =====================================================
# CSS CUSTOMIZADO - TEMA PROFISSIONAL
# =====================================================
st.markdown("""
<style>
    /* Sidebar styling */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    }
    [data-testid="stSidebar"] * {
        color: #ffffff !important;
    }
    [data-testid="stSidebar"] .stRadio label {
        color: #e0e0e0 !important;
        font-size: 15px;
    }
    
    /* Metric cards */
    [data-testid="stMetric"] {
        background: #ffffff;
        padding: 18px;
        border-radius: 12px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        border-left: 4px solid #e53935;
    }
    [data-testid="stMetricValue"] {
        font-size: 28px !important;
        font-weight: 700 !important;
        color: #1a1a2e !important;
    }
    [data-testid="stMetricLabel"] {
        font-size: 13px !important;
        color: #666 !important;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    /* Main header */
    .main-header {
        background: linear-gradient(135deg, #e53935 0%, #d32f2f 100%);
        padding: 24px 32px;
        border-radius: 16px;
        color: white;
        margin-bottom: 24px;
        box-shadow: 0 4px 16px rgba(229, 57, 53, 0.3);
    }
    .main-header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
    }
    .main-header p {
        margin: 4px 0 0;
        opacity: 0.9;
        font-size: 14px;
    }
    
    /* Status badges */
    .status-ok { 
        background: #e8f5e9; color: #2e7d32; 
        padding: 4px 12px; border-radius: 20px; 
        font-weight: 600; font-size: 12px; 
    }
    .status-low { 
        background: #fff3e0; color: #ef6c00; 
        padding: 4px 12px; border-radius: 20px; 
        font-weight: 600; font-size: 12px; 
    }
    .status-critical { 
        background: #ffebee; color: #c62828; 
        padding: 4px 12px; border-radius: 20px; 
        font-weight: 600; font-size: 12px; 
    }
    
    /* Card container */
    .card {
        background: #ffffff;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        margin-bottom: 16px;
    }
    
    /* Table styling */
    .stDataFrame {
        border-radius: 8px;
        overflow: hidden;
    }
    
    /* Expander styling */
    .streamlit-expanderHeader {
        font-weight: 600;
        font-size: 16px;
    }

    /* Hide streamlit branding */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    
    /* Tab styling */
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }
    .stTabs [data-baseweb="tab"] {
        border-radius: 8px 8px 0 0;
        padding: 10px 24px;
        font-weight: 600;
    }
</style>
""", unsafe_allow_html=True)

# =====================================================
# INICIALIZAÇÃO DO FIREBASE
# =====================================================
db = get_firebase_db()

# =====================================================
# SIDEBAR - NAVEGAÇÃO
# =====================================================
with st.sidebar:
    st.markdown("### 🏮 NikkeyBox")
    st.markdown("**Sistema de Gestão**")
    st.markdown("---")
    
    menu = st.radio(
        "📍 Navegação",
        [
            "📊 Dashboard",
            "💰 Vendas Detalhadas",
            "💸 Despesas",
            "📋 Ficha Técnica",
            "📦 Estoque",
            "👥 Clientes (CRM)",
            "📈 Resumo Financeiro",
            "🛒 Lista de Compras",
            "📦 Gestão de Pedidos",
            "🏷️ Etiquetas de Envio",
            "🎟️ Cupons",
            "🎂 Aniversários",
            "📱 WhatsApp",
            "📄 Relatórios",
        ],
        index=0,
    )
    # Sanitize: remove any corrupted unicode replacement chars
    menu = menu.replace(chr(0xFFFD), '').strip()
    
    st.markdown("---")
    st.markdown("##### 🔗 Links Rápidos")
    st.markdown("[Firebase Console](https://console.firebase.google.com/project/nikkey-33f93)")
    st.markdown("[Site](https://nikkeybox-store.com)")
    
    st.markdown("---")
    
    # Birthday alerts in sidebar
    if db:
        _users = get_all_users(db)
        _today = datetime.now()
        _bday_alerts = []
        for _u in _users:
            bd = _u.get('birthdate', '')
            if bd:
                try:
                    bdate = datetime.strptime(str(bd)[:10], '%Y-%m-%d')
                    days_until = (bdate.replace(year=_today.year) - _today).days
                    if days_until < 0:
                        days_until = (bdate.replace(year=_today.year + 1) - _today).days
                    if 0 <= days_until <= 7:
                        _bday_alerts.append((_u.get('name', ''), days_until))
                except:
                    pass
        if _bday_alerts:
            st.markdown("---")
            st.markdown("##### 🎂 Aniversários")
            for name, days in _bday_alerts:
                if days == 0:
                    st.warning(f"🎉 **HOJE**: {name}")
                else:
                    st.info(f"📅 Em {days}d: {name}")
    
    st.markdown("---")
    st.caption(f"v2.0 • {datetime.now().strftime('%d/%m/%Y %H:%M')}")


# =====================================================
# HELPERS
# =====================================================


def parse_order_date(order):
    """Extrai a data de um pedido de forma robusta."""
    date_str = order.get('orderDate') or order.get('date') or order.get('syncedAt') or ''
    try:
        if 'T' in str(date_str):
            return datetime.fromisoformat(str(date_str).replace('Z', '+00:00').split('+')[0])
        return datetime.strptime(str(date_str)[:10], '%Y-%m-%d')
    except:
        return datetime.now()


def get_order_total(order):
    """Extrai o valor total de um pedido."""
    return float(order.get('totalPrice') or order.get('totalAmount') or 0)


def get_order_items(order):
    """Extrai os itens de um pedido."""
    items = order.get('items', [])
    parsed = []
    for item in items:
        parsed.append({
            'name': item.get('productName') or item.get('name') or 'Desconhecido',
            'quantity': int(item.get('quantity', 1)),
            'price': float(item.get('price', 0)),
            'size': item.get('size', 'N/A'),
        })
    return parsed


def orders_to_dataframe(orders):
    """Converte a lista de pedidos em um DataFrame."""
    if not orders:
        return pd.DataFrame()
    
    rows = []
    for o in orders:
        if o.get('status') == 'cancelled':
            continue
        
        dt = parse_order_date(o)
        items = get_order_items(o)
        total = get_order_total(o)
        
        for item in items:
            product_name = item['name']
            rows.append({
                'orderNumber': o.get('orderNumber', 'N/A'),
                'date': dt,
                'month': dt.strftime('%Y-%m'),
                'monthLabel': dt.strftime('%b/%Y'),
                'product': product_name,
                'size': item['size'],
                'quantity': item['quantity'],
                'unitPrice': item['price'],
                'itemTotal': item['price'] * item['quantity'],
                'orderTotal': total,
                'status': o.get('status', 'pending'),
                'customerName': o.get('customerName') or 
                                (o.get('shippingAddress', {}).get('name') if isinstance(o.get('shippingAddress'), dict) else '') or
                                (o.get('formData', {}).get('name') if isinstance(o.get('formData'), dict) else '') or 'N/A',
                'customerEmail': o.get('customerEmail', 'N/A'),
                'paymentMethod': o.get('paymentMethod', 'N/A'),
            })
    
    if not rows:
        return pd.DataFrame()
    
    df = pd.DataFrame(rows)
    df['date'] = pd.to_datetime(df['date'])
    return df.sort_values('date', ascending=False)


def format_yen(value):
    """Formata valor em ienes."""
    return f"¥{value:,.0f}"


def format_percent_change(current, previous):
    """Calcula e formata a variação percentual."""
    if previous == 0:
        return "+100%" if current > 0 else "0%"
    change = ((current - previous) / previous) * 100
    sign = "+" if change >= 0 else ""
    return f"{sign}{change:.1f}%"


# =====================================================
# 📊 DASHBOARD
# =====================================================
if menu == "📊 Dashboard":
    st.markdown("""
    <div class="main-header">
        <h1>📊 Dashboard - Visão Geral</h1>
        <p>Resumo do desempenho do NikkeyBox em tempo real</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.warning("⚠️ Conecte o Firebase para ver os dados reais. Veja instruções na sidebar.")
        st.stop()
    
    orders = get_all_orders(db)
    df = orders_to_dataframe(orders)
    
    if df.empty:
        st.info("📭 Nenhum pedido encontrado. Quando houver vendas no site, elas aparecerão aqui automaticamente.")
        st.stop()
    
    # Período atual vs anterior
    now = datetime.now()
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)
    
    df_this_month = df[df['date'] >= this_month_start]
    df_last_month = df[(df['date'] >= last_month_start) & (df['date'] < this_month_start)]
    
    revenue_this = df_this_month['itemTotal'].sum()
    revenue_last = df_last_month['itemTotal'].sum()
    orders_this = df_this_month['orderNumber'].nunique()
    orders_last = df_last_month['orderNumber'].nunique()
    qty_this = df_this_month['quantity'].sum()
    qty_last = df_last_month['quantity'].sum()
    
    # Métricas principais
    col1, col2, col3, col4 = st.columns(4)
    col1.metric(
        "Faturamento do Mês",
        format_yen(revenue_this),
        format_percent_change(revenue_this, revenue_last),
    )
    col2.metric(
        "Pedidos no Mês",
        f"{orders_this}",
        format_percent_change(orders_this, orders_last),
    )
    col3.metric(
        "Unidades Vendidas",
        f"{qty_this:,.0f}",
        format_percent_change(qty_this, qty_last),
    )
    ticket_medio = revenue_this / orders_this if orders_this > 0 else 0
    col4.metric(
        "Ticket Médio",
        format_yen(ticket_medio),
    )
    
    st.markdown("---")
    
    # Gráficos lado a lado
    col_left, col_right = st.columns(2)
    
    with col_left:
        st.subheader("📈 Vendas por Mês")
        monthly = df.groupby('monthLabel').agg(
            revenue=('itemTotal', 'sum'),
            qty=('quantity', 'sum'),
        ).reset_index()
        # Sort by month
        monthly['sort_key'] = pd.to_datetime(df.groupby('monthLabel')['date'].first().values)
        monthly = monthly.sort_values('sort_key')
        
        fig_monthly = go.Figure()
        fig_monthly.add_trace(go.Bar(
            x=monthly['monthLabel'], y=monthly['revenue'],
            name='Faturamento (¥)', marker_color='#e53935',
        ))
        fig_monthly.add_trace(go.Scatter(
            x=monthly['monthLabel'], y=monthly['qty'],
            name='Quantidade', yaxis='y2',
            marker_color='#1565c0', mode='lines+markers',
        ))
        fig_monthly.update_layout(
            yaxis=dict(title='Faturamento (¥)'),
            yaxis2=dict(title='Quantidade', overlaying='y', side='right'),
            legend=dict(orientation='h', yanchor='bottom', y=1.02),
            height=400,
            margin=dict(t=40, b=40),
        )
        st.plotly_chart(fig_monthly, use_container_width=True)
    
    with col_right:
        st.subheader("🛍️ Vendas por Produto")
        by_product = df.groupby('product').agg(
            revenue=('itemTotal', 'sum'),
            qty=('quantity', 'sum'),
        ).sort_values('revenue', ascending=False).reset_index()
        
        fig_product = px.pie(
            by_product, values='revenue', names='product',
            hole=0.4,
            color_discrete_sequence=px.colors.qualitative.Set2,
        )
        fig_product.update_layout(height=400, margin=dict(t=20, b=20))
        st.plotly_chart(fig_product, use_container_width=True)
    
    # Segunda linha de gráficos
    col_left2, col_right2 = st.columns(2)
    
    with col_left2:
        st.subheader("💳 Vendas por Forma de Pagamento")
        by_payment = df.groupby('paymentMethod').agg(
            revenue=('itemTotal', 'sum'),
            qty=('quantity', 'sum'),
        ).reset_index()

        fig_payment = px.bar(
            by_payment, x='paymentMethod', y='revenue',
            color='paymentMethod',
            text_auto=True,
        )
        fig_payment.update_layout(height=350, showlegend=False, margin=dict(t=20, b=20))
        st.plotly_chart(fig_payment, use_container_width=True)
    
    with col_right2:
        st.subheader("📏 Vendas por Tamanho")
        by_size = df.groupby('size').agg(
            qty=('quantity', 'sum'),
        ).reset_index()
        
        fig_size = px.pie(
            by_size, values='qty', names='size',
            color_discrete_sequence=['#42a5f5', '#ef5350'],
            hole=0.4,
        )
        fig_size.update_layout(height=350, margin=dict(t=20, b=20))
        st.plotly_chart(fig_size, use_container_width=True)
    
    # Top 5 Clientes
    st.subheader("🏆 Top 5 Clientes")
    top_customers = df.groupby('customerName').agg(
        totalSpent=('itemTotal', 'sum'),
        orders=('orderNumber', 'nunique'),
    ).sort_values('totalSpent', ascending=False).head(5).reset_index()
    
    top_customers.columns = ['Cliente', 'Total Gasto (¥)', 'Nº Pedidos']
    st.dataframe(top_customers, use_container_width=True, hide_index=True)


# =====================================================
# 💰 VENDAS DETALHADAS
# =====================================================
elif menu == "💰 Vendas Detalhadas":
    st.markdown("""
    <div class="main-header">
        <h1>💰 Vendas Detalhadas</h1>
        <p>Análise detalhada de cada venda separada por tipo, mês e quantidade</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    orders = get_all_orders(db)
    df = orders_to_dataframe(orders)
    
    if df.empty:
        st.info("📭 Nenhum pedido encontrado.")
        st.stop()
    
    # Filtros
    st.subheader("🔍 Filtros")
    col_f1, col_f2 = st.columns(2)
    
    with col_f1:
        months_available = sorted(df['monthLabel'].unique())
        selected_months = st.multiselect("Mês", months_available, default=months_available)
    
    with col_f2:
        products_available = sorted(df['product'].unique())
        selected_products = st.multiselect("Produto", products_available, default=products_available)
    
    
    # Aplicar filtros
    df_filtered = df[
        (df['monthLabel'].isin(selected_months)) &
        (df['product'].isin(selected_products))
    ]
    
    if df_filtered.empty:
        st.warning("Nenhum dado para os filtros selecionados.")
        st.stop()
    
    # Métricas filtradas
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Faturado", format_yen(df_filtered['itemTotal'].sum()))
    col2.metric("Pedidos", f"{df_filtered['orderNumber'].nunique()}")
    col3.metric("Unidades", f"{df_filtered['quantity'].sum():,.0f}")
    
    st.markdown("---")
    
    # Tabela por produto e mês
    st.subheader("📊 Vendas por Produto e Mês")
    pivot = df_filtered.pivot_table(
        index='product',
        columns='monthLabel',
        values='quantity',
        aggfunc='sum',
        fill_value=0,
    )
    pivot['TOTAL'] = pivot.sum(axis=1)
    pivot = pivot.sort_values('TOTAL', ascending=False)
    st.dataframe(pivot, use_container_width=True)
    
    # Tabela detalhada de pedidos
    st.subheader("📝 Lista de Pedidos")
    display_df = df_filtered[['orderNumber', 'date', 'product', 'size', 'quantity', 'unitPrice', 'itemTotal', 'customerName', 'status', 'paymentMethod']].copy()
    display_df.columns = ['Pedido', 'Data', 'Produto', 'Tamanho', 'Qtd', 'Preço Un.', 'Total', 'Cliente', 'Status', 'Pagamento']
    display_df['Data'] = display_df['Data'].dt.strftime('%d/%m/%Y')
    display_df['Preço Un.'] = display_df['Preço Un.'].apply(lambda x: format_yen(x))
    display_df['Total'] = display_df['Total'].apply(lambda x: format_yen(x))
    st.dataframe(display_df, use_container_width=True, hide_index=True)
    
    # Exportar para Excel
    st.subheader("📥 Exportar Dados")
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df_filtered.to_excel(writer, sheet_name='Vendas', index=False)
    
    st.download_button(
        label="⬇️ Baixar Excel",
        data=buffer.getvalue(),
        file_name=f"vendas_nikkey_box_{datetime.now().strftime('%Y%m%d')}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# =====================================================
# 💸 DESPESAS
# =====================================================
elif menu == "💸 Despesas":
    st.markdown("""
    <div class="main-header">
        <h1>💸 Controle de Despesas</h1>
        <p>Registre custos com produtos, embalagens e outros insumos</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    tab1, tab2 = st.tabs(["➕ Lançar Despesa", "📋 Histórico"])
    
    with tab1:
        st.subheader("Nova Despesa")
        with st.form("form_expense", clear_on_submit=True):
            col1, col2 = st.columns(2)
            
            with col1:
                expense_type = st.selectbox("Tipo de Despesa", [
                    "📦 Produtos / Mercadoria",
                    "📮 Embalagens",
                    "🏷️ Adesivos / Etiquetas",
                    "📦 Material de Envio",
                    "🚚 Frete / Transporte",
                    "📱 Marketing / Publicidade",
                    "🏠 Aluguel / Espaço",
                    "⚡ Água / Luz / Gás",
                    "📋 Impostos / Taxas",
                    "🔧 Equipamentos",
                    "💼 Outros",
                ])
                description = st.text_input("Descrição", placeholder="Ex: Reposição de estoque - cosméticos")
            
            with col2:
                expense_value = st.number_input("Valor (¥)", min_value=0.0, format="%.0f", step=100.0)
                expense_date = st.date_input("Data da Despesa", value=datetime.now())
                supplier = st.text_input("Fornecedor (opcional)", placeholder="Ex: Supermercado Gyomu")
            
            notes = st.text_area("Observações (opcional)", height=68)
            
            submitted = st.form_submit_button("💾 Registrar Despesa", use_container_width=True)
            
            if submitted:
                if expense_value <= 0:
                    st.error("Valor deve ser maior que zero!")
                elif not description:
                    st.error("Preencha a descrição!")
                else:
                    expense_data = {
                        'type': expense_type,
                        'description': description,
                        'value': expense_value,
                        'date': expense_date.isoformat(),
                        'supplier': supplier,
                        'notes': notes,
                    }
                    if save_expense(db, expense_data):
                        st.success(f"✅ Despesa registrada: {description} - {format_yen(expense_value)}")
                        st.rerun()
    
    with tab2:
        st.subheader("📋 Histórico de Despesas")
        expenses = get_all_expenses(db)
        
        if expenses:
            df_exp = pd.DataFrame(expenses)
            df_exp['date'] = pd.to_datetime(df_exp['date'])
            df_exp = df_exp.sort_values('date', ascending=False)
            
            # Resumo por tipo
            col1, col2 = st.columns([2, 1])
            
            with col1:
                fig_exp = px.bar(
                    df_exp.groupby('type')['value'].sum().reset_index(),
                    x='type', y='value',
                    color='type',
                    title='Despesas por Categoria',
                    color_discrete_sequence=px.colors.qualitative.Pastel,
                )
                fig_exp.update_layout(showlegend=False, height=400)
                st.plotly_chart(fig_exp, use_container_width=True)
            
            with col2:
                total_expenses = df_exp['value'].sum()
                st.metric("Total de Despesas", format_yen(total_expenses))
                
                monthly_exp = df_exp[df_exp['date'].dt.month == datetime.now().month]
                st.metric("Despesas este Mês", format_yen(monthly_exp['value'].sum() if not monthly_exp.empty else 0))
            
            # Tabela
            display_exp = df_exp[['date', 'type', 'description', 'value', 'supplier']].copy()
            display_exp.columns = ['Data', 'Tipo', 'Descrição', 'Valor (¥)', 'Fornecedor']
            display_exp['Data'] = display_exp['Data'].dt.strftime('%d/%m/%Y')
            st.dataframe(display_exp, use_container_width=True, hide_index=True)
            
            # Deletar despesa
            with st.expander("🗑️ Remover Despesa"):
                expense_ids = {f"{e.get('description', 'N/A')} - {format_yen(e.get('value', 0))} ({e.get('date', '')[:10]})": e['_id'] for e in expenses}
                selected_expense = st.selectbox("Selecione a despesa para remover", list(expense_ids.keys()))
                if st.button("🗑️ Confirmar Remoção"):
                    if delete_expense(db, expense_ids[selected_expense]):
                        st.success("Despesa removida!")
                        st.rerun()
        else:
            st.info("Nenhuma despesa registrada ainda.")


# =====================================================
# 📋 FICHA TÉCNICA
# =====================================================
elif menu == "📋 Ficha Técnica":
    st.markdown("""
    <div class="main-header">
        <h1>📋 Ficha Técnica de Produtos</h1>
        <p>Calcule o custo exato de cada produto com calma — digite os insumos que você usa</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    tab1, tab2, tab3 = st.tabs(["🧪 Cadastrar Insumos", "📝 Criar Ficha de Produto", "📊 Fichas Salvas"])
    
    # --- TAB 1: Cadastro de Insumos ---
    with tab1:
        st.subheader("🧪 Cadastro de Insumos e Matéria-Prima")
        st.info("Cadastre aqui todos os ingredientes, embalagens, adesivos etc. que você compra. O sistema calcula o custo por unidade automaticamente.")
        
        with st.form("form_supply", clear_on_submit=True):
            col1, col2, col3 = st.columns(3)
            
            with col1:
                supply_name = st.text_input("Nome do Insumo", placeholder="Ex: Caixa de papelão")
                supply_category = st.selectbox("Categoria", [
                    "Matéria-prima",
                    "Embalagem",
                    "Adesivo / Etiqueta",
                    "Fita adesiva",
                    "Saco / Sacola",
                    "Caixa de Envio",
                    "Outros",
                ])
            
            with col2:
                supply_price = st.number_input("Preço Pago (¥)", min_value=0.0, format="%.0f", step=10.0)
                supply_quantity = st.number_input("Quantidade Comprada", min_value=0.01, format="%.2f", step=1.0, value=1.0)
            
            with col3:
                supply_unit = st.selectbox("Unidade de Medida", [
                    "g (gramas)", "kg (quilos)", "ml (mililitros)", 
                    "L (litros)", "un (unidades)", "pacote", "caixa",
                ])
                supply_supplier = st.text_input("Fornecedor (opcional)", placeholder="Ex: Gyomu Super")
            
            submitted = st.form_submit_button("💾 Salvar Insumo", use_container_width=True)
            
            if submitted and supply_name and supply_price > 0 and supply_quantity > 0:
                unit_cost = supply_price / supply_quantity
                supply_data = {
                    'name': supply_name,
                    'category': supply_category,
                    'totalPrice': supply_price,
                    'totalQuantity': supply_quantity,
                    'unit': supply_unit,
                    'unitCost': unit_cost,
                    'supplier': supply_supplier,
                }
                if save_supply(db, supply_data):
                    st.success(f"✅ {supply_name} salvo! Custo por {supply_unit.split(' ')[0]}: {format_yen(unit_cost)}")
                    st.rerun()
        
        # Lista de insumos cadastrados
        st.markdown("---")
        st.subheader("📦 Insumos Cadastrados")
        supplies = get_all_supplies(db)
        
        if supplies:
            df_sup = pd.DataFrame(supplies)
            display_cols = ['name', 'category', 'totalPrice', 'totalQuantity', 'unit', 'unitCost', 'supplier']
            available_cols = [c for c in display_cols if c in df_sup.columns]
            display_sup = df_sup[available_cols].copy()
            display_sup.columns = ['Nome', 'Categoria', 'Preço Total', 'Qtd', 'Unidade', 'Custo Un.', 'Fornecedor'][:len(available_cols)]
            st.dataframe(display_sup, use_container_width=True, hide_index=True)
            
            with st.expander("🗑️ Remover Insumo"):
                supply_ids = {s.get('name', 'N/A'): s['_id'] for s in supplies}
                sel = st.selectbox("Selecione o insumo", list(supply_ids.keys()), key="del_supply")
                if st.button("🗑️ Confirmar Remoção", key="btn_del_supply"):
                    if delete_supply(db, supply_ids[sel]):
                        st.success("Insumo removido!")
                        st.rerun()
        else:
            st.info("Nenhum insumo cadastrado. Comece cadastrando seus ingredientes e embalagens acima.")
    
    # --- TAB 2: Criar Ficha Técnica ---
    with tab2:
        st.subheader("📝 Criar/Editar Ficha Técnica de Produto")
        st.info("Selecione os insumos que fazem parte de um produto e a quantidade usada em cada unidade.")
        
        supplies = get_all_supplies(db)
        
        if not supplies:
            st.warning("⚠️ Cadastre insumos primeiro na aba 'Cadastrar Insumos'.")
        else:
            product_name = st.text_input(
                "Nome do Produto",
                placeholder="Ex: Máscara Capilar Fino 280g",
            )
            
            product_size = st.selectbox("Tamanho", ["Pequeno (small)", "Grande (large)"])
            
            st.markdown("#### Selecione os insumos usados:")
            
            recipe_items = {}
            total_cost = 0.0
            
            for supply in supplies:
                col_a, col_b, col_c = st.columns([2, 1.5, 1])
                
                with col_a:
                    use_it = st.checkbox(
                        f"{supply.get('name', 'N/A')} ({supply.get('unit', '')})",
                        key=f"recipe_{supply['_id']}",
                    )
                
                if use_it:
                    with col_b:
                        qty_used = st.number_input(
                            f"Qtd de {supply.get('name', '')} por unidade",
                            min_value=0.0,
                            format="%.2f",
                            key=f"qty_{supply['_id']}",
                        )
                    
                    item_cost = qty_used * supply.get('unitCost', 0)
                    total_cost += item_cost
                    recipe_items[supply.get('name', '')] = {
                        'quantity': qty_used,
                        'unit': supply.get('unit', ''),
                        'unitCost': supply.get('unitCost', 0),
                        'totalCost': item_cost,
                    }
                    
                    with col_c:
                        st.markdown(f"**{format_yen(item_cost)}**")
            
            st.markdown("---")
            
            # Resumo financeiro da ficha
            col_res1, col_res2, col_res3 = st.columns(3)
            
            with col_res1:
                st.metric("💰 Custo de Produção", format_yen(total_cost))
            
            with col_res2:
                margin = st.slider("Margem de Lucro (%)", 0, 500, 100, step=10)
                suggested_price = total_cost * (1 + margin / 100)
                st.metric("🏷️ Preço Sugerido", format_yen(suggested_price))
            
            with col_res3:
                profit = suggested_price - total_cost
                st.metric("📈 Lucro por Unidade", format_yen(profit))
            
            if st.button("💾 Salvar Ficha Técnica", use_container_width=True):
                if not product_name:
                    st.error("Dê um nome ao produto!")
                elif not recipe_items:
                    st.error("Selecione pelo menos um insumo!")
                else:
                    recipe_data = {
                        'product_name': product_name,
                        'size': product_size,
                        'ingredients': recipe_items,
                        'total_cost': total_cost,
                        'suggested_margin': margin,
                        'suggested_price': suggested_price,
                    }
                    if save_product_recipe(db, recipe_data):
                        st.balloons()
                        st.success(f"✅ Ficha técnica de '{product_name}' salva com sucesso!")
    
    # --- TAB 3: Fichas salvas ---
    with tab3:
        st.subheader("📊 Fichas Técnicas Salvas")
        recipes = get_all_recipes(db)
        
        if recipes:
            for recipe in recipes:
                with st.expander(f"📋 {recipe.get('product_name', 'N/A')} — Custo: {format_yen(recipe.get('total_cost', 0))}"):
                    col1, col2, col3 = st.columns(3)
                    col1.metric("Custo de Produção", format_yen(recipe.get('total_cost', 0)))
                    col2.metric("Preço Sugerido", format_yen(recipe.get('suggested_price', 0)))
                    col3.metric("Margem", f"{recipe.get('suggested_margin', 0)}%")
                    
                    st.markdown("**Insumos:**")
                    ingredients = recipe.get('ingredients', {})
                    if ingredients:
                        rows = []
                        for name, info in ingredients.items():
                            if isinstance(info, dict):
                                rows.append({
                                    'Insumo': name,
                                    'Quantidade': info.get('quantity', 0),
                                    'Unidade': info.get('unit', ''),
                                    'Custo Un.': format_yen(info.get('unitCost', 0)),
                                    'Custo Total': format_yen(info.get('totalCost', 0)),
                                })
                        st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
                    
                    if st.button(f"🗑️ Remover", key=f"del_recipe_{recipe['_id']}"):
                        if delete_recipe(db, recipe['_id']):
                            st.success("Ficha removida!")
                            st.rerun()
        else:
            st.info("Nenhuma ficha técnica salva ainda.")


# =====================================================
# 📦 ESTOQUE
# =====================================================
elif menu == "📦 Estoque":
    st.markdown("""
    <div class="main-header">
        <h1>📦 Controle de Estoque</h1>
        <p>Gerencie estoque de produtos prontos e matéria-prima</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    tab1, tab2 = st.tabs(["📦 Estoque Atual", "➕ Movimentação"])
    
    with tab2:
        st.subheader("➕ Registrar Movimentação de Estoque")
        
        with st.form("form_stock", clear_on_submit=True):
            col1, col2 = st.columns(2)
            
            with col1:
                stock_type = st.selectbox("Tipo de Item", [
                    "Produto Pronto",
                    "Ingrediente",
                    "Embalagem",
                    "Adesivo / Etiqueta",
                    "Material de Envio",
                    "Outros",
                ])
                item_name = st.text_input("Nome do Item", placeholder="Ex: Máscara Capilar Fino 280g")
                movement_type = st.selectbox("Tipo de Movimentação", ["Entrada", "Saída", "Ajuste de Inventário"])
            
            with col2:
                quantity = st.number_input("Quantidade", min_value=0.0, format="%.1f", step=1.0)
                unit = st.selectbox("Unidade", ["unidades", "g", "kg", "ml", "L", "pacotes", "caixas"])
                stock_date = st.date_input("Data", value=datetime.now())
                stock_notes = st.text_input("Observação (opcional)")
            
            # Estoque mínimo
            min_stock = st.number_input("Estoque Mínimo (alerta)", min_value=0.0, format="%.0f", step=1.0, value=5.0)
            
            submitted = st.form_submit_button("💾 Registrar", use_container_width=True)
            
            if submitted and item_name and quantity > 0:
                stock_data = {
                    'type': stock_type,
                    'name': item_name,
                    'movementType': movement_type,
                    'quantity': quantity if movement_type == "Entrada" else -quantity,
                    'unit': unit,
                    'date': stock_date.isoformat(),
                    'notes': stock_notes,
                    'minStock': min_stock,
                }
                if save_stock_entry(db, stock_data):
                    st.success(f"✅ {movement_type} registrada: {item_name} — {quantity} {unit}")
                    st.rerun()
    
    with tab1:
        st.subheader("📦 Estoque Atual")
        stock_entries = get_all_stock(db)
        
        if stock_entries:
            # Consolidar estoque por item
            stock_summary = defaultdict(lambda: {'quantity': 0, 'unit': '', 'type': '', 'minStock': 5})
            
            for entry in stock_entries:
                name = entry.get('name', 'N/A')
                stock_summary[name]['quantity'] += entry.get('quantity', 0)
                stock_summary[name]['unit'] = entry.get('unit', '')
                stock_summary[name]['type'] = entry.get('type', '')
                stock_summary[name]['minStock'] = entry.get('minStock', 5)
            
            # Criar tabela com status visual
            rows = []
            alerts = []
            for name, info in stock_summary.items():
                qty = info['quantity']
                min_s = info['minStock']
                
                if qty <= 0:
                    status = "🔴 ZERADO"
                    alerts.append(f"🔴 **{name}** está ZERADO!")
                elif qty <= min_s:
                    status = "🟡 BAIXO"
                    alerts.append(f"🟡 **{name}** está abaixo do mínimo ({qty:.0f}/{min_s:.0f})")
                else:
                    status = "🟢 OK"
                
                rows.append({
                    'Item': name,
                    'Tipo': info['type'],
                    'Qtd Atual': f"{qty:.1f}",
                    'Unidade': info['unit'],
                    'Mínimo': f"{min_s:.0f}",
                    'Status': status,
                })
            
            # Alertas
            if alerts:
                st.warning("⚠️ **Alertas de Estoque:**")
                for alert in alerts:
                    st.markdown(alert)
                st.markdown("---")
            
            st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
            
            # Gráfico de estoque
            df_stock = pd.DataFrame(rows)
            fig_stock = px.bar(
                df_stock, x='Item', y=df_stock['Qtd Atual'].astype(float),
                color='Status',
                color_discrete_map={
                    '🟢 OK': '#4caf50',
                    '🟡 BAIXO': '#ff9800',
                    '🔴 ZERADO': '#f44336',
                },
                title='Visão do Estoque',
            )
            fig_stock.update_layout(height=400)
            st.plotly_chart(fig_stock, use_container_width=True)
        else:
            st.info("Nenhum item no estoque. Registre movimentações na aba 'Movimentação'.")


# =====================================================
# 👥 CLIENTES (CRM)
# =====================================================
elif menu == "👥 Clientes (CRM)":
    st.markdown("""
    <div class="main-header">
        <h1>👥 CRM - Gestão de Clientes</h1>
        <p>Clientes sincronizados automaticamente do site NikkeyBox</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    users = get_all_users(db)
    orders = get_all_orders(db)
    
    if not users:
        st.info("📭 Nenhum cliente cadastrado no site ainda.")
        st.stop()
    
    # Consolidar dados de clientes
    customer_data = []
    
    # Map orders by customerEmail AND userId
    order_by_email = defaultdict(list)
    order_by_uid = defaultdict(list)
    
    for o in orders:
        email = o.get('customerEmail', '')
        uid = o.get('userId', '')
        if email:
            order_by_email[email].append(o)
        if uid:
            order_by_uid[uid].append(o)
    
    for user in users:
        email = user.get('email', 'N/A')
        name = user.get('name', 'N/A')
        phone = user.get('phone', 'N/A')
        uid = user.get('_id', '') or user.get('id', '')
        
        # Match orders by email OR userId
        user_orders = order_by_email.get(email, []) or order_by_uid.get(uid, [])
        total_spent = sum(get_order_total(o) for o in user_orders)
        last_order = max((parse_order_date(o) for o in user_orders), default=None) if user_orders else None
        
        # Get address info
        address = user.get('address', {})
        address_str = ''
        if isinstance(address, dict):
            address_str = f"{address.get('prefecture', '')} {address.get('city', '')} {address.get('address', '')}".strip()
        
        birthdate = user.get('birthdate', '')
        
        customer_data.append({
            'Nome': name,
            'Email': email,
            'Telefone': phone,
            'Aniversário': birthdate if birthdate else 'N/A',
            'Endereço': address_str if address_str else 'N/A',
            'Pedidos': len(user_orders),
            'Total Gasto': total_spent,
            'Ticket Médio': total_spent / len(user_orders) if user_orders else 0,
            'Último Pedido': last_order.strftime('%d/%m/%Y') if last_order else 'Nunca',
            'Cadastro': str(user.get('createdAt') or user.get('lastSyncAt') or 'N/A')[:10],
        })
    
    df_customers = pd.DataFrame(customer_data)
    df_customers = df_customers.sort_values('Total Gasto', ascending=False)
    
    # Métricas
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total de Clientes", len(df_customers))
    col2.metric("Clientes Ativos", len(df_customers[df_customers['Pedidos'] > 0]))
    col3.metric("Receita Total", format_yen(df_customers['Total Gasto'].sum()))
    col4.metric("Ticket Médio Geral", format_yen(df_customers['Ticket Médio'].mean()))
    
    st.markdown("---")
    
    # Busca
    search = st.text_input("🔍 Buscar cliente (nome ou email)", "")
    if search:
        df_filtered = df_customers[
            df_customers['Nome'].str.contains(search, case=False, na=False) |
            df_customers['Email'].str.contains(search, case=False, na=False)
        ]
    else:
        df_filtered = df_customers
    
    # Tabela
    st.subheader(f"📋 Lista de Clientes ({len(df_filtered)})")
    display_cust = df_filtered.copy()
    display_cust['Total Gasto'] = display_cust['Total Gasto'].apply(lambda x: format_yen(x))
    display_cust['Ticket Médio'] = display_cust['Ticket Médio'].apply(lambda x: format_yen(x))
    st.dataframe(display_cust, use_container_width=True, hide_index=True)
    
    # Detalhes de cliente
    st.markdown("---")
    st.subheader("🔎 Detalhes do Cliente")
    customer_names = df_customers['Nome'].tolist()
    if customer_names:
        selected_customer = st.selectbox("Selecione um cliente", customer_names)
        
        cust_row = df_customers[df_customers['Nome'] == selected_customer].iloc[0]
        
        col1, col2, col3 = st.columns(3)
        col1.markdown(f"**📧 Email:** {cust_row['Email']}")
        col2.markdown(f"**📞 Telefone:** {cust_row['Telefone']}")
        col3.markdown(f"**📅 Último Pedido:** {cust_row['Último Pedido']}")
        
        # Histórico de pedidos do cliente
        cust_email = cust_row['Email']
        # Find uid for this customer
        cust_uid = ''
        for user in users:
            if user.get('email') == cust_email:
                cust_uid = user.get('_id', '') or user.get('id', '')
                break
        
        cust_orders = []
        seen_orders = set()
        for o in orders:
            oid = o.get('orderNumber', o.get('_id', ''))
            if oid in seen_orders:
                continue
            if o.get('customerEmail') == cust_email or o.get('userId') == cust_uid:
                cust_orders.append(o)
                seen_orders.add(oid)
        
        if cust_orders:
            st.markdown("**📝 Histórico de Pedidos:**")
            order_rows = []
            for o in cust_orders:
                order_rows.append({
                    'Pedido': o.get('orderNumber', 'N/A'),
                    'Data': parse_order_date(o).strftime('%d/%m/%Y'),
                    'Total': format_yen(get_order_total(o)),
                    'Status': o.get('status', 'pending'),
                    'Pagamento': o.get('paymentMethod', 'N/A'),
                })
            st.dataframe(pd.DataFrame(order_rows), hide_index=True, use_container_width=True)
        
        # Sugestão de recompra
        if cust_row['Pedidos'] > 0 and cust_row['Último Pedido'] != 'Nunca':
            try:
                last_dt = datetime.strptime(cust_row['Último Pedido'], '%d/%m/%Y')
                days_since = (datetime.now() - last_dt).days
                if days_since > 30:
                    st.warning(f"💡 Este cliente não compra há **{days_since} dias**. Considere enviar um cupom de desconto para incentivá-lo a voltar!")
            except:
                pass


# =====================================================
# 📈 RESUMO FINANCEIRO
# =====================================================
elif menu == "📈 Resumo Financeiro":
    st.markdown("""
    <div class="main-header">
        <h1>📈 Resumo Financeiro</h1>
        <p>Faturamento Bruto vs Líquido — Saiba exatamente quanto está lucrando</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    orders = get_all_orders(db)
    df = orders_to_dataframe(orders)
    expenses = get_all_expenses(db)
    recipes = get_all_recipes(db)
    
    # Período de análise
    st.subheader("📅 Período de Análise")
    col_period1, col_period2 = st.columns(2)
    with col_period1:
        start_date = st.date_input("De", value=datetime.now().replace(day=1) - timedelta(days=180))
    with col_period2:
        end_date = st.date_input("Até", value=datetime.now())
    
    # Filtrar por período
    if not df.empty:
        df = df[(df['date'] >= pd.Timestamp(start_date)) & (df['date'] <= pd.Timestamp(end_date))]
    
    # FATURAMENTO BRUTO
    gross_revenue = df['itemTotal'].sum() if not df.empty else 0
    total_units = df['quantity'].sum() if not df.empty else 0
    total_orders = df['orderNumber'].nunique() if not df.empty else 0
    
    # DESPESAS
    if expenses:
        df_exp = pd.DataFrame(expenses)
        df_exp['date'] = pd.to_datetime(df_exp['date'])
        df_exp = df_exp[(df_exp['date'] >= pd.Timestamp(start_date)) & (df_exp['date'] <= pd.Timestamp(end_date))]
        total_expenses = df_exp['value'].sum()
    else:
        total_expenses = 0
        df_exp = pd.DataFrame()
    
    # CUSTO DE PRODUÇÃO (estimado pelas fichas técnicas)
    production_cost = 0
    if recipes and not df.empty:
        recipe_costs = {}
        for r in recipes:
            recipe_costs[r.get('product_name', '')] = r.get('total_cost', 0)
        
        for _, row in df.iterrows():
            product = row.get('product', '')
            qty = row.get('quantity', 0)
            # Try to find matching recipe
            for recipe_name, cost in recipe_costs.items():
                if product.lower() in recipe_name.lower() or recipe_name.lower() in product.lower():
                    production_cost += cost * qty
                    break
    
    # CÁLCULOS
    total_costs = total_expenses + production_cost
    net_profit = gross_revenue - total_costs
    profit_margin = (net_profit / gross_revenue * 100) if gross_revenue > 0 else 0
    
    # DRE (Demonstração de Resultados)
    st.subheader("📊 DRE — Demonstração do Resultado")
    
    col1, col2, col3 = st.columns(3)
    col1.metric("💵 Faturamento Bruto", format_yen(gross_revenue))
    col2.metric("💸 Custos + Despesas", format_yen(total_costs), delta=f"-{format_yen(total_costs)}")
    
    delta_color = "normal" if net_profit >= 0 else "inverse"
    col3.metric("💰 Lucro Líquido", format_yen(net_profit), delta=f"{profit_margin:.1f}%", delta_color=delta_color)
    
    st.markdown("---")
    
    # Composição detalhada
    col_left, col_right = st.columns(2)
    
    with col_left:
        st.subheader("📋 Composição das Receitas")
        if not df.empty:
            revenue_by_cat = df.groupby('category')['itemTotal'].sum().reset_index()
            fig_revenue = px.pie(
                revenue_by_cat, values='itemTotal', names='category',
                title='Faturamento por Categoria',
                color_discrete_sequence=['#ff8a65', '#7e57c2'],
                hole=0.4,
            )
            fig_revenue.update_layout(height=350)
            st.plotly_chart(fig_revenue, use_container_width=True)
    
    with col_right:
        st.subheader("📋 Composição dos Custos")
        cost_breakdown = []
        if production_cost > 0:
            cost_breakdown.append({'Tipo': 'Custo de Produção', 'Valor': production_cost})
        if not df_exp.empty:
            exp_by_type = df_exp.groupby('type')['value'].sum().reset_index()
            for _, row in exp_by_type.iterrows():
                cost_breakdown.append({'Tipo': row['type'], 'Valor': row['value']})
        
        if cost_breakdown:
            fig_costs = px.pie(
                pd.DataFrame(cost_breakdown),
                values='Valor', names='Tipo',
                title='Distribuição de Custos',
                color_discrete_sequence=px.colors.qualitative.Set3,
                hole=0.4,
            )
            fig_costs.update_layout(height=350)
            st.plotly_chart(fig_costs, use_container_width=True)
        else:
            st.info("Cadastre despesas e fichas técnicas para ver a composição dos custos.")
    
    # Tabela DRE detalhada
    st.subheader("📑 DRE Detalhada")
    dre_data = [
        {'Linha': '(+) FATURAMENTO BRUTO', 'Valor (¥)': format_yen(gross_revenue)},
        {'Linha': '    Total de Pedidos', 'Valor (¥)': str(total_orders)},
        {'Linha': '    Unidades Vendidas', 'Valor (¥)': str(int(total_units))},
        {'Linha': '', 'Valor (¥)': ''},
        {'Linha': '(-) CUSTO DE PRODUÇÃO', 'Valor (¥)': format_yen(production_cost)},
        {'Linha': '(-) DESPESAS OPERACIONAIS', 'Valor (¥)': format_yen(total_expenses)},
    ]
    
    # Detalhar despesas por tipo
    if not df_exp.empty:
        for _, row in df_exp.groupby('type')['value'].sum().reset_index().iterrows():
            dre_data.append({'Linha': f"    {row['type']}", 'Valor (¥)': format_yen(row['value'])})
    
    dre_data.extend([
        {'Linha': '', 'Valor (¥)': ''},
        {'Linha': '(=) TOTAL DE CUSTOS', 'Valor (¥)': format_yen(total_costs)},
        {'Linha': '', 'Valor (¥)': ''},
        {'Linha': '(=) LUCRO LÍQUIDO', 'Valor (¥)': format_yen(net_profit)},
        {'Linha': '    Margem de Lucro', 'Valor (¥)': f"{profit_margin:.1f}%"},
    ])
    
    st.dataframe(pd.DataFrame(dre_data), use_container_width=True, hide_index=True)
    
    # Evolução mensal
    if not df.empty:
        st.subheader("📈 Evolução Mensal")
        monthly_revenue = df.groupby('monthLabel')['itemTotal'].sum().reset_index()
        monthly_revenue.columns = ['Mês', 'Receita']
        
        # Adicionar despesas mensais
        if not df_exp.empty:
            monthly_expenses = df_exp.groupby(df_exp['date'].dt.strftime('%b/%Y'))['value'].sum().reset_index()
            monthly_expenses.columns = ['Mês', 'Despesa']
            monthly_merged = monthly_revenue.merge(monthly_expenses, on='Mês', how='outer').fillna(0)
        else:
            monthly_merged = monthly_revenue.copy()
            monthly_merged['Despesa'] = 0
        
        monthly_merged['Lucro'] = monthly_merged['Receita'] - monthly_merged['Despesa']
        
        fig_evolution = go.Figure()
        fig_evolution.add_trace(go.Bar(
            x=monthly_merged['Mês'], y=monthly_merged['Receita'],
            name='Receita', marker_color='#4caf50',
        ))
        fig_evolution.add_trace(go.Bar(
            x=monthly_merged['Mês'], y=monthly_merged['Despesa'],
            name='Despesas', marker_color='#f44336',
        ))
        fig_evolution.add_trace(go.Scatter(
            x=monthly_merged['Mês'], y=monthly_merged['Lucro'],
            name='Lucro Líquido', marker_color='#1565c0',
            mode='lines+markers', line=dict(width=3),
        ))
        fig_evolution.update_layout(
            barmode='group', height=450,
            legend=dict(orientation='h', yanchor='bottom', y=1.02),
        )
        st.plotly_chart(fig_evolution, use_container_width=True)
    
    # Margem de contribuição por produto
    if recipes and not df.empty:
        st.subheader("🏆 Margem de Contribuição por Produto")
        st.info("Descubra qual produto te dá mais lucro!")
        
        margin_data = []
        recipe_costs = {r.get('product_name', ''): r.get('total_cost', 0) for r in recipes}
        
        product_revenue = df.groupby('product').agg(
            revenue=('itemTotal', 'sum'),
            qty=('quantity', 'sum'),
        ).reset_index()
        
        for _, row in product_revenue.iterrows():
            product = row['product']
            revenue = row['revenue']
            qty = row['qty']
            
            cost = 0
            for recipe_name, recipe_cost in recipe_costs.items():
                if product.lower() in recipe_name.lower() or recipe_name.lower() in product.lower():
                    cost = recipe_cost * qty
                    break
            
            margin = revenue - cost
            margin_pct = (margin / revenue * 100) if revenue > 0 else 0
            
            margin_data.append({
                'Produto': product,
                'Receita': format_yen(revenue),
                'Custo': format_yen(cost),
                'Margem (¥)': format_yen(margin),
                'Margem (%)': f"{margin_pct:.1f}%",
                'Qtd Vendida': int(qty),
            })
        
        st.dataframe(pd.DataFrame(margin_data), use_container_width=True, hide_index=True)


# =====================================================
# 🛒 LISTA DE COMPRAS AUTOMÁTICA
# =====================================================
elif menu == "🛒 Lista de Compras":
    st.markdown("""
    <div class="main-header">
        <h1>🛒 Lista de Compras Inteligente</h1>
        <p>Com base nas vendas e fichas técnicas, saiba exatamente o que precisa comprar</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    orders = get_all_orders(db)
    recipes = get_all_recipes(db)
    stock_entries = get_all_stock(db)
    
    if not recipes:
        st.warning("⚠️ Cadastre fichas técnicas primeiro para que o sistema calcule automaticamente a lista de compras.")
        st.stop()
    
    # Período para calcular
    st.subheader("📅 Calcular necessidades para o período")
    col1, col2 = st.columns(2)
    with col1:
        calc_start = st.date_input("De", value=datetime.now().replace(day=1), key="calc_start")
    with col2:
        calc_end = st.date_input("Até", value=datetime.now(), key="calc_end")
    
    df = orders_to_dataframe(orders)
    
    if not df.empty:
        df_period = df[(df['date'] >= pd.Timestamp(calc_start)) & (df['date'] <= pd.Timestamp(calc_end))]
    else:
        df_period = pd.DataFrame()
    
    # Mapear fichas técnicas
    recipe_map = {}
    for r in recipes:
        recipe_map[r.get('product_name', '')] = r.get('ingredients', {})
    
    # Calcular necessidades
    needs = defaultdict(lambda: {'quantity': 0, 'unit': ''})
    
    if not df_period.empty:
        for _, row in df_period.iterrows():
            product = row.get('product', '')
            qty_sold = row.get('quantity', 0)
            
            # Encontrar receita correspondente
            for recipe_name, ingredients in recipe_map.items():
                if product.lower() in recipe_name.lower() or recipe_name.lower() in product.lower():
                    for ing_name, ing_info in ingredients.items():
                        if isinstance(ing_info, dict):
                            needs[ing_name]['quantity'] += ing_info.get('quantity', 0) * qty_sold
                            needs[ing_name]['unit'] = ing_info.get('unit', '')
                    break
    
    if needs:
        st.subheader("📋 Insumos Necessários (baseado nas vendas)")
        
        # Estoque atual
        stock_current = defaultdict(float)
        for entry in stock_entries:
            stock_current[entry.get('name', '')] += entry.get('quantity', 0)
        
        needs_rows = []
        for name, info in needs.items():
            current = stock_current.get(name, 0)
            needed = info['quantity']
            to_buy = max(0, needed - current)
            
            needs_rows.append({
                'Insumo': name,
                'Necessário': f"{needed:.1f}",
                'Em Estoque': f"{current:.1f}",
                'Comprar': f"{to_buy:.1f}",
                'Unidade': info['unit'],
                'Status': '✅ OK' if to_buy == 0 else '🛒 COMPRAR',
            })
        
        df_needs = pd.DataFrame(needs_rows)
        st.dataframe(df_needs, use_container_width=True, hide_index=True)
        
        # Apenas itens a comprar
        to_buy_items = [r for r in needs_rows if r['Status'] == '🛒 COMPRAR']
        if to_buy_items:
            st.subheader("🛒 Lista de Compras")
            st.markdown("Imprima ou salve esta lista:")
            for item in to_buy_items:
                st.markdown(f"- [ ] **{item['Insumo']}** — {item['Comprar']} {item['Unidade']}")
        else:
            st.success("🎉 Estoque suficiente para o período!")
    else:
        st.info("Nenhuma venda no período selecionado ou fichas técnicas não correspondem aos produtos vendidos.")
    
    # Projeção futura
    st.markdown("---")
    st.subheader("🔮 Projeção de Compras")
    projection_qty = st.number_input("Quantas unidades pretende produzir?", min_value=1, value=50, step=10)
    projection_product = st.selectbox("De qual produto?", [r.get('product_name', '') for r in recipes])
    
    if st.button("📊 Calcular Projeção"):
        recipe = recipe_map.get(projection_product, {})
        if recipe:
            st.markdown(f"**Para produzir {projection_qty} unidades de {projection_product}:**")
            proj_rows = []
            for ing_name, ing_info in recipe.items():
                if isinstance(ing_info, dict):
                    total_needed = ing_info.get('quantity', 0) * projection_qty
                    est_cost = ing_info.get('unitCost', 0) * total_needed
                    proj_rows.append({
                        'Insumo': ing_name,
                        'Qtd Total': f"{total_needed:.1f}",
                        'Unidade': ing_info.get('unit', ''),
                        'Custo Estimado': format_yen(est_cost),
                    })
            
            if proj_rows:
                st.dataframe(pd.DataFrame(proj_rows), hide_index=True, use_container_width=True)
                total_proj_cost = sum(ing_info.get('unitCost', 0) * ing_info.get('quantity', 0) * projection_qty 
                                      for ing_info in recipe.values() if isinstance(ing_info, dict))
                st.metric("💰 Custo Total Estimado", format_yen(total_proj_cost))


# =====================================================
# 📄 RELATÓRIOS
# =====================================================
elif menu == "📄 Relatórios":
    st.markdown("""
    <div class="main-header">
        <h1>📄 Relatórios e Exportação</h1>
        <p>Gere relatórios profissionais para sua organização financeira</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    report_type = st.selectbox("Tipo de Relatório", [
        "Relatório Mensal Completo",
        "Relatório de Vendas por Produto",
        "Relatório de Despesas",
        "Relatório de Clientes",
        "Relatório de Estoque",
    ])
    
    col1, col2 = st.columns(2)
    with col1:
        report_start = st.date_input("De", value=datetime.now().replace(day=1), key="rep_start")
    with col2:
        report_end = st.date_input("Até", value=datetime.now(), key="rep_end")
    
    # Load data immediately for display
    orders = get_all_orders(db)
    df = orders_to_dataframe(orders)
    expenses_raw = get_all_expenses(db)
    
    # Filter by date
    if not df.empty:
        df_filtered = df[(df['date'] >= pd.Timestamp(report_start)) & (df['date'] <= pd.Timestamp(report_end))].copy()
    else:
        df_filtered = pd.DataFrame()
    
    # Filter expenses by date
    expenses_filtered = []
    for e in expenses_raw:
        e_date = e.get('date', '')
        if e_date:
            try:
                ed = pd.Timestamp(e_date)
                if pd.Timestamp(report_start) <= ed <= pd.Timestamp(report_end):
                    expenses_filtered.append(e)
            except:
                expenses_filtered.append(e)
        else:
            expenses_filtered.append(e)
    
    st.markdown("---")
    
    # ============ VISUAL DATA DISPLAY ============
    if report_type == "Relatório Mensal Completo":
        revenue = df_filtered['itemTotal'].sum() if not df_filtered.empty else 0
        n_orders = df_filtered['orderNumber'].nunique() if not df_filtered.empty else 0
        n_units = int(df_filtered['quantity'].sum()) if not df_filtered.empty else 0
        total_expenses = sum(e.get('value', 0) for e in expenses_filtered)
        profit = revenue - total_expenses
        
        st.subheader("📊 Resumo do Período")
        mc1, mc2, mc3, mc4, mc5 = st.columns(5)
        mc1.metric("💰 Faturamento", format_yen(revenue))
        mc2.metric("📦 Pedidos", n_orders)
        mc3.metric("🧮 Unidades", n_units)
        mc4.metric("💸 Despesas", format_yen(total_expenses))
        mc5.metric("📈 Lucro", format_yen(profit), delta=f"{(profit/revenue*100):.0f}%" if revenue > 0 else "0%")
        
        if not df_filtered.empty:
            col_chart1, col_chart2 = st.columns(2)
            with col_chart1:
                # Sales by product pie
                by_prod = df_filtered.groupby('product')['itemTotal'].sum().reset_index()
                fig_pie = px.pie(by_prod, values='itemTotal', names='product', title='Faturamento por Produto')
                st.plotly_chart(fig_pie, use_container_width=True)
            with col_chart2:
                # Revenue trend by day
                daily = df_filtered.groupby(df_filtered['date'].dt.date).agg(
                    revenue=('itemTotal', 'sum'),
                    orders=('orderNumber', 'nunique')
                ).reset_index()
                daily.columns = ['Data', 'Receita', 'Pedidos']
                fig_daily = px.bar(daily, x='Data', y='Receita', title='Receita Diária no Período',
                                   text_auto=True, color_discrete_sequence=['#e53935'])
                st.plotly_chart(fig_daily, use_container_width=True)
            
            st.subheader("📋 Vendas Detalhadas")
            display_cols = ['orderNumber', 'date', 'product', 'size', 'quantity', 'itemTotal', 'customerName', 'status']
            available_cols = [c for c in display_cols if c in df_filtered.columns]
            st.dataframe(df_filtered[available_cols], use_container_width=True, hide_index=True)
        else:
            st.info("📭 Nenhuma venda encontrada no período selecionado.")
        
        if expenses_filtered:
            st.subheader("💸 Despesas no Período")
            exp_df = pd.DataFrame(expenses_filtered)
            display_exp_cols = ['date', 'category', 'description', 'value']
            available_exp_cols = [c for c in display_exp_cols if c in exp_df.columns]
            st.dataframe(exp_df[available_exp_cols], use_container_width=True, hide_index=True)
    
    elif report_type == "Relatório de Vendas por Produto":
        if not df_filtered.empty:
            st.subheader("📊 Vendas por Produto")
            by_product = df_filtered.groupby(['product', 'category']).agg(
                receita=('itemTotal', 'sum'),
                quantidade=('quantity', 'sum'),
                pedidos=('orderNumber', 'nunique'),
            ).reset_index()
            by_product.columns = ['Produto', 'Categoria', 'Receita (¥)', 'Quantidade', 'Pedidos']
            
            # Metrics
            top_product = by_product.loc[by_product['Receita (¥)'].idxmax()]
            mc1, mc2, mc3 = st.columns(3)
            mc1.metric("🏆 Produto Top", top_product['Produto'])
            mc2.metric("💰 Receita Top", format_yen(top_product['Receita (¥)']))
            mc3.metric("📦 Total Produtos", len(by_product))
            
            # Chart
            fig_bar = px.bar(by_product, x='Produto', y='Receita (¥)', color='Categoria',
                            title='Receita por Produto', text_auto=True,
                            color_discrete_map={'artesanal': '#ff9800', 'premium': '#e53935'})
            st.plotly_chart(fig_bar, use_container_width=True)
            
            # Table
            st.dataframe(by_product, use_container_width=True, hide_index=True)
        else:
            st.info("📭 Nenhuma venda encontrada no período selecionado.")
    
    elif report_type == "Relatório de Despesas":
        if expenses_filtered:
            st.subheader("💸 Despesas no Período")
            exp_df = pd.DataFrame(expenses_filtered)
            total_exp = exp_df['value'].sum() if 'value' in exp_df.columns else 0
            
            mc1, mc2 = st.columns(2)
            mc1.metric("💸 Total Despesas", format_yen(total_exp))
            mc2.metric("📝 Quantidade", len(expenses_filtered))
            
            if 'category' in exp_df.columns:
                by_cat = exp_df.groupby('category')['value'].sum().reset_index()
                by_cat.columns = ['Categoria', 'Valor (¥)']
                fig_cat = px.pie(by_cat, values='Valor (¥)', names='Categoria', title='Despesas por Categoria')
                st.plotly_chart(fig_cat, use_container_width=True)
            
            display_exp_cols = ['date', 'category', 'description', 'value']
            available_exp_cols = [c for c in display_exp_cols if c in exp_df.columns]
            st.dataframe(exp_df[available_exp_cols], use_container_width=True, hide_index=True)
        else:
            st.info("📭 Nenhuma despesa encontrada no período selecionado.")
    
    elif report_type == "Relatório de Clientes":
        users = get_all_users(db)
        if users:
            st.subheader("👥 Clientes Cadastrados")
            users_df = pd.DataFrame(users)
            
            mc1, mc2 = st.columns(2)
            mc1.metric("👥 Total Clientes", len(users))
            bday_count = sum(1 for u in users if u.get('birthdate'))
            mc2.metric("🎂 Com Aniversário", bday_count)
            
            display_user_cols = ['name', 'email', 'phone', 'address', 'birthdate']
            available_user_cols = [c for c in display_user_cols if c in users_df.columns]
            st.dataframe(users_df[available_user_cols], use_container_width=True, hide_index=True)
            
            # Orders per customer
            if not df_filtered.empty and 'customerName' in df_filtered.columns:
                st.subheader("📊 Pedidos por Cliente no Período")
                by_cust = df_filtered.groupby('customerName').agg(
                    pedidos=('orderNumber', 'nunique'),
                    receita=('itemTotal', 'sum'),
                ).reset_index()
                by_cust.columns = ['Cliente', 'Pedidos', 'Receita (¥)']
                by_cust = by_cust.sort_values('Receita (¥)', ascending=False)
                st.dataframe(by_cust, use_container_width=True, hide_index=True)
        else:
            st.info("📭 Nenhum cliente encontrado.")
    
    elif report_type == "Relatório de Estoque":
        stock = get_all_stock(db)
        if stock:
            st.subheader("📦 Estoque Atual")
            stock_df = pd.DataFrame(stock)
            
            mc1, mc2, mc3 = st.columns(3)
            mc1.metric("📦 Itens", len(stock))
            if 'quantity' in stock_df.columns:
                low = len(stock_df[stock_df['quantity'] < 5])
                mc2.metric("⚠️ Estoque Baixo", low)
                zero = len(stock_df[stock_df['quantity'] == 0])
                mc3.metric("🔴 Zerado", zero)
            
            st.dataframe(stock_df, use_container_width=True, hide_index=True)
        else:
            st.info("📭 Nenhum item de estoque cadastrado.")
    
    # ============ EXCEL EXPORT ============
    st.markdown("---")
    st.subheader("⬇️ Exportar para Excel")
    
    buffer = io.BytesIO()
    has_data = False
    
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        if report_type == "Relatório Mensal Completo":
            revenue = df_filtered['itemTotal'].sum() if not df_filtered.empty else 0
            n_orders = df_filtered['orderNumber'].nunique() if not df_filtered.empty else 0
            n_units = int(df_filtered['quantity'].sum()) if not df_filtered.empty else 0
            total_expenses = sum(e.get('value', 0) for e in expenses_filtered)
            summary_data = {
                'Métrica': ['Faturamento Bruto', 'Total de Pedidos', 'Unidades Vendidas', 'Total de Despesas', 'Lucro Estimado'],
                'Valor': [revenue, n_orders, n_units, total_expenses, revenue - total_expenses],
            }
            pd.DataFrame(summary_data).to_excel(writer, sheet_name='Resumo', index=False)
            has_data = True
            if not df_filtered.empty:
                df_filtered.to_excel(writer, sheet_name='Vendas Detalhadas', index=False)
            if expenses_filtered:
                pd.DataFrame(expenses_filtered).to_excel(writer, sheet_name='Despesas', index=False)
        
        elif report_type == "Relatório de Vendas por Produto":
            if not df_filtered.empty:
                by_product = df_filtered.groupby(['product', 'category']).agg(
                    revenue=('itemTotal', 'sum'), qty=('quantity', 'sum'), orders=('orderNumber', 'nunique'),
                ).reset_index()
                by_product.to_excel(writer, sheet_name='Por Produto', index=False)
                df_filtered.to_excel(writer, sheet_name='Detalhado', index=False)
                has_data = True
        
        elif report_type == "Relatório de Despesas":
            if expenses_filtered:
                pd.DataFrame(expenses_filtered).to_excel(writer, sheet_name='Despesas', index=False)
                has_data = True
        
        elif report_type == "Relatório de Clientes":
            users = get_all_users(db)
            if users:
                pd.DataFrame(users).to_excel(writer, sheet_name='Clientes', index=False)
                has_data = True
        
        elif report_type == "Relatório de Estoque":
            stock = get_all_stock(db)
            if stock:
                pd.DataFrame(stock).to_excel(writer, sheet_name='Estoque', index=False)
                has_data = True
    
    if has_data:
        filename = f"relatorio_{report_type.replace(' ', '_').lower()}_{report_start.strftime('%Y%m%d')}_{report_end.strftime('%Y%m%d')}.xlsx"
        st.download_button(
            label="⬇️ Baixar Relatório Excel",
            data=buffer.getvalue(),
            file_name=filename,
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )
    else:
        st.warning("⚠️ Sem dados para exportar no período selecionado.")


# =====================================================
# 📦 GESTÃO DE PEDIDOS (KANBAN)
# =====================================================
elif menu == "📦 Gestão de Pedidos":
    st.markdown("""
    <div class="main-header">
        <h1>📦 Gestão de Pedidos</h1>
        <p>Acompanhe e atualize o status dos pedidos em tempo real</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    orders = get_all_orders(db)
    
    if not orders:
        st.info("📭 Nenhum pedido encontrado.")
        st.stop()
    
    # Status definitions
    STATUS_CONFIG = {
        'pending': {'label': '⏳ Pendente', 'color': '#ff9800', 'next': 'processing'},
        'processing': {'label': '🔄 Processando', 'color': '#2196f3', 'next': 'shipped'},
        'confirmed': {'label': '✅ Confirmado', 'color': '#4caf50', 'next': 'shipped'},
        'shipped': {'label': '🚚 Enviado', 'color': '#9c27b0', 'next': 'delivered'},
        'delivered': {'label': '📬 Entregue', 'color': '#4caf50', 'next': None},
        'cancelled': {'label': '❌ Cancelado', 'color': '#f44336', 'next': None},
    }
    
    # Separate orders by status
    orders_by_status = defaultdict(list)
    for o in orders:
        status = o.get('status', 'pending')
        orders_by_status[status].append(o)
    
    # Kanban columns
    st.subheader("📋 Visão Kanban")
    
    status_order = ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled']
    cols = st.columns(len(status_order))
    
    for idx, status in enumerate(status_order):
        config = STATUS_CONFIG.get(status, {'label': status, 'color': '#999'})
        status_orders = orders_by_status.get(status, [])
        
        with cols[idx]:
            st.markdown(f"""
            <div style="background:{config['color']}20; border-top:4px solid {config['color']}; 
                        border-radius:8px; padding:12px; text-align:center; margin-bottom:8px;">
                <strong>{config['label']}</strong><br>
                <span style="font-size:24px; font-weight:700;">{len(status_orders)}</span>
            </div>
            """, unsafe_allow_html=True)
            
            for o in status_orders[:5]:  # Show max 5 per column
                order_num = o.get('orderNumber', 'N/A')
                customer = o.get('customerName', 'N/A')
                total = get_order_total(o)
                date = parse_order_date(o).strftime('%d/%m')
                
                st.markdown(f"""
                <div style="background:#fff; border:1px solid #e0e0e0; border-radius:8px; 
                            padding:10px; margin-bottom:6px; font-size:13px;">
                    <strong>{order_num}</strong><br>
                    👤 {customer[:20]}<br>
                    💰 {format_yen(total)} • 📅 {date}
                </div>
                """, unsafe_allow_html=True)
            
            if len(status_orders) > 5:
                st.caption(f"+ {len(status_orders) - 5} mais...")
    
    st.markdown("---")
    
    # Detailed order management
    st.subheader("🔧 Gerenciar Pedido")
    
    order_options = {f"{o.get('orderNumber', 'N/A')} — {o.get('customerName', 'N/A')} ({STATUS_CONFIG.get(o.get('status', 'pending'), {}).get('label', o.get('status', ''))})": o for o in orders}
    
    selected_order_key = st.selectbox("Selecione um pedido", list(order_options.keys()))
    selected_order = order_options[selected_order_key]
    
    col_info, col_actions = st.columns([2, 1])
    
    with col_info:
        st.markdown("**📋 Detalhes do Pedido:**")
        
        detail_col1, detail_col2 = st.columns(2)
        with detail_col1:
            st.markdown(f"**Pedido:** {selected_order.get('orderNumber', 'N/A')}")
            st.markdown(f"**Cliente:** {selected_order.get('customerName', 'N/A')}")
            st.markdown(f"**Email:** {selected_order.get('customerEmail', 'N/A')}")
            st.markdown(f"**Telefone:** {selected_order.get('customerPhone', 'N/A')}")
        
        with detail_col2:
            st.markdown(f"**Data:** {parse_order_date(selected_order).strftime('%d/%m/%Y %H:%M')}")
            st.markdown(f"**Total:** {format_yen(get_order_total(selected_order))}")
            payment_method = selected_order.get('paymentMethod', 'N/A')
            payment_label = '🏦 Depósito Bancário' if payment_method == 'bank' else '📱 PayPay' if payment_method == 'paypay' else payment_method
            st.markdown(f"**Pagamento:** {payment_label}")
            curr_status = selected_order.get('status', 'pending')
            st.markdown(f"**Status:** {STATUS_CONFIG.get(curr_status, {}).get('label', curr_status)}")
        
        # Order items
        items = get_order_items(selected_order)
        if items:
            st.markdown("**📦 Itens:**")
            items_df = pd.DataFrame(items)
            items_df.columns = ['Produto', 'Qtd', 'Preço', 'Tamanho']
            items_df['Preço'] = items_df['Preço'].apply(lambda x: format_yen(x))
            st.dataframe(items_df, hide_index=True, use_container_width=True)
        
        # Shipping address
        addr = selected_order.get('shippingAddress', {})
        if isinstance(addr, dict) and addr:
            st.markdown("**📍 Endereço de Entrega:**")
            st.markdown(f"〒{addr.get('postalCode', '')}")
            st.markdown(f"{addr.get('prefecture', '')} {addr.get('city', '')}")
            st.markdown(f"{addr.get('address', '')} {addr.get('building', '')}")
            st.markdown(f"{addr.get('name', '')}")
    
    with col_actions:
        st.markdown("**⚡ Ações:**")
        
        # Change status
        new_status = st.selectbox(
            "Alterar Status",
            ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled'],
            index=['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled'].index(selected_order.get('status', 'pending')),
            format_func=lambda x: STATUS_CONFIG.get(x, {}).get('label', x),
        )
        
        if st.button("✅ Atualizar Status", use_container_width=True):
            if update_order_status_erp(db, selected_order.get('orderNumber', ''), new_status):
                st.success(f"Status atualizado para {STATUS_CONFIG.get(new_status, {}).get('label', new_status)}!")
                
                # Auto-send WhatsApp notification
                customer_phone = selected_order.get('customerPhone', '')
                if customer_phone:
                    try:
                        wa_payload = {
                            'phone': customer_phone,
                            'orderNumber': selected_order.get('orderNumber', ''),
                            'customerName': selected_order.get('customerName', ''),
                            'items': get_order_items(selected_order),
                            'total': get_order_total(selected_order),
                            'paymentMethod': selected_order.get('paymentMethod', ''),
                            'type': 'status_update',
                            'status': new_status,
                        }
                        # Include tracking info if shipped
                        if new_status == 'shipped':
                            wa_payload['trackingNumber'] = selected_order.get('trackingNumber', '')
                            wa_payload['trackingUrl'] = selected_order.get('trackingUrl', '')
                            wa_payload['carrier'] = selected_order.get('carrier', '')
                        
                        whatsapp_api_url = get_whatsapp_api_url(db)
                        wa_response = http_requests.post(f'{whatsapp_api_url}/api/send-order-notification', json=wa_payload, timeout=10)
                        if wa_response.status_code == 200:
                            status_labels = {
                                'processing': '🔄 Processando',
                                'confirmed': '✅ Confirmado',
                                'shipped': '🚚 Enviado',
                                'delivered': '📬 Entregue (agradecimento)',
                                'cancelled': '❌ Cancelado',
                            }
                            st.success(f"📱 WhatsApp enviado: {status_labels.get(new_status, new_status)}")
                        else:
                            st.warning("⚠️ WhatsApp não enviado (serviço offline ou desconectado)")
                    except:
                        st.info("💡 Ative o serviço WhatsApp para enviar notificações automáticas")
                
                st.rerun()
        
        st.markdown("---")
        
        # Tracking info
        st.markdown("**🚚 Rastreamento:**")
        tracking_carrier = st.selectbox("Transportadora", [
            "Japan Post (ゆうパック)",
            "Yamato Transport (クロネコヤマト)",
            "Sagawa Express (佐川急便)",
            "Outra",
        ])
        tracking_number = st.text_input("Código de Rastreio", value=selected_order.get('trackingNumber', ''))
        
        # Auto-generate tracking URL
        tracking_url = ''
        if tracking_number:
            clean_num = tracking_number.replace('-', '').replace(' ', '')
            if 'Japan Post' in tracking_carrier:
                tracking_url = f"https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1={tracking_number}&locale=ja"
            elif 'Yamato' in tracking_carrier:
                tracking_url = f"https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number={clean_num}"
            elif 'Sagawa' in tracking_carrier:
                tracking_url = f"https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo={clean_num}"
        
        if st.button("📦 Salvar Rastreio e Marcar Enviado", use_container_width=True):
            if tracking_number:
                if update_order_tracking(db, selected_order.get('orderNumber', ''), tracking_number, tracking_url, tracking_carrier):
                    st.success("Rastreio salvo e pedido marcado como Enviado!")
                    
                    # Auto-send WhatsApp with tracking
                    customer_phone = selected_order.get('customerPhone', '')
                    if customer_phone:
                        try:
                            whatsapp_api_url = get_whatsapp_api_url(db)
                            wa_response = http_requests.post(f'{whatsapp_api_url}/api/send-order-notification', json={
                                'phone': customer_phone,
                                'orderNumber': selected_order.get('orderNumber', ''),
                                'customerName': selected_order.get('customerName', ''),
                                'type': 'status_update',
                                'status': 'shipped',
                                'trackingNumber': tracking_number,
                                'trackingUrl': tracking_url,
                                'carrier': tracking_carrier,
                            }, timeout=10)
                            if wa_response.status_code == 200:
                                st.success("📱 WhatsApp com rastreio enviado ao cliente!")
                            else:
                                st.warning("⚠️ WhatsApp não enviado (serviço offline)")
                        except:
                            st.info("💡 Ative o serviço WhatsApp para notificações automáticas")
                    
                    st.rerun()
            else:
                st.error("Preencha o código de rastreio!")
        
        # Current tracking link
        existing_tracking = selected_order.get('trackingUrl', '')
        if existing_tracking:
            st.markdown(f"[🔗 Rastrear Pacote]({existing_tracking})")


# =====================================================
# 🏷️ ETIQUETAS DE ENVIO (PDF)
# =====================================================
elif menu == "🏷️ Etiquetas de Envio":
    st.markdown("""
    <div class="main-header">
        <h1>🏷️ Gerador de Etiquetas de Envio</h1>
        <p>Gere etiquetas profissionais prontas para imprimir e colar no pacote</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    orders = get_all_orders(db)
    
    if not orders:
        st.info("📭 Nenhum pedido encontrado.")
        st.stop()
    
    # Sender info
    st.subheader("📮 Dados do Remetente")
    col_s1, col_s2 = st.columns(2)
    with col_s1:
        sender_name = st.text_input(
            "Nome do Remetente",
            value=f"{COMPANY_PROFILE['contactName']} / {COMPANY_PROFILE['brand']}",
            key="sender_name",
        )
        sender_postal = st.text_input(
            "CEP (〒)",
            value=COMPANY_PROFILE["fulfillmentOrigin"]["postalCode"],
            key="sender_postal",
        )
    with col_s2:
        sender_address = st.text_input(
            "Endereço",
            value=COMPANY_PROFILE["fulfillmentOrigin"]["formatted"],
            key="sender_addr",
        )
        sender_phone = st.text_input(
            "Telefone",
            value=COMPANY_PROFILE["whatsapp"]["domestic"],
            key="sender_phone",
        )
    
    st.markdown("---")
    
    # Filter orders that need shipping
    pending_ship = [o for o in orders if o.get('status') in ('pending', 'processing', 'confirmed')]
    shipped = [o for o in orders if o.get('status') in ('shipped', 'delivered')]
    
    st.subheader("📋 Selecionar Pedido")
    
    tab_pending, tab_all = st.tabs([f"⏳ Aguardando Envio ({len(pending_ship)})", f"📋 Todos ({len(orders)})"])
    
    with tab_pending:
        label_orders = pending_ship
    with tab_all:
        label_orders = orders
    
    if not label_orders:
        st.info("Nenhum pedido aguardando envio.")
    else:
        order_select = {f"{o.get('orderNumber', 'N/A')} — {o.get('customerName', 'N/A')} ({o.get('status', '')})": o for o in label_orders}
        selected_key = st.selectbox("Pedido", list(order_select.keys()), key="label_select")
        sel_order = order_select[selected_key]
        
        addr = sel_order.get('shippingAddress', {})
        if not isinstance(addr, dict):
            addr = {}
        
        # Preview
        st.subheader("👁️ Prévia da Etiqueta")
        
        recipient_name = addr.get('name', sel_order.get('customerName', 'N/A'))
        recipient_postal = addr.get('postalCode', '')
        recipient_pref = addr.get('prefecture', '')
        recipient_city = addr.get('city', '')
        recipient_addr = addr.get('address', '')
        recipient_building = addr.get('building', '')
        recipient_phone = sel_order.get('customerPhone', '')
        
        items = get_order_items(sel_order)
        items_text = ', '.join([f"{i['name']} x{i['quantity']}" for i in items])
        
        # Beautiful label preview using components.html for proper rendering
        label_preview_html = f"""
        <html>
        <head>
            <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
        </head>
        <body style="margin:0; padding:16px; background:transparent; font-family:'Noto Sans JP', sans-serif;">
        <div style="border:3px solid #333; border-radius:12px; padding:24px; max-width:560px; 
                    margin:0 auto; background:#fff; box-shadow:0 4px 20px rgba(0,0,0,0.1);">
            
            <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
                <div style="font-size:11px; color:#666;">REMETENTE / 差出人</div>
                <div style="font-size:11px; color:#666;">Pedido: {sel_order.get('orderNumber', '')}</div>
            </div>
            
            <div style="background:#f5f5f5; padding:12px; border-radius:8px; margin-bottom:20px; font-size:13px;">
                <strong>{sender_name}</strong><br>
                〒{sender_postal}<br>
                {sender_address}<br>
                TEL: {sender_phone}
            </div>
            
            <div style="text-align:center; font-size:12px; color:#999; margin-bottom:8px;">▼ お届け先 / DESTINATÁRIO ▼</div>
            
            <div style="border:2px solid #e53935; padding:16px; border-radius:8px; background:#fff5f5;">
                <div style="font-size:20px; font-weight:700; color:#e53935; margin-bottom:4px;">〒{recipient_postal}</div>
                <div style="font-size:16px; margin-bottom:4px;">{recipient_pref} {recipient_city}</div>
                <div style="font-size:16px; margin-bottom:4px;">{recipient_addr}</div>
                <div style="font-size:14px; color:#666; margin-bottom:8px;">{recipient_building}</div>
                <div style="font-size:20px; font-weight:700;">{recipient_name} 様</div>
                <div style="font-size:13px; color:#666; margin-top:4px;">TEL: {recipient_phone}</div>
            </div>
            
            <div style="margin-top:16px; padding:8px; background:#f0f0f0; border-radius:6px; font-size:12px;">
                <strong>内容品 / Conteúdo:</strong> {items_text}
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:11px; color:#999;">
                <span>🏮 NikkeyBox</span>
                <span>{parse_order_date(sel_order).strftime('%d/%m/%Y')}</span>
            </div>
        </div>
        </body></html>
        """
        components.html(label_preview_html, height=520, scrolling=False)
        
        # Generate printable HTML
        if st.button("🖨️ Gerar Etiqueta para Impressão", use_container_width=True):
            label_html = f"""
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Etiqueta - {sel_order.get('orderNumber', '')}</title>
<style>
    @page {{ size: A6; margin: 10mm; }}
    body {{ font-family: 'Noto Sans JP', 'Hiragino Sans', sans-serif; margin: 0; padding: 20px; }}
    .label {{ border: 3px solid #333; border-radius: 12px; padding: 24px; max-width: 400px; margin: 0 auto; }}
    .sender {{ background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 12px; }}
    .recipient {{ border: 3px solid #d32f2f; padding: 16px; border-radius: 8px; }}
    .postal {{ font-size: 22px; font-weight: 700; color: #d32f2f; }}
    .name {{ font-size: 22px; font-weight: 700; margin-top: 8px; }}
    .addr {{ font-size: 15px; margin: 4px 0; }}
    .contents {{ margin-top: 16px; padding: 8px; background: #f0f0f0; border-radius: 6px; font-size: 11px; }}
    .header {{ display: flex; justify-content: space-between; font-size: 10px; color: #999; margin-bottom: 12px; }}
    @media print {{ body {{ margin: 0; }} }}
</style>
</head>
<body>
<div class="label">
    <div class="header">
        <span>REMETENTE / 差出人</span>
        <span>Pedido: {sel_order.get('orderNumber', '')}</span>
    </div>
    <div class="sender">
        <strong>{sender_name}</strong><br>
        〒{sender_postal}<br>
        {sender_address}<br>
        TEL: {sender_phone}
    </div>
    <div style="text-align:center; font-size:11px; color:#999; margin-bottom:8px;">▼ お届け先 / DESTINATÁRIO ▼</div>
    <div class="recipient">
        <div class="postal">〒{recipient_postal}</div>
        <div class="addr">{recipient_pref} {recipient_city}</div>
        <div class="addr">{recipient_addr}</div>
        <div style="font-size:13px; color:#666;">{recipient_building}</div>
        <div class="name">{recipient_name} 様</div>
        <div style="font-size:12px; color:#666;">TEL: {recipient_phone}</div>
    </div>
    <div class="contents">
        <strong>内容品 / Conteúdo:</strong> {items_text}
    </div>
    <div class="header" style="margin-top:12px;">
        <span>🏮 NikkeyBox</span>
        <span>{parse_order_date(sel_order).strftime('%d/%m/%Y')}</span>
    </div>
</div>
<script>window.print();</script>
</body>
</html>
"""
            st.download_button(
                label="⬇️ Baixar Etiqueta (HTML)",
                data=label_html,
                file_name=f"etiqueta_{sel_order.get('orderNumber', 'pedido')}.html",
                mime="text/html",
            )
            st.info("💡 Abra o arquivo HTML no navegador — ele abrirá automaticamente a janela de impressão.")


# =====================================================
# ️ CUPONS DE DESCONTO
# =====================================================
elif menu == "🎟️ Cupons":
    st.markdown("""
    <div class="main-header">
        <h1>🎟️ Gestão de Cupons</h1>
        <p>Crie, visualize e gerencie cupons de desconto para seus clientes</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    tab_list, tab_create = st.tabs(["📋 Cupons Ativos", "➕ Criar Cupom"])
    
    with tab_list:
        coupons = get_all_coupons(db)
        
        if coupons:
            # Metrics
            active_coupons = [c for c in coupons if c.get('active', True)]
            inactive_coupons = [c for c in coupons if not c.get('active', True)]
            
            mc1, mc2, mc3 = st.columns(3)
            mc1.metric("🎟️ Total de Cupons", len(coupons))
            mc2.metric("✅ Ativos", len(active_coupons))
            mc3.metric("❌ Inativos", len(inactive_coupons))
            
            st.markdown("---")
            
            for coupon in coupons:
                code = coupon.get('code', coupon.get('_id', 'N/A'))
                is_active = coupon.get('active', True)
                discount = coupon.get('discount', 0)
                discount_percent = coupon.get('discountPercent', 0)
                coupon_type = coupon.get('type', 'fixed' if discount > 0 else 'percent')
                min_purchase = coupon.get('minPurchase', 0)
                valid_until = coupon.get('validUntil', coupon.get('expiresAt', ''))
                description = coupon.get('description', '')
                created_at = coupon.get('createdAt', '')
                
                # Determine discount display
                if coupon_type == 'percent' or discount_percent > 0:
                    disc_display = f"{discount_percent or discount}%"
                else:
                    disc_display = format_yen(discount)
                
                status_icon = "✅" if is_active else "❌"
                
                with st.expander(f"{status_icon} **{code}** — Desconto: {disc_display}", expanded=False):
                    col_info, col_actions = st.columns([3, 1])
                    
                    with col_info:
                        st.markdown(f"**Código:** `{code}`")
                        st.markdown(f"**Desconto:** {disc_display}")
                        st.markdown(f"**Tipo:** {'Percentual' if coupon_type == 'percent' or discount_percent > 0 else 'Valor Fixo'}")
                        if min_purchase > 0:
                            st.markdown(f"**Compra Mínima:** {format_yen(min_purchase)}")
                        if valid_until:
                            st.markdown(f"**Válido até:** {valid_until[:10] if len(valid_until) > 10 else valid_until}")
                        if description:
                            st.markdown(f"**Descrição:** {description}")
                        if created_at:
                            st.markdown(f"**Criado em:** {created_at[:10] if len(created_at) > 10 else created_at}")
                    
                    with col_actions:
                        if is_active:
                            if st.button("⏸️ Desativar", key=f"deact_{code}", use_container_width=True):
                                if toggle_coupon_active(db, code, False):
                                    st.success(f"Cupom {code} desativado!")
                                    st.rerun()
                        else:
                            if st.button("▶️ Ativar", key=f"act_{code}", use_container_width=True):
                                if toggle_coupon_active(db, code, True):
                                    st.success(f"Cupom {code} ativado!")
                                    st.rerun()
                        
                        if st.button("🗑️ Excluir", key=f"del_{code}", use_container_width=True, type="secondary"):
                            if delete_coupon(db, code):
                                st.success(f"Cupom {code} excluído!")
                                st.rerun()
        else:
            st.info("🎟️ Nenhum cupom encontrado. Crie o primeiro cupom na aba '➕ Criar Cupom'.")
    
    with tab_create:
        st.subheader("➕ Novo Cupom")
        
        col_c1, col_c2 = st.columns(2)
        with col_c1:
            new_code = st.text_input("Código do Cupom (ex: DESCONTO10)", key="new_coupon_code").strip().upper()
            new_type = st.selectbox("Tipo de Desconto", ["Valor Fixo (¥)", "Percentual (%)"], key="new_coupon_type")
        with col_c2:
            if new_type == "Valor Fixo (¥)":
                new_discount = st.number_input("Valor do Desconto (¥)", min_value=0, value=500, step=100, key="new_coupon_val")
            else:
                new_discount = st.number_input("Percentual (%)", min_value=0, max_value=100, value=10, step=5, key="new_coupon_pct")
            new_min = st.number_input("Compra Mínima (¥)", min_value=0, value=0, step=500, key="new_coupon_min")
        
        new_desc = st.text_input("Descrição (opcional)", key="new_coupon_desc")
        new_valid = st.date_input("Válido até", value=datetime.now() + timedelta(days=30), key="new_coupon_valid")
        
        if st.button("🎟️ Criar Cupom", type="primary", use_container_width=True):
            if not new_code:
                st.error("❌ Informe o código do cupom.")
            else:
                coupon_data = {
                    'code': new_code,
                    'active': True,
                    'description': new_desc,
                    'minPurchase': new_min,
                    'validUntil': new_valid.isoformat(),
                }
                if new_type == "Valor Fixo (¥)":
                    coupon_data['type'] = 'fixed'
                    coupon_data['discount'] = new_discount
                else:
                    coupon_data['type'] = 'percent'
                    coupon_data['discount'] = new_discount
                    coupon_data['discountPercent'] = new_discount
                
                if create_coupon(db, coupon_data):
                    st.success(f"✅ Cupom **{new_code}** criado com sucesso!")
                    st.balloons()
                    st.rerun()


# =====================================================
# 🎂 ANIVERSÁRIOS + CUPONS AUTOMÁTICOS
# =====================================================
elif menu == "🎂 Aniversários":
    st.markdown("""
    <div class="main-header">
        <h1>🎂 Aniversários de Clientes</h1>
        <p>Fidelização inteligente — envie cupons de desconto antes do aniversário</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    users = get_all_users(db)
    today = datetime.now()
    
    if not users:
        st.info("📭 Nenhum cliente cadastrado.")
        st.stop()
    
    # Calculate birthday distances
    birthday_list = []
    for user in users:
        bd = user.get('birthdate', '')
        if not bd:
            continue
        try:
            bdate = datetime.strptime(str(bd)[:10], '%Y-%m-%d')
            this_year_bday = bdate.replace(year=today.year)
            
            days_until = (this_year_bday - today).days
            if days_until < -7:  # Already passed this year
                this_year_bday = bdate.replace(year=today.year + 1)
                days_until = (this_year_bday - today).days
            
            age = today.year - bdate.year
            if today < this_year_bday:
                age -= 1
            
            birthday_list.append({
                'name': user.get('name', 'N/A'),
                'email': user.get('email', 'N/A'),
                'phone': user.get('phone', 'N/A'),
                'birthdate': bdate.strftime('%d/%m/%Y'),
                'birthday_this_year': this_year_bday.strftime('%d/%m/%Y'),
                'days_until': days_until,
                'age': age,
                'uid': user.get('_id', ''),
            })
        except:
            continue
    
    if not birthday_list:
        st.info("Nenhum cliente tem data de aniversário cadastrada.")
        st.stop()
    
    # Sort by days until birthday
    birthday_list.sort(key=lambda x: x['days_until'])
    
    # Alerts section
    st.subheader("⏰ Próximos Aniversários")
    
    upcoming = [b for b in birthday_list if 0 <= b['days_until'] <= 30]
    past_week = [b for b in birthday_list if -7 <= b['days_until'] < 0]
    
    if past_week:
        st.markdown("**🎉 Aniversariaram na última semana:**")
        for b in past_week:
            st.markdown(f"- 🎂 **{b['name']}** fez **{b['age']}** anos em {b['birthday_this_year']} ({abs(b['days_until'])} dias atrás)")
        st.markdown("---")
    
    if upcoming:
        for b in upcoming:
            if b['days_until'] == 0:
                st.markdown(f"""
                <div style="background:linear-gradient(135deg, #ff6b6b, #ffa500); padding:16px; 
                            border-radius:12px; color:white; margin-bottom:12px;">
                    <h3 style="margin:0; color:white;">🎉 HOJE é aniversário de {b['name']}!</h3>
                    <p style="margin:4px 0 0; opacity:0.9;">Fazendo {b['age']} anos • {b['email']} • {b['phone']}</p>
                </div>
                """, unsafe_allow_html=True)
            elif b['days_until'] <= 3:
                st.warning(f"🎂 **{b['name']}** faz aniversário em **{b['days_until']} dia(s)** ({b['birthday_this_year']}) — {b['age']+1} anos")
            elif b['days_until'] <= 7:
                st.info(f"📅 **{b['name']}** faz aniversário em **{b['days_until']} dias** ({b['birthday_this_year']})")
            else:
                st.markdown(f"- 📅 **{b['name']}** — {b['birthday_this_year']} (em {b['days_until']} dias)")
    else:
        st.success("Nenhum aniversário nos próximos 30 dias.")
    
    st.markdown("---")
    
    # Calendar view - all birthdays
    st.subheader("📅 Calendário de Aniversários")
    
    months_br = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    bday_by_month = defaultdict(list)
    for b in birthday_list:
        try:
            month = datetime.strptime(b['birthdate'], '%d/%m/%Y').month
            bday_by_month[month].append(b)
        except:
            pass
    
    month_cols = st.columns(6)
    for i, month_num in enumerate(range(1, 13)):
        col_idx = i % 6
        with month_cols[col_idx]:
            month_bdays = bday_by_month.get(month_num, [])
            highlight = '🔴' if any(0 <= b['days_until'] <= 7 for b in month_bdays) else ''
            st.markdown(f"**{months_br[month_num-1]}** {highlight} ({len(month_bdays)})")
            for b in month_bdays:
                day = b['birthdate'][:2]
                st.caption(f"{day} — {b['name'][:15]}")
    
    st.markdown("---")
    
    # Auto-generate coupon
    st.subheader("🎁 Gerar Cupom de Aniversário")
    st.info("Crie um cupom personalizado que vai direto para o site — o cliente pode usar no próximo pedido!")
    
    target_clients = [b for b in birthday_list if -7 <= b['days_until'] <= 30]
    
    if target_clients:
        with st.form("form_birthday_coupon", clear_on_submit=True):
            col_c1, col_c2 = st.columns(2)
            
            with col_c1:
                bday_client = st.selectbox(
                    "Cliente",
                    [f"{b['name']} ({b['email']})" for b in target_clients],
                )
                selected_client = target_clients[[f"{b['name']} ({b['email']})" for b in target_clients].index(bday_client)]
                
                coupon_type = st.selectbox("Tipo de Desconto", ['percent', 'fixed'], format_func=lambda x: 'Porcentagem (%)' if x == 'percent' else 'Valor Fixo (¥)')
            
            with col_c2:
                if coupon_type == 'percent':
                    discount_value = st.number_input("Desconto (%)", min_value=1, max_value=100, value=15, step=5)
                else:
                    discount_value = st.number_input("Desconto (¥)", min_value=100, value=500, step=100)
                
                validity_days = st.number_input("Validade (dias)", min_value=1, value=30, step=7)
            
            free_shipping = st.checkbox("🚚 Incluir frete grátis?", value=False)
            
            # Auto-generate code
            first_name = selected_client['name'].split()[0].upper()[:6]
            auto_code = f"NIVER{first_name}{today.strftime('%m')}"
            coupon_code = st.text_input("Código do Cupom", value=auto_code)
            
            submitted = st.form_submit_button("🎁 Criar Cupom de Aniversário", use_container_width=True)
            
            if submitted:
                expiry = (today + timedelta(days=validity_days)).isoformat()
                coupon_data = {
                    'code': coupon_code.upper(),
                    'type': coupon_type,
                    'discount': discount_value if coupon_type == 'fixed' else 0,
                    'discountPercent': discount_value if coupon_type == 'percent' else 0,
                    'expiryDate': expiry,
                    'isActive': True,
                    'usedCount': 0,
                    'description': f"Cupom de aniversário para {selected_client['name']}",
                    'targetType': 'specific',
                    'targetEmails': [selected_client['email']],
                    'freeShipping': free_shipping,
                }
                
                if create_coupon(db, coupon_data):
                    st.balloons()
                    st.success(f"🎉 Cupom **{coupon_code.upper()}** criado para {selected_client['name']}!")
                    st.info(f"O cliente pode usar o código **{coupon_code.upper()}** no site para ganhar o desconto.")
    else:
        st.info("Nenhum cliente com aniversário próximo para gerar cupom.")
    
    # Full list
    st.markdown("---")
    st.subheader("📋 Lista Completa")
    df_bday = pd.DataFrame(birthday_list)
    if not df_bday.empty:
        display_bday = df_bday[['name', 'email', 'phone', 'birthdate', 'days_until', 'age']].copy()
        display_bday.columns = ['Nome', 'Email', 'Telefone', 'Nascimento', 'Dias até Aniv.', 'Idade']
        st.dataframe(display_bday, use_container_width=True, hide_index=True)


# =====================================================
# 📱 WHATSAPP AUTOMÁTICO
# =====================================================
elif menu == "📱 WhatsApp":
    st.markdown("""
    <div class="main-header">
        <h1>📱 WhatsApp Automático</h1>
        <p>Conecte seu WhatsApp e envie mensagens automáticas para clientes</p>
    </div>
    """, unsafe_allow_html=True)
    
    if db is None:
        st.stop()
    
    whatsapp_api_url = get_whatsapp_api_url(db)
    
    # Configuration container
    with st.expander("⚙️ Configurar URL do Servidor WhatsApp (Túnel ngrok)", expanded=True):
        st.markdown("""
        Se o ERP está rodando na nuvem (Streamlit Cloud), ele precisa do endereço público do ngrok para se conectar ao seu WhatsApp local.
        """)
        new_url = st.text_input("URL da API WhatsApp", value=whatsapp_api_url, help="Ex: https://xxxx.ngrok-free.app ou http://localhost:3001").strip()
        if st.button("💾 Salvar URL da API", use_container_width=True):
            if save_whatsapp_api_url(db, new_url):
                st.success("✅ URL da API atualizada com sucesso no Firebase!")
                st.rerun()
                
    WHATSAPP_API = new_url
    
    # Helper function to check WhatsApp service
    def get_wa_status():
        try:
            r = http_requests.get(f"{WHATSAPP_API}/api/status", timeout=5)
            return r.json()
        except:
            return None
    
    wa_status = get_wa_status()
    
    if wa_status is None:
        st.error("⚠️ Serviço WhatsApp não está rodando no endereço configurado!")
        st.markdown(f"""
        **Endereço configurado:** `{WHATSAPP_API}`
        
        ### 🚀 Como iniciar o serviço WhatsApp e o Túnel ngrok
        
        1. **Abra um terminal** e inicie o serviço WhatsApp localmente:
        ```bash
        cd erp/whatsapp-service
        npm install
        node server.js
        ```
        
        2. **Abra outro terminal** e inicie o túnel ngrok para a porta 3001:
        ```bash
        C:\\Users\\VAIO\\AppData\\Local\\ngrok\\ngrok.exe http 3001
        ```
        
        3. **Copie a URL do ngrok** (ex: `https://xxxx-xx-xx.ngrok-free.app`) gerada e salve no campo "URL da API WhatsApp" acima.
        """)
        
        st.info("💡 O serviço e o túnel ngrok precisam estar rodando para o WhatsApp funcionar na nuvem.")
        st.stop()
    
    # Connection status
    tab_status, tab_send, tab_templates, tab_log = st.tabs([
        "📡 Conexão", "✉️ Enviar Mensagem", "📝 Templates", "📋 Histórico"
    ])
    
    with tab_status:
        if wa_status['isReady']:
            st.success("✅ WhatsApp conectado e pronto!")
            
            info = wa_status.get('connectionInfo', {})
            col_s1, col_s2, col_s3 = st.columns(3)
            col_s1.metric("📱 Telefone", info.get('phone', 'N/A'))
            col_s2.metric("👤 Nome", info.get('name', 'N/A'))
            col_s3.metric("📊 Mensagens Enviadas", wa_status.get('messagesSent', 0))
            
            st.markdown("---")
            
            if st.button("🔌 Desconectar WhatsApp", type="secondary"):
                try:
                    http_requests.post(f"{WHATSAPP_API}/api/disconnect", timeout=10)
                    st.warning("WhatsApp desconectado. Será necessário escanear o QR Code novamente.")
                    st.rerun()
                except:
                    st.error("Erro ao desconectar.")
        
        elif wa_status.get('hasQRCode'):
            st.warning("📱 Escaneie o QR Code com seu WhatsApp:")
            st.markdown("""
            **Instruções:**
            1. Abra o WhatsApp no celular
            2. Toque em **⋮ Menu** > **Dispositivos Conectados**
            3. Toque em **Conectar um Dispositivo**
            4. Escaneie o QR Code abaixo
            """)
            
            try:
                qr_data = http_requests.get(f"{WHATSAPP_API}/api/qrcode", timeout=5).json()
                if qr_data.get('qrCode'):
                    # Display QR Code using st.image (more reliable than components.html)
                    import base64 as b64_module
                    qr_base64_str = qr_data['qrCode']
                    # Extract raw base64 from data URI
                    if ',' in qr_base64_str:
                        raw_b64 = qr_base64_str.split(',', 1)[1]
                    else:
                        raw_b64 = qr_base64_str
                    qr_img_bytes = b64_module.b64decode(raw_b64)
                    
                    col_qr1, col_qr2, col_qr3 = st.columns([1, 2, 1])
                    with col_qr2:
                        st.image(qr_img_bytes, caption="Escaneie com o WhatsApp do celular", width=300)
                    
                    st.info("⏳ Aguardando escaneamento... Clique em 'Verificar Conexão' após escanear.")
                    
                    # Auto-refresh button
                    if st.button("🔄 Verificar Conexão", use_container_width=True):
                        st.rerun()
                else:
                    st.warning("QR Code ainda não está pronto. Aguarde e clique em Atualizar.")
                    if st.button("🔄 Atualizar", use_container_width=True, key="qr_refresh"):
                        st.rerun()
            except Exception as e:
                st.error(f"Erro ao obter QR Code: {e}")
        
        elif wa_status.get('isConnecting'):
            st.info("⏳ Conectando ao WhatsApp... Aguarde o QR Code aparecer.")
            if st.button("🔄 Atualizar", use_container_width=True):
                st.rerun()
        else:
            st.warning("WhatsApp desconectado.")
            if st.button("🔄 Reconectar", use_container_width=True):
                try:
                    http_requests.post(f"{WHATSAPP_API}/api/restart", timeout=10)
                    st.info("Reconectando... Aguarde e recarregue a página.")
                except:
                    st.error("Erro ao reconectar.")
    
    with tab_send:
        if not wa_status['isReady']:
            st.warning("⚠️ Conecte o WhatsApp primeiro na aba 'Conexão'.")
            st.stop()
        
        st.subheader("✉️ Enviar Mensagem Manual")
        
        send_type = st.radio("Tipo de envio", ["📱 Para um número", "📦 Para cliente de pedido"], horizontal=True)
        
        if send_type == "📱 Para um número":
            phone_input = st.text_input("Número do WhatsApp", placeholder="070-1234-5678 ou 08012345678")
            msg_input = st.text_area("Mensagem", height=150, placeholder="Digite sua mensagem aqui...")
            
            if st.button("📤 Enviar", type="primary", use_container_width=True):
                if phone_input and msg_input:
                    try:
                        resp = http_requests.post(f"{WHATSAPP_API}/api/send", json={
                            'phone': phone_input,
                            'message': msg_input
                        }, timeout=30)
                        result = resp.json()
                        if result.get('success'):
                            st.success(f"✅ Mensagem enviada para {result.get('phone', phone_input)}!")
                        else:
                            st.error(f"❌ Erro: {result.get('error', 'Erro desconhecido')}")
                    except Exception as e:
                        st.error(f"❌ Erro de conexão: {str(e)}")
                else:
                    st.error("Preencha o número e a mensagem!")
        
        else:  # Para cliente de pedido
            orders = get_all_orders(db)
            if orders:
                order_select = {
                    f"{o.get('orderNumber', 'N/A')} — {o.get('customerName', 'N/A')} ({o.get('customerPhone', 'N/A')})": o
                    for o in orders if o.get('customerPhone')
                }
                
                if order_select:
                    sel_key = st.selectbox("Selecione o Pedido", list(order_select.keys()))
                    sel_order = order_select[sel_key]
                    
                    msg_type = st.selectbox("Tipo de Mensagem", [
                        "Novo Pedido Recebido",
                        "Atualização de Status",
                        "Mensagem Personalizada",
                    ])
                    
                    if msg_type == "Novo Pedido Recebido":
                        if st.button("📤 Enviar Notificação de Novo Pedido", type="primary", use_container_width=True):
                            try:
                                items = []
                                for item in sel_order.get('items', []):
                                    items.append({
                                        'productName': item.get('productName', item.get('name', '')),
                                        'size': item.get('size', ''),
                                        'quantity': item.get('quantity', 1),
                                    })
                                
                                resp = http_requests.post(f"{WHATSAPP_API}/api/send-order-notification", json={
                                    'phone': sel_order.get('customerPhone', ''),
                                    'orderNumber': sel_order.get('orderNumber', ''),
                                    'customerName': sel_order.get('customerName', ''),
                                    'items': items,
                                    'total': get_order_total(sel_order),
                                    'paymentMethod': sel_order.get('paymentMethod', ''),
                                    'type': 'new_order',
                                }, timeout=30)
                                result = resp.json()
                                if result.get('success'):
                                    st.success("✅ Notificação de pedido enviada via WhatsApp!")
                                else:
                                    st.error(f"❌ Erro: {result.get('error')}")
                            except Exception as e:
                                st.error(f"❌ Erro: {str(e)}")
                    
                    elif msg_type == "Atualização de Status":
                        upd_status = st.selectbox("Status", ['processing', 'confirmed', 'shipped', 'delivered'],
                                                   format_func=lambda x: {'processing':'🔄 Processando', 'confirmed':'✅ Confirmado', 
                                                                          'shipped':'🚚 Enviado', 'delivered':'📬 Entregue'}.get(x, x))
                        tracking_input = ''
                        if upd_status == 'shipped':
                            tracking_input = st.text_input("Código de Rastreio (opcional)")
                        
                        if st.button("📤 Enviar Atualização", type="primary", use_container_width=True):
                            try:
                                payload = {
                                    'phone': sel_order.get('customerPhone', ''),
                                    'orderNumber': sel_order.get('orderNumber', ''),
                                    'customerName': sel_order.get('customerName', ''),
                                    'type': 'status_update',
                                    'status': upd_status,
                                }
                                if tracking_input:
                                    payload['trackingNumber'] = tracking_input
                                
                                resp = http_requests.post(f"{WHATSAPP_API}/api/send-order-notification", json=payload, timeout=30)
                                result = resp.json()
                                if result.get('success'):
                                    st.success("✅ Atualização enviada via WhatsApp!")
                                else:
                                    st.error(f"❌ Erro: {result.get('error')}")
                            except Exception as e:
                                st.error(f"❌ Erro: {str(e)}")
                    
                    else:  # Mensagem Personalizada
                        custom_msg = st.text_area("Mensagem", height=150, 
                            value=f"🏮 *NikkeyBox*\n\nOlá {sel_order.get('customerName', '')}!\n\n")
                        if st.button("📤 Enviar Mensagem", type="primary", use_container_width=True):
                            try:
                                resp = http_requests.post(f"{WHATSAPP_API}/api/send", json={
                                    'phone': sel_order.get('customerPhone', ''),
                                    'message': custom_msg,
                                }, timeout=30)
                                result = resp.json()
                                if result.get('success'):
                                    st.success("✅ Mensagem enviada!")
                                else:
                                    st.error(f"❌ Erro: {result.get('error')}")
                            except Exception as e:
                                st.error(f"❌ Erro: {str(e)}")
                else:
                    st.info("Nenhum pedido com telefone cadastrado.")
            else:
                st.info("Nenhum pedido encontrado.")
    
    with tab_templates:
        st.subheader("📝 Templates de Mensagens")
        st.info("Templates prontos para copiar e personalizar")
        
        templates = [
            {
                'name': '🆕 Novo Pedido',
                'message': """🏮 *NikkeyBox*

Olá {nome}! 📦

Seu pedido *{numero}* foi recebido com sucesso!

📦 *Itens:*
{itens}

💰 *Total:* ¥{total}
Obrigada pela compra! 💛

_NikkeyBox_"""
            },
            {
                'name': '✅ Pagamento Confirmado',
                'message': """🏮 *NikkeyBox*

Olá {nome}!

✅ Pagamento do pedido *{numero}* confirmado!

Seu pedido está sendo preparado com cuidado. 📦
Em breve enviaremos o código de rastreamento.

_NikkeyBox_"""
            },
            {
                'name': '🚚 Pedido Enviado',
                'message': """🏮 *NikkeyBox*

Olá {nome}!

🚚 Seu pedido *{numero}* foi enviado!

📦 *Rastreamento:* {rastreio}
🔗 Acompanhe: {link_rastreio}

Previsão de entrega: 2-3 dias úteis.

_NikkeyBox_"""
            },
            {
                'name': '🎂 Aniversário',
                'message': """🏮 *NikkeyBox*

🎂 Feliz Aniversário, {nome}! 🎉

Para comemorar seu dia especial, temos um presente:

🎟️ Use o cupom *{cupom}* e ganhe desconto na sua próxima compra!
Parabéns! 💛

_NikkeyBox_"""
            },
            {
                'name': '💌 Pós-Venda',
                'message': """🏮 *NikkeyBox*

Olá {nome}!

Tudo bem? 😊

Queria saber se você gostou do seu pedido! 📦

Se tiver qualquer feedback, adoraríamos ouvir.
E quando quiser fazer um novo pedido, é só acessar nosso site:
🌐 nikkeybox-store.com
Obrigada! 💛

_NikkeyBox_"""
            },
        ]
        
        for tmpl in templates:
            with st.expander(tmpl['name']):
                st.code(tmpl['message'], language=None)
                st.caption("Substitua {nome}, {numero}, {total}, etc. pelos dados reais")
    
    with tab_log:
        st.subheader("📋 Histórico de Mensagens")
        
        try:
            log_resp = http_requests.get(f"{WHATSAPP_API}/api/messages", timeout=5)
            log_data = log_resp.json()
            messages = log_data.get('messages', [])
            
            if messages:
                st.metric("📊 Total de Mensagens", len(messages))
                
                for msg in messages[:20]:
                    status_icon = "✅" if msg.get('status') == 'sent' else "❌"
                    timestamp = msg.get('timestamp', '')[:19].replace('T', ' ')
                    phone = msg.get('phone', 'N/A')
                    preview = msg.get('message', '')[:80]
                    msg_type = msg.get('type', 'manual')
                    
                    st.markdown(f"""
                    {status_icon} **{phone}** — {timestamp}  
                    _{preview}_  
                    <small style="color:#999;">Tipo: {msg_type}</small>
                    """, unsafe_allow_html=True)
                    st.markdown("---")
            else:
                st.info("📭 Nenhuma mensagem enviada ainda.")
        except:
            st.warning("⚠️ Não foi possível carregar o histórico. Verifique se o serviço está rodando.")
