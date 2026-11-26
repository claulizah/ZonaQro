#!/usr/bin/env node
/* Pruebas del material para compartir (A.4): enlaces ?zona=, textos para grupos vecinales (admin → Compartir), botón "Compartir mi ficha",
   páginas por zona con su imagen og y las imágenes. Supabase y WhatsApp van simulados (nada sale a internet). Uso: node tests/compartir.js */
const { chromium } = require("playwright"), fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const RAIZ = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
const MACROS = eval(html.match(/const MACROS = (\[[\s\S]*?\n\]);/)[1]);
const ZONAS = MACROS.reduce((a, m) => a.concat(m.zonas), []);
const slug = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "zona";
const fallos = []; let pruebas = 0;
const ok = (c, m) => { pruebas++; if(!c){ fallos.push(m); console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const L = "Descripción suficientemente larga para pasar el mínimo de la ficha.";
let k = 0;
const neg = (nombre, zona, extra = {}) => Object.assign({ id: "n-" + (k++), nombre, estado: "aprobado", tipo: "local", categoria: "gastronomia", zonas: [zona], descripcion: L, whatsapp: "44212345" + String(10 + k), horarios: { lun: ["09:00", "20:00"] }, horario: "", alta: "2026-01-10", clics: 0, cupones: [], fotos: [], origen: "registro", verificado: false, referencia: false, seguimiento: "sin_contactar", created_at: "2026-11-01T10:00:00Z" }, extra);
const NEG = [neg("Tacos Uno", "Zibatá"), neg("Tacos Dos", "Zibatá"), neg("Tacos Tres", "Zibatá"), neg("Café Zakia", "Zakia")];
const FICHA = (estado) => ({ id: "n-ficha1", nombre: "Pastelería Lupita", tipo: "local", categoria: "tienda", estado, descripcion: "Pasteles y postres por encargo, hechos cada mañana.", direccion: "Calle Uno 12", horario: "", horarios: { lun: ["09:00", "18:00"] }, redes: "", entrega: "", sitio_web: "", fotos: [], resenas: [] });
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

async function pagina(browser, vp, o = {}){
  const ctx = await browser.newContext({ viewport: vp, permissions: ["clipboard-read", "clipboard-write"] }), p = await ctx.newPage(), s = { errores: [], rpc: [], abiertos: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource|404/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  ctx.on("page", async w => { await w.waitForLoadState("domcontentloaded").catch(() => {}); s.abiertos.push(w.url()); await w.close().catch(() => {}); });
  if(o.admin) await p.addInitScript(() => { try{ sessionStorage.setItem("zq_tok", "token-de-admin"); }catch(e){} });
  const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" }));
  await p.route("https://zonaqro.com/**", r => { const u = r.request().url(); r.fulfill(u.includes("/rest/") ? json([]) : /\/og\/.*\.png/.test(u) ? { status: 200, contentType: "image/png", body: fs.readFileSync(path.join(RAIZ, "og", u.split("/og/")[1].split("?")[0])) } : { status: 200, contentType: "text/html", body: html }); });
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/**", r => r.fulfill(json([])));
  await p.route("**/rest/v1/negocios*", r => r.fulfill(json(NEG)));
  await p.route("**/rest/v1/rpc/ficha_por_token", r => r.fulfill(json(FICHA(o.estado || "aprobado"))));
  await p.route("**/rest/v1/rpc/registrar_evento", r => { s.rpc.push(JSON.parse(r.request().postData())); r.fulfill(json(null)); });
  await p.goto("https://zonaqro.com/" + (o.query || "") + (o.hash || "#directorio")); await p.waitForTimeout(900);
  return { ctx, p, s };
}

async function casos(browser, nombre, vp){
  console.log("\n== " + nombre);
  { console.log(" Enlaces ?zona=");
    const a = await pagina(browser, vp, { query: "?zona=" + encodeURIComponent("Zibatá") });
    ok((await a.p.inputValue("#miZona")) === "Zibatá", "?zona=Zibatá deja elegida la zona");
    ok(JSON.parse(await a.p.evaluate(() => localStorage.getItem("zq_zona"))) === "Zibatá", "y se recuerda para la próxima visita"); await a.ctx.close();
    const b = await pagina(browser, vp, { query: "?zona=Marte" });
    ok((await b.p.inputValue("#miZona")) === "", "una zona que no existe se ignora"); await b.ctx.close();
    const c = await pagina(browser, vp, { query: "?zona=Juriquilla" });
    ok(/Faltan \d para activar Juriquilla/.test(await c.p.textContent("#app")), "una zona aún inactiva muestra el aviso 'Faltan N para activar'"); await c.ctx.close();
    const d = await pagina(browser, vp, { query: "?zona=Zibat%C3%A1&utm_source=grupo&utm_medium=vecinal&utm_campaign=vec-zibata", hash: "#negocios" });
    ok(d.s.rpc.some(x => x.p_tipo === "utm_visita" && x.p_ref === "grupo|vecinal|vec-zibata"), "la ola (utm) llega junto con la zona"); await d.ctx.close(); }
  { console.log(" Admin → Compartir");
    const { ctx, p, s } = await pagina(browser, vp, { admin: true, hash: "#admin" });
    await p.waitForSelector('[data-atab="compartir"]'); await p.click('[data-atab="compartir"]'); await p.waitForTimeout(300);
    const vec = () => p.inputValue("#comp-vec"), negT = () => p.inputValue("#comp-neg");
    let t = await vec();
    ok(/gratuito/.test(t) && /sin costo/.test(t) && /Zibatá/.test(t), "el texto para vecinos aclara que es gratuito y menciona la zona (" + t.length + " caracteres)");
    ok(/gratuito/.test(await negT()) && /no cuesta nada/.test(await negT()), "el texto para negocios también");
    ok(!EMOJI.test(t + await negT()) && t.length < 450, "sin emojis y corto (menos de 450 caracteres)");
    ok(/https:\/\/zonaqro\.com\/z\/zibata\/\?utm_source=grupo&utm_medium=vecinal&utm_campaign=vec-zibata$/.test(t), "el enlace va a la página de la zona con utm_source=grupo y utm_medium=vecinal");
    await p.fill("#comp-camp", "Ola 3!"); await p.waitForTimeout(200);
    ok(/utm_campaign=ola3$/.test(await vec()) && /utm_campaign=ola3$/.test(await negT()), "la ola que escribes se limpia ('Ola 3!' → ola3) y se usa en los dos textos, al momento");
    ok(/ola3$/.test(await p.textContent("#comp-vec-n").then(() => vec())), "los textos cambian sin repintar la pantalla");
    await p.click("#comp-camp"); await p.keyboard.press("Tab"); await p.waitForTimeout(200);
    ok((await p.inputValue("#comp-camp")) === "ola3", "al salir del campo, la ola se ve ya limpia");
    await p.fill("#comp-camp", ""); await p.waitForTimeout(150); await p.keyboard.press("Tab");
    await p.click("[data-cop='comp-vec']"); await p.waitForTimeout(300);
    ok((await p.evaluate(() => navigator.clipboard.readText())) === await vec(), "'Copiar texto' deja el texto en el portapapeles");
    await p.selectOption("#comp-zona", "Juriquilla"); await p.waitForTimeout(300);
    ok(/todavía no está activa/.test(await p.textContent("#app")), "una zona inactiva avisa que su página invita a registrar negocios");
    ok(/z\/juriquilla\/\?utm_source=grupo&utm_medium=vecinal&utm_campaign=vec-juriquilla$/.test(await vec()), "al cambiar de zona cambian los textos y el enlace");
    let todas = true, detalle = "";
    for(const z of ZONAS){ await p.selectOption("#comp-zona", z); await p.waitForTimeout(60); const u = new URL((await vec()).split("\n")[1]), n = new URL((await negT()).split("\n")[1]);
      for(const x of [u, n]){ const g = x.searchParams; if(!(g.get("utm_source").length <= 20 && g.get("utm_medium").length <= 12 && g.get("utm_campaign").length <= 24 && x.pathname === "/z/" + slug(z) + "/")){ todas = false; detalle = z; } } }
    ok(todas, "en las " + ZONAS.length + " zonas, el enlace apunta a su página y las etiquetas caben en los límites del sitio (20, 12 y 24 letras)" + (detalle ? " — falla " + detalle : ""));
    const src = await p.getAttribute("#app img[src^='og/']", "src"); ok(!!src && fs.existsSync(path.join(RAIZ, src)), "muestra y ofrece descargar la imagen de la zona");
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" Compartir mi ficha (edición por enlace)");
    const { ctx, p, s } = await pagina(browser, vp, { hash: "#editar-" + "a".repeat(64) });
    await p.waitForSelector("#fEdit");
    ok(await p.isVisible("#comp-mi"), "la ficha publicada muestra 'Comparte tu ficha'");
    const t = await p.inputValue("#comp-mi-txt");
    ok(/gratuito/.test(t) && /https:\/\/zonaqro\.com\/\?utm_source=compartir&utm_medium=negocio&utm_campaign=mi-ficha#n-n-ficha1$/.test(t), "el texto es corto, aclara que es gratuito y enlaza a su ficha con utm_source=compartir");
    await p.click("[data-comp-mi]"); await p.waitForTimeout(800);
    ok(s.abiertos.some(u => u.startsWith("https://wa.me/") && decodeURIComponent(u).includes("#n-n-ficha1")), "'Compartir mi ficha' abre WhatsApp con el texto y el enlace");
    ok(s.rpc.some(x => x.p_tipo === "compartir" && x.p_ref === "n:n-ficha1"), "se cuenta como compartido");
    await p.click("[data-cop='comp-mi-txt']"); await p.waitForTimeout(300);
    ok((await p.evaluate(() => navigator.clipboard.readText())) === t, "'Copiar texto' funciona también aquí"); await ctx.close();
    const r = await pagina(browser, vp, { hash: "#editar-" + "a".repeat(64), estado: "pendiente" });
    await r.p.waitForSelector("#fEdit");
    ok(/Cuando tu ficha esté publicada/.test(await r.p.textContent("#comp-mi")) && (await r.p.$$("[data-comp-mi]")).length === 0, "si la ficha aún no está publicada, no ofrece compartir"); await r.ctx.close(); }
}

async function paginasYImagenes(browser){
  console.log("\n== Páginas por zona e imágenes (generador)");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zq-zonas-")), datos = path.join(dir, "datos.json");
  const base = (id, n, z, ex = {}) => Object.assign({ id, nombre: n, categoria: "gastronomia", tipo: "local", zonas: [z], descripcion: L, whatsapp: "4429876543", horario: "9 a 6", horarios: null, estado: "aprobado", direccion: "Calle 1", referencia: false, alta: "2026-01-01" }, ex);
  fs.writeFileSync(datos, JSON.stringify([base("a", "Tacos Uno", "Zibatá"), base("b", "Tacos Dos", "Zibatá"), base("c", "Tacos Tres", "Zibatá"),                       // Zibatá: 3 completas → activa
    base("d", "Café Uno", "Zakia"), base("e", "Café Dos", "Zakia"), base("f", "Café Tres sin horario", "Zakia", { horario: "" }),                              // Zakia: 2 completas y 1 sin horario → no activa
    base("g", "Lugar", "Juriquilla", { referencia: true, whatsapp: "" }), base("h", "Sin WhatsApp", "Juriquilla", { whatsapp: "" })]));
  const corre = salida => cp.execFileSync(process.execPath, [path.join(RAIZ, "scripts", "generar-paginas.js"), "--datos", datos, "--salida", salida], { encoding: "utf8" });
  const s1 = path.join(dir, "s1"), s2 = path.join(dir, "s2"); fs.mkdirSync(s1); fs.mkdirSync(s2);
  corre(s1); corre(s2);
  const leer = (d, z) => fs.readFileSync(path.join(d, "z", slug(z), "index.html"), "utf8");
  ok(ZONAS.every(z => fs.existsSync(path.join(s1, "z", slug(z), "index.html"))), "hay una página para cada una de las " + ZONAS.length + " zonas");
  const titulos = ZONAS.map(z => leer(s1, z).match(/<title>([^<]*)<\/title>/)[1]), descs = ZONAS.map(z => leer(s1, z).match(/name="description" content="([^"]*)"/)[1]);
  ok(new Set(titulos).size === ZONAS.length && new Set(descs).size === ZONAS.length, "títulos y descripciones únicos en cada zona");
  ok(ZONAS.every(z => leer(s1, z).includes(`<link rel="canonical" href="https://zonaqro.com/z/${slug(z)}/">`)), "cada página tiene su dirección canónica");
  const pngs = ZONAS.map(z => path.join(RAIZ, "og", slug(z) + ".png"));
  ok(pngs.every(f => fs.existsSync(f)), "cada zona tiene su imagen en og/");
  ok(ZONAS.every(z => leer(s1, z).includes(`<meta property="og:image" content="https://zonaqro.com/og/${slug(z)}.png">`) && leer(s1, z).includes('name="twitter:card" content="summary_large_image"')), "cada página apunta a la imagen de su zona (dirección completa) y pide la tarjeta grande");
  const dims = f => { const b = fs.readFileSync(f); return b.slice(1, 4).toString() === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20), b.length] : [0, 0, b.length]; };
  ok(pngs.every(f => { const [w, h, n] = dims(f); return w === 1200 && h === 630 && n < 250000; }), "las imágenes miden 1200 x 630 y pesan menos de 250 KB");
  const zi = leer(s1, "Zibatá"), zk = leer(s1, "Zakia");
  ok(!/noindex/.test(zi) && /href="https:\/\/zonaqro\.com\/\?zona=Zibat%C3%A1#directorio"/.test(zi) && /3 negocios/.test(zi), "una zona activa (3 fichas completas) se indexa y lleva a sus negocios");
  ok(/noindex/.test(zk) && /\?zona=Zakia#negocios/.test(zk) && /Próximamente|llega pronto/i.test(zk) && !/\d+ negocios/.test(zk), "una zona con 2 completas + 1 sin horario no está activa: noindex, invita a registrarse y no presume cifras");
  const sm = fs.readFileSync(path.join(s1, "sitemap.xml"), "utf8");
  ok(sm.includes("https://zonaqro.com/z/zibata/") && !sm.includes("/z/zakia/") && !sm.includes("/z/juriquilla/"), "el sitemap solo incluye las zonas activas");
  ok(ZONAS.every(z => !/4429876543|Tacos Uno|Café Uno/.test(leer(s1, z))), "las páginas de zona no publican nombres ni teléfonos de negocios");
  ok(ZONAS.every(z => leer(s1, z) === fs.readFileSync(path.join(s2, "z", slug(z), "index.html"), "utf8")) && sm === fs.readFileSync(path.join(s2, "sitemap.xml"), "utf8"), "correrlo dos veces da exactamente lo mismo");
  // las etiquetas utm del enlace compartido se conservan en los botones de la página
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }), p = await ctx.newPage();
  await p.route("https://zonaqro.com/z/zibata/**", r => r.fulfill({ status: 200, contentType: "text/html", body: zi }));
  await p.goto("https://zonaqro.com/z/zibata/?utm_source=grupo&utm_medium=vecinal&utm_campaign=vec-zibata");
  const hrefs = await p.$$eval("a[data-utm]", a => a.map(x => x.href));
  ok(hrefs.length === 2 && hrefs.every(h => /utm_source=grupo/.test(h) && /utm_medium=vecinal/.test(h) && /utm_campaign=vec-zibata/.test(h) && /zona=Zibat/.test(h)), "los botones conservan utm_source, utm_medium y utm_campaign del enlace y la zona");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "la página de zona no se desborda en celular de 390 px"); await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await casos(browser, "celular 390 px", { width: 390, height: 800 });
  await casos(browser, "escritorio 1280 px", { width: 1280, height: 900 });
  await paginasYImagenes(browser);
  await browser.close();
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
