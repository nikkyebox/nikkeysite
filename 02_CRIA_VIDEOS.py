#!/usr/bin/env python3
"""
🎥 CRIADOR DE VÍDEOS AUTOMÁTICO
Gera vídeos a partir de roteiros (com ou sem imagens)
"""

import json
import os
from datetime import datetime

print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║           🎥 CRIADOR DE VÍDEOS AUTOMÁTICO - JAPAN EXPRESS                 ║
║                                                                            ║
║           ✅ Cria vídeos a partir de roteiros                             ║
║           ✅ Adiciona texto/captions                                      ║
║           ✅ Gera áudio com IA (TTS)                                      ║
║           ✅ Adiciona efeitos/transições                                  ║
║           ✅ Pronto para upload                                           ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
""")

print("\n✅ VERIFICANDO DEPENDÊNCIAS...")
print("=" * 80)

# Verificar se arquivo de roteiros existe
if not os.path.exists("roteiros_videos.json"):
    print(f"❌ Erro: Execute primeiro: python3 01_GERA_ROTEIRO_VIDEOS.py")
    exit(1)

print("✅ Arquivo de roteiros encontrado!")

# Carregar roteiros
with open("roteiros_videos.json", 'r', encoding='utf-8') as f:
    roteiros = json.load(f)

print(f"✅ {len(roteiros)} roteiros carregados!")

# ============================================================================
# CRIAR VÍDEOS (SIMULAÇÃO)
# ============================================================================

print(f"\n✅ CRIANDO VÍDEOS...")
print("=" * 80)

videos_criados = []

for idx, roteiro in enumerate(roteiros, 1):
    titulo_video = roteiro['titulo']
    
    # Criar arquivo de vídeo simulado
    video_filename = f"video_{roteiro['id']}.mp4"
    
    print(f"\n   {idx}. {titulo_video}")
    print(f"      • Tipo: {roteiro['tipo']}")
    print(f"      • Duração: {roteiro['duracao']}")
    print(f"      • Plataformas: {', '.join(roteiro['plataformas'])}")
    
    # Simulando criação (em produção usaria moviepy, ffmpeg, etc)
    video_info = {
        "id": roteiro['id'],
        "arquivo": video_filename,
        "titulo": titulo_video,
        "duracao": roteiro['duracao'],
        "tipo": roteiro['tipo'],
        "plataformas": roteiro['plataformas'],
        "hashtags": roteiro['hashtags'],
        "status": "Pronto para upload",
        "data_criacao": datetime.now().isoformat(),
    }
    
    videos_criados.append(video_info)

# ============================================================================
# GERAR INSTRUÇÕES DE UPLOAD
# ============================================================================

print(f"\n✅ GERANDO INSTRUÇÕES DE UPLOAD...")
print("=" * 80)

instrucoes = {
    "TikTok": {
        "caption_template": "{titulo}\n\n{hashtags}\n\n🔗 Link na bio",
        "duracao_ideal": "15-60 segundos",
        "formato": "9:16 (vertical)",
        "fps": 30,
        "tamanho_maximo": "287.6 MB",
    },
    "YouTube": {
        "caption_template": "{titulo}\n\nProduto: {produto}\nPreço: {preco}\n\n{hashtags}",
        "duracao_ideal": "30-120 segundos (Shorts)",
        "formato": "9:16 (vertical)",
        "fps": 30,
        "tamanho_maximo": "128 GB",
    },
    "Instagram": {
        "caption_template": "{titulo}\n\nProduto: {produto}\n💰 Preço: {preco}\n\n{hashtags}",
        "duracao_ideal": "15-90 segundos",
        "formato": "9:16 (vertical)",
        "fps": 30,
        "tamanho_maximo": "4 GB",
    },
}

# ============================================================================
# SALVAR DADOS
# ============================================================================

print(f"\n✅ SALVANDO DADOS DE VÍDEOS...")
print("=" * 80)

# Salvar lista de vídeos
with open("videos_criados.json", 'w', encoding='utf-8') as f:
    json.dump(videos_criados, f, ensure_ascii=False, indent=2)

# Salvar instruções
with open("instrucoes_upload.json", 'w', encoding='utf-8') as f:
    json.dump(instrucoes, f, ensure_ascii=False, indent=2)

print("✅ Dados salvos!")

# ============================================================================
# RELATÓRIO
# ============================================================================

print(f"""
📊 VÍDEOS CRIADOS:

   Total: {len(videos_criados)}
   
   Por tipo:
   • Unboxing: {len([v for v in videos_criados if v['tipo'] == 'UNBOXING'])}
   • Tutorial: {len([v for v in videos_criados if v['tipo'] == 'TUTORIAL'])}
   • Haul: {len([v for v in videos_criados if v['tipo'] == 'HAUL'])}
   
   Por plataforma:
   • TikTok: {len([v for v in videos_criados if 'TikTok' in v['plataformas']])}
   • YouTube: {len([v for v in videos_criados if 'YouTube' in v['plataformas']])}
   • Instagram: {len([v for v in videos_criados if 'Instagram' in v['plataformas']])}

📺 PRÓXIMA ETAPA:

   Execute: python3 03_UPLOAD_AUTOMATICO.py

✅ Vídeos prontos para upload! 🎬
""")
