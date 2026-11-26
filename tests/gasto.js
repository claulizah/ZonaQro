#!/usr/bin/env node
/* Pruebas del tablero de gasto de campañas (admin → Gasto). Supabase va simulado, incluido el tope de 1,000 filas por consulta
   que tiene Supabase por omisión (por eso el tablero pide las métricas por páginas). Uso: node tests/gasto.js */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fallos = []; let pruebas = 0;
const ok = (c, m) => { pruebas++; if(!c){ fallos.push(m); console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const J = "meta|cpc|ola1-juriquilla", C = "meta|cpc|ola1-centro-sur";
const fila = (n, tipo, ref, v) => ({ dia: dia(n), tipo, ref, n: v });
function metricas(){
  const m = [
    fila(-3, "utm_registro", J, 2), fila(-3, "utm_wa", J, 5), fila(-3, "utm_visita", J, 20),
    fila(-2, "utm_registro", J, 1), fila(-2, "utm_wa", J, 3), fila(-2, "utm_visita", J, 10),
    fila(-1, "utm_registro", J, 3), fila(-1, "utm_wa", J, 4), fila(-1, "utm_visita", J, 15),
    fila(-10, "utm_registro", J, 9), fila(-10, "utm_wa", J, 9), fila(-10, "utm_visita", J, 9),   // fuera de las fechas capturadas
    fila(-5, "utm_wa", C, 2), fila(-4, "utm_visita", C, 8),
    fila(-2, "visita", "sitio", 7), fila(-44, "visita", "sitio", 500)                            // la de hace 44 días no debe entrar a los "últimos 30 días"
  ];
  for(const d of [0, -1]) for(let i = 0; i < 650; i++) m.push(fila(d, "vista", "n-" + i, 1));      // 1,300 filas más recientes: empujan lo demás más allá de la primera página
  return m;
}
const neg = [{ id: "a1", nombre: "Uno", estado: "aprobado", tipo: "local", categoria: "gastronomia", zonas: ["Zibatá"], descripcion: "Tacos al pastor y de guisado, desde 1998.", whatsapp: "4421234567", horario: "9 a 6", fotos: [], seguimiento: "sin_contactar", created_at: new Date().toISOString() }];

async function pagina(browser, vp, o = {}){
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage();
  const s = { errores: [], gastos: (o.gastos || []).slice(), posts: [], borrados: [], pedidosMetricas: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource|404/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  await p.addInitScript(() => { try{ sessionStorage.setItem("zq_tok", "token-de-admin"); }catch(e){} });
  const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await p.route("https://zonaqro.com/**", r => r.fulfill(r.request().url().includes("/rest/") ? json([]) : { status: 200, contentType: "text/html", body: html }));
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/**", r => r.fulfill(json([]))); // lo que no se simule abajo se contesta vacío: ninguna prueba debe llegar al Supabase real
  await p.route("**/rest/v1/negocios*", r => r.fulfill(json(neg)));
  await p.route("**/rest/v1/eventos*", r => r.fulfill(json([])));
  await p.route("**/rest/v1/resenas*", r => r.fulfill(json([])));
  await p.route("**/rest/v1/ediciones*", r => r.fulfill(json([])));
  const M = metricas();
  await p.route("**/rest/v1/metricas*", r => {
    const u = new URL(r.request().url()), desde = (u.searchParams.get("dia") || "gte.0000").replace("gte.", ""), lim = Math.min(+u.searchParams.get("limit") || 1000, 1000), off = +u.searchParams.get("offset") || 0;
    s.pedidosMetricas.push(off);
    const todas = M.filter(x => x.dia >= desde).sort((a, b) => b.dia.localeCompare(a.dia) || a.tipo.localeCompare(b.tipo) || a.ref.localeCompare(b.ref));
    r.fulfill(json(todas.slice(off, off + lim)));
  });
  await p.route("**/rest/v1/gastos_campana*", r => {
    const req = r.request(), m = req.method();
    if(o.sinTabla){ r.fulfill(json({ code: "PGRST205", message: "Could not find the table 'public.gastos_campana' in the schema cache" }, 404)); return; }
    if(m === "POST"){ const b = JSON.parse(req.postData()); s.posts.push(b); s.gastos.unshift(Object.assign({ id: "g" + (s.posts.length + 100), created_at: new Date().toISOString() }, b)); r.fulfill({ status: 201, body: "" }); return; }
    if(m === "DELETE"){ const id = new URL(req.url()).searchParams.get("id").replace("eq.", ""); s.borrados.push(id); s.gastos = s.gastos.filter(g => g.id !== id); r.fulfill({ status: 204, body: "" }); return; }
    r.fulfill(json(s.gastos));
  });
  await p.route("**/rpc/**", r => r.fulfill({ status: 200, body: "null" }));
  await p.goto("https://zonaqro.com/#admin"); await p.waitForSelector('[data-atab="gasto"]'); await p.click('[data-atab="gasto"]'); await p.waitForTimeout(300);
  return { ctx, p, s };
}
const guardar = async (p, c, d, h, m) => { await p.fill("#g-campana", c); await p.fill("#g-desde", d); await p.fill("#g-hasta", h); await p.fill("#g-monto", m); await p.click("#fGasto button[type=submit]"); await p.waitForTimeout(500); };
const textoFila = (p, campana) => p.$$eval("#t-gasto tbody tr", (trs, c) => { const t = trs.find(x => x.children[0].textContent.trim().startsWith(c)); return t ? [...t.children].map(x => x.textContent.replace(/\s+/g, " ").trim()) : null; }, campana);

async function casos(browser, nombre, vp){
  console.log("\n== " + nombre);
  { console.log(" Capturar gasto y ver el costo");
    const { ctx, p, s } = await pagina(browser, vp);
    ok(/Todavía no has capturado gasto/.test(await p.textContent("#t-gasto")), "sin capturas dice 'Todavía no has capturado gasto'");
    await guardar(p, "OLA1-Juriquilla", dia(-3), dia(-2), "300");
    ok(s.posts.length === 1 && s.posts[0].campana === "ola1-juriquilla" && s.posts[0].desde === dia(-3) && s.posts[0].hasta === dia(-2) && s.posts[0].monto === 300, "guarda campaña (normalizada a minúsculas), fechas y monto");
    await guardar(p, "ola1-juriquilla", dia(-2), dia(-1), "$150.00");
    await guardar(p, "ola1-centro-sur", dia(-5), dia(-4), "200");
    ok(s.posts.length === 3, "puede capturar varias veces la misma campaña");
    const j = await textoFila(p, "ola1-juriquilla"), c = await textoFila(p, "ola1-centro-sur");
    ok(!!j && /2 capturas/.test(j[0]), "la campaña muestra '2 capturas'");
    ok(!!j && j[2] === "$450.00", "gasto = suma de las capturas ($450.00)");
    ok(!!j && j[3] === "45" && j[4] === "12" && j[5] === "6", "visitas 45, clics 12 y registros 6: solo de los días capturados (sin los 9 de hace 10 días)");
    ok(!!j && j[6] === "$75.00" && j[7] === "$37.50", "costo por registro $75.00 y por clic $37.50 (los días que se empalman no se cuentan dos veces)");
    ok(!!c && c[5] === "0" && c[6] === "—" && c[7] === "$100.00", "sin registros: costo por registro '—'; por clic $100.00");
    const t = await textoFila(p, "Total");
    ok(!!t && t[2] === "$650.00" && t[5] === "6" && t[6] === "$108.33", "total: $650.00 gastados, 6 registros, $108.33 por registro");
    if(process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, "gasto-" + vp.width + ".png"), fullPage: true });
    ok((await p.$$("#g-lista option")).length >= 2, "al escribir la campaña sugiere las que ya llegaron con UTM");
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" Métricas por páginas");
    const { ctx, s } = await pagina(browser, vp, { gastos: [{ id: "g1", campana: "ola1-juriquilla", desde: dia(-3), hasta: dia(-1), monto: 450, created_at: new Date().toISOString() }] });
    ok(s.pedidosMetricas.length >= 3, "pide las métricas en varias páginas (" + s.pedidosMetricas.length + " pedidos) aunque el servidor entregue máximo 1,000 filas");
    ok(s.pedidosMetricas[0] === 0 && s.pedidosMetricas[1] === 1000, "cada página sigue donde terminó la anterior"); await ctx.close(); }
  { console.log(" Datos correctos con lo capturado y lo guardado");
    const { ctx, p } = await pagina(browser, vp, { gastos: [{ id: "g1", campana: "ola1-juriquilla", desde: dia(-3), hasta: dia(-1), monto: 450, created_at: new Date().toISOString() }] });
    const j = await textoFila(p, "ola1-juriquilla");
    ok(!!j && j[5] === "6" && j[6] === "$75.00", "con las métricas llegadas por páginas, los 6 registros y $75.00 salen completos"); await ctx.close(); }
  { console.log(" Captura antigua no altera los últimos 30 días");
    const { ctx, p } = await pagina(browser, vp, { gastos: [{ id: "g9", campana: "vieja", desde: dia(-45), hasta: dia(-44), monto: 100, created_at: new Date().toISOString() }] });
    await p.click('[data-atab="metricas"]'); await p.waitForTimeout(300);
    const visitas = await p.$$eval(".stat", e => (e.find(x => /Visitas al sitio/.test(x.textContent)) || {}).textContent || "");
    ok(/^7/.test(visitas.trim()), "'Visitas al sitio' de Métricas cuenta 7 y no 507 (la de hace 44 días queda fuera de los 30 días)"); await ctx.close(); }
  { console.log(" Validaciones");
    const { ctx, p, s } = await pagina(browser, vp);
    await guardar(p, "ola1", dia(-1), dia(-3), "100");
    ok(/fecha final/.test(await p.textContent("#g-err")) && s.posts.length === 0, "fechas al revés: avisa y no guarda");
    await guardar(p, "ola1", dia(-3), dia(-1), "abc");
    ok(/monto/.test(await p.textContent("#g-err")) && s.posts.length === 0, "monto que no es número: avisa y no guarda");
    await guardar(p, "ola1", dia(-3), dia(-1), "0");
    ok(s.posts.length === 0, "monto cero: no guarda");
    await guardar(p, "", dia(-3), dia(-1), "100");
    ok(/campaña/.test(await p.textContent("#g-err")) && s.posts.length === 0, "sin nombre de campaña: avisa y no guarda");
    await guardar(p, "Ola 1 Juriquilla!", dia(-3), dia(-1), "1,250.50");
    ok(s.posts.length === 1 && s.posts[0].campana === "ola1juriquilla" && s.posts[0].monto === 1250.5, "limpia el nombre como el sitio arma el utm_campaign y entiende '1,250.50'"); await ctx.close(); }
  { console.log(" Borrar una captura");
    const { ctx, p, s } = await pagina(browser, vp, { gastos: [{ id: "g1", campana: "ola1-juriquilla", desde: dia(-3), hasta: dia(-1), monto: 450, created_at: new Date().toISOString() }] });
    p.once("dialog", d => d.dismiss()); await p.click("[data-gdel]"); await p.waitForTimeout(300);
    ok(s.borrados.length === 0, "si cancelas la confirmación, no se borra");
    p.once("dialog", d => { ok(/No se puede deshacer/.test(d.message()), "la confirmación avisa que no se puede deshacer"); d.accept(); }); await p.click("[data-gdel]"); await p.waitForTimeout(600);
    ok(s.borrados.length === 1 && s.borrados[0] === "g1", "si confirmas, se borra esa captura");
    ok(/Todavía no has capturado gasto/.test(await p.textContent("#t-gasto")), "el tablero se actualiza"); await ctx.close(); }
  { console.log(" Si falta la sección 32");
    const { ctx, p } = await pagina(browser, vp, { sinTabla: true });
    ok(/sección 32/.test(await p.textContent("#app")), "avisa que falta correr la sección 32"); await ctx.close(); }
}

(async () => {
  const browser = await chromium.launch();
  await casos(browser, "celular 390 px", { width: 390, height: 800 });
  await casos(browser, "escritorio 1280 px", { width: 1280, height: 900 });
  await browser.close();
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
