#!/usr/bin/env node
/* Pruebas de humo de ZonaQro (Playwright). Supabase va simulado: no toca la base real.
   Uso:  npm i playwright && npx playwright install chromium   (una sola vez)
         node tests/humo.js
   Corre en celular (390 px) y escritorio (1280 px). Termina con código 1 si algo falla. */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const hoy = (d = 0) => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const fallos = []; let pruebas = 0;
const ok = (cond, msg) => { pruebas++; if(!cond){ fallos.push(msg); console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };

async function nuevaPagina(browser, vp){
  const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage(), s = { errores: [], posts: [], rpc: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await p.route("https://zonaqro.com/**", r => r.fulfill(r.request().url().includes("/rest/") ? json([]) : { status: 200, contentType: "text/html", body: html }));
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/negocios*", r => { if(r.request().method() === "POST"){ s.posts.push(["negocios", JSON.parse(r.request().postData())]); r.fulfill({ status: 201, body: "" }); } else r.fulfill(json([])); });
  await p.route("**/rest/v1/eventos*", r => { if(r.request().method() === "POST"){ s.posts.push(["eventos", JSON.parse(r.request().postData())]); r.fulfill({ status: 201, body: "" }); } else r.fulfill(json([])); });
  await p.route("**/rest/v1/resenas*", r => r.fulfill(json([])));
  await p.route("**/rest/v1/rpc/registrar_evento", r => { s.rpc.push(JSON.parse(r.request().postData())); r.fulfill(json(null)); });
  return { ctx, p, s };
}

async function registro(p, s){
  console.log(" Registro de negocio");
  await p.goto("https://zonaqro.com/#registrar"); await p.waitForSelector("#r-nombre");
  // 1) nombre con correo: se rechaza
  await p.fill("#r-nombre", "alguien@correo.com"); await p.fill("#r-wa", "4421234567"); await p.click("#fReg button[type=submit]");
  ok(/correo/i.test(await p.textContent("#r-err")), "rechaza un correo como nombre del negocio");
  ok(s.posts.length === 0, "no envía nada cuando hay errores");
  // 2) registro válido (desde casa, a domicilio)
  await p.fill("#r-nombre", "Pastelería de prueba"); await p.check("#tipo-emprendimiento");
  await p.selectOption("#r-cat", "tienda"); await p.check("#z-Zakia");
  await p.fill("#r-desc", "Pasteles y postres por encargo, entrega a domicilio en la zona."); await p.fill("#r-ent", "Entrega a domicilio sin costo en la zona");
  await p.check("#r-ok"); await p.click("#fReg button[type=submit]");
  await p.waitForSelector("text=Recibimos tu solicitud", { timeout: 5000 }).catch(() => {});
  ok(/Recibimos tu solicitud/.test(await p.textContent("#app")), "muestra la pantalla de gracias");
  const post = s.posts.find(x => x[0] === "negocios");
  ok(!!post, "envía el negocio a Supabase");
  if(post){
    const f = post[1];
    ok(f.estado === "pendiente", "el negocio entra como pendiente");
    ok(f.nombre && f.whatsapp === "4421234567" && f.zonas.includes("Zakia"), "manda nombre, WhatsApp y zona");
    ok(!("token_edicion" in f) && !("notas" in f) && !("seguimiento" in f), "no manda campos de uso interno");
  }
  await p.waitForTimeout(300);
  ok(s.rpc.some(x => x.p_tipo === "registro_envio"), "cuenta el registro en métricas");
}

async function evento(p, s){
  console.log(" Publicar evento");
  await p.goto("https://zonaqro.com/#publicar-evento"); await p.waitForSelector("#e-titulo");
  await p.click("#fEv button[type=submit]");
  ok((await p.textContent("#e-err")).length > 5, "pide los datos que faltan");
  ok(s.posts.filter(x => x[0] === "eventos").length === 0, "no envía un evento incompleto");
  await p.fill("#e-titulo", "Bazar de prueba"); await p.fill("#e-lugar", "Parque central"); await p.fill("#e-fecha", hoy(10));
  await p.fill("#e-hora", "4:00 pm a 9:00 pm"); await p.fill("#e-wa", "4421234567");
  await p.check("#e-ok"); await p.click("#fEv button[type=submit]");
  await p.waitForTimeout(800);
  const post = s.posts.find(x => x[0] === "eventos");
  ok(!!post, "envía el evento a Supabase");
  if(post) ok(post[1].estado === "pendiente" && post[1].destacado !== true, "el evento entra pendiente y sin destacar");
  ok(/Gracias|Recibimos/i.test(await p.textContent("#app")), "muestra la pantalla de gracias");
}

(async () => {
  const browser = await chromium.launch();
  for(const [nombre, vp] of [["celular 390 px", { width: 390, height: 800 }], ["escritorio 1280 px", { width: 1280, height: 900 }]]){
    console.log("\n== " + nombre);
    for(const prueba of [registro, evento]){
      const { ctx, p, s } = await nuevaPagina(browser, vp);
      try{ await prueba(p, s); }catch(e){ ok(false, "la prueba se rompió: " + String(e.message).split("\n")[0]); }
      ok(s.errores.length === 0, "sin errores de consola" + (s.errores.length ? ": " + s.errores[0] : ""));
      await ctx.close();
    }
  }
  await browser.close();
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
