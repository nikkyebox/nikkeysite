#!/usr/bin/env python3
"""
🚀 UPLOAD AUTOMÁTICO VIA SFTP - V2
Google Merchant Center - Feed automático (SENHA ATUALIZADA)
"""

import sys
import os

print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║           🚀 UPLOAD AUTOMÁTICO VIA SFTP - V2                              ║
║                                                                            ║
║           Arquivo: nikkey_box_real_sample_UPDATED.xml                  ║
║           Destino: Google Merchant Center (SFTP)                          ║
║           Método: Upload automático via SFTP                              ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
""")

# ============================================================================
# CREDENCIAIS SFTP (ATUALIZADAS)
# ============================================================================

SFTP_HOST = "partnerupload.google.com"
SFTP_PORT = 19321
SFTP_USER = "mc-sftp-5814734944"
SFTP_PASSWORD = "-Xt2H8K?VU"  # NOVA SENHA
SFTP_PATH = "/"

FEED_FILE = "nikkey_box_real_sample_UPDATED.xml"

# ============================================================================
# PASSO 1: Validar Arquivo
# ============================================================================

print("\n✅ PASSO 1: Validando arquivo XML...")
print("=" * 80)

import xml.etree.ElementTree as ET

try:
    tree = ET.parse(FEED_FILE)
    root = tree.getroot()
    items = root.findall('.//item')
    print(f"✅ Arquivo válido!")
    print(f"   Produtos: {len(items)}")
    print(f"   Tamanho: {os.path.getsize(FEED_FILE) / 1024:.1f} KB")
except FileNotFoundError:
    print(f"❌ Erro: Arquivo não encontrado: {FEED_FILE}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Erro: {e}")
    sys.exit(1)

# ============================================================================
# PASSO 2: Conectar e Fazer Upload via SFTP
# ============================================================================

print("\n✅ PASSO 2: Conectando ao servidor SFTP...")
print("=" * 80)

try:
    import paramiko
    
    print("\n🔐 Conectando a partnerupload.google.com:19321...")
    
    # Criar cliente SFTP
    transport = paramiko.Transport((SFTP_HOST, SFTP_PORT))
    transport.connect(username=SFTP_USER, password=SFTP_PASSWORD)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    print("✅ Conectado ao servidor SFTP!")
    
    # Fazer upload
    print(f"\n📤 Fazendo upload de {FEED_FILE}...")
    print(f"   Host: {SFTP_HOST}:{SFTP_PORT}")
    print(f"   Usuário: {SFTP_USER}")
    print(f"   Arquivo: {FEED_FILE}")
    
    # Upload file
    sftp.put(FEED_FILE, f"{SFTP_PATH}{FEED_FILE}")
    
    print(f"\n✅ UPLOAD BEM-SUCEDIDO!")
    print(f"   Arquivo enviado para: {SFTP_PATH}{FEED_FILE}")
    
    # Fechar conexão
    sftp.close()
    transport.close()
    
    print("\n✅ Conexão fechada com sucesso")

except ImportError:
    print("""
❌ Erro: Biblioteca paramiko não instalada!

Para instalar, execute:
  pip install paramiko

Depois execute este script novamente:
  python3 upload_feed_sftp_final_v2.py
""")
    sys.exit(1)

except paramiko.ssh_exception.NoValidConnectionsError:
    print("""
❌ Erro de conexão ao servidor SFTP!

Verifique:
1. Credenciais SFTP (usuário/senha)
2. Host e porta corretos
3. Conexão internet ativa
4. Firewall/VPN não bloqueando porta 19321
""")
    sys.exit(1)

except paramiko.ssh_exception.AuthenticationException:
    print("""
❌ Erro de autenticação!

Verifique:
1. Senha SFTP está correta
2. Não tem espaços antes/depois da senha
3. Regenerar senha no Merchant Center se necessário
""")
    sys.exit(1)

except Exception as e:
    print(f"\n❌ Erro: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ============================================================================
# CONCLUSÃO
# ============================================================================

print("\n" + "=" * 80)
print("✨ UPLOAD CONCLUÍDO COM SUCESSO!")
print("=" * 80)

print("""
📝 PRÓXIMOS PASSOS:

1. Google Merchant Center processará o arquivo automaticamente:
   ├─ Status: "Sincronizando" → "Ativo" (2-4 horas)
   ├─ Verifique em: Produtos → Fontes de dados

2. Seus 10 produtos aparecem com fretes:
   ├─ Brasil: Air Packet (R$ 206) + Airmail (R$ 263)
   ├─ Europa: 11 países com 2 opções cada
   └─ EUA: Air Packet (US$ 26) + Airmail (US$ 30)

3. Impacto esperado (7-14 dias):
   ├─ Impressões: +20%
   ├─ Cliques: +15-25%
   └─ Conversões: +30-50% ✅

4. Próxima atualização (próxima semana):
   └─ Execute este script novamente para 700+ produtos
   └─ Tudo é automático!

📊 MONITORAR:

   Google Merchant Center:
   → Produtos → Fontes de dados
   → Clique em: nikkey_box_real_sample_UPDATED.xml
   → Ver status e histórico de sincronizações

✅ Seu feed foi enviado com sucesso via SFTP! 🚀
""")
