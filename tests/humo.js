#!/usr/bin/env node
/* Pruebas de humo de ZonaQro (Playwright). Supabase va simulado: no toca la base real.
   Uso:  npm i playwright && npx playwright install chromium   (una sola vez)
         node tests/humo.js
   Corre en celular (390 px) y escritorio (1280 px). Termina con código 1 si algo falla. */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const hoy = (d = 0) => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const FICHA = { id: "n-abc1234567", nombre: "Taquería de prueba", tipo: "local", categoria: "gastronomia", estado: "aprobado", descripcion: "Tacos al pastor y de guisado, desde 1998 en el barrio.", direccion: "Calle Uno 12", horario: "", horarios: { lun: ["09:00", "18:00"] }, redes: "", entrega: "", sitio_web: "", fotos: [], resenas: [] };
const REGLA_FOTOS = /^[A-Za-z0-9_-]{2,80}\/[0-9]{1,2}-[a-z0-9]{1,8}\.jpg$/; // la misma forma que exige la política de fotos del SQL 29e
const rutasUtm = new Set(); // etiquetas UTM que mandó el sitio (se pueden pasar por Postgres con RUTAS_UTM=archivo.txt)
const rutasFotos = []; // todas las rutas subidas en las pruebas (se pueden pasar por Postgres con RUTAS_FOTOS=archivo.json)
const jpeg = async p => Buffer.from(await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 300; c.height = 200; const x = c.getContext("2d"); x.fillStyle = "#2C674B"; x.fillRect(0, 0, 300, 200); return c.toDataURL("image/jpeg", 0.8).split(",")[1]; }), "base64");
const fallos = []; let pruebas = 0;
const ok = (cond, msg) => { pruebas++; if(!cond){ fallos.push(msg); console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };

async function nuevaPagina(browser, vp){
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600 }), p = await ctx.newPage(), s = { errores: [], posts: [], rpc: [], fotos: [], rpcs: [], patches: [] };
  p.on("console", m => { if(m.type() === "error" && !/ERR_|Failed to load resource/.test(m.text())) s.errores.push(m.text()); });
  p.on("pageerror", e => s.errores.push(String(e)));
  const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await p.route("https://zonaqro.com/**", r => r.fulfill(r.request().url().includes("/rest/") ? json([]) : { status: 200, contentType: "text/html", body: html }));
  await p.route("https://fonts.*/**", r => r.fulfill({ status: 200, body: "" }));
  await p.route("**/rest/v1/**", r => r.fulfill(json([]))); // lo que no se simule abajo se contesta vacío: ninguna prueba debe llegar al Supabase real
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" })); // las pestañas nuevas de WhatsApp tampoco salen a internet
  await p.route("**/rest/v1/negocios*", r => { if(r.request().method() === "POST"){ s.posts.push(["negocios", JSON.parse(r.request().postData())]); r.fulfill({ status: 201, body: "" }); } else r.fulfill(json([])); });
  await p.route("**/rest/v1/eventos*", r => { if(r.request().method() === "POST"){ s.posts.push(["eventos", JSON.parse(r.request().postData())]); r.fulfill({ status: 201, body: "" }); } else r.fulfill(json([])); });
  await p.route("**/rest/v1/resenas*", r => r.fulfill(json([])));
  await p.route("**/storage/v1/object/fotos/**", r => { const req = r.request(); s.fotos.push({ path: decodeURIComponent(req.url().split("/object/fotos/")[1]), auth: req.headers()["authorization"] || "", tipo: req.headers()["content-type"] || "" }); r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await p.route("**/rest/v1/rpc/ficha_por_token", r => r.fulfill(json(FICHA)));
  await p.route("**/rest/v1/rpc/editar_ficha", r => { const b = JSON.parse(r.request().postData()); s.rpcs.push(b); r.fulfill(json(Object.assign({}, FICHA, b.p_cambios))); });
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
  await p.check("#r-ok"); await p.waitForTimeout(2700); // una persona tarda más de 2.5 s en llenar el formulario
  await p.click("#fReg button[type=submit]");
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
  await p.check("#e-ok"); await p.waitForTimeout(2700);
  await p.click("#fEv button[type=submit]");
  await p.waitForTimeout(800);
  const post = s.posts.find(x => x[0] === "eventos");
  ok(!!post, "envía el evento a Supabase");
  if(post) ok(post[1].estado === "pendiente" && post[1].destacado !== true, "el evento entra pendiente y sin destacar");
  ok(/Gracias|Recibimos/i.test(await p.textContent("#app")), "muestra la pantalla de gracias");
}

async function ficha(p, s){
  console.log(" Edición de ficha con enlace personal");
  await p.goto("https://zonaqro.com/#editar-" + "a".repeat(64)); await p.waitForSelector("#fEdit");
  ok(/Taquería de prueba/.test(await p.textContent("#app")), "el enlace abre la ficha");
  await p.fill("#ep-desc", "Tacos al pastor, de guisado y quesadillas. Abrimos todos los días."); await p.click("#fEdit button[type=submit]"); await p.waitForTimeout(600);
  const g = s.rpcs[0];
  ok(!!g && g.p_cambios.descripcion.startsWith("Tacos al pastor, de guisado") && g.p_token === "a".repeat(64), "guarda la descripción con editar_ficha y su llave");
  ok(!(g && "nombre" in g.p_cambios) && !(g && "token_edicion" in g.p_cambios), "no manda nombre ni llave en los cambios");
  console.log(" Foto desde el enlace de edición");
  await p.setInputFiles("#ep-foto", { name: "foto.jpg", mimeType: "image/jpeg", buffer: await jpeg(p) }); await p.waitForTimeout(900);
  const f = s.fotos[0];
  ok(!!f && REGLA_FOTOS.test(f.path), "sube la foto con la ruta que acepta el SQL 29e (" + (f ? f.path.replace(/^[^/]+/, "<id>") : "sin subida") + ")");
  ok(!!f && f.path.startsWith(FICHA.id + "/") && f.tipo === "image/jpeg", "la sube a la carpeta de su ficha como JPEG");
  s.fotos.forEach(x => rutasFotos.push(x.path));
}

async function adminFoto(p, s){
  console.log(" Foto desde el admin");
  await p.addInitScript(() => { try{ sessionStorage.setItem("zq_tok", "token-de-admin"); }catch(e){} });
  const neg = [{ id: "n-abc1234567", nombre: "Taquería de prueba", estado: "aprobado", tipo: "local", categoria: "gastronomia", zonas: ["Zibatá"], descripcion: "Tacos al pastor y de guisado, desde 1998.", whatsapp: "4421234567", horario: "9 a 6", fotos: [], seguimiento: "sin_contactar", created_at: new Date().toISOString() }];
  await p.route("**/rest/v1/negocios*", r => { if(r.request().method() === "PATCH"){ s.patches.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([neg[0]]) }); } else r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(neg) }); });
  await p.route("**/rest/v1/metricas*", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await p.route("**/rest/v1/ediciones*", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await p.goto("https://zonaqro.com/#admin"); await p.waitForSelector('[data-atab="editar"]'); await p.click('[data-atab="editar"]');
  await p.waitForSelector('[data-edfoto="n-abc1234567"]', { state: "attached" });
  await p.setInputFiles('[data-edfoto="n-abc1234567"]', { name: "foto.jpg", mimeType: "image/jpeg", buffer: await jpeg(p) }); await p.waitForTimeout(1200);
  const f = s.fotos[0];
  ok(!!f && REGLA_FOTOS.test(f.path), "sube la foto con la ruta que acepta el SQL 29e (" + (f ? f.path.replace(/^[^/]+/, "<id>") : "sin subida") + ")");
  ok(!!f && /token-de-admin/.test(f.auth), "la sube con la sesión de administradora");
  ok(s.patches.some(x => Array.isArray(x.fotos) && x.fotos.length === 1), "guarda la lista de fotos en la ficha");
  s.fotos.forEach(x => rutasFotos.push(x.path));
}

async function fotoRegistro(p, s){
  console.log(" Foto en el registro de un negocio");
  await p.goto("https://zonaqro.com/#registrar"); await p.waitForSelector("#r-nombre");
  await p.fill("#r-nombre", "Negocio con foto"); await p.check("#tipo-emprendimiento"); await p.selectOption("#r-cat", "tienda"); await p.check("#z-Zakia");
  await p.fill("#r-desc", "Pasteles y postres por encargo, entrega a domicilio en la zona."); await p.fill("#r-ent", "Entrega sin costo"); await p.fill("#r-wa", "4421234567"); await p.check("#r-ok");
  await p.setInputFiles("#r-fotos", [{ name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(p) }, { name: "b.jpg", mimeType: "image/jpeg", buffer: await jpeg(p) }]);
  await p.waitForTimeout(2800); await p.click("#fReg button[type=submit]"); await p.waitForTimeout(1500);
  ok(s.fotos.length === 2 && s.fotos.every(f => REGLA_FOTOS.test(f.path)), "sube 2 fotos con rutas que acepta el SQL 29e");
  const post = s.posts.find(x => x[0] === "negocios");
  ok(!!post && post[1].fotos.length === 2 && post[1].fotos.every(u => /\/storage\/v1\/object\/public\/fotos\//.test(u)), "el negocio guarda las dos fotos");
  s.fotos.forEach(x => rutasFotos.push(x.path));
}

async function utm(p, s, nombre){
  console.log(" Campaña " + nombre);
  const ref = "meta|cpc|" + nombre, url = "https://zonaqro.com/?utm_source=meta&utm_medium=cpc&utm_campaign=" + nombre + "#negocios";
  await p.goto(url); await p.waitForSelector("a.btn.wa"); await p.click("a.btn.wa", { noWaitAfter: true }).catch(() => {});
  await p.click('a.btn[href="#registrar"]'); await p.waitForSelector("#r-nombre");
  await p.fill("#r-nombre", "Negocio de campaña"); await p.check("#tipo-emprendimiento"); await p.selectOption("#r-cat", "tienda"); await p.check("#z-Zakia");
  await p.fill("#r-desc", "Pasteles y postres por encargo, entrega a domicilio en la zona."); await p.fill("#r-ent", "Entrega sin costo"); await p.fill("#r-wa", "4421234567"); await p.check("#r-ok");
  await p.waitForTimeout(2800); await p.click("#fReg button[type=submit]"); await p.waitForTimeout(800);
  const tiene = t => s.rpc.some(x => x.p_tipo === t && x.p_ref === ref);
  ok(tiene("utm_visita"), "cuenta la visita con " + ref); ok(tiene("utm_wa"), "cuenta el clic a WhatsApp con " + ref); ok(tiene("utm_registro"), "cuenta el registro con " + ref);
  s.rpc.filter(x => /^utm_/.test(x.p_tipo)).forEach(x => rutasUtm.add(x.p_tipo + "\t" + x.p_ref));
}

async function inicios(p, s){
  await p.goto("https://zonaqro.com/#inicio"); const tactil = await p.evaluate(() => navigator.maxTouchPoints > 0);
  console.log(" Métricas de inicio de formulario" + (tactil ? " (con toque)" : " (con teclado)"));
  const escribe = async (sel, txt) => { if(tactil) await p.tap(sel); else await p.click(sel); await p.keyboard.type(txt); await p.waitForTimeout(400); };
  await p.goto("https://zonaqro.com/#publicar-evento"); await p.waitForSelector("#e-titulo"); await p.waitForTimeout(300);
  ok(s.rpc.some(x => x.p_tipo === "evento_vista"), "cuenta que abrieron el formulario de evento");
  ok(!s.rpc.some(x => x.p_tipo === "evento_inicio"), "todavía no cuenta 'empezó' si no han escrito");
  await escribe("#e-titulo", "Bazar");
  ok(s.rpc.filter(x => x.p_tipo === "evento_inicio").length === 1, "al escribir cuenta 'empezó' el formulario de evento (una vez)");
  await escribe("#e-lugar", "Parque");
  ok(s.rpc.filter(x => x.p_tipo === "evento_inicio").length === 1, "seguir escribiendo no lo cuenta otra vez");
  await p.goto("about:blank"); await p.goto("https://zonaqro.com/#registrar"); await p.waitForSelector("#r-nombre"); await escribe("#r-nombre", "Mi negocio");
  ok(s.rpc.some(x => x.p_tipo === "registro_inicio"), "al escribir cuenta 'empezó' el registro de negocio");
}

async function robots(p, s){
  console.log(" Anti-spam (sin captcha)");
  const llenarReg = async () => { await p.goto("about:blank"); await p.goto("https://zonaqro.com/#registrar"); await p.waitForSelector("#r-nombre");
    await p.fill("#r-nombre", "Robot de prueba"); await p.check("#tipo-emprendimiento"); await p.selectOption("#r-cat", "tienda"); await p.check("#z-Zakia");
    await p.fill("#r-desc", "Descripción suficientemente larga para pasar el mínimo del formulario."); await p.fill("#r-ent", "Entrega a domicilio"); await p.fill("#r-wa", "4421234567"); await p.check("#r-ok"); };
  const llenarEv = async () => { await p.goto("about:blank"); await p.goto("https://zonaqro.com/#publicar-evento"); await p.waitForSelector("#e-titulo");
    await p.fill("#e-titulo", "Evento robot"); await p.fill("#e-lugar", "Parque"); await p.fill("#e-fecha", hoy(10)); await p.fill("#e-hora", "5 pm"); await p.fill("#e-wa", "4421234567"); await p.check("#e-ok"); };
  const enviados = () => s.posts.length;
  await llenarReg(); await p.waitForTimeout(2700); await p.evaluate(() => { document.getElementById("fx-r9k3").value = "http://spam"; }); await p.click("#fReg button[type=submit]"); await p.waitForTimeout(500);
  ok(enviados() === 0, "registro: campo escondido lleno, no se manda nada");
  ok(/Recibimos tu solicitud/.test(await p.textContent("#app")), "registro: el robot ve la pantalla de gracias (sin pistas)");
  await llenarReg(); await p.click("#fReg button[type=submit]"); await p.waitForTimeout(500);
  ok(enviados() === 0, "registro: envío instantáneo (menos de 2.5 s), no se manda nada");
  await llenarEv(); await p.waitForTimeout(2700); await p.evaluate(() => { document.getElementById("fx-e4m8").value = "x"; }); await p.click("#fEv button[type=submit]"); await p.waitForTimeout(500);
  ok(enviados() === 0, "evento: campo escondido lleno, no se manda nada");
  await llenarEv(); await p.click("#fEv button[type=submit]"); await p.waitForTimeout(500);
  ok(enviados() === 0, "evento: envío instantáneo, no se manda nada");
}

(async () => {
  const browser = await chromium.launch();
  for(const [nombre, vp] of [["celular 390 px", { width: 390, height: 800 }], ["escritorio 1280 px", { width: 1280, height: 900 }]]){
    console.log("\n== " + nombre);
    const lista = [[registro], [evento], [inicios], [ficha], [adminFoto], [fotoRegistro], [utm, "ola1-juriquilla"], [utm, "ola1-centro-sur"], [robots]];
    for(const [prueba, ...args] of lista){
      const { ctx, p, s } = await nuevaPagina(browser, vp);
      try{ await prueba(p, s, ...args); }catch(e){ ok(false, "la prueba se rompió: " + String(e.message).split("\n")[0]); }
      ok(s.errores.length === 0, "sin errores de consola" + (s.errores.length ? ": " + s.errores[0] : ""));
      await ctx.close();
    }
  }
  await browser.close();
  if(process.env.RUTAS_FOTOS) fs.writeFileSync(process.env.RUTAS_FOTOS, JSON.stringify([...new Set(rutasFotos)]));
  if(process.env.RUTAS_UTM) fs.writeFileSync(process.env.RUTAS_UTM, [...rutasUtm].join("\n"));
  console.log("\n" + (fallos.length ? fallos.length + " de " + pruebas + " pruebas fallaron" : "Todo bien: " + pruebas + " pruebas"));
  process.exit(fallos.length ? 1 : 0);
})();
