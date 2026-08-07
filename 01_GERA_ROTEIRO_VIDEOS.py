#!/usr/bin/env python3
"""
🎬 GERADOR DE ROTEIRO PARA VÍDEOS
Cria roteiros automáticos baseado no catálogo
"""

import json
from datetime import datetime

print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║        🎬 GERADOR DE ROTEIRO PARA VÍDEOS - JAPAN EXPRESS                  ║
║                                                                            ║
║        Cria roteiros automáticos para:                                    ║
║        ✅ Unboxing (TikTok/YouTube)                                       ║
║        ✅ Product Showcase (Instagram)                                    ║
║        ✅ Tutorial/How-to (YouTube)                                       ║
║        ✅ Haul/Compras (TikTok)                                           ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
""")

# ============================================================================
# CATÁLOGO JAPAN EXPRESS
# ============================================================================

PRODUTOS = [
    {
        "nome": "Medicube 3H Relief Cream",
        "preco": "R$ 204,62",
        "categoria": "Skincare",
        "descricao": "Creme facial coreano com ácido hialurônico",
        "beneficios": ["Hidratação", "Alívio", "Pele macia"],
        "pais": "🇰🇷 Coreia do Sul",
    },
    {
        "nome": "Pocky Chocolate Original",
        "preco": "R$ 26,69",
        "categoria": "Snacks",
        "descricao": "Biscoito japonês com cobertura de chocolate",
        "beneficios": ["Crocante", "Saboroso", "Clássico"],
        "pais": "🇯🇵 Japão",
    },
    {
        "nome": "Kit &honey Hair Treatment",
        "preco": "R$ 333,33",
        "categoria": "Hair Care",
        "descricao": "Kit completo para tratamento capilar",
        "beneficios": ["Reparação", "Brilho", "Sedosidade"],
        "pais": "🇯🇵 Japão",
    },
]

# ============================================================================
# TEMPLATES DE ROTEIRO
# ============================================================================

ROTEIROS = {
    "UNBOXING": {
        "titulo": "🎁 UNBOXING: {produto}",
        "duracao": "60-90 segundos",
        "cenas": [
            "Zoom no pacote chegando",
            "Abrindo a embalagem (slow-mo)",
            "Revelando o produto (efeito dramatic)",
            "Mostrando detalhes do produto",
            "Preço e onde comprar",
            "Reação final (thumbs up)",
        ],
        "audio": "Música energética (upbeat)",
        "hashtags": [
            "#Unboxing",
            "#JapanExpress",
            "#ShoppingHaul",
            "#Skincare" if "Cream" in "{produto}" else "#Snacks",
        ],
    },
    "TUTORIAL": {
        "titulo": "💡 COMO USAR: {produto}",
        "duracao": "30-60 segundos",
        "cenas": [
            "Problema/benefício (texto overlay)",
            "Mostrando o produto",
            "Como usar (passo-a-passo)",
            "Resultado final",
            "CTA: Link na bio",
        ],
        "audio": "Voz-over educativa",
        "hashtags": [
            "#Tutorial",
            "#DIY",
            "#BeautyTips",
            "#JapanExpress",
        ],
    },
    "HAUL": {
        "titulo": "🛍️ HAUL JAPAN EXPRESS: {valor}",
        "duracao": "60-120 segundos",
        "cenas": [
            "Montagem de vários produtos",
            "Revela cada item",
            "Preços aparecendo",
            "Reação aos preços",
            "Total gasto (overlay)",
        ],
        "audio": "Música animada + voz-over",
        "hashtags": [
            "#Haul",
            "#ShoppingOnline",
            "#ImportadosJapão",
            "#JapanExpress",
        ],
    },
}

# ============================================================================
# GERAR ROTEIROS
# ============================================================================

print("\n✅ GERANDO ROTEIROS AUTOMÁTICOS...")
print("=" * 80)

roteiros_gerados = []

for idx, produto in enumerate(PRODUTOS, 1):
    print(f"\n📌 Produto {idx}: {produto['nome']}")
    
    for tipo_roteiro, template in ROTEIROS.items():
        roteiro = {
            "id": f"{tipo_roteiro.lower()}_{idx}",
            "tipo": tipo_roteiro,
            "produto": produto['nome'],
            "preco": produto['preco'],
            "categoria": produto['categoria'],
            "titulo": template["titulo"].format(produto=produto['nome']),
            "duracao": template["duracao"],
            "cenas": template["cenas"],
            "audio": template["audio"],
            "hashtags": template["hashtags"],
            "plataformas": ["TikTok", "YouTube", "Instagram"],
            "data_criacao": datetime.now().isoformat(),
        }
        
        roteiros_gerados.append(roteiro)
        print(f"   ✓ {tipo_roteiro}: {roteiro['titulo']}")

# ============================================================================
# SALVAR ROTEIROS
# ============================================================================

print(f"\n✅ SALVANDO ROTEIROS...")
print("=" * 80)

arquivo_roteiros = "roteiros_videos.json"
with open(arquivo_roteiros, 'w', encoding='utf-8') as f:
    json.dump(roteiros_gerados, f, ensure_ascii=False, indent=2)

print(f"✅ {len(roteiros_gerados)} roteiros salvos em: {arquivo_roteiros}")

# ============================================================================
# RELATÓRIO
# ============================================================================

print(f"""
📊 RESUMO:

   Produtos processados: {len(PRODUTOS)}
   Tipos de roteiro: {len(ROTEIROS)}
   Total de roteiros: {len(roteiros_gerados)}
   
   Roteiros por tipo:
   • Unboxing: {len([r for r in roteiros_gerados if r['tipo'] == 'UNBOXING'])}
   • Tutorial: {len([r for r in roteiros_gerados if r['tipo'] == 'TUTORIAL'])}
   • Haul: {len([r for r in roteiros_gerados if r['tipo'] == 'HAUL'])}

📺 PRONTO PARA CRIAR VÍDEOS!

   Próxima etapa:
   Execute: python3 02_CRIA_VIDEOS.py

✅ Roteiros criados com sucesso! 🎬
""")
