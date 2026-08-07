#!/usr/bin/env python3
"""
Testa TODAS as páginas no mobile (393px) com um produto no carrinho e reporta
qual página corta conteúdo (elemento mais largo que a viewport).

Uso: python3 scripts/sim_all_pages.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://www.nikkeybox-store.com"
UA = ("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36")

PAGES = ["/", "/produtos", "/ofertas", "/carrinho", "/checkout", "/frete",
         "/como-funciona", "/empresas", "/sobre", "/promocao", "/perfil"]

FIND = """() => {
  const vw = document.documentElement.clientWidth;
  const wide = [];
  for (const el of document.querySelectorAll('*')) {
    const st = getComputedStyle(el);
    if (st.display==='none'||st.visibility==='hidden') continue;
    if (el.closest('.animate-marquee')) continue;  // marquee é intencional
    // ignora elementos dentro de um ancestral com overflow hidden/clip
    // (blobs decorativos não causam scroll real)
    let clipped = false, a = el.parentElement;
    while (a) { const as = getComputedStyle(a);
      if (as.overflowX==='hidden'||as.overflowX==='clip'||as.overflow==='hidden'){clipped=true;break;}
      a = a.parentElement; }
    if (clipped) continue;
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1) {
      let cw=false;
      for (const c of el.children){ if(c.getBoundingClientRect().width>vw+1){cw=true;break;} }
      if(!cw) wide.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className.toString?el.className.toString():'').slice(0,65),
        w: Math.round(r.width),
        txt: (el.textContent||'').trim().slice(0,35),
      });
    }
  }
  return { vw, scrollW: document.documentElement.scrollWidth, wide: wide.slice(0,6) };
}"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 393, "height": 850},
                            device_scale_factor=2.75, user_agent=UA,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()

        # adiciona 1 produto ao carrinho
        pg.goto(BASE + "/produtos", wait_until="domcontentloaded", timeout=25000)
        pg.wait_for_timeout(3500)
        for btn in pg.query_selector_all("button"):
            if "carrinho" in (btn.text_content() or "").lower():
                btn.click(); break
        pg.wait_for_timeout(1200)

        print(f"{'PÁGINA':<18} {'scrollW':>8} {'status':>10}")
        print("─" * 42)
        problems = []
        for path in PAGES:
            try:
                pg.goto(BASE + path, wait_until="domcontentloaded", timeout=25000)
                pg.wait_for_timeout(3000)
                r = pg.evaluate(FIND)
                over = r["scrollW"] > r["vw"] + 1 or len(r["wide"]) > 0
                status = "❌ CORTA" if over else "✅ ok"
                print(f"{path:<18} {r['scrollW']:>8} {status:>10}")
                if r["wide"]:
                    for it in r["wide"]:
                        print(f"     └ w={it['w']} <{it['tag']}> .{it['cls']}  {it['txt']!r}")
                    problems.append(path)
            except Exception as e:
                print(f"{path:<18} {'?':>8}  ⚠️ {str(e)[:30]}")

        print("─" * 42)
        if problems:
            print(f"❌ Páginas com corte: {', '.join(problems)}")
        else:
            print("✅ TODAS as páginas enquadradas no mobile!")
        b.close()


if __name__ == "__main__":
    main()
