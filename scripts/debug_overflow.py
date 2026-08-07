#!/usr/bin/env python3
"""
Simulador de análise de overflow horizontal do NikkeyBox.

Baixa o HTML + CSS de produção e procura, de forma estática, padrões que
causam scroll horizontal / desenquadramento no mobile:
  - largura fixa (w-[NNNpx], min-w-[NNNpx]) sem prefixo responsivo
  - uso de 100vw / w-screen
  - posições negativas (-right-NN, -left-NN) fora de container com overflow-hidden
  - regras CSS html/body/#root suspeitas

Uso:  python3 scripts/debug_overflow.py [URL]
      (default: https://www.nikkeybox-store.com)
"""
import sys
import re
import urllib.request
import gzip
import io

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://www.nikkeybox-store.com"
MOBILE_WIDTH = 412  # largura lógica típica de celular Android (Pixel-ish)

UA_MOBILE = ("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA_MOBILE})
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return raw.decode("utf-8", "ignore")


def main():
    print(f"🔍 Analisando {BASE}  (simulando largura {MOBILE_WIDTH}px)\n")

    html = fetch(BASE)

    # 1) Localiza o CSS principal
    css_match = re.search(r'/assets/index-[\w-]+\.css', html)
    if not css_match:
        print("❌ CSS principal não encontrado no HTML")
        return
    css_url = BASE + css_match.group(0)
    css = fetch(css_url)
    print(f"📄 CSS: {css_url}  ({len(css)//1024} KB)\n")

    problems = []

    # 2) Regras críticas de viewport
    print("── Regras de viewport ─────────────────────────────")
    for sel in ["html", "body", "#root"]:
        m = re.search(re.escape(sel) + r'\{[^}]*\}', css)
        rule = m.group(0) if m else "(não encontrada)"
        flags = []
        if "overflow-x:hidden" in rule and sel == "html":
            flags.append("⚠️ overflow-x:hidden no html BLOQUEIA pinch-zoom no mobile")
        if "100vw" in rule:
            flags.append("⚠️ 100vw inclui a scrollbar → pode estourar ~15px")
        mark = "  ".join(flags)
        status = "❌" if flags else "✅"
        print(f"  {status} {sel}: {rule[:90]}{'...' if len(rule)>90 else ''}")
        for f in flags:
            print(f"        {f}")
            problems.append(f"{sel}: {f}")

    # 3) .container
    print("\n── .container ─────────────────────────────────────")
    m = re.search(r'\.container\{[^}]*\}', css)
    if m:
        rule = m.group(0)
        pad = re.search(r'padding(?:-left|-right)?:(\d+(?:\.\d+)?)rem', rule)
        print(f"  {rule[:100]}")
        if pad and float(pad.group(1)) > 0:
            problems.append(f".container padding {pad.group(1)}rem — soma com px-4 das páginas")
            print(f"  ⚠️ padding {pad.group(1)}rem + px-4 manual = padding duplo no mobile")
        else:
            print("  ✅ sem padding fixo (páginas controlam com px-4)")

    # 4) Busca por 100vw / w-screen no CSS (classes utilitárias compiladas)
    print("\n── Larguras de viewport no CSS ───────────────────")
    vw_hits = re.findall(r'\.[\w\\\[\]-]*\{[^}]*100vw[^}]*\}', css)
    if vw_hits:
        for h in vw_hits[:8]:
            print(f"  ⚠️ {h[:80]}")
            problems.append(f"classe com 100vw: {h[:60]}")
    else:
        print("  ✅ nenhuma classe com 100vw")

    # 5) Resumo
    print("\n" + "=" * 52)
    if problems:
        print(f"❌ {len(problems)} possível(is) causa(s) de overflow:")
        for p in problems:
            print(f"   • {p}")
    else:
        print("✅ Nenhum problema estrutural de viewport no CSS de produção.")
        print("   → Se o app ainda corta, é CACHE do Service Worker no aparelho.")
        print("   → Use a ferramenta /debug-layout no celular para achar o")
        print("     elemento exato que vaza (mede no DOM renderizado real).")
    print("=" * 52)


if __name__ == "__main__":
    main()
