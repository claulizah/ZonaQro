#!/usr/bin/env node
/* Pruebas de la página para negocios (#negocios, A.2): contenido, ejemplo de ficha, registro corto, anti-spam, UTM hasta el registro
   y que #registrar siga funcionando. Supabase y WhatsApp van simulados (nada sale a internet). Uso: node tests/negocios.js */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fallos = []; let pruebas = 0;
const ok = (c, m) => { pruebas++; if(!c){ fallos.push(m); console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const UTM = "?utm_source=whatsapp&utm_medium=reclutar&utm_campaign=rec-juriquilla";
const REF = "whatsapp|reclutar|rec-juriquilla";

async function pagina(browser, vp, o = {}){
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage(), s = { errores: [], posts: [], rpc: [], abiertos: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource|400/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  ctx.on("page", async w => { await w.waitForLoadState("domcontentloaded").catch(() => {}); s.abiertos.push(w.url()); await w.close().catch(() => {}); });
  const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" }));
  await p.route("https://zonaqro.com/**", r => r.fulfill(r.request().url().includes("/rest/") ? json([]) : { status: 200, contentType: "text/html", body: html }));
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/**", r => r.fulfill(json([])));
  await p.route("**/rest/v1/negocios*", r => {
    if(r.request().method() === "POST"){ const b = JSON.parse(r.request().postData()); if(o.errorServidor){ r.fulfill(json({ code: "P0001", message: o.errorServidor }, 400)); return; } s.posts.push(b); r.fulfill({ status: 201, body: "" }); return; }
    r.fulfill(json([]));
  });
  await p.route("**/rest/v1/rpc/registrar_evento", r => { s.rpc.push(JSON.parse(r.request().postData())); r.fulfill(json(null)); });
  await p.goto("https://zonaqro.com/" + (o.query || "") + (o.hash || "#negocios")); await p.waitForSelector("#app h1"); await p.waitForTimeout(500);
  return { ctx, p, s };
}
const llenar = async (p, d = {}) => {
  await p.fill("#q-nombre", d.nombre === undefined ? "Panadería Doña Lupe" : d.nombre); await p.fill("#q-wa", d.wa === undefined ? "+52 442 123 4567" : d.wa);
  await p.selectOption("#q-zona", d.zona === undefined ? "Juriquilla" : d.zona); await p.selectOption("#q-cat", d.cat === undefined ? "gastronomia" : d.cat);
  if(d.tipo) await p.selectOption("#q-tipo", d.tipo); if(d.ok !== false) await p.check("#q-ok");
};
const enviar = async (p, espera = 2700) => { await p.waitForTimeout(espera); await p.click("#fRapido button[type=submit]"); await p.waitForTimeout(700); };
const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function casos(browser, nombre, vp){
  console.log("\n== " + nombre);
  { console.log(" Contenido");
    const { ctx, p, s } = await pagina(browser, vp);
    ok((await p.textContent("#app h1")).trim() === "Aparece gratis en ZonaQro", "conserva el título 'Aparece gratis en ZonaQro'");
    ok(/Aparece gratis en ZonaQro/.test(await p.title()), "el título de la pestaña también");
    ok((await p.$$(".ben3 li")).length === 3, "beneficios en 3 líneas");
    const t = await p.textContent("#app");
    ok(/Qué te llevas/.test(t) && /Cómo funciona/.test(t) && /Preguntas frecuentes/.test(t), "conserva 'Qué te llevas', 'Cómo funciona' y las preguntas frecuentes");
    ok(!/mimx|\$|precio|pesos/i.test(t), "no menciona mimx ni precios en una página de reclutamiento");
    const ej = await p.$(".ejemplo");
    ok(!!ej && /Ejemplo/.test(await ej.textContent()) && /inventado/.test(await ej.textContent()), "el ejemplo de ficha dice claramente que es un ejemplo y un negocio inventado");
    ok((await p.$$(".ejemplo a, .ejemplo button, .ejemplo [href]")).length === 0, "el ejemplo no tiene enlaces ni botones de verdad (no se puede confundir con un negocio real)");
    ok(await sinDesborde(p), "sin desborde horizontal");
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" Botones y #registrar");
    const { ctx, p, s } = await pagina(browser, vp);
    await p.click('[data-ir="registro-rapido"]'); await p.waitForTimeout(800);
    ok((await p.evaluate(() => document.activeElement && document.activeElement.id)) === "q-nombre", "'Regístrate gratis' lleva al formulario corto y deja el cursor en el nombre");
    const wa = await p.getAttribute("a.btn.wa", "href");
    ok(/^https:\/\/wa\.me\/52\d{10}\?text=/.test(wa), "el botón de WhatsApp abre wa.me con el número de ZonaQro y un mensaje");
    await p.click("a.btn.wa"); await p.waitForTimeout(600);
    ok(s.abiertos.some(u => /^https:\/\/wa\.me\//.test(u)), "se abre WhatsApp en otra pestaña");
    await p.click('a[href="#registrar"]'); await p.waitForSelector("#r-nombre");
    ok(/#registrar/.test(p.url()) && await p.isVisible("#fReg"), "'Abre el formulario completo' sigue llevando a #registrar");
    await p.goto("https://zonaqro.com/#registrar"); await p.waitForSelector("#fReg"); ok(await p.isVisible("#r-desc"), "#registrar abre directo con su formulario completo"); await ctx.close(); }
  { console.log(" Formulario corto");
    const { ctx, p, s } = await pagina(browser, vp);
    for(const [d, texto, que] of [[{ nombre: "" }, /nombre/, "sin nombre"], [{ nombre: "alguien@correo.com" }, /correo ni un teléfono/, "un correo como nombre"], [{ wa: "442123" }, /10 dígitos/, "WhatsApp incompleto"], [{ zona: "" }, /zona/, "sin zona"], [{ cat: "" }, /categoría/, "sin categoría"], [{ ok: false }, /términos/, "sin aceptar los términos"], [{ zona: "Todo Querétaro", tipo: "local" }, /una sola zona/, "un local en 'Todo Querétaro'"]]){
      await p.reload(); await p.waitForSelector("#fRapido"); await llenar(p, d); await p.waitForTimeout(2700); await p.click("#fRapido button[type=submit]"); await p.waitForTimeout(300);
      ok(texto.test(await p.textContent("#q-err")) && s.posts.length === 0, "avisa y no manda: " + que); }
    await p.reload(); await p.waitForSelector("#fRapido"); await llenar(p); await enviar(p);
    const f = s.posts[0] || {};
    ok(s.posts.length === 1 && f.nombre === "Panadería Doña Lupe" && f.whatsapp === "4421234567" && JSON.stringify(f.zonas) === '["Juriquilla"]' && f.categoria === "gastronomia" && f.tipo === "local", "manda nombre, WhatsApp limpio (+52 y espacios), zona, categoría y tipo");
    ok(f.estado === "pendiente" && f.descripcion === "" && /^panaderia-dona-lupe-/.test(f.id), "entra como pendiente, sin descripción (se completa después) y con id propio");
    ok(!("token_edicion" in f) && !("notas" in f) && !("seguimiento" in f) && !("interes_mimx" in f), "no manda campos de uso interno ni de mimx");
    ok(/Recibimos tu solicitud/.test(await p.textContent("#app")), "muestra la pantalla de gracias");
    ok(s.errores.length === 0, "sin errores de consola"); await ctx.close(); }
  { console.log(" Anti-spam y límites");
    const a = await pagina(browser, vp);
    await llenar(a.p); await a.p.evaluate(() => { document.getElementById("fx-q7m1").value = "http://spam"; }); await enviar(a.p);
    ok(a.s.posts.length === 0 && /Recibimos tu solicitud/.test(await a.p.textContent("#app")), "campo escondido lleno: no se manda nada y el robot ve 'gracias'");
    ok(a.s.rpc.some(x => x.p_tipo === "envio_descartado" && x.p_ref === "registro:trampa"), "se cuenta como envío descartado"); await a.ctx.close();
    const b = await pagina(browser, vp);
    await llenar(b.p); await enviar(b.p, 0);
    ok(b.s.posts.length === 0, "envío instantáneo (menos de 2.5 s): no se manda"); await b.ctx.close();
    const c = await pagina(browser, vp, { errorServidor: "Hay muchos envíos en este momento. Intenta de nuevo en un rato." });
    await llenar(c.p); await enviar(c.p);
    ok(/muchos envíos/.test(await c.p.textContent("#q-err")), "si el servidor pone un límite, la persona ve el motivo");
    ok(c.s.rpc.some(x => x.p_tipo === "tope_envios"), "y queda registrado para el aviso del admin"); await c.ctx.close(); }
  { console.log(" Medición por ola (utm) hasta el registro");
    const { ctx, p, s } = await pagina(browser, vp, { query: UTM });
    ok(s.rpc.some(x => x.p_tipo === "utm_visita" && x.p_ref === REF), "la visita llega con la etiqueta " + REF);
    ok(s.rpc.some(x => x.p_tipo === "registro_vista"), "cuenta que abrieron un formulario de registro");
    await llenar(p); await enviar(p);
    ok(s.rpc.some(x => x.p_tipo === "registro_inicio"), "cuenta que empezaron");
    ok(s.rpc.filter(x => x.p_tipo === "registro_envio").length === 1 && s.rpc.some(x => x.p_tipo === "utm_registro" && x.p_ref === REF), "al enviar, el registro queda atribuido a la ola (" + REF + ")"); await ctx.close();
    const r = await pagina(browser, vp, { query: UTM });
    await r.p.click('a[href="#registrar"]'); await r.p.waitForSelector("#r-nombre");
    await r.p.fill("#r-nombre", "Pasteles de prueba"); await r.p.check("#tipo-emprendimiento"); await r.p.selectOption("#r-cat", "tienda"); await r.p.check("#z-Zakia");
    await r.p.fill("#r-desc", "Pasteles y postres por encargo, entrega a domicilio en la zona."); await r.p.fill("#r-ent", "Entrega sin costo"); await r.p.fill("#r-wa", "4421234567"); await r.p.check("#r-ok");
    await r.p.waitForTimeout(2700); await r.p.click("#fReg button[type=submit]"); await r.p.waitForTimeout(700);
    ok(r.s.rpc.some(x => x.p_tipo === "utm_registro" && x.p_ref === REF), "si pasa al formulario completo, la ola se conserva hasta el registro"); await r.ctx.close(); }
}

(async () => {
  const browser = await chromium.launch();
  await casos(browser, "celular 390 px", { width: 390, height: 800 });
  await casos(browser, "escritorio 1280 px", { width: 1280, height: 900 });
  await browser.close();
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
