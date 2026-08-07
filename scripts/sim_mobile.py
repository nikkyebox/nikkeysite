#!/usr/bin/env python3
"""
Simulador mobile real (Playwright/Chromium).

Abre o site simulando um celular, mede o DOM RENDERIZADO e lista os elementos
que ultrapassam a largura da viewport (causa do desenquadramento / scroll-x).
Também tira screenshot de cada página.

Uso:
  python3 scripts/sim_mobile.py                 # páginas padrão
  python3 scripts/sim_mobile.py /carrinho       # uma página específica
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "https://www.nikkeybox-store.com"
VIEWPORT = {"width": 412, "height": 915}   # Pixel 7
DPR = 2.625
UA = ("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36")

PAGES = sys.argv[1:] or ["/", "/produtos", "/carrinho", "/frete", "/checkout"]

# JS injetado: acha todos os elementos mais largos que a viewport
FIND_OVERFLOW_JS = """
() => {
  const vw = document.documentElement.clientWidth;
  const docW = document.documentElement.scrollWidth;
  const offenders = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    // vaza pela direita ou tem largura maior que a viewport
    if (r.right > vw + 1 || r.width > vw + 1) {
      // ignora elementos invisíveis
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 90),
        id: el.id || '',
        right: Math.round(r.right),
        width: Math.round(r.width),
        left: Math.round(r.left),
      });
    }
  }
  // mantém só os "mais externos" e os mais largos
  offenders.sort((a, b) => b.right - a.right);
  return { vw, docW, hasOverflow: docW > vw + 1, offenders: offenders.slice(0, 25) };
}
"""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=DPR,
            user_agent=UA,
            is_mobile=True,
            has_touch=True,
        )
        page = ctx.new_page()

        for path in PAGES:
            url = BASE + path
            print(f"\n{'='*60}\n📱 {url}\n{'='*60}")
            try:
                page.goto(url, wait_until="networkidle", timeout=30000)
            except Exception as e:
                print(f"  ⚠️ load: {e}")
                page.wait_for_timeout(3000)

            page.wait_for_timeout(1500)  # deixa o app hidratar

            res = page.evaluate(FIND_OVERFLOW_JS)
            print(f"  viewport={res['vw']}px  scrollWidth={res['docW']}px  "
                  f"overflow={'❌ SIM' if res['hasOverflow'] else '✅ não'}")

            if res["offenders"]:
                print(f"  Elementos que vazam (right > {res['vw']}px):")
                for o in res["offenders"]:
                    print(f"    • <{o['tag']}> right={o['right']} w={o['width']} "
                          f"left={o['left']}  .{o['cls']}")
            else:
                print("  ✅ nenhum elemento vaza da viewport")

            # screenshot
            shot = f"/tmp/sim_{path.strip('/').replace('/','_') or 'home'}.png"
            page.screenshot(path=shot, full_page=False)
            print(f"  📸 {shot}")

        browser.close()


if __name__ == "__main__":
    main()
