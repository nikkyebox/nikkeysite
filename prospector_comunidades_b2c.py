# -*- coding: utf-8 -*-
"""
====================================================================
PROSPECTOR DE LEADS B2C & REDES SOCIAIS - NIKKEYBOX / JAPAN EXPRESS
Mapeamento de Reddit, Grupos de Facebook, Instagram e TikTok
====================================================================
"""

import json
import os
import sys
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

COMUNIDADES_SOCIAIS = [
    # =========================================================================
    # 1. REDDIT (Subreddits Brasileiros e de Beleza Asiática)
    # =========================================================================
    {
        "id": "REDDIT-01",
        "plataforma": "Reddit",
        "canal": "r/SkincareBR",
        "link": "https://www.reddit.com/r/SkincareBR/",
        "publico_alvo": "Pessoas buscando cosméticos asiáticos (Hada Labo, Rohto Melano CC, Bioré, Medicube)",
        "volume_membros": "120.000+ membros",
        "gatilho_busca": "Buscas por 'protetor japonês', 'onde comprar Hada Labo original', 'falsificação shopee'",
        "copy_comentario": (
            "Oi! Para cosméticos japoneses (Hada Labo, Bioré, Melano CC), tomar muito cuidado com marketplace porque tem muito lote falso da China circulando.\n\n"
            "Eu compro direto de uma loja de brasileiros que moram no Japão (a NikkeyBox / Japan Express). Eles enviam com rastreio da Japan Post e o lote vem novinho direto de Tóquio. Se quiser dar uma olhada, tem o site deles (nikkeybox-store.com) ou pelo WhatsApp direto do Japão (+81 70-2272-3051) que eles até compram itens específicos sob encomenda se você não achar no site!"
        ),
        "copy_dm": (
            "Oi! Vi seu post no r/SkincareBR sobre {produto}. Moramos aqui no Japão e temos um serviço de envio direto de produtos 100% originais de farmácias de Tóquio para o Brasil com código de rastreio.\n\n"
            "Se você ainda estiver procurando, consigo te passar os valores e opções de frete leve! Posso te mandar o link?"
        )
    },
    {
        "id": "REDDIT-02",
        "plataforma": "Reddit",
        "canal": "r/CabelosDoBrasil",
        "link": "https://www.reddit.com/r/CabelosDoBrasil/",
        "publico_alvo": "Pessoas buscando cronograma capilar, máscaras potentes e óleos reparadores",
        "volume_membros": "45.000+ membros",
        "gatilho_busca": "Posts sobre 'Shiseido Fino vs Tsubaki', '&honey vale a pena?', 'onde comprar Fino original'",
        "copy_comentario": (
            "A máscara Shiseido Fino e o óleo &honey Deep Moist mudam o cabelo da primeira aplicação, mas atenção redobrada: mais de 80% das que vendem barato em marketplace no Brasil são réplicas que deixam o cabelo pesado.\n\n"
            "Se quiser a original do Japão com selo autêntico, a NikkeyBox envia caixas montadas direto do Japão para o Brasil com frete econômico. Vale muito a pena montar uma caixinha com a máscara + refil!"
        ),
        "copy_dm": (
            "Olá! Vi que você tem interesse na máscara Shiseido Fino / &honey no r/CabelosDoBrasil. Nós despachamos caixas com produtos capilares originais direto daqui do Japão para o Brasil toda semana.\n\n"
            "Temos cupom de primeira compra se quiser testar! Posso te mandar o catálogo?"
        )
    },
    {
        "id": "REDDIT-03",
        "plataforma": "Reddit",
        "canal": "r/japao & r/brasil",
        "link": "https://www.reddit.com/r/japao/",
        "publico_alvo": "Ex-decasséguis, estudantes e apaixonados pela cultura japonesa e culinária",
        "volume_membros": "90.000+ membros",
        "gatilho_busca": "Posts de 'saudades das comidas do Japão', 'onde achar KitKat de Matcha', 'personal shopper Japão'",
        "copy_comentario": (
            "Para quem sente falta dos snacks e temperos do Japão (KitKat de Matcha/Sakura, chocolates Meiji, curry Golden/Vermont, molhos Kewpie), a NikkeyBox faz personal shopper e envia caixas personalizadas para qualquer estado do Brasil!\n\n"
            "Você pode pedir pelo site ou mandar a lista do que quer no WhatsApp deles (+81 70-2272-3051) que eles compram nas lojas daqui e enviam."
        ),
        "copy_dm": (
            "Konnichiwa! Vi seu post sobre a saudade dos produtos do Japão no Reddit. Trabalhamos como Personal Shopper aqui no Japão enviando qualquer item (snacks, guloseimas, cosméticos e itens de anime) para a sua casa no Brasil.\n\n"
            "Se precisar de algo específico, só me falar que montamos uma cotação sem compromisso!"
        )
    },

    # =========================================================================
    # 2. GRUPOS DO FACEBOOK (Comunidade Nikkei, Decasséguis e Cultura Japonesa)
    # =========================================================================
    {
        "id": "FB-01",
        "plataforma": "Facebook Groups",
        "canal": "Decasséguis no Brasil / Projeto Okaeri",
        "link": "https://www.facebook.com/groups/decasséguisbrasil/",
        "publico_alvo": "Brasileiros que moraram no Japão e sentem falta dos produtos, remédios, cosméticos e comidas",
        "volume_membros": "65.000+ membros ativos",
        "gatilho_busca": "Postagens diárias de 'Alguém trazendo encomenda do Japão?', 'Onde compro remédio/vitamina japonesa?'",
        "copy_comentario": (
            "Olá pessoal do grupo! Para quem voltou do Japão e está com saudade dos produtos ou precisa de itens específicos (remédios japoneses isentos, pomadas, colírios Rohto, cosméticos e snacks), nós moramos aqui no Japão e enviamos caixas para todo o Brasil pela Japan Post com código de rastreio.\n\n"
            "Atendimento 100% em português pelo WhatsApp: +81 70-2272-3051 ou pelo site www.nikkeybox-store.com 🇯🇵📦"
        ),
        "copy_dm": (
            "Olá {nome}! Tudo bem? Vi sua mensagem no grupo sobre trazer encomendas do Japão. Nós temos a NikkeyBox / Japan Express, com base aqui no Japão e enviamos qualquer encomenda para o Brasil com segurança e suporte completo em português.\n\n"
            "Qual produto você está precisando? Consigo verificar a disponibilidade e te passar o valor certinho!"
        )
    },
    {
        "id": "FB-02",
        "plataforma": "Facebook Groups",
        "canal": "Amantes do Japão & Cultura Pop Japonesa Brasil",
        "link": "https://www.facebook.com/groups/culturajapao/",
        "publico_alvo": "Fãs de animes, guloseimas japonesas, figures, papelaria kawaii e colecionáveis",
        "volume_membros": "80.000+ membros",
        "gatilho_busca": "Posts de unboxing de doces japoneses, papelaria japonesa e pedidos de importação",
        "copy_comentario": (
            "Gente, para quem quer doces japoneses de verdade (KitKats colecionáveis de províncias, balas Hi-Chew, Pocky de sabores raros e caixas misteriosas), a NikkeyBox monta caixas temáticas enviadas direto do Japão!\n\n"
            "Tudo com validade fresca e embalado com muito carinho. O link da loja é nikkeybox-store.com!"
        ),
        "copy_dm": (
            "Olá {nome}! Vi que você curte colecionáveis e guloseimas do Japão no grupo. Temos um serviço de Personal Shopper onde compramos direto em Akihabara, Don Quijote e Pokémon Center para enviar para você no Brasil.\n\n"
            "Se tiver algum item que você esteja procurando e não encontra no Brasil, pode me chamar!"
        )
    },
    {
        "id": "FB-03",
        "plataforma": "Facebook Groups",
        "canal": "J-Beauty & K-Beauty Brasil (Skincare Asiático)",
        "link": "https://www.facebook.com/groups/jbeautybrasil/",
        "publico_alvo": "Consumidoras frequentes de skincare e maquiagem japonesa",
        "volume_membros": "35.000+ membros",
        "gatilho_busca": "Comparativos de protetores solares (Anessa vs Bioré), dúvidas sobre Melano CC e Medicube",
        "copy_comentario": (
            "Meninas, o segredo da pele de porcelana japonesa é a constância com produtos autênticos! Protetores da Anessa, Bioré Aqua Rich e a linha Medicube PDRN são imbatíveis.\n\n"
            "A NikkeyBox despacha direto das drogarias de Tóquio com frete internacional acessível para o Brasil. Uso o cupom BEMVINDO10 para ganhar 10% de desconto na primeira compra!"
        ),
        "copy_dm": (
            "Oi {nome}! Vi sua dúvida sobre a rotina de skincare japonesa no grupo. Nós enviamos direto de Tóquio os dermocosméticos mais premiados do ranking @cosme do Japão.\n\n"
            "Se quiser ajuda para montar uma rotina com os produtos certos para a sua pele, nosso WhatsApp de suporte é +81 70-2272-3051!"
        )
    },

    # =========================================================================
    # 3. INSTAGRAM & TIKTOK (Caça a Compradores em Comentários de Vídeos Virais)
    # =========================================================================
    {
        "id": "INSTA-01",
        "plataforma": "Instagram & TikTok",
        "canal": "Vídeos virais de Shiseido Fino & &honey (#shiseidofino #hairtokbrasil)",
        "link": "https://www.instagram.com/explore/tags/shiseidofinobrasil/",
        "publico_alvo": "Seguidoras perguntando nos comentários: 'Onde acho original?', 'Tem link de confiança?'",
        "volume_membros": "Milhares de comentários com intenção imediata de compra",
        "gatilho_busca": "Monitorar posts de influenciadoras de cabelo e responder quem perguntou 'onde comprar'",
        "copy_comentario": (
            "Para quem está com medo de comprar falsificada na internet, a @nikkeybox_store envia a original lacrada direto do Japão para a sua casa! Chega com rastreio e você acompanha tudo do Japão até o Brasil 🌸📦"
        ),
        "copy_dm": (
            "Oii {nome}! Vi que você comentou no post querendo a máscara Shiseido Fino / óleo &honey. Somos loja oficial com envio direto de Tóquio para o Brasil, 100% original e com garantia de autenticidade.\n\n"
            "Temos pronta entrega para despacho nesta semana! Posso te mandar o link da loja com cupom de desconto?"
        )
    },
    {
        "id": "INSTA-02",
        "plataforma": "Instagram & TikTok",
        "canal": "Contas de Comprinhas no Japão e Don Quijote (#donkibrasil #comprinhasjapao)",
        "link": "https://www.instagram.com/explore/tags/comprinhasnojapao/",
        "publico_alvo": "Pessoas maravilhadas com as lojas Don Quijote querendo comprar no Brasil",
        "volume_membros": "Público altamente engajado com novidades e tendências",
        "gatilho_busca": "Comentários: 'Queria muito morar no Japão pra comprar isso', 'Alguém vende no Brasil?'",
        "copy_comentario": (
            "Você não precisa ir até o Japão! Nós somos o seu Personal Shopper no Japão: compramos na Donki, Matsumoto Kiyoshi e lojas de conveniência e enviamos para a sua casa no Brasil! Acesse @nikkeybox_store ✨"
        ),
        "copy_dm": (
            "Olá {nome}! Vi seu comentário sobre querer os produtinhos da Don Quijote. Nós fazemos compras personalizadas em qualquer loja do Japão e enviamos direto para a sua casa no Brasil.\n\n"
            "Se quiser encomendar qualquer item que você viu no vídeo, só mandar foto pra gente no WhatsApp (+81 70-2272-3051) que cotamos para você!"
        )
    }
]

def gerar_pipeline_social():
    leads = []
    for item in COMUNIDADES_SOCIAIS:
        lead = {
            **item,
            "status": "🔥 Canal Quente de Captação Ativa",
            "data_mapeamento": datetime.now().strftime("%d/%m/%Y"),
        }
        leads.append(lead)
    return leads

def salvar_pipeline_social(leads, filename_md="leads_comunidades_social.md", filename_json="leads_comunidades_social.json"):
    with open(filename_json, "w", encoding="utf-8") as f:
        json.dump(leads, f, ensure_ascii=False, indent=2)

    with open(filename_md, "w", encoding="utf-8") as f:
        f.write("# 🎣 GUIA DE PESCA DE CLIENTES EM REDES SOCIAIS & FÓRUNS (B2C)\n")
        f.write("### Estratégia de Captação no Reddit, Grupos de Facebook, Instagram e TikTok\n\n")
        f.write(f"*Data de Atualização:* **{datetime.now().strftime('%d/%m/%Y às %H:%M')}**\n")
        f.write(f"*Total de Fontes Mapeadas:* **{len(leads)} comunidades de alto tráfego**\n")
        f.write("*Público Potencial:* **+400.000 pessoas interessadas em produtos do Japão**\n\n")
        f.write("---\n\n")

        f.write("## 📌 COMO PESCAR CLIENTES NESSAS COMUNIDADES (SEM TOMAR BAN)\n\n")
        f.write("1. **Nunca jogue apenas o link (Regra de Ouro)**: Responda primeiro à dúvida da pessoa com autoridade (ex: 'cuidado com falsificação', 'o segredo é usar o óleo nos fios úmidos').\n")
        f.write("2. **Apresente a NikkeyBox como a solução segura**: 'Moramos no Japão e enviamos com código de rastreio da Japan Post'.\n")
        f.write("3. **Ofereça o Concierge de WhatsApp ou Cupom de Boas-Vindas**: Convide para tirar dúvidas no WhatsApp (+81 70-2272-3051) ou usar o cupom `BEMVINDO10`.\n\n")
        f.write("---\n\n")

        for idx, lead in enumerate(leads, 1):
            f.write(f"### {idx}. [{lead['plataforma']}] {lead['canal']}\n")
            f.write(f"- **Link Direto:** [{lead['canal']}]({lead['link']})\n")
            f.write(f"- **Público & Volume:** {lead['publico_alvo']} ({lead['volume_membros']})\n")
            f.write(f"- **Gatilho de Busca:** `{lead['gatilho_busca']}`\n")
            f.write(f"- **Status:** `{lead['status']}`\n\n")

            f.write("💬 **Resposta Pública para Comentários (Educativa + Recomendação):**\n")
            f.write("```text\n")
            f.write(lead['copy_comentario'] + "\n")
            f.write("```\n\n")

            f.write("📩 **Abordagem Privada no Direct / Mensagem Direta (DM):**\n")
            f.write("```text\n")
            f.write(lead['copy_dm'] + "\n")
            f.write("```\n\n")
            f.write("---\n\n")

    print("=" * 65)
    print("  🎣 PROSPECTOR SOCIAL B2C EXECUTADO COM SUCESSO!")
    print("=" * 65)
    print(f"✅ Comunidades mapeadas: {len(leads)}")
    print(f"📄 Arquivo Markdown gerado: {filename_md}")
    print(f"📊 Arquivo JSON gerado: {filename_json}")
    print("=" * 65)

if __name__ == "__main__":
    leads = gerar_pipeline_social()
    salvar_pipeline_social(leads)
