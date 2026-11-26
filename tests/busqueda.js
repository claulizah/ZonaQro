#!/usr/bin/env node
/* Pruebas del bloque 5: búsqueda (sin acentos, ñ, sinónimos editables), búsquedas sin resultado, "Próximamente" con "faltan",
   zona recordada, zonas cercanas y orden justo. Supabase va simulado. Uso: node tests/busqueda.js */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SIN_REAL = fs.readFileSync(path.join(__dirname, "..", "sinonimos.json"), "utf8");
const fallos = []; let pruebas = 0;
const ok = (c, m) => { pruebas++; if(!c){ fallos.push(m); console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const L = "Descripción suficientemente larga para pasar el mínimo de la ficha.";
const horas = { lun: ["09:00", "20:00"], mar: ["09:00", "20:00"], mie: ["09:00", "20:00"], jue: ["09:00", "20:00"], vie: ["09:00", "20:00"], sab: ["09:00", "20:00"], dom: ["09:00", "20:00"] };
let k = 0;
const neg = (nombre, cat, desc, zonas = ["Zibatá"], extra = {}) => Object.assign({ id: "n-" + (k++), nombre, estado: "aprobado", tipo: "local", categoria: cat, zonas, descripcion: desc, whatsapp: "44212345" + String(10 + k), horarios: horas, alta: "2026-01-10", clics: 0, cupones: [], fotos: [] }, extra);
const BASE = [
  neg("Nails by Ana", "belleza", "Manicure, pedicure y uñas acrílicas con diseños a tu gusto."),
  neg("Papelería Lupita", "tienda", "Una gran variedad de útiles escolares y regalos para toda la familia."),
  neg("Plomería Express", "hogar", "Reparación de fugas y tuberías, atendemos urgencias todos los días."),
  neg("Electricista Luz", "hogar", "Instalaciones eléctricas y reparación de contactos en tu casa."),
  neg("Café Aroma", "gastronomia", "Café de especialidad, desayunos y postres hechos en casa todos los días."),
  neg("Estética Bella", "belleza", "Corte de cabello, peinados y tintes con productos de calidad."),
  neg("Taller Don Pepe", "autos", "Mecánica general, afinaciones y frenos para todo tipo de coche.", ["Juriquilla"])
];
const FIESTAS = neg("Fiestas Ana", "fiestas", "Hacemos piñatas y mesas de dulces para fiestas infantiles.");

async function pagina(browser, vp, negocios, o = {}){
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage(), s = { errores: [], rpc: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if(o.init) await p.addInitScript(o.init);
  await p.route("https://zonaqro.com/**", r => { const u = r.request().url(); r.fulfill(u.includes("/rest/") ? json([]) : u.endsWith("sinonimos.json") ? (o.sin === undefined ? { status: 200, contentType: "application/json", body: SIN_REAL } : o.sin === null ? { status: 404, body: "no" } : { status: 200, contentType: "application/json", body: o.sin }) : { status: 200, contentType: "text/html", body: html }); });
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/**", r => r.fulfill(json([]))); // lo que no se simule abajo se contesta vacío: ninguna prueba debe llegar al Supabase real
  await p.route("**/rest/v1/negocios*", r => r.fulfill(json(negocios)));
  await p.route("**/rest/v1/eventos*", r => r.fulfill(json([])));
  await p.route("**/rest/v1/resenas*", r => r.fulfill(json([])));
  await p.route("**/rest/v1/metricas*", r => r.fulfill(json(o.metricas || [])));
  await p.route("**/rest/v1/ediciones*", r => r.fulfill(json([])));
  await p.route("**/rpc/**", r => r.fulfill({ status: 200, body: "null" }));
  await p.route("**/rest/v1/rpc/registrar_evento", r => { s.rpc.push(JSON.parse(r.request().postData())); r.fulfill(json(null)); });
  await p.goto("https://zonaqro.com/" + (o.hash || "#directorio")); await p.waitForSelector("#app *"); await p.waitForTimeout(700);
  return { ctx, p, s };
}
const buscar = async (p, q) => { await p.fill("#fq", q); await p.waitForTimeout(250); return p.$$eval(".grid .card h3", h => h.map(x => x.textContent.trim())); };
const SOLO = (arr, ...n) => JSON.stringify(arr.slice().sort()) === JSON.stringify(n.slice().sort());

async function casos(browser, nombre, vp){
  console.log("\n== " + nombre);
  { console.log(" Búsqueda: acentos, ñ y sinónimos");
    const { ctx, p, s } = await pagina(browser, vp, BASE.concat([FIESTAS]));
    ok(SOLO(await buscar(p, "uñas"), "Nails by Ana"), "'uñas' encuentra solo a Nails by Ana (no a la papelería con 'una')");
    ok(SOLO(await buscar(p, "unas"), "Nails by Ana"), "'unas' sin tilde también");
    ok(SOLO(await buscar(p, "UÑAS"), "Nails by Ana"), "mayúsculas no importan");
    ok(SOLO(await buscar(p, "peluqueria"), "Estética Bella"), "'peluqueria' (sin acento) encuentra la estética");
    ok(SOLO(await buscar(p, "peluquería"), "Estética Bella"), "'peluquería' (con acento) también");
    ok(SOLO(await buscar(p, "fontanero"), "Plomería Express"), "'fontanero' encuentra a la plomería (sinónimo)");
    ok(SOLO(await buscar(p, "restaurante"), "Café Aroma"), "'restaurante' lleva a la categoría Gastronomía (palabra general)");
    ok(SOLO(await buscar(p, "reparaciones"), "Plomería Express", "Electricista Luz"), "'reparaciones' lleva a toda la categoría Hogar");
    ok(SOLO(await buscar(p, "globos"), ), "'globos' no existe en la lista de fábrica: sin resultados");
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" sinonimos.json editable");
    const { ctx, p } = await pagina(browser, vp, BASE.concat([FIESTAS]), { sin: JSON.stringify({ grupos: [["globo", "piñata"]], categorias: {} }) });
    ok(SOLO(await buscar(p, "globos"), "Fiestas Ana"), "con tu archivo, 'globos' encuentra las piñatas");
    ok(SOLO(await buscar(p, "fontanero")), "y lo que quitaste del archivo ya no cuenta ('fontanero')"); await ctx.close();
    for(const [titulo, sin] of [["no carga (404)", null], ["no es JSON válido", "esto no es json"], ["está vacío", "{}"]]){
      const r = await pagina(browser, vp, BASE, { sin });
      ok(SOLO(await buscar(r.p, "fontanero"), "Plomería Express"), "si el archivo " + titulo + ", se usa la lista de fábrica"); await r.ctx.close(); } }
  { console.log(" Búsquedas sin resultado");
    const { ctx, p, s } = await pagina(browser, vp, BASE);
    await buscar(p, "paracaidismo"); await p.waitForTimeout(1900);
    ok(s.rpc.some(x => x.p_tipo === "busqueda_vacia" && x.p_ref === "paracaidismo|todas"), "cuenta 'paracaidismo' sin resultado (texto y zona)");
    await buscar(p, "paracaidismo "); await p.waitForTimeout(1900);
    ok(s.rpc.filter(x => x.p_tipo === "busqueda_vacia" && x.p_ref === "paracaidismo|todas").length === 1, "la misma búsqueda no se cuenta dos veces en la sesión");
    await buscar(p, "uñas"); await p.waitForTimeout(1900);
    ok(!s.rpc.some(x => x.p_tipo === "busqueda_vacia" && /uñas|unas/.test(x.p_ref)), "una búsqueda con resultados no se cuenta");
    for(const raro of ["4421234567", "llamame al 4421234567", "alguien@correo.com", "https://spam.com", "ab"]){ await buscar(p, raro); await p.waitForTimeout(1700); }
    ok(!s.rpc.some(x => x.p_tipo === "busqueda_vacia" && /\d{4}|@|http|^ab\|/.test(x.p_ref)), "teléfonos, correos, enlaces y textos de 2 letras nunca se mandan");
    await buscar(p, "xyzzy"); await p.fill("#fq", "xyzzyy"); await p.waitForTimeout(300); await p.fill("#fq", ""); await p.waitForTimeout(1900);
    ok(!s.rpc.some(x => x.p_ref && x.p_ref.startsWith("xyzzy")), "si la persona sigue escribiendo o borra, no se cuenta");
    await p.selectOption("#miZona", "Zibatá"); await buscar(p, "submarinismo"); await p.waitForTimeout(1900);
    ok(s.rpc.some(x => x.p_tipo === "busqueda_vacia" && x.p_ref === "submarinismo|Zibatá"), "con una zona elegida, la manda junto al texto"); await ctx.close(); }
  { console.log(" Próximamente con 'faltan X'");
    const { ctx, p } = await pagina(browser, vp, BASE, { hash: "#inicio" });
    const t = await p.textContent(".pronto");
    ok(/Juriquilla\s*\(faltan 2\)/.test(t), "la portada dice que a Juriquilla le faltan 2");
    ok(/Cada zona se activa con 3 negocios con ficha completa/.test(t), "explica la regla de las 3 fichas completas");
    ok(await p.$(".pronto a[href='#registrar']") !== null, "sigue el botón de registro (no se duplicó)");
    ok((await p.$$(".pronto")).length === 1, "hay un solo bloque 'Próximamente'"); await ctx.close(); }
  { console.log(" Zona inactiva y zonas cercanas");
    const { ctx, p } = await pagina(browser, vp, BASE, { init: () => { try{ localStorage.setItem("zq_zona", JSON.stringify("Juriquilla")); }catch(e){} } });
    const aviso = await p.textContent(".notice");
    ok(/Faltan 2 para activar Juriquilla/.test(aviso), "avisa 'Faltan 2 para activar Juriquilla'");
    ok(await p.$(".notice [data-fz='Zibatá']") !== null, "ofrece la zona activa cercana (Zibatá)");
    await p.click(".notice [data-fz='Zibatá']"); await p.waitForTimeout(300);
    ok(await p.$(".notice") === null && (await p.$$(".grid .card")).length > 0, "al tocarla se ven los negocios de Zibatá"); await ctx.close(); }
  { console.log(" Zona recordada");
    const { ctx, p } = await pagina(browser, vp, BASE, { hash: "#inicio" });
    await p.selectOption("#miZona", "Zibatá"); await p.waitForTimeout(200); await p.reload(); await p.waitForSelector("#miZona"); await p.waitForTimeout(500);
    ok((await p.inputValue("#miZona")) === "Zibatá", "al volver a entrar sigue en Zibatá"); await ctx.close();
    const r = await pagina(browser, vp, BASE, { hash: "#inicio", init: () => { try{ localStorage.setItem("zq_zona", JSON.stringify("Zona que ya no existe")); }catch(e){} } });
    ok((await r.p.inputValue("#miZona")) === "", "una zona guardada que ya no existe se ignora (queda en 'Todas')");
    ok((await r.p.$$(".grid .card")).length > 0, "y la portada no queda vacía"); await r.ctx.close();
    const b = await pagina(browser, vp, BASE, { hash: "#inicio", init: () => { Object.defineProperty(window, "localStorage", { get(){ throw new Error("bloqueado"); } }); } });
    ok(b.s.errores.length === 0, "con almacenamiento bloqueado no hay errores"); await b.ctx.close(); }
  { console.log(" Orden justo");
    const comp = i => neg("Completo " + i, "tienda", L, ["Zibatá"], { clics: i === 1 ? 900 : 0 });
    const inc = i => neg("Incompleto " + i, "tienda", "corta", ["Zibatá"], { horarios: {} });
    const datos = [1, 2, 3, 4, 5].map(comp).concat([1, 2, 3].map(inc), [neg("Lugar de referencia", "tienda", L, ["Zibatá"], { referencia: true, whatsapp: "" })]);
    const orden = async seed => { const r = await pagina(browser, vp, datos, { init: `try{ sessionStorage.setItem("zq_sem", ${JSON.stringify(seed)}); }catch(e){}` });
      const a = await r.p.$$eval(".grid .card h3", h => h.map(x => x.textContent.trim()));
      await r.p.goto("https://zonaqro.com/#eventos"); await r.p.waitForTimeout(300); await r.p.goto("https://zonaqro.com/#directorio"); await r.p.waitForTimeout(500);
      const b = await r.p.$$eval(".grid .card h3", h => h.map(x => x.textContent.trim())); await r.ctx.close(); return { a, b }; };
    const res = []; for(const seed of ["uno", "dos", "tres", "cuatro", "cinco"]) res.push(await orden(seed));
    ok(res.every(r => r.a.slice(0, 5).every(n => /^Completo/.test(n))), "las fichas completas salen primero, siempre");
    ok(res.every(r => r.a.slice(5, 8).every(n => /^Incompleto/.test(n)) && r.a[8] === "Lugar de referencia"), "después las incompletas y al final el lugar de referencia");
    ok(new Set(res.map(r => r.a.join("|"))).size > 1, "con otra visita el orden cambia (rotan)");
    ok(res.every(r => r.a.join("|") === r.b.join("|")), "dentro de la misma visita el orden no se mueve al navegar");
    ok(new Set(res.map(r => r.a[0])).size > 1, "el negocio con más clics no queda siempre primero"); }
  { console.log(" Admin: búsquedas sin resultado");
    const M = [{ dia: "2026-11-20", tipo: "busqueda_vacia", ref: "paracaidismo|Zibatá", n: 3 }, { dia: "2026-11-21", tipo: "busqueda_vacia", ref: "mudanza|todas", n: 1 }];
    const adm = BASE.map(b => Object.assign({}, b, { created_at: "2026-11-01T10:00:00Z", seguimiento: "sin_contactar" }));
    const { ctx, p } = await pagina(browser, vp, adm, { hash: "#admin", metricas: M, init: () => { try{ sessionStorage.setItem("zq_tok", "tok"); }catch(e){} } });
    await p.waitForSelector('[data-atab="metricas"]'); await p.click('[data-atab="metricas"]'); await p.waitForTimeout(300);
    const t = await p.textContent("#app");
    ok(/Búsquedas sin resultado/.test(t) && /paracaidismo/.test(t) && /mudanza/.test(t), "el admin muestra lo que la gente buscó y no encontró"); await ctx.close(); }
}

(async () => {
  const browser = await chromium.launch();
  await casos(browser, "celular 390 px", { width: 390, height: 800 });
  await casos(browser, "escritorio 1280 px", { width: 1280, height: 900 });
  await browser.close();
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
