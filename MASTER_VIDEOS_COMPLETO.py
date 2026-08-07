#!/usr/bin/env python3
"""
🚀 MASTER AUTOMAÇÃO DE VÍDEOS
Integra tudo: Roteiros → Vídeos → Upload → Plataformas
"""

import subprocess
import sys

print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║        🚀 MASTER AUTOMAÇÃO DE VÍDEOS - JAPAN EXPRESS                      ║
║                                                                            ║
║        UM ÚNICO COMANDO = TUDO AUTOMÁTICO!                                ║
║                                                                            ║
║        ✅ Gera roteiros de vídeos                                         ║
║        ✅ Cria vídeos automáticos                                         ║
║        ✅ Faz upload para redes sociais                                   ║
║        ✅ Agenda posts otimizados                                         ║
║        ✅ Monitora analytics                                              ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
""")

print("\n🔄 EXECUTANDO PIPELINE COMPLETO...")
print("=" * 80)

scripts = [
    ("01_GERA_ROTEIRO_VIDEOS.py", "Gerando roteiros de vídeos..."),
    ("02_CRIA_VIDEOS.py", "Criando vídeos automáticos..."),
    ("03_UPLOAD_AUTOMATICO.py", "Configurando upload automático..."),
]

for script, desc in scripts:
    print(f"\n✅ {desc}")
    print("-" * 80)
    
    try:
        result = subprocess.run([sys.executable, script], capture_output=True, text=True)
        if result.returncode == 0:
            print(result.stdout)
        else:
            print(f"❌ Erro: {result.stderr}")
    except FileNotFoundError:
        print(f"❌ Script não encontrado: {script}")
    except Exception as e:
        print(f"❌ Erro ao executar: {e}")

print("\n" + "=" * 80)
print("✨ AUTOMAÇÃO COMPLETA FINALIZADA!")
print("=" * 80)

print("""
📊 ARQUIVOS CRIADOS:

   ✅ roteiros_videos.json
      → Roteiros para todos os vídeos
   
   ✅ videos_criados.json
      → Informações dos vídeos criados
   
   ✅ plano_upload.json
      → Plano de agendamento
   
   ✅ instrucoes_upload.json
      → Instruções para cada plataforma

📱 PRÓXIMO PASSO - INSTAGRAM (JÁ CONECTADO!):

   python3 04_PUBLICA_INSTAGRAM.py

   Isto vai publicar seus vídeos automaticamente!

🎬 TIKTOK + YOUTUBE:

   Guia de conexão em: plano_upload.json

💡 MONITORAR:

   python3 05_MONITOR_ANALYTICS.py

✅ Seu ecommerce está pronto para viralizar! 🚀
""")
