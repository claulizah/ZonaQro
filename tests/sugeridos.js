#!/usr/bin/env node
/* Pruebas de la aprobación en lote de eventos sugeridos (admin → Sugeridos). Supabase va simulado. Uso: node tests/sugeridos.js */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fallos = []; let pruebas = 0;
const ok = (c, m) => { pruebas++; if(!c){ fallos.push(m); console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const sug = (id, zona, extra = {}) => Object.assign({ id, titulo: "Evento " + id, tipo: "bazar", zona, lugar: "Plaza", fecha: dia(10), hora: "10:00", precio: "Gratis", organizador: "Org", descripcion: "Descripción corta.", fuente: "https://example.com/" + id, nota: "" }, extra);
const SUG = [sug("s-a", "Zibatá"), sug("s-b", "Ciudad de Querétaro", { fecha_fin: dia(12) }), sug("s-c", "Tequisquiapan"), sug("s-d", "")];

async function pagina(browser, vp, o = {}){
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage();
  const s = { errores: [], posts: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource|404/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  p.on("dialog", d => d.accept());
  await p.addInitScript(() => { try{ sessionStorage.setItem("zq_tok", "token-de-admin"); localStorage.removeItem("zq_desc"); }catch(e){} });
  const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await p.route("https://zonaqro.com/**", r => { const u = r.request().url(); r.fulfill(u.includes("/rest/") ? json([]) : u.includes("eventos-sugeridos.json") ? json(SUG) : { status: 200, contentType: "text/html", body: html }); });
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/**", r => r.fulfill(json([])));
  await p.route("**/rest/v1/eventos*", r => {
    if(r.request().method() === "POST"){ const b = JSON.parse(r.request().postData()); s.posts.push(b); if(o.falla && b.titulo === "Evento " + o.falla) r.fulfill(json({ message: "boom" }, 400)); else r.fulfill({ status: 201, body: "" }); }
    else r.fulfill(json([]));
  });
  await p.goto("https://zonaqro.com/#admin"); await p.waitForSelector('[data-atab="sugeridos"]'); await p.click('[data-atab="sugeridos"]'); await p.waitForSelector(".sug-ck");
  return { ctx, p, s };
}

async function casos(browser, nombre, vp){
  console.log("\n== " + nombre);
  { console.log(" Marcar y aprobar en lote");
    const { ctx, p, s } = await pagina(browser, vp);
    ok((await p.$$(".sug-ck")).length === 4, "cada sugerencia tiene su casilla");
    await p.click('[data-sugsel="zonas"]');
    ok((await p.$$(".sug-ck:checked")).length === 3, "'Marcar las de mis zonas' deja fuera la que no tiene zona");
    ok(/3 marcadas/.test(await p.textContent("#sug-cuenta")), "muestra el conteo de marcadas");
    await p.click('[data-sugl="ap"]'); await p.waitForTimeout(500);
    ok(s.posts.length === 3, "publica las 3 marcadas");
    ok(s.posts.every(b => b.estado === "aprobado" && b.zona), "todas quedan aprobadas con zona");
    ok(s.posts.find(b => b.titulo === "Evento s-b").fecha_fin === dia(12), "conserva fecha_fin");
    ok(s.errores.length === 0, "sin errores de consola" + (s.errores[0] ? ": " + s.errores[0] : "")); await ctx.close(); }
  { console.log(" Sin zona y sin marcas");
    const { ctx, p, s } = await pagina(browser, vp);
    await p.click('[data-sugl="ap"]'); await p.waitForTimeout(200);
    ok(s.posts.length === 0, "sin marcas no publica nada");
    await p.check('.sug-ck[data-id="s-d"]'); await p.click('[data-sugl="ap"]'); await p.waitForTimeout(300);
    ok(s.posts.length === 0, "una marcada sin zona no se publica en lote");
    await ctx.close(); }
  { console.log(" Un error no frena a los demás");
    const { ctx, p, s } = await pagina(browser, vp, { falla: "s-b" });
    await p.click('[data-sugsel="zonas"]'); await p.click('[data-sugl="ap"]'); await p.waitForTimeout(600);
    ok(s.posts.length === 3, "intenta las 3 aunque una falle");
    await ctx.close(); }
  { console.log(" Descartar en lote");
    const { ctx, p, s } = await pagina(browser, vp);
    await p.check('.sug-ck[data-id="s-a"]'); await p.check('.sug-ck[data-id="s-d"]'); await p.click('[data-sugl="de"]'); await p.waitForTimeout(300);
    ok((await p.$$(".sug-ck")).length === 2 && s.posts.length === 0, "descartar quita 2 de la lista sin publicar nada");
    await ctx.close(); }
}
(async () => {
  const b = await chromium.launch();
  await casos(b, "Celular 390 px", { width: 390, height: 800 });
  await casos(b, "Escritorio 1280 px", { width: 1280, height: 900 });
  await b.close();
  console.log("\n" + (pruebas - fallos.length) + "/" + pruebas + " pruebas pasan");
  process.exit(fallos.length ? 1 : 0);
})();
