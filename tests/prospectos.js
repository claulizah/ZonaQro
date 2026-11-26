#!/usr/bin/env node
/* Pruebas del flujo de reclutamiento (admin → Reclutamiento): agregar prospecto → mensaje de WhatsApp → seguimiento y recordatorio.
   Supabase va simulado (nada toca la base real). Uso: node tests/prospectos.js */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fallos = []; let pruebas = 0;
const ok = (c, m) => { pruebas++; if(!c){ fallos.push(m); console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
let k = 0;
const pr = (nombre, extra = {}) => Object.assign({ id: "p" + (++k), nombre, whatsapp: "44290000" + String(10 + k), zona: "Juriquilla", campana: "", estado: "nuevo", ultimo_contacto: null, intentos: 0, nota: "", created_at: new Date().toISOString() }, extra);
const negocio = (id, wa, estado = "aprobado") => ({ id, nombre: "Tacos Don Pepe", estado, tipo: "local", categoria: "gastronomia", zonas: ["Zibatá"], descripcion: "Tacos al pastor y de guisado, desde 1998.", whatsapp: wa, horario: "9 a 6", fotos: [], seguimiento: "sin_contactar", created_at: new Date().toISOString() });

async function pagina(browser, vp, o = {}){
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage();
  const s = { errores: [], prospectos: (o.prospectos || []).map(x => Object.assign({}, x)), posts: [], patches: [], borrados: [], abiertos: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource|404|409/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  ctx.on("page", async w => { await w.waitForLoadState("domcontentloaded").catch(() => {}); s.abiertos.push(w.url()); await w.close().catch(() => {}); });
  await p.addInitScript(() => { try{ sessionStorage.setItem("zq_tok", "token-de-admin"); }catch(e){} });
  const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await p.route("https://zonaqro.com/**", r => r.fulfill(r.request().url().includes("/rest/") ? json([]) : { status: 200, contentType: "text/html", body: html }));
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" })); // la pestaña de WhatsApp es otra página: se simula en el contexto para no salir a internet
  await p.route("**/rest/v1/**", r => r.fulfill(json([])));
  await p.route("**/rest/v1/negocios*", r => r.fulfill(json(o.negocios || [])));
  await p.route("**/rest/v1/prospectos*", r => {
    const req = r.request(), m = req.method(), id = new URL(req.url()).searchParams.get("id");
    if(o.sinTabla){ r.fulfill(json({ code: "PGRST205", message: "Could not find the table 'public.prospectos' in the schema cache" }, 404)); return; }
    if(m === "POST"){ const b = JSON.parse(req.postData());
      if(s.prospectos.some(x => x.whatsapp === b.whatsapp)){ r.fulfill(json({ code: "23505", message: 'duplicate key value violates unique constraint "prospectos_whatsapp_uq"' }, 409)); return; }
      s.posts.push(b); s.prospectos.unshift(Object.assign({ id: "n" + (++k), estado: "nuevo", ultimo_contacto: null, intentos: 0, created_at: new Date().toISOString() }, b)); r.fulfill({ status: 201, body: "" }); return; }
    if(m === "PATCH"){ const b = JSON.parse(req.postData()), pid = id.replace("eq.", ""), x = s.prospectos.find(y => y.id === pid); s.patches.push(Object.assign({ id: pid }, b)); if(x) Object.assign(x, b); r.fulfill(json(x ? [x] : [])); return; }
    if(m === "DELETE"){ const pid = id.replace("eq.", ""); s.borrados.push(pid); s.prospectos = s.prospectos.filter(y => y.id !== pid); r.fulfill({ status: 204, body: "" }); return; }
    r.fulfill(json(s.prospectos));
  });
  await p.route("**/rpc/**", r => r.fulfill({ status: 200, body: "null" }));
  await p.goto("https://zonaqro.com/#admin"); await p.waitForSelector('[data-atab="reclutamiento"]'); await p.click('[data-atab="reclutamiento"]'); await p.waitForTimeout(300);
  return { ctx, p, s };
}
const agregar = async (p, nombre, wa, extra = {}) => { await p.fill("#p-nombre", nombre); await p.fill("#p-wa", wa); if(extra.zona) await p.selectOption("#p-zona", extra.zona); if(extra.campana !== undefined) await p.fill("#p-campana", extra.campana); await p.click("#fProspecto button[type=submit]"); await p.waitForTimeout(500); };
const fila = (p, nombre) => p.$$eval("#t-prospectos tbody tr", (trs, n) => { const t = trs.find(x => x.textContent.includes(n)); return t ? t.textContent.replace(/\s+/g, " ").trim() : null; }, nombre);
const textoMensaje = async (p, nombre) => p.$$eval("#t-prospectos tbody tr", (trs, n) => { const t = trs.find(x => x.textContent.includes(n)); return t ? t.querySelector("details p").textContent : null; }, nombre);

async function casos(browser, nombre, vp){
  console.log("\n== " + nombre);
  { console.log(" Agregar prospecto");
    const { ctx, p, s } = await pagina(browser, vp);
    ok(/Todavía no tienes prospectos/.test(await p.textContent("#t-prospectos")), "sin prospectos dice 'Todavía no tienes prospectos'");
    await agregar(p, "", "4421234567"); ok(/nombre/.test(await p.textContent("#p-err")) && s.posts.length === 0, "sin nombre: avisa y no guarda");
    await agregar(p, "Pasteles Lupita", "442123"); ok(/10 dígitos/.test(await p.textContent("#p-err")) && s.posts.length === 0, "WhatsApp incompleto: avisa y no guarda");
    await agregar(p, "Pasteles Lupita", "+52 (442) 123-4567", { zona: "Juriquilla" });
    ok(s.posts.length === 1 && s.posts[0].whatsapp === "4421234567" && s.posts[0].zona === "Juriquilla" && s.posts[0].nombre === "Pasteles Lupita", "guarda nombre, zona y WhatsApp limpio (acepta +52, espacios y guiones)");
    ok(!("estado" in s.posts[0]) && !("ultimo_contacto" in s.posts[0]), "no manda estado ni fechas: los pone la base");
    const f = await fila(p, "Pasteles Lupita"); ok(!!f && /Enviar primer mensaje/.test(f) && /Escribir por WhatsApp/.test(f), "queda como Nuevo, con 'Enviar primer mensaje' y el botón de WhatsApp");
    await agregar(p, "Otro nombre", "442 123 4567"); ok(/ya está en tu lista/.test(await p.textContent("#p-err")) && s.posts.length === 1, "el mismo WhatsApp dos veces: avisa y no duplica");
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" Mensaje de WhatsApp");
    const { ctx, p } = await pagina(browser, vp, { prospectos: [pr("Pasteles Lupita", { whatsapp: "4421234567" })] });
    const m = await textoMensaje(p, "Pasteles Lupita");
    ok(/Pasteles Lupita/.test(m) && /ZonaQro/.test(m) && /gratuito/.test(m), "dice quién escribe, el nombre del negocio y que es gratuito");
    ok(/utm_source=whatsapp&utm_medium=reclutar&utm_campaign=rec-juriquilla/.test(m) && /#negocios/.test(m), "el enlace lleva utm de la ola (rec-juriquilla) y va a la página para negocios");
    const q = new URLSearchParams(m.match(/\?(utm_[^# \n]+)/)[1]);
    ok(q.get("utm_source").length <= 20 && q.get("utm_medium").length <= 12 && q.get("utm_campaign").length <= 24, "las tres etiquetas del enlace caben en los límites del sitio (20, 12 y 24 letras): si no, el sitio las recortaría");
    ok(/no te vuelvo a escribir/.test(m), "ofrece salida fácil: 'dímelo y no te vuelvo a escribir'");
    ok(m.length < 450 && !/mimx|\$|precio|pesos/i.test(m), "es corto (menos de 450 caracteres) y no habla de ventas ni de mimx");
    const href = await p.getAttribute("#t-prospectos a[data-pw]", "href");
    ok(href.startsWith("https://wa.me/524421234567?text=") && decodeURIComponent(href.split("?text=")[1]) === m.trim(), "el botón abre WhatsApp al número correcto con exactamente ese mensaje");
    await ctx.close(); }
  { console.log(" Contactar y recordar a los 5 días");
    const { ctx, p, s } = await pagina(browser, vp, { prospectos: [pr("Pasteles Lupita", { whatsapp: "4421234567" })] });
    await p.click("#t-prospectos a[data-pw]"); await p.waitForTimeout(700);
    ok(s.patches.length === 1 && s.patches[0].estado === "contactado" && s.patches[0].ultimo_contacto === dia(0) && s.patches[0].intentos === 1, "al abrir WhatsApp queda contactado, con la fecha de hoy y 1 mensaje");
    await p.waitForTimeout(500); ok(s.abiertos.some(u => u.startsWith("https://wa.me/524421234567")), "se abre WhatsApp en otra pestaña (" + s.abiertos.map(u => u.slice(0, 40)).join(" | ") + ")");
    let f = await fila(p, "Pasteles Lupita"); ok(/Esperar: recordar el/.test(f) && f.includes(dia(5)) && !/Recordar por WhatsApp/.test(f), "queda esperando; el recordatorio es en 5 días (" + dia(5) + ") y todavía no hay botón");
    await ctx.close();
    for(const [dias, esperaBoton] of [[-4, false], [-5, true], [-9, true]]){
      const r = await pagina(browser, vp, { prospectos: [pr("Pasteles Lupita", { whatsapp: "4421234567", estado: "contactado", ultimo_contacto: dia(dias), intentos: 1 })] });
      f = await fila(r.p, "Pasteles Lupita");
      ok(esperaBoton ? /Recordar hoy/.test(f) && /Recordar por WhatsApp/.test(f) : /Esperar/.test(f) && !/Recordar por WhatsApp/.test(f), "contactado hace " + Math.abs(dias) + " días: " + (esperaBoton ? "toca recordar" : "todavía no toca"));
      if(dias === -5){
        const m = await textoMensaje(r.p, "Pasteles Lupita");
        ok(/una sola vez más/.test(m) && /no te escribo más/.test(m), "el recordatorio es distinto, corto y avisa que es la última vez");
        await r.p.click("#t-prospectos a[data-pw]"); await r.p.waitForTimeout(700);
        ok(r.s.patches[0].intentos === 2 && r.s.patches[0].ultimo_contacto === dia(0), "al recordar suma el segundo mensaje y actualiza la fecha");
        f = await fila(r.p, "Pasteles Lupita"); ok(/Sin respuesta \(2 intentos\)/.test(f) && !/WhatsApp/.test(f.replace("Ver mensaje", "")) , "después del recordatorio ya no hay más botones: no se insiste");
      }
      await r.ctx.close(); } }
  { console.log(" Seguimiento y 'no le interesa'");
    const { ctx, p, s } = await pagina(browser, vp, { prospectos: [pr("Pasteles Lupita", { whatsapp: "4421234567" }), pr("Taquería El Güero", { whatsapp: "4421234568" })] });
    await p.selectOption('[data-pest]:near(:text("Pasteles Lupita"))', "no_interesa").catch(async () => { await p.selectOption("#t-prospectos tbody tr:first-child [data-pest]", "no_interesa"); }); await p.waitForTimeout(600);
    ok(s.patches.some(x => x.estado === "no_interesa"), "marcar 'No le interesa' se guarda");
    const filas = await p.$$eval("#t-prospectos tbody tr", t => t.map(x => x.textContent.replace(/\s+/g, " ")));
    const ni = filas.find(x => /No escribirle más/.test(x));
    ok(!!ni && !/Escribir por WhatsApp/.test(ni), "queda 'No escribirle más' y sin botón de WhatsApp");
    await p.selectOption("#t-prospectos tbody tr:last-child [data-pest]", "respondio"); await p.waitForTimeout(500);
    ok(s.patches.some(x => x.estado === "respondio"), "se puede marcar 'Respondió'");
    await p.click('[data-pf="no_interesa"]'); await p.waitForTimeout(200);
    ok((await p.$$("#t-prospectos tbody tr[data-prosp]")).length === 1, "el filtro por estado muestra solo los que no les interesa");
    ok(s.errores.length === 0, "sin errores de consola"); await ctx.close(); }
  { console.log(" Ya se registró");
    const { ctx, p, s } = await pagina(browser, vp, { prospectos: [pr("Tacos Don Pepe", { whatsapp: "4421112233" })], negocios: [negocio("n-aaa111", "4421112233")] });
    const f = await fila(p, "Tacos Don Pepe"); ok(/Ya tiene ficha en ZonaQro/.test(f), "avisa que ese WhatsApp ya tiene ficha en ZonaQro");
    const m = await textoMensaje(p, "Tacos Don Pepe"); ok(/Ya preparamos la ficha/.test(m) && /#n-n-aaa111/.test(m), "el mensaje enlaza a su ficha");
    await p.click("[data-preg]"); await p.waitForTimeout(500);
    ok(s.patches.some(x => x.estado === "registrado"), "'Marcar registrado' lo guarda"); await ctx.close(); }
  { console.log(" Hoy toca, aviso diario y borrar");
    const seis = [1, 2, 3].map(i => pr("Nuevo " + i)).concat([pr("Recordar 1", { estado: "contactado", ultimo_contacto: dia(-6), intentos: 1 }), pr("Esperar 1", { estado: "contactado", ultimo_contacto: dia(-1), intentos: 1 })]);
    const { ctx, p, s } = await pagina(browser, vp, { prospectos: seis });
    await p.click('[data-atab="solicitudes"]'); await p.waitForTimeout(200);
    ok(/4 prospectos por escribir o recordar/.test(await p.textContent(".notice")), "'Hoy toca' cuenta 4 (3 nuevos y 1 por recordar; el que espera no)");
    await p.click('[data-atab="reclutamiento"]'); await p.waitForTimeout(200);
    ok(!/mejor pausa/i.test(await p.textContent("#app")), "con pocos mensajes hoy no hay aviso de spam"); await ctx.close();
    const diez = [...Array(10)].map((_, i) => pr("Hoy " + i, { estado: "contactado", ultimo_contacto: dia(0), intentos: 1 }));
    const r = await pagina(browser, vp, { prospectos: diez });
    ok(/mejor pausa/i.test(await r.p.textContent("#app")), "con 10 mensajes en un día avisa que mejor pausa para no parecer spam"); await r.ctx.close();
    const b = await pagina(browser, vp, { prospectos: [pr("Pasteles Lupita")] });
    b.p.once("dialog", d => d.dismiss()); await b.p.click("[data-pdel]"); await b.p.waitForTimeout(300);
    ok(b.s.borrados.length === 0, "si cancelas la confirmación, no se borra");
    b.p.once("dialog", d => { ok(/no se puede deshacer/i.test(d.message()) && /no volver a escribirle|ya no quedará marcado/.test(d.message()), "la confirmación avisa que ya no quedará marcado para no escribirle"); d.accept(); }); await b.p.click("[data-pdel]"); await b.p.waitForTimeout(600);
    ok(b.s.borrados.length === 1, "si confirmas, se borra"); await b.ctx.close(); }
  { console.log(" Seguridad y degradación");
    const { ctx, p } = await pagina(browser, vp, { prospectos: [pr("<img src=x onerror=window.__xss=1>", { nota: "<script>window.__xss=2</script>" })] });
    await p.waitForTimeout(300);
    ok(!(await p.evaluate(() => window.__xss)) && (await p.$$("#t-prospectos img")).length === 0, "el nombre y la nota se muestran como texto (sin ejecutar nada)"); await ctx.close();
    const r = await pagina(browser, vp, { sinTabla: true });
    ok(/sección 33/.test(await r.p.textContent("#app")), "si falta la sección 33, avisa claramente"); await r.ctx.close(); }
}

(async () => {
  const browser = await chromium.launch();
  await casos(browser, "celular 390 px", { width: 390, height: 800 });
  await casos(browser, "escritorio 1280 px", { width: 1280, height: 900 });
  await browser.close();
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
