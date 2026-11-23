#!/usr/bin/env node
/* Pruebas de la portada (bloque 4): "Este finde", "Nuevos en ZonaQro" y "Abierto ahora".
   Supabase va simulado y la fecha se fija (miércoles 25 nov 2026, 2:00 pm) para que sean repetibles.
   Uso: node tests/portada.js */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fallos = []; let pruebas = 0;
const ok = (c, m) => { pruebas++; if(!c){ fallos.push(m); console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const AHORA = "2026-11-25T14:00:00", HOY = "2026-11-25"; // miércoles; el finde es sáb 28 y dom 29
const L = "Descripción suficientemente larga para pasar el mínimo de la ficha.";
const todos = h => ({ lun: h, mar: h, mie: h, jue: h, vie: h, sab: h, dom: h });
let k = 0;
const neg = (nombre, zonas, extra = {}) => Object.assign({ id: "n-" + (k++), nombre, estado: "aprobado", tipo: "local", categoria: "gastronomia", zonas, descripcion: L, whatsapp: "44212345" + String(10 + k), horarios: todos(["09:00", "20:00"]), alta: "2026-01-10", clics: 0, cupones: [], fotos: [] }, extra);
const nuevo = (n, z) => neg(n, z, { alta: HOY });
const ev = (id, titulo, zona, fecha) => ({ id, titulo, tipo: "concierto", zona, lugar: "Foro central", fecha, hora: "8:00 pm", precio: "Entrada libre", organizador: "Org", whatsapp: "4421234567", descripcion: "", estado: "aprobado" });
const viejos = [...Array(9)].map((_, i) => neg("Negocio viejo " + (i + 1), [i % 2 ? "Zakia" : "Zibatá"]));
const EVENTOS = [ev("e1", "Concierto sábado Zibatá", "Zibatá", "2026-11-28"), ev("e2", "Bazar domingo Zakia", "Zakia", "2026-11-29"), ev("e3", "Obra el lunes", "Zibatá", "2026-11-30"), ev("e4", "Feria Zibatá", "Zibatá", "2026-12-05")];
const base = { negocios: viejos.concat([nuevo("Café Nuevo Uno", ["Zibatá"]), nuevo("Café Nuevo Dos", ["Zibatá"]), nuevo("Café Nuevo Tres", ["Zibatá"])]), eventos: EVENTOS };

async function pagina(browser, vp, datos, opciones = {}){
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage(), s = { errores: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  await p.clock.install({ time: new Date(opciones.hora || AHORA) });
  const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await p.route("https://zonaqro.com/**", r => r.fulfill(r.request().url().includes("/rest/") ? json([]) : { status: 200, contentType: "text/html", body: html }));
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/negocios*", r => r.fulfill(json(datos.negocios)));
  await p.route("**/rest/v1/eventos*", r => r.fulfill(json(datos.eventos)));
  await p.route("**/rest/v1/resenas*", r => r.fulfill(json([])));
  await p.route("**/rpc/**", r => r.fulfill({ status: 200, body: "null" }));
  await p.goto("https://zonaqro.com/#inicio"); await p.waitForSelector(".hero"); await p.clock.runFor(1500); await p.waitForTimeout(300);
  return { ctx, p, s };
}
const titulos = p => p.$$eval(".tres-bloques .bloque h2", h => h.map(x => x.textContent.trim()));
const filas = (p, t) => p.$$eval(".tres-bloques .bloque", (bs, t) => { const b = bs.find(x => x.querySelector("h2").textContent.trim() === t); return b ? [...b.querySelectorAll(".ev-row strong")].map(x => x.textContent.trim()) : null; }, t);
const sinDesborde = async p => (await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

async function casos(browser, nombre, vp){
  console.log("\n== " + nombre);
  { console.log(" Todas las zonas");
    const { ctx, p, s } = await pagina(browser, vp, base);
    ok(JSON.stringify(await titulos(p)) === JSON.stringify(["Este finde en tu zona", "Nuevos en ZonaQro", "Abierto ahora"]), "salen los tres bloques, en ese orden");
    ok(JSON.stringify(await filas(p, "Este finde en tu zona")) === JSON.stringify(["Concierto sábado Zibatá", "Bazar domingo Zakia"]), "Este finde: solo sábado y domingo (no el lunes ni el 5 de dic.)");
    ok((await filas(p, "Nuevos en ZonaQro")).length === 3, "Nuevos: muestra los 3 negocios nuevos");
    ok((await filas(p, "Abierto ahora")).length === 3, "Abierto ahora: muestra 3 negocios (de los que hay abiertos)");
    ok(!/Trattoria|Jazz bajo|Tacos La Cantera/i.test(await p.textContent("#app")), "no aparecen datos de ejemplo");
    const lado = await p.$$eval(".evlado .ev-row strong", x => x.map(y => y.textContent.trim()));
    ok(!lado.includes("Concierto sábado Zibatá") && !lado.includes("Bazar domingo Zakia"), "'Qué hacer' no repite los eventos del finde");
    ok(await sinDesborde(p), "sin desborde horizontal");
    if(process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, "portada-" + vp.width + ".png"), fullPage: false });
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" Mi zona = Zakia");
    const { ctx, p, s } = await pagina(browser, vp, base);
    await p.selectOption("#miZona", "Zakia"); await p.clock.runFor(500); await p.waitForTimeout(200);
    ok(JSON.stringify(await filas(p, "Este finde en tu zona")) === JSON.stringify(["Bazar domingo Zakia"]), "Este finde: solo eventos de Zakia");
    ok(!(await titulos(p)).includes("Nuevos en ZonaQro"), "Nuevos se oculta: en Zakia hay menos de 3 nuevos");
    const ab = await filas(p, "Abierto ahora"); ok(!!ab && ab.length > 0, "Abierto ahora sigue con negocios de Zakia");
    ok(ab.every(n => /^Negocio viejo [0-9]*[02468]$/.test(n)), "los negocios mostrados son solo los de Zakia (" + ab.join(", ") + ")");
    ok(/Zakia/.test(await p.textContent(".tres-bloques .bloque p")), "el bloque dice qué zona se está viendo");
    ok(s.errores.length === 0, "sin errores de consola"); await ctx.close(); }
  { console.log(" Menos de 3 nuevos");
    const { ctx, p } = await pagina(browser, vp, { negocios: viejos.concat([nuevo("Café Nuevo Uno", ["Zibatá"]), nuevo("Café Nuevo Dos", ["Zibatá"])]), eventos: EVENTOS });
    ok(!(await titulos(p)).includes("Nuevos en ZonaQro"), "con 2 nuevos el bloque no sale"); await ctx.close(); }
  { console.log(" Abierto ahora solo con horario");
    const sinHorario = viejos.map(b => Object.assign({}, b, { horarios: {}, horario: "Lun a Vie 9 a 8" }));
    const { ctx, p } = await pagina(browser, vp, { negocios: sinHorario, eventos: [] });
    ok(!(await titulos(p)).includes("Abierto ahora"), "fichas con horario solo en texto no cuentan"); await ctx.close();
    const un = viejos.map((b, i) => i === 0 ? b : Object.assign({}, b, { horarios: {} }));
    const r = await pagina(browser, vp, { negocios: un, eventos: [] });
    ok(JSON.stringify(await filas(r.p, "Abierto ahora")) === JSON.stringify([un[0].nombre]), "solo sale la ficha que sí tiene horario"); await r.ctx.close(); }
  { console.log(" Fuera de horario");
    const { ctx, p } = await pagina(browser, vp, base, { hora: "2026-11-25T23:00:00" });
    ok(!(await titulos(p)).includes("Abierto ahora"), "a las 11 pm (cierran a las 8 pm) no sale Abierto ahora");
    ok((await titulos(p)).includes("Este finde en tu zona"), "lo demás sigue saliendo"); await ctx.close(); }
  { console.log(" Sin nada");
    const { ctx, p } = await pagina(browser, vp, { negocios: [], eventos: [] });
    ok((await titulos(p)).length === 0, "sin datos no sale ningún bloque vacío");
    ok(/Muy pronto|Estamos sumando/.test(await p.textContent("#app")), "se ve el mensaje de 'Muy pronto'"); await ctx.close(); }
  { console.log(" Enlaces de los bloques");
    const { ctx, p } = await pagina(browser, vp, base);
    await p.click("[data-finde-go]"); await p.waitForTimeout(300);
    ok(/#eventos/.test(p.url()) && (await p.getAttribute('[data-ffinde]', "aria-pressed")) === "true", "'Ver agenda' abre la agenda con 'Este finde' activado");
    await p.goto("about:blank"); await p.goto("https://zonaqro.com/#inicio"); await p.waitForSelector("[data-ahora-go]"); await p.click("[data-ahora-go]"); await p.waitForTimeout(300);
    ok(/#directorio/.test(p.url()) && (await p.getAttribute("[data-fahora]", "aria-pressed")) === "true", "'Ver los abiertos' abre el directorio con 'Abierto ahora' activado"); await ctx.close(); }
}

(async () => {
  const browser = await chromium.launch();
  await casos(browser, "celular 390 px", { width: 390, height: 800 });
  await casos(browser, "escritorio 1280 px", { width: 1280, height: 900 });
  await browser.close();
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
