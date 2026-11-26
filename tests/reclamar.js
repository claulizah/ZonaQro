#!/usr/bin/env node
/* Pruebas de "Reclamar ficha" (A.3): el dueño reclama una ficha agregada por ZonaQro, la administradora confirma por WhatsApp y al aprobar
   queda verificada. Supabase y WhatsApp van simulados (nada sale a internet). Uso: node tests/reclamar.js */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fallos = []; let pruebas = 0;
const ok = (c, m) => { pruebas++; if(!c){ fallos.push(m); console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const base = { categoria: "gastronomia", tipo: "local", estado: "aprobado", zonas: ["Zibatá"], descripcion: "Tacos al pastor y de guisado, desde 1998 en el barrio.", horarios: {}, fotos: [], cupones: [], clics: 0, alta: "2026-01-10" };
const NEG = [
  Object.assign({ id: "zq1", nombre: "Tacos Don Pepe", whatsapp: "4421110001", origen: "zonaqro", verificado: false, token_edicion: "t".repeat(64), seguimiento: "sin_contactar", created_at: "2026-11-01T10:00:00Z" }, base),
  Object.assign({ id: "zq2", nombre: "Café Verificado", whatsapp: "4421110002", origen: "zonaqro", verificado: true, token_edicion: "v".repeat(64), seguimiento: "sin_contactar", created_at: "2026-11-01T10:00:00Z" }, base),
  Object.assign({ id: "reg1", nombre: "Se Registró Solo", whatsapp: "4421110003", origen: "registro", verificado: false, token_edicion: "r".repeat(64), seguimiento: "sin_contactar", created_at: "2026-11-01T10:00:00Z" }, base),
  Object.assign({ id: "ref1", nombre: "Lugar de Referencia", whatsapp: "", origen: "zonaqro", verificado: false, referencia: true, seguimiento: "sin_contactar", created_at: "2026-11-01T10:00:00Z" }, base),
  Object.assign({ id: "xss1", nombre: "<img src=x onerror=window.__xss=1>", whatsapp: "4421110005", origen: "zonaqro", verificado: false, token_edicion: "x".repeat(64), seguimiento: "sin_contactar", created_at: "2026-11-01T10:00:00Z" }, base)
];
const rec = (id, extra = {}) => Object.assign({ id, negocio_id: "zq1", whatsapp: "4429990001", nombre: "Ana", estado: "pendiente", nota: "", created_at: "2026-11-20T10:00:00Z", resuelto_at: null }, extra);

async function pagina(browser, vp, o = {}){
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage();
  const s = { errores: [], posts: [], patchNeg: [], patchRec: [], reclamos: (o.reclamos || []).map(x => Object.assign({}, x)), abiertos: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource|404|400|409/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  ctx.on("page", async w => { await w.waitForLoadState("domcontentloaded").catch(() => {}); s.abiertos.push(w.url()); await w.close().catch(() => {}); });
  if(o.admin) await p.addInitScript(() => { try{ sessionStorage.setItem("zq_tok", "token-de-admin"); }catch(e){} });
  const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" }));
  await p.route("https://zonaqro.com/**", r => r.fulfill(r.request().url().includes("/rest/") ? json([]) : { status: 200, contentType: "text/html", body: html }));
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/**", r => r.fulfill(json([])));
  await p.route("**/rest/v1/negocios*", r => {
    const req = r.request();
    if(req.method() === "PATCH"){ const id = new URL(req.url()).searchParams.get("id").replace("eq.", ""), b = JSON.parse(req.postData()); s.patchNeg.push(Object.assign({ id }, b)); const n = NEG.find(x => x.id === id); r.fulfill(json(n ? [Object.assign({}, n, b)] : [])); return; }
    r.fulfill(json(o.admin ? NEG : NEG.filter(x => x.estado === "aprobado")));
  });
  await p.route("**/rest/v1/reclamos*", r => {
    const req = r.request(), m = req.method();
    if(o.sinTabla){ r.fulfill(json({ code: "PGRST205", message: "Could not find the table 'public.reclamos' in the schema cache" }, 404)); return; }
    if(m === "POST"){ if(o.errorPost){ r.fulfill(json(o.errorPost.cuerpo, o.errorPost.status)); return; } const b = JSON.parse(req.postData()); s.posts.push(b); r.fulfill({ status: 201, body: "" }); return; }
    if(m === "PATCH"){ const id = new URL(req.url()).searchParams.get("id").replace("eq.", ""), b = JSON.parse(req.postData()); s.patchRec.push(Object.assign({ id }, b)); const x = s.reclamos.find(y => y.id === id); if(x) Object.assign(x, b); r.fulfill({ status: 204, body: "" }); return; }
    r.fulfill(json(s.reclamos));
  });
  await p.route("**/rpc/**", r => r.fulfill({ status: 200, body: "null" }));
  await p.goto("https://zonaqro.com/" + (o.hash || "#directorio")); await p.waitForTimeout(900);
  return { ctx, p, s };
}
const abrirFicha = async (p, id) => { await p.goto("about:blank"); await p.goto("https://zonaqro.com/#n-" + id); await p.waitForSelector("#app h1"); await p.waitForTimeout(500); };
const llenar = async (p, d = {}) => { await p.click("#reclamo summary"); await p.fill("#rm-nombre", d.nombre === undefined ? "Ana" : d.nombre); await p.fill("#rm-wa", d.wa === undefined ? "+52 442 123 4567" : d.wa); if(d.ok !== false) await p.check("#rm-ok"); };
const enviar = async (p, espera = 2700) => { await p.waitForTimeout(espera); await p.click("#fReclamo button[type=submit]"); await p.waitForTimeout(600); };
const irAdmin = async p => { await p.waitForSelector('[data-atab="reclamos"]'); await p.click('[data-atab="reclamos"]'); await p.waitForTimeout(300); };

async function casos(browser, nombre, vp){
  console.log("\n== " + nombre);
  { console.log(" Ficha pública");
    const { ctx, p, s } = await pagina(browser, vp);
    await abrirFicha(p, "zq1");
    ok(await p.isVisible("#reclamo summary") && /¿Es tu negocio\? Reclámalo/.test(await p.textContent("#reclamo summary")), "una ficha agregada por ZonaQro ofrece '¿Es tu negocio? Reclámalo'");
    for(const [id, que] of [["zq2", "ya verificada"], ["reg1", "registrada por su dueño"], ["ref1", "lugar de referencia"]]){ await abrirFicha(p, id); ok((await p.$$("#reclamo")).length === 0, "no se ofrece en una ficha " + que); }
    await abrirFicha(p, "zq2"); ok(/Verificado/.test(await p.textContent("#app")), "la ficha verificada muestra su marca de verificado");
    await abrirFicha(p, "xss1"); ok(!(await p.evaluate(() => window.__xss)) && (await p.$$("#app h1 img")).length === 0, "un nombre con HTML se muestra como texto");
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" Enviar un reclamo");
    const { ctx, p, s } = await pagina(browser, vp);
    for(const [d, texto, que] of [[{ wa: "442" }, /10 dígitos/, "WhatsApp incompleto"], [{ ok: false }, /privacidad/, "sin aceptar el aviso de privacidad"]]){
      await abrirFicha(p, "zq1"); await llenar(p, d); await p.waitForTimeout(2700); await p.click("#fReclamo button[type=submit]"); await p.waitForTimeout(300);
      ok(texto.test(await p.textContent("#rm-err")) && s.posts.length === 0, "avisa y no manda: " + que); }
    await abrirFicha(p, "zq1"); await llenar(p); await enviar(p);
    ok(s.posts.length === 1 && s.posts[0].negocio_id === "zq1" && s.posts[0].whatsapp === "4421234567" && s.posts[0].nombre === "Ana", "manda la ficha, el WhatsApp limpio (+52 y espacios) y el nombre");
    ok(Object.keys(s.posts[0]).sort().join() === "negocio_id,nombre,whatsapp", "no manda estado, notas ni fechas: los pone la base");
    const t = await p.textContent("#app");
    ok(/Recibimos tu reclamo/.test(t) && /no cambiamos nada/.test(t), "avisa que se recibió y que no cambia nada mientras se confirma");
    ok(!/4421234567|442 123 4567/.test(t), "el número de quien reclama no se muestra en la página");
    await ctx.close(); }
  { console.log(" Anti-spam y errores");
    const a = await pagina(browser, vp);
    await abrirFicha(a.p, "zq1"); await llenar(a.p); await a.p.evaluate(() => { document.getElementById("fx-r2n5").value = "http://spam"; }); await enviar(a.p);
    ok(a.s.posts.length === 0 && /Recibimos tu reclamo/.test(await a.p.textContent("#app")), "campo escondido lleno: no se manda nada y el robot ve 'gracias'"); await a.ctx.close();
    const b = await pagina(browser, vp);
    await abrirFicha(b.p, "zq1"); await llenar(b.p); await enviar(b.p, 0);
    ok(b.s.posts.length === 0, "envío instantáneo (menos de 2.5 s): no se manda"); await b.ctx.close();
    for(const [cuerpo, status, patron, que] of [[{ code: "P0001", message: "Hay muchos envíos en este momento. Intenta de nuevo en un rato." }, 400, /muchos envíos/, "tope por hora"], [{ code: "23505", message: 'duplicate key value violates unique constraint "reclamos_pendiente_uq"' }, 409, /Ya recibimos tu reclamo/, "reclamo repetido"], [{ code: "PGRST205", message: "Could not find the table 'public.reclamos' in the schema cache" }, 404, /Reclámalo por WhatsApp/, "la base todavía sin la sección 34"]]){
      const c = await pagina(browser, vp, { errorPost: { cuerpo, status } });
      await abrirFicha(c.p, "zq1"); await llenar(c.p); await enviar(c.p);
      ok(patron.test(await c.p.textContent("#rm-err")), "mensaje claro: " + que);
      if(status === 404){ const href = await c.p.getAttribute("#rm-err a", "href"); ok(/^https:\/\/wa\.me\/52\d{10}\?text=/.test(href) && /Tacos%20Don%20Pepe/.test(href), "ofrece reclamar por WhatsApp con el nombre del negocio"); }
      await c.ctx.close(); } }
  { console.log(" Admin: revisar y aprobar");
    const { ctx, p, s } = await pagina(browser, vp, { admin: true, hash: "#admin", reclamos: [rec("r1"), rec("r2", { negocio_id: "zq2", whatsapp: "4429990002", nombre: "", estado: "aprobado", resuelto_at: "2026-11-21T10:00:00Z" })] });
    await p.waitForSelector('[data-atab="reclamos"]');
    ok(/1/.test(await p.textContent('[data-atab="reclamos"]')), "la pestaña Reclamos muestra cuántos hay pendientes");
    await p.click('[data-atab="solicitudes"]'); await p.waitForTimeout(200);
    ok(/1 reclamos de fichas por revisar/.test(await p.textContent(".notice")), "'Hoy toca' los cuenta");
    await irAdmin(p);
    const t = await p.textContent("#app");
    ok(/Reclamo pendiente/.test(t) && /Tacos Don Pepe/.test(t) && /Ana/.test(t) && /442 999 0001/.test(t), "el reclamo sale como pendiente, con la ficha y quién reclama");
    const hrefs = await p.$$eval("[data-reclamo] a.wa", a => a.map(x => decodeURIComponent(x.href)));
    ok(hrefs.length === 2 && hrefs.some(h => h.includes("wa.me/524421110001") && /Alguien pidió reclamar la ficha de Tacos Don Pepe/.test(h)), "botón para confirmar con el WhatsApp que ya está en la ficha");
    ok(hrefs.some(h => h.includes("wa.me/524429990001") && /Hola Ana/.test(h) && /Recibimos tu solicitud para reclamar la ficha de Tacos Don Pepe/.test(h)), "botón para escribir a quien reclama");
    p.once("dialog", d => d.dismiss()); await p.click("[data-rapr]"); await p.waitForTimeout(300);
    ok(s.patchNeg.length === 0 && s.patchRec.length === 0, "si cancelas la confirmación, no se cambia nada");
    p.once("dialog", d => { ok(/solo si ya confirmaste/.test(d.message()), "la confirmación recuerda confirmar por WhatsApp antes"); d.accept(); }); await p.click("[data-rapr]"); await p.waitForTimeout(800);
    ok(s.patchNeg.length === 1 && s.patchNeg[0].id === "zq1" && s.patchNeg[0].verificado === true && Object.keys(s.patchNeg[0]).length === 2, "al aprobar, la ficha queda verificada (solo cambia esa marca)");
    ok(s.patchRec.length === 1 && s.patchRec[0].estado === "aprobado" && !!s.patchRec[0].resuelto_at, "y el reclamo queda aprobado con fecha");
    const t2 = await p.textContent("#app");
    ok(/No hay reclamos por revisar/.test(t2) && /Aprobado/.test(t2), "ya no está pendiente");
    const enlaces = await p.$$eval("table a.wa", a => a.map(x => decodeURIComponent(x.href)));
    ok(enlaces.some(h => h.includes("wa.me/524429990001") && h.includes("#editar-" + "t".repeat(64))), "ofrece mandar el enlace de edición a quien reclamó");
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" Admin: rechazar y falta de SQL");
    const { ctx, p, s } = await pagina(browser, vp, { admin: true, hash: "#admin", reclamos: [rec("r1")] });
    await irAdmin(p);
    p.once("dialog", d => d.dismiss()); await p.click("[data-rrej]"); await p.waitForTimeout(300);
    ok(s.patchRec.length === 0, "si cancelas el motivo, no se rechaza");
    p.once("dialog", d => d.accept("No pudimos confirmar que sea el dueño")); await p.click("[data-rrej]"); await p.waitForTimeout(800);
    ok(s.patchRec.length === 1 && s.patchRec[0].estado === "rechazado" && /No pudimos confirmar/.test(s.patchRec[0].nota) && s.patchNeg.length === 0, "rechazar guarda el motivo y no toca la ficha"); await ctx.close();
    const r = await pagina(browser, vp, { admin: true, hash: "#admin", sinTabla: true }); await irAdmin(r.p);
    ok(/sección 34/.test(await r.p.textContent("#app")), "si falta la sección 34, el admin lo avisa"); await r.ctx.close(); }
}

(async () => {
  const browser = await chromium.launch();
  await casos(browser, "celular 390 px", { width: 390, height: 800 });
  await casos(browser, "escritorio 1280 px", { width: 1280, height: 900 });
  await browser.close();
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
