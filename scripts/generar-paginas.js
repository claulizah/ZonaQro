#!/usr/bin/env node
/* Genera páginas estáticas por negocio (/n/<slug>/), sitemap.xml y robots.txt a partir de los datos públicos de Supabase.
   Uso: node scripts/generar-paginas.js [--datos archivo.json] [--salida carpeta]
   Solo usa la llave pública (anon) que ya está en index.html y las mismas columnas que lee el sitio. */
const fs = require("fs"), path = require("path");
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const RAIZ = path.resolve(__dirname, ".."), SAL = path.resolve(arg("--salida") || RAIZ);
const src = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
const tomar = r => { const m = src.match(r); if(!m) throw new Error("No encontré " + r); return m[1]; };
const SB_URL = tomar(/const SB_URL = "([^"]+)"/), SB_KEY = tomar(/const SB_KEY = "([^"]+)"/), BASE = tomar(/const BASE_URL = "([^"]+)"/).replace(/\/$/, "");
const CATS = eval(tomar(/const CATEGORIAS = (\[[\s\S]*?\n\]);/));
const catNombre = id => (CATS.find(c => c.id === id) || {}).nombre || id;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slug = t => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "negocio";
const DK = ["lun","mar","mie","jue","vie","sab","dom"], DN = {lun:"Lun",mar:"Mar",mie:"Mié",jue:"Jue",vie:"Vie",sab:"Sáb",dom:"Dom"}, SCH = {lun:"Monday",mar:"Tuesday",mie:"Wednesday",jue:"Thursday",vie:"Friday",sab:"Saturday",dom:"Sunday"};
const h12 = t => { const [H, M] = t.split(":").map(Number); return (H % 12 || 12) + ":" + String(M).padStart(2, "0") + " " + (H >= 12 ? "pm" : "am"); };
function horarios(b){
  const h = b.horarios; if(!h || typeof h !== "object") return null; const o = {};
  for(const d of DK){ const t = h[d]; if(Array.isArray(t) && /^\d\d:\d\d$/.test(t[0]) && /^\d\d:\d\d$/.test(t[1])) o[d] = t; }
  return Object.keys(o).length ? o : null;
}
function horarioTexto(h){
  const g = []; let i = 0;
  while(i < 7){ const t = h[DK[i]]; if(!t){ i++; continue; } let j = i; while(j + 1 < 7 && h[DK[j+1]] && h[DK[j+1]][0] === t[0] && h[DK[j+1]][1] === t[1]) j++;
    const n = j - i + 1; g.push((n === 7 ? "Todos los días" : n === 1 ? DN[DK[i]] : DN[DK[i]] + " a " + DN[DK[j]]) + ", " + h12(t[0]) + " a " + h12(t[1])); i = j + 1; }
  return g.join(" · ");
}
const fotos = b => (Array.isArray(b.fotos) ? b.fotos : []).filter(u => typeof u === "string" && u.startsWith(SB_URL + "/storage/v1/object/public/fotos/") && !/[\s"'<>]/.test(u)).slice(0, 3);
const tel = w => { const d = String(w || "").replace(/\D/g, ""); return d.length === 10 ? "52" + d : d.length >= 11 ? d : ""; };
const urlSeguro = u => { try{ const x = new URL(/^https?:/i.test(u) ? u : "https://" + u); return /^https?:$/.test(x.protocol) ? x.href : ""; }catch(e){ return ""; } };
const completa = b => b.estado !== "rechazado" && !b.referencia && (b.descripcion || "").trim().length >= 30 && !(b.nombre === b.nombre.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(b.nombre));

function pagina(b, url){
  const zonas = (b.zonas || []).join(", "), cat = catNombre(b.categoria), hor = horarios(b), ft = fotos(b), t = tel(b.whatsapp), web = urlSeguro(b.sitio_web || "");
  const titulo = `${b.nombre} en ${zonas} | ZonaQro`;
  const desc = (b.descripcion.replace(/\s+/g, " ").trim().slice(0, 150) + (b.descripcion.length > 150 ? "…" : "")).replace(/…$/, "…");
  const ld = {"@context":"https://schema.org","@type":"LocalBusiness",name:b.nombre,description:b.descripcion,url,areaServed:(b.zonas || []).map(z => ({"@type":"Place",name:z + ", Querétaro"}))};
  if(ft.length) ld.image = ft;
  if(b.direccion) ld.address = {"@type":"PostalAddress",streetAddress:b.direccion,addressLocality:zonas.split(",")[0],addressRegion:"Querétaro",addressCountry:"MX"};
  if(t) ld.telephone = "+" + t;
  if(hor) ld.openingHoursSpecification = Object.entries(hor).map(([d, h]) => ({"@type":"OpeningHoursSpecification",dayOfWeek:SCH[d],opens:h[0],closes:h[1] === "00:00" ? "23:59" : h[1]}));
  const wa = t ? `https://wa.me/${t}?text=${encodeURIComponent("Hola, vi su negocio en ZonaQro y quisiera más información.")}` : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(cat + " en " + zonas + ". " + desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ZonaQro"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(ft[0] || BASE + "/og.png")}">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>
:root{--bg:#F4F7F2;--ink:#17231C;--muted:#56665B;--line:#D9E2D6;--agave:#2C674B;--wa:#187A42}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
header{background:#fff;border-bottom:1px solid var(--line);padding:12px 16px}header a{color:var(--agave);font-weight:800;text-decoration:none;font-size:1.1rem}
main{max-width:720px;margin:0 auto;padding:20px 16px 40px}h1{font-size:1.7rem;line-height:1.2;margin:.2em 0 .3em}
.tag{color:var(--muted);margin:0 0 16px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}
.card h2{font-size:1.05rem;margin:0 0 6px}.fotos{display:flex;gap:8px;overflow-x:auto;margin:12px 0}.fotos img{height:190px;border-radius:12px;flex:none;max-width:90%;object-fit:cover}
.btn{display:block;text-align:center;padding:14px;border-radius:12px;font-weight:700;text-decoration:none;margin:10px 0;border:2px solid var(--agave);color:var(--agave);background:#fff}
.btn.wa{background:var(--wa);border-color:var(--wa);color:#fff}footer{color:var(--muted);font-size:.9rem;text-align:center;padding:20px 16px}footer a{color:var(--agave)}
</style></head><body>
<header><a href="/">ZonaQro</a></header>
<main>
<h1>${esc(b.nombre)}</h1>
<p class="tag">${esc(cat)} · ${esc(zonas)}, Querétaro</p>
${ft.length ? `<div class="fotos">${ft.map(u => `<img src="${esc(u)}" alt="${esc(b.nombre)}" loading="lazy">`).join("")}</div>` : ""}
${wa ? `<a class="btn wa" href="${esc(wa)}" rel="nofollow noopener">Escribir por WhatsApp</a>` : ""}
<div class="card"><h2>Acerca de este negocio</h2><p style="margin:0">${esc(b.descripcion).replace(/\n/g, "<br>")}</p></div>
${hor || b.horario || b.direccion || b.entrega || web ? `<div class="card"><h2>Información</h2>
${hor ? `<p style="margin:.2em 0"><strong>Horario:</strong> ${esc(horarioTexto(hor))}</p>` : b.horario ? `<p style="margin:.2em 0"><strong>Horario:</strong> ${esc(b.horario)}</p>` : ""}
${b.direccion ? `<p style="margin:.2em 0"><strong>Dirección:</strong> ${esc(b.direccion)}</p>` : ""}
${b.entrega ? `<p style="margin:.2em 0"><strong>Entrega:</strong> ${esc(b.entrega)}</p>` : ""}
${web ? `<p style="margin:.2em 0"><strong>Sitio web:</strong> <a href="${esc(web)}" rel="nofollow noopener">${esc(web.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a></p>` : ""}</div>` : ""}
<a class="btn" href="/#n-${esc(b.id)}">Ver opiniones y cupones en ZonaQro</a>
<a class="btn" href="/#directorio">Más negocios en ${esc((b.zonas || ["tu zona"])[0])}</a>
</main>
<footer>ZonaQro · directorio de negocios de Zibatá, Zakia, Juriquilla, El Refugio, La Pradera y La Vista.<br><a href="/#registrar">Registra tu negocio gratis</a></footer>
</body></html>`;
}

async function datos(){
  const f = arg("--datos"); if(f) return JSON.parse(fs.readFileSync(f, "utf8"));
  const cols = "id,nombre,categoria,tipo,zonas,descripcion,whatsapp,direccion,horario,horarios,entrega,envio,fotos,sitio_web,referencia,alta";
  const r = await fetch(`${SB_URL}/rest/v1/negocios?estado=eq.aprobado&select=${cols}&order=nombre`, {headers:{apikey:SB_KEY, Authorization:"Bearer " + SB_KEY}});
  if(!r.ok) throw new Error("Supabase respondió " + r.status);
  return r.json();
}

(async () => {
  const todos = await datos(); const lista = todos.filter(completa);
  if(!Array.isArray(todos) || !todos.length) throw new Error("Sin datos: no toco nada para no borrar páginas por un error de red.");
  const usados = new Set(), urls = [];
  const dirN = path.join(SAL, "n"); fs.rmSync(dirN, {recursive:true, force:true}); fs.mkdirSync(dirN, {recursive:true});
  for(const b of lista){
    let s = slug(b.nombre + " " + (b.zonas || [])[0]); if(usados.has(s)) s += "-" + slug(String(b.id)).slice(0, 6); usados.add(s);
    const url = `${BASE}/n/${s}/`; fs.mkdirSync(path.join(dirN, s), {recursive:true}); fs.writeFileSync(path.join(dirN, s, "index.html"), pagina(b, url)); urls.push(url);
  }
  const hoy = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(SAL, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${BASE}/</loc><lastmod>${hoy}</lastmod><priority>1.0</priority></url>\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${hoy}</lastmod></url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(SAL, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
  console.log(`${lista.length} páginas de ${todos.length} negocios (omitidos: ${todos.length - lista.length} sin ficha completa)`);
})().catch(e => { console.error(e.message); process.exit(1); });
