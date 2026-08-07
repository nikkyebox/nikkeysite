"""
Firebase Integration Module para NikkeyBox ERP
Conecta ao Firestore do projeto nikkey-33f93
"""

import firebase_admin
from firebase_admin import credentials, firestore
import streamlit as st
import os
import json
from datetime import datetime


def get_firebase_db():
    """Inicializa e retorna a conexão com o Firestore."""
    if not firebase_admin._apps:
        # Auto-detect credentials file (any .json with firebase/adminsdk in name)
        erp_dir = os.path.dirname(os.path.abspath(__file__))
        cred_path = None
        
        # Priority 1: exact name
        exact = os.path.join(erp_dir, 'firebase-credentials.json')
        if os.path.exists(exact):
            cred_path = exact
        else:
            # Priority 2: any json file with firebase/adminsdk in name
            for f in os.listdir(erp_dir):
                if f.endswith('.json') and ('firebase' in f.lower() or 'adminsdk' in f.lower()):
                    cred_path = os.path.join(erp_dir, f)
                    break
        
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            st.sidebar.success(f"Firebase conectado!")
        else:
            st.error(
                "⚠️ Arquivo de credenciais Firebase não encontrado!\n\n"
                "**Como obter:**\n"
                "1. Acesse https://console.firebase.google.com/project/nikkey-33f93/settings/serviceaccounts/adminsdk\n"
                "2. Clique em **'Gerar nova chave privada'**\n"
                "3. Salve o arquivo `.json` na pasta `erp/`"
            )
            return None
    
    return firestore.client()


def get_all_orders(db):
    """Busca todos os pedidos do Firestore (coleção 'orders')."""
    try:
        orders_ref = db.collection('orders')
        docs = orders_ref.stream()
        
        orders = []
        for doc in docs:
            data = doc.to_dict()
            data['_id'] = doc.id
            orders.append(data)
        
        return orders
    except Exception as e:
        st.error(f"Erro ao buscar pedidos: {e}")
        return []


def get_all_users(db):
    """Busca todos os usuários do Firestore (coleção 'users')."""
    try:
        users_ref = db.collection('users')
        docs = users_ref.stream()
        
        users = []
        for doc in docs:
            data = doc.to_dict()
            data['_id'] = doc.id
            users.append(data)
        
        return users
    except Exception as e:
        st.error(f"Erro ao buscar usuários: {e}")
        return []


# ===================== DESPESAS (Expenses) =====================

def save_expense(db, expense_data: dict):
    """Salva uma despesa no Firestore."""
    try:
        expense_data['createdAt'] = datetime.now().isoformat()
        db.collection('erp_expenses').add(expense_data)
        return True
    except Exception as e:
        st.error(f"Erro ao salvar despesa: {e}")
        return False


def get_all_expenses(db):
    """Busca todas as despesas do Firestore."""
    try:
        docs = db.collection('erp_expenses').stream()
        expenses = []
        for doc in docs:
            data = doc.to_dict()
            data['_id'] = doc.id
            expenses.append(data)
        return expenses
    except Exception as e:
        st.error(f"Erro ao buscar despesas: {e}")
        return []


def delete_expense(db, expense_id: str):
    """Remove uma despesa do Firestore."""
    try:
        db.collection('erp_expenses').document(expense_id).delete()
        return True
    except Exception as e:
        st.error(f"Erro ao deletar despesa: {e}")
        return False


# ===================== INSUMOS (Supplies/Ingredients) =====================

def save_supply(db, supply_data: dict):
    """Salva um insumo/ingrediente no Firestore."""
    try:
        supply_data['createdAt'] = datetime.now().isoformat()
        supply_data['updatedAt'] = datetime.now().isoformat()
        # Use name as document ID for easy updates
        doc_id = supply_data.get('name', '').replace('/', '-').replace(' ', '_').lower()
        if doc_id:
            db.collection('erp_supplies').document(doc_id).set(supply_data, merge=True)
        else:
            db.collection('erp_supplies').add(supply_data)
        return True
    except Exception as e:
        st.error(f"Erro ao salvar insumo: {e}")
        return False


def get_all_supplies(db):
    """Busca todos os insumos do Firestore."""
    try:
        docs = db.collection('erp_supplies').stream()
        supplies = []
        for doc in docs:
            data = doc.to_dict()
            data['_id'] = doc.id
            supplies.append(data)
        return supplies
    except Exception as e:
        st.error(f"Erro ao buscar insumos: {e}")
        return []


def delete_supply(db, supply_id: str):
    """Remove um insumo do Firestore."""
    try:
        db.collection('erp_supplies').document(supply_id).delete()
        return True
    except Exception as e:
        st.error(f"Erro ao deletar insumo: {e}")
        return False


# ===================== FICHAS TÉCNICAS =====================

def save_product_recipe(db, recipe_data: dict):
    """Salva a ficha técnica de um produto no Firestore."""
    try:
        recipe_data['updatedAt'] = datetime.now().isoformat()
        doc_id = recipe_data.get('product_name', '').replace('/', '-').replace(' ', '_').lower()
        if doc_id:
            db.collection('erp_recipes').document(doc_id).set(recipe_data, merge=True)
        else:
            db.collection('erp_recipes').add(recipe_data)
        return True
    except Exception as e:
        st.error(f"Erro ao salvar ficha técnica: {e}")
        return False


def get_all_recipes(db):
    """Busca todas as fichas técnicas do Firestore."""
    try:
        docs = db.collection('erp_recipes').stream()
        recipes = []
        for doc in docs:
            data = doc.to_dict()
            data['_id'] = doc.id
            recipes.append(data)
        return recipes
    except Exception as e:
        st.error(f"Erro ao buscar fichas técnicas: {e}")
        return []


def delete_recipe(db, recipe_id: str):
    """Remove uma ficha técnica do Firestore."""
    try:
        db.collection('erp_recipes').document(recipe_id).delete()
        return True
    except Exception as e:
        st.error(f"Erro ao deletar ficha técnica: {e}")
        return False


# ===================== ESTOQUE =====================

def save_stock_entry(db, stock_data: dict):
    """Salva movimentação de estoque no Firestore."""
    try:
        stock_data['createdAt'] = datetime.now().isoformat()
        db.collection('erp_stock').add(stock_data)
        return True
    except Exception as e:
        st.error(f"Erro ao salvar estoque: {e}")
        return False


def get_all_stock(db):
    """Busca todo o estoque do Firestore."""
    try:
        docs = db.collection('erp_stock').stream()
        stock = []
        for doc in docs:
            data = doc.to_dict()
            data['_id'] = doc.id
            stock.append(data)
        return stock
    except Exception as e:
        st.error(f"Erro ao buscar estoque: {e}")
        return []


def update_stock_item(db, stock_id: str, new_data: dict):
    """Atualiza um item de estoque no Firestore."""
    try:
        new_data['updatedAt'] = datetime.now().isoformat()
        db.collection('erp_stock').document(stock_id).update(new_data)
        return True
    except Exception as e:
        st.error(f"Erro ao atualizar estoque: {e}")
        return False


def delete_stock_item(db, stock_id: str):
    """Remove um item de estoque do Firestore."""
    try:
        db.collection('erp_stock').document(stock_id).delete()
        return True
    except Exception as e:
        st.error(f"Erro ao deletar estoque: {e}")
        return False


# ===================== CUPONS (Coupons) =====================

def create_coupon(db, coupon_data: dict):
    """Cria um cupom na coleção 'coupons' do site (mesma que o site usa)."""
    try:
        code = coupon_data.get('code', '').upper()
        if not code:
            return False
        coupon_data['createdAt'] = datetime.now().isoformat()
        coupon_data['updatedAt'] = datetime.now().isoformat()
        db.collection('coupons').document(code).set(coupon_data, merge=True)
        return True
    except Exception as e:
        st.error(f"Erro ao criar cupom: {e}")
        return False


def get_all_coupons(db):
    """Busca todos os cupons do Firestore."""
    try:
        docs = db.collection('coupons').stream()
        coupons = []
        for doc in docs:
            data = doc.to_dict()
            data['_id'] = doc.id
            coupons.append(data)
        return coupons
    except Exception as e:
        st.error(f"Erro ao buscar cupons: {e}")
        return []


def delete_coupon(db, code: str):
    """Deleta um cupom do Firestore."""
    try:
        db.collection('coupons').document(code.upper()).delete()
        return True
    except Exception as e:
        st.error(f"Erro ao deletar cupom: {e}")
        return False


def toggle_coupon_active(db, code: str, active: bool):
    """Ativa ou desativa um cupom."""
    try:
        db.collection('coupons').document(code.upper()).update({
            'active': active,
            'updatedAt': datetime.now().isoformat(),
        })
        return True
    except Exception as e:
        st.error(f"Erro ao atualizar cupom: {e}")
        return False


# ===================== ORDER STATUS =====================

def update_order_status_erp(db, order_number: str, new_status: str):
    """Atualiza status do pedido no Firestore (mesmo que o site lê)."""
    try:
        order_ref = db.collection('orders').document(order_number)
        order_ref.update({
            'status': new_status,
            'updatedAt': datetime.now().isoformat(),
        })
        return True
    except Exception as e:
        st.error(f"Erro ao atualizar status: {e}")
        return False


def update_order_tracking(db, order_number: str, tracking_number: str, tracking_url: str, carrier: str):
    """Atualiza informações de rastreio no Firestore."""
    try:
        order_ref = db.collection('orders').document(order_number)
        order_ref.update({
            'trackingNumber': tracking_number,
            'trackingUrl': tracking_url,
            'carrier': carrier,
            'status': 'shipped',
            'updatedAt': datetime.now().isoformat(),
        })
        return True
    except Exception as e:
        st.error(f"Erro ao atualizar rastreio: {e}")
        return False


def get_whatsapp_api_url(db):
    """Obtém a URL da API do WhatsApp do Firestore ou retorna o padrão local."""
    try:
        doc = db.collection('erp_settings').document('whatsapp').get()
        if doc.exists:
            return doc.to_dict().get('api_url', 'http://localhost:3001')
    except Exception as e:
        pass
    return 'http://localhost:3001'


def save_whatsapp_api_url(db, api_url: str):
    """Salva a URL da API do WhatsApp no Firestore."""
    try:
        db.collection('erp_settings').document('whatsapp').set({
            'api_url': api_url,
            'updatedAt': datetime.now().isoformat()
        }, merge=True)
        return True
    except Exception as e:
        st.error(f"Erro ao salvar URL do WhatsApp: {e}")
        return False

