#!/usr/bin/env node
/* Genera la imagen para compartir (og) de cada zona: og/<zona>.png, de 1200 x 630.
   Estilo editorial: fondo crema, tipografía con serifa y un solo acento verde. Sin degradados ni emojis.
   Uso:  npm i playwright && npx playwright install chromium   (una vez)
         node scripts/generar-og.js [--salida carpeta]
   Corre a mano cuando cambie la lista de zonas o el diseño; las imágenes se guardan en el repo (no se generan a diario). */
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const RAIZ = path.resolve(__dirname, ".."), SAL = path.resolve(arg("--salida") || path.join(RAIZ, "og"));
const src = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
const MACROS = eval(src.match(/const MACROS = (\[[\s\S]*?\n\]);/)[1]);
const slug = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "zona";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const html = (zona, macro) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#F4EFE3;color:#17231C;font-family:"Liberation Serif","Times New Roman",Georgia,"DejaVu Serif",serif;position:relative;overflow:hidden}
.marca{position:absolute;left:72px;top:60px;font-size:40px;font-weight:700;color:#2C674B;letter-spacing:.5px}
.macro{position:absolute;right:72px;top:68px;font-size:26px;letter-spacing:3px;text-transform:uppercase;color:#56665B}
.centro{position:absolute;left:72px;right:72px;top:176px}
.pre{font-size:38px;color:#56665B;margin-bottom:10px}
.zona{font-size:${zona.length > 14 ? 104 : 128}px;line-height:1.02;font-weight:700;color:#17231C}
.regla{width:120px;height:8px;background:#2C674B;margin:34px 0 28px}
.sub{font-size:32px;line-height:1.3;color:#17231C;max-width:1056px}
.pie{position:absolute;left:72px;right:72px;bottom:56px;display:flex;justify-content:space-between;font-size:30px;color:#2C674B;font-weight:700}
.pie span:last-child{color:#56665B;font-weight:400}
</style></head><body>
<div class="marca">ZonaQro</div><div class="macro">${esc(macro)}</div>
<div class="centro"><div class="pre">Negocios y servicios en</div><div class="zona">${esc(zona)}</div><div class="regla"></div>
<div class="sub">Directorio gratuito de Querétaro. Contacto directo por WhatsApp.</div></div>
<div class="pie"><span>zonaqro.com</span><span>Gratis para negocios y vecinos</span></div>
</body></html>`;

(async () => {
  fs.mkdirSync(SAL, { recursive: true });
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  let n = 0;
  for(const m of MACROS) for(const z of m.zonas){
    await page.setContent(html(z, m.nombre)); await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(SAL, slug(z) + ".png"), type: "png" }); n++;
  }
  await browser.close();
  console.log(n + " imágenes en " + SAL);
})().catch(e => { console.error(e.message); process.exit(1); });
