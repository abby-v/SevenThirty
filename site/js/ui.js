import { BUILTIN } from './prices.js';
import { REGIONS, regionName, zoneOf } from './regions.js';
import { gbp, n, money, scalar, esc, fmtDate, fmtStamp } from './format.js';
import { rateLookup, globalHours } from './blocks.js';
import { SECTIONS, SVCMAP, SECTION_ORDER, FAMILY_SEC, defaults } from './services.js';
import { computeItem, computeGeneric, qtyLabel, itemSection, itemName, itemSum, computeAll, monthLabel, fiscalYears } from './engine.js';
import { toMarkdown, toCsv } from './exports.js';

// SevenThirty: the page itself (menu, configurator, estimate sheet, price data loading).
/** Pricing context for the engine, built from the current state. */
const COMMON_SVC=new Set(["Virtual Machines","Storage","SQL Database","SQL Managed Instance","Azure App Service","Azure Kubernetes Service","Azure Database for PostgreSQL","Azure Database for MySQL","Azure Cosmos DB","Functions","Azure Container Apps","Log Analytics","Azure Monitor","Backup","Key Vault","Redis Cache","Service Bus","Event Hubs","Azure Data Factory v2","Microsoft Fabric","Azure Synapse Analytics","Azure Firewall","Virtual Network","Application Gateway","Azure Front Door Service","Sentinel"]);
const C=()=>({snap:SNAP,overrides:S.overrides,mode:S.mode,custom:S.custom});
const $=id=>document.getElementById(id);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const store={get(k){try{return JSON.parse(localStorage.getItem(k)||"null");}catch(e){return null;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
/* ---- Live state ---- */
let SNAP=store.get("st-snapshot2")||BUILTIN;
let CAT=null;
let S=store.get("st-estimate-v2");
/* =====================================================================
   STATE
   ===================================================================== */
function exampleState(){
  const now=new Date();const m=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const st={v:2,meta:{client:"",title:"",by:"",status:"Indicative"},mode:"730",custom:196,overrides:{},acr:{start:m,term:36,live:1,ramp:1,disc:0,cont:0},items:[],
    ui:{view:"vm",region:"uksouth",draft:null,editing:null}};
  const add=(svc,cfg,region,label)=>st.items.push({uid:uid(),svc,region:region||"uksouth",label:label||"",cfg:Object.assign(defaults(svc),cfg)});
  add("fw",{sku:"Standard",qty:1,gb:2000},null,"Hub firewall");add("vpn",{sku:"VpnGw1AZ",qty:1,s2s:2});add("bas",{sku:"Standard",qty:1});
  add("vnet",{intra:1500,glob:200});add("pip",{qty:3});add("pe",{qty:8,gbin:150,gbout:150});add("dns",{pub:2,priv:12,pq:5,vq:25,rin:1,rout:1,rs:1});
  add("vm",{size:"Standard_D4s_v5",count:2,os:"Windows",osdisk:"P10"},null,"App servers");add("sqldb",{tier:"General Purpose",vc:"4",dbs:1});
  add("avd",{users:100,conc:80,work:"4",size:"Standard_D8s_v5",hours:"217"},null,"Office desktops");add("defender",{servers:4,plan:"Plan 2",sql:1,stor:2,arm:1});
  add("fw",{sku:"Standard",qty:1,gb:200},"ukwest","DR firewall");
  return st;
}
let isExample=false;
if(!S||S.v!==2){S=exampleState();isExample=true;}
if(!S.ui)S.ui={view:"vm",region:"uksouth"};
function newDraft(svc,region){return {svc,region:region||S.ui.region||"uksouth",label:"",cfg:defaults(svc)};}
if(!S.ui.draft||!SVCMAP[S.ui.draft.svc]){const v=SVCMAP[S.ui.view]?S.ui.view:"vm";S.ui.view=v;S.ui.draft=newDraft(v);S.ui.editing=null;}
function save(){store.set("st-estimate-v2",S);}
function touched(){isExample=false;save();}
/* =====================================================================
   RENDER: MENU
   ===================================================================== */
function renderMenu(){
  const counts={};S.items.forEach(it=>{const s=itemSection(it);const k=it.svc==="generic"||it.svc==="manual"?"other:"+s:it.svc;counts[k]=(counts[k]||0)+1;counts["sec:"+s]=(counts["sec:"+s]||0)+1;});
  $("menu").innerHTML=SECTIONS.map(([sid,label])=>`<div class="msec"><h2><span style="font-family:inherit;text-transform:inherit;letter-spacing:inherit;color:inherit;font-weight:inherit">${esc(label)}</span>${counts["sec:"+sid]?`<span>${counts["sec:"+sid]} in estimate</span>`:""}</h2><ul>`+
    SECTION_ORDER[sid].map(id=>{const s=SVCMAP[id];return `<li><button type="button" class="mbtn" data-view="${id}" aria-current="${S.ui.view===id}" title="${esc(s.blurb)}"><span>${esc(s.name)}</span>${counts[id]?`<span class="cnt">${counts[id]}</span>`:""}</button></li>`;}).join("")+
    `<li><button type="button" class="mbtn more" data-view="catalog" data-sec="${sid}" aria-current="${S.ui.view==="catalog"&&catSec===sid}">More ${esc(label.toLowerCase())} services</button></li></ul></div>`).join("")+
    `<div class="msec"><h2>Anything else</h2><ul><li><button type="button" class="mbtn" data-view="catalog" data-sec="" aria-current="${S.ui.view==="catalog"&&!catSec}">Search all Azure services</button></li><li><button type="button" class="mbtn" data-view="manual" aria-current="${S.ui.view==="manual"}">Add a manual line</button></li></ul></div>`;
}

/* =====================================================================
   RENDER: CONFIGURATOR
   ===================================================================== */
function optList(f,c,ctx){const o=typeof f.opts==="function"?f.opts(c,ctx):f.opts;return o.map(x=>Array.isArray(x)?x:[x,x]);}
function regionSelect(id,val){return `<label class="field" for="${id}"><span class="fl">Region</span><select id="${id}" data-d="region">${REGIONS.map(([v,t])=>`<option value="${v}"${v===val?" selected":""}>${esc(t)}${(SNAP.regions||{})[v]?"":" (load prices)"}</option>`).join("")}</select></label>`;}
function fieldHtml(f,c,ctx){const id="f-"+f.k;const lab=`<span class="fl">${esc(f.label||"Hours per month")}${f.unit?` <span class="u">${esc(f.unit)}</span>`:""}</span>`;const hint=f.hint?`<span class="hint">${esc(f.hint)}</span>`:"";
  if(f.type==="sel"){const opts=optList(f,c,ctx);return `<label class="field${f.wide?" wide":""}" for="${id}">${lab}<select id="${id}" data-f="${f.k}">${opts.map(([v,t])=>`<option value="${esc(v)}"${String(v)===String(c[f.k])?" selected":""}>${esc(t)}</option>`).join("")}</select>${hint}</label>`;}
  if(f.type==="hours")return `<label class="field" for="${id}">${lab}<input id="${id}" type="number" min="0" max="744" step="1" inputmode="numeric" data-f="hours" value="${esc(c.hours??"")}" placeholder="${globalHours(S)}"><span class="hint">Blank uses the ${n(globalHours(S))} h set at the top.</span></label>`;
  return `<label class="field${f.wide?" wide":""}" for="${id}">${lab}<input id="${id}" type="number" min="0" step="any" inputmode="decimal" data-f="${f.k}" value="${esc(c[f.k])}">${hint}</label>`;}
function renderCfg(){
  const v=S.ui.view;if(v==="catalog")return renderCatalog();if(v==="manual")return renderManual();
  const d=S.ui.draft;const def=SVCMAP[d.svc];const r=rateLookup(C(),d.region);const ctx={region:d.region,r,snap:SNAP};
  // normalise select values to the options on offer
  def.fields.forEach(f=>{if(f.type==="sel"){const o=optList(f,d.cfg,ctx).map(x=>String(x[0]));if(o.length&&!o.includes(String(d.cfg[f.k])))d.cfg[f.k]=o.includes(String(f.def))?f.def:o[0];}});
  const c=d.cfg;const main=def.fields.filter(f=>!f.more),more=def.fields.filter(f=>f.more);
  const editing=S.ui.editing&&S.items.find(x=>x.uid===S.ui.editing);
  $("cfg").innerHTML=`<div class="crumb">${esc(SECTIONS.find(s=>s[0]===def.sec)[1])}</div><h2>${esc(def.name)}</h2><p class="lead">${esc(def.desc)}</p>
   ${editing?`<div class="editing"><span>Editing <b>${esc(itemName(editing))}</b> in your estimate.</span><button class="btn sm" type="button" id="cancelEdit">Stop editing</button></div>`:""}
   ${def.presets?`<div class="presets"><span>Start from</span>${def.presets.map(([lbl],i)=>`<button type="button" class="preset" data-preset="${i}">${esc(lbl)}</button>`).join("")}</div>`:""}
   <div class="fields">
     <label class="field wide" for="f-label"><span class="fl">Name in estimate <span class="u">(optional)</span></span><input id="f-label" type="text" data-d="label" value="${esc(d.label)}" placeholder="${esc(def.name)}"></label>
     ${def.global?`<div class="field"><span class="fl">Region</span><span class="hint">Global service. Priced at ${esc(zoneOf(d.region)||"Zone 1")} rates.</span></div>`:regionSelect("f-region",d.region)}
     ${main.map(f=>fieldHtml(f,c,ctx)).join("")}
   </div>
   ${more.length?`<details class="more"${S.ui.moreOpen?" open":""} id="moreBox"><summary>More options</summary><div class="fields">${more.map(f=>fieldHtml(f,c,ctx)).join("")}</div></details>`:""}
   <div id="cfgNotes"></div>
   <ul class="ledger" id="cfgLedger"></ul>
   <details class="rates" id="ratesBox"><summary>Rates used, editable for ${esc(regionName(d.region))}</summary><table class="rt" id="ratesTable"></table><div class="row"><button class="btn sm" type="button" id="resetRates">Reset rate edits for this region</button></div></details>
   <div class="cta"><div class="price" id="cfgPrice">£0.00 <small>/ month</small></div><div class="acts">
     ${editing?`<button class="btn" type="button" id="addNew">Add as a new item</button><button class="btn primary big" type="button" id="saveEdit">Save changes</button>`:`<button class="btn primary big" type="button" id="addItem">Add to estimate</button>`}</div></div>`;
  updateCfg();
}
function draftItem(){const d=S.ui.draft;return {uid:"draft",svc:d.svc,region:d.region,label:d.label,cfg:d.cfg};}
function updateCfg(){
  if(S.ui.view==="catalog"||S.ui.view==="manual")return;
  const it=draftItem();const res=computeItem(C(),it);const def=SVCMAP[it.svc];
  $("cfgLedger").innerHTML=(res.lines.length?res.lines.map(ledgerLi).join(""):`<li class="empty">Enter a quantity to see the working.</li>`)+
    (res.payg-res.amt>0.005?`<li class="empty">Pay-as-you-go would be ${gbp(res.payg)} a month: this pricing saves ${gbp(res.payg-res.amt)}.</li>`:"");
  $("cfgPrice").innerHTML=`${gbp(res.amt)} <small>/ month</small>`;
  const notes=[...(def.notes?def.notes(res.c,res.h,{region:it.region},res.lines):[])];
  if(def.pause===false&&res.h&&res.h.v<730)notes.unshift({t:"note",x:`${def.name} has no stopped state. ${n(res.h.v)} h is only right if you delete and redeploy it on a schedule; otherwise use 730.`});
  if(res.lines.some(l=>l.srcs.some(s=>s.src==="proxy")))notes.unshift({t:"note",x:`Some rates aren't in today's price data for ${regionName(it.region)}, so a stand-in is used and flagged. Check the flagged lines before sharing.`});
  if(res.lines.some(l=>l.srcs.some(s=>s.src==="missing")))notes.unshift({t:"note",x:"A line has no published rate in the loaded price data and is costed at £0. Load a rates file, or enter the rate under Rates used."});
  $("cfgNotes").innerHTML=notes.map(x=>`<p class="${x.t}">${esc(x.x)}</p>`).join("");
  renderRates(res,it.region);
}
function ledgerLi(l){const f=[];if(l.srcs.some(s=>s.src==="missing"))f.push('<span class="flag">no rate</span>');else if(l.srcs.some(s=>s.src==="proxy"))f.push('<span class="flag">stand-in rate</span>');
  if(l.srcs.some(s=>s.verify))f.push('<span class="flag verify">verify</span>');if(l.srcs.some(s=>s.src==="manual"&&s.key))f.push('<span class="flag edit">edited rate</span>');
  return `<li><span class="kind ${l.kind}">${l.kind}</span><span class="what">${esc(l.what)}${f.join("")}</span><span class="calc">${esc(l.calc)}</span><span class="amt">${gbp(l.amt)}</span></li>`;}
function renderRates(res,region){const t=$("ratesTable");if(!t)return;const seen=new Map();res.lines.forEach(l=>l.srcs.forEach(s=>{if(s.key&&!seen.has(s.key))seen.set(s.key,s);}));
  t.innerHTML=seen.size?[...seen.values()].map(s=>{const k=s.key;const tiered=Array.isArray(s.v);const src=s.src==="region"?"regional":s.src==="global"?"global or zone":s.src==="proxy"?`stand-in from ${s.from==="snapshot"?"the built-in snapshot":s.from==="Zone 1"?"Zone 1":regionName(s.from)}`:s.src==="manual"?"edited":"missing";
    return `<tr><td>${esc(k.replace(/_/g," "))} <span class="u">${esc(src)}</span></td><td>${tiered?`<span class="u">tiered: ${s.v.map(x=>money(x[1])).join(" → ")}</span>`:`<label class="sr" for="rate-${k}">${esc(k)} in pounds</label><input id="rate-${k}" type="number" step="any" min="0" data-rate="${k}" value="${scalar(s.v)}" class="${s.src==="manual"?"changed":""}">`}</td></tr>`;}).join(""):`<tr><td>No rates used yet.</td></tr>`;}

/* ---- Catalogue and manual views ---- */
let catSec="",catQ="",catIndex=null,catIndexFor=null,MAN=null,catLoading=null;
function loadServerCatalogue(){if(catLoading||!MAN||!MAN.catalogue)return catLoading;catLoading=(async()=>{try{const r=await fetch(`data/${MAN.catalogue}?v=${encodeURIComponent(MAN.generatedAt||MAN.generated)}`);if(!r.ok)throw new Error(r.status);const obj=await r.json();if(obj&&obj.catalog){CAT={generated:obj.generated,strings:obj.catalog.strings,scopes:obj.catalog.scopes};catIndex=null;IDB.set("catalog",CAT);}}catch(e){toast("The price catalogue couldn't be loaded. Try again shortly.");}finally{catLoading=null;syncTop();if(S.ui.view==="catalog")renderCatalog();}})();return catLoading;}
function catScopes(id){return [id,zoneOf(id),"global",""].filter((x,i,a)=>x!=null&&a.indexOf(x)===i&&CAT.scopes[x]);}
function buildIndex(id){if(catIndexFor===id&&catIndex)return catIndex;const T=CAT.strings;const idx=[];
  catScopes(id).forEach(sc=>CAT.scopes[sc].forEach(row=>idx.push({sc,row,svc:T[row[0]],fam:T[row[11]]||"",t:(T[row[0]]+" "+T[row[1]]+" "+T[row[2]]+" "+T[row[3]]).toLowerCase()})));catIndex=idx;catIndexFor=id;return idx;}
function renderCatalog(){
  if((!CAT||(MAN&&MAN.catalogue&&CAT.generated!==MAN.generated))&&MAN&&MAN.catalogue){if(!catLoading)loadServerCatalogue();if(!CAT){$("cfg").innerHTML=`<div class="crumb">Price catalogue</div><h2>Loading every Azure meter…</h2><p class="lead">This happens once a day; after that, search is instant.</p>`;return;}}
  const region=S.ui.region||"uksouth";const secName=catSec?SECTIONS.find(s=>s[0]===catSec)[1]:"All Azure services";
  $("cfg").innerHTML=`<div class="crumb">${esc(catSec?secName:"Anything else")}</div><h2>${catSec?`More ${esc(secName.toLowerCase())} services`:"Search all Azure services"}</h2>
   <p class="lead">${CAT?`Every meter Microsoft publishes for the region, with reservation and savings plan prices where they exist. Search by product or size, then add it to the estimate.`:
     `To search every Azure service, load a catalogue file once: run <code>python fetch_prices.py --catalog uksouth ukwest</code> and choose the file under Price data and estimate files. Until then you can add a manual line for anything.`}</p>
   <div class="fields">${regionSelect("c-region",region)}</div>
   ${CAT?`<div class="search" role="search"><label class="sr" for="catQ">Search Azure meters</label><input id="catQ" type="search" placeholder="e.g. App Service P1 v3, PostgreSQL D4ds, Cosmos DB, Container Apps" value="${esc(catQ)}" autocomplete="off">
     <label class="sr" for="catSecSel">Section</label><select id="catSecSel"><option value="">All sections</option>${SECTIONS.map(([v,t])=>`<option value="${v}"${v===catSec?" selected":""}>${esc(t)}</option>`).join("")}</select></div>
     <ul class="results" id="catResults" aria-live="polite"></ul>`:`<div class="cta"><span></span><div class="acts"><button class="btn" type="button" data-view="manual">Add a manual line</button><button class="btn primary" type="button" id="openPrice">Load price data</button></div></div>`}`;
  renderResults();
}
function renderResults(){const ul=$("catResults");if(!ul||!CAT)return;const reg=S.ui.region||"uksouth";if(!CAT.scopes[reg]){ul.innerHTML=`<li><span class="none">The loaded catalogue has no meters for ${esc(regionName(reg))}, only global services. Run the pricing script with ${esc(reg)} included to search it.</span></li>`;}const idx=buildIndex(reg);if(!CAT.scopes[reg]&&!catQ)return;const toks=catQ.toLowerCase().split(/\s+/).filter(Boolean);
  const all=[];for(const x of idx){if(catSec&&(FAMILY_SEC[x.fam]||"other")!==catSec)continue;if(toks.every(t=>x.t.includes(t))){all.push(x);if(all.length>=2000)break;}}
  // Rank: words matching the SKU or meter name first, then the services consultants price most, then shorter names.
  const T0=CAT.strings;const rank=x=>{const r=x.row;const sku=(T0[r[2]]+" "+T0[r[3]]).toLowerCase();let s=0;const sv=x.svc.toLowerCase();toks.forEach(t=>{if(sku.includes(t))s+=4;if(sv.includes(t))s+=4;});if(COMMON_SVC.has(x.svc))s+=3;if(/spot|low priority|dev\/?test/i.test(sku))s-=3;if(/windows/i.test(T0[r[1]]))s-=1;return s-(T0[r[1]].length+T0[r[2]].length)/200;};
  const hits=all.map(x=>[rank(x),x]).sort((a,b)=>b[0]-a[0]).slice(0,60).map(p=>p[1]);
  const T=CAT.strings;ul._hits=hits;
  ul.innerHTML=hits.length?hits.map((x,i)=>{const r=x.row;const ex=[r[7]?"1-yr RI":"",r[8]?"3-yr RI":"",r[9]?"savings plan":""].filter(Boolean).join(", ");
    return `<li><div style="min-width:0"><div class="rn">${esc(T[r[2]])} · ${esc(T[r[3]])}</div><div class="rm">${esc(T[r[0]])} › ${esc(T[r[1]])} · ${esc(x.sc==="global"?"Global":x.sc?regionName(x.sc):"No region")}</div></div>
     <div class="rp">${money(r[5])} <span style="color:var(--muted)">/ ${esc(T[r[4]])}</span>${ex?`<small>${esc(ex)}</small>`:""}</div><button class="btn sm" type="button" data-add="${i}">Add</button></li>`;}).join("")+(hits.length>=60?`<li><span class="none">Showing the first 60. Add more words to narrow it down.</span></li>`:"")
    :`<li><span class="none">${toks.length||catSec?"No meters match. Try fewer or different words.":"Type to search."}</span></li>`;}
function renderManual(){const region=S.ui.region||"uksouth";
  $("cfg").innerHTML=`<div class="crumb">Anything else</div><h2>Add a manual line</h2><p class="lead">For anything not covered yet: a marketplace product, a licence, or a meter you've priced elsewhere. It's marked as a manual rate in exports.</p>
   <div class="fields">
    <label class="field wide" for="mName"><span class="fl">Name</span><input id="mName" type="text" placeholder="e.g. Third-party firewall licence"></label>
    <label class="field" for="mSec"><span class="fl">Section</span><select id="mSec">${SECTIONS.map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join("")}</select></label>
    ${regionSelect("m-region",region)}
    <label class="field" for="mUnit"><span class="fl">Charged</span><select id="mUnit"><option value="1 Hour">per hour</option><option value="1/Month">per month</option><option value="1 GB">per GB</option><option value="1">per unit used</option></select></label>
    <label class="field" for="mRate"><span class="fl">Rate <span class="u">£</span></span><input id="mRate" type="number" min="0" step="any"></label>
    <label class="field" for="mQty"><span class="fl">Quantity</span><input id="mQty" type="number" min="0" step="any" value="1"></label>
   </div><div class="cta"><span></span><div class="acts"><button class="btn primary big" type="button" id="mAdd">Add to estimate</button></div></div>`;}
/* Generic item editor (catalogue or manual), shown when editing such an item */
function renderGenericEdit(it){const res=computeGeneric(C(),it);const pu=res.pu;const opts=[["payg","Pay-as-you-go"]];if(pu.cls==="hour"){if(it.ri1)opts.push(["ri1","1-year reservation"]);if(it.ri3)opts.push(["ri3","3-year reservation"]);if(it.sp1)opts.push(["sp1","1-year savings plan"]);if(it.sp3)opts.push(["sp3","3-year savings plan"]);}
  $("cfg").innerHTML=`<div class="crumb">${esc(SECTIONS.find(s=>s[0]===itemSection(it))?.[1]||"Other")}</div><h2>${esc(itemName(it))}</h2>
   <p class="lead">${it.svc==="manual"?`Manual rate ${money(Number(it.payg)||0)} ${esc(pu.raw)}.`:`${esc(it.meta.svc)} › ${esc(it.meta.prod)} · ${esc(it.meta.sku)} · ${esc(it.meta.meter)} · ${esc(it.unit)} · priced ${esc(fmtDate(it.date))}`}</p>
   <div class="editing"><span>Editing this item in your estimate. Changes apply as you type.</span><button class="btn sm" type="button" id="cancelEdit">Done</button></div>
   <div class="fields"><label class="field wide" for="g-label"><span class="fl">Name in estimate</span><input id="g-label" type="text" data-g="label" value="${esc(it.label||"")}"></label>
    <label class="field" for="g-qty"><span class="fl">${esc(qtyLabel(pu))}</span><input id="g-qty" type="number" min="0" step="any" data-g="qty" value="${esc(it.cfg.qty)}"></label>
    ${pu.cls==="hour"?`<label class="field" for="g-hours"><span class="fl">Hours per month</span><input id="g-hours" type="number" min="0" max="744" data-g="hours" value="${esc(it.cfg.hours??"")}" placeholder="${globalHours(S)}"></label>`:""}
    ${opts.length>1?`<label class="field" for="g-pricing"><span class="fl">Pricing</span><select id="g-pricing" data-g="pricing">${opts.map(([v,t])=>`<option value="${v}"${v===(it.cfg.pricing||"payg")?" selected":""}>${t}</option>`).join("")}</select></label>`:""}
   </div><ul class="ledger" id="genLedger">${res.lines.map(ledgerLi).join("")}${res.payg-res.amt>0.005?`<li class="empty">Pay-as-you-go would be ${gbp(res.payg)}: saving ${gbp(res.payg-res.amt)} a month.</li>`:""}</ul>
   <div class="cta"><div class="price">${gbp(res.amt)} <small>/ month</small></div></div>`;}

/* =====================================================================
   RENDER: ESTIMATE
   ===================================================================== */
let R,liveTimer,pendingRemove=null;
function renderSheet(){
  $("total").innerHTML=`${gbp(R.monthly)} <small>/ month</small>`;$("mTotal").textContent=gbp(R.monthly);
  clearTimeout(liveTimer);liveTimer=setTimeout(()=>{$("liveTotal").textContent=`Estimate ${gbp(R.monthly)} a month`;},700);
  $("kAnnual").textContent=gbp(R.monthly*12,0);$("kTermLbl").textContent=`${R.term}-month ACR`;$("kTerm").textContent=gbp(R.termTotal,0);
  $("tS").textContent=gbp(R.standing);$("tU").textContent=gbp(R.usage);
  $("barS").style.width=R.list?(R.standing/R.list*100)+"%":"0";$("barU").style.width=R.list?(R.usage/R.list*100)+"%":"0";
  if(!R.items.length){$("groups").innerHTML=`<div class="emptyest">Nothing here yet. Pick a service on the left, set it up, then choose Add to estimate.</div>`;}
  else $("groups").innerHTML=[...SECTIONS,["other","Other"]].map(([sid,label])=>{const its=R.items.filter(x=>itemSection(x.it)===sid);if(!its.length)return "";
    const tot=its.reduce((a,x)=>a+x.res.amt,0);
    return `<section class="grp" aria-label="${esc(label)}"><h3><span>${esc(label)}</span><span>${gbp(tot)}</span></h3><ul>${its.map(({it,res})=>{const flag=res.lines.some(l=>l.srcs.some(s=>s.src==="missing"||s.src==="proxy"));
      return `<li class="it${S.ui.editing===it.uid?" sel":""}" data-uid="${it.uid}"><span class="nm">${esc(itemName(it))}${flag?' <span class="flag">check rates</span>':""}</span><span class="am">${gbp(res.amt)}</span>
        <span class="sb">${esc(regionName(it.region))} · ${esc(itemSum(it,res))}</span>
        <span class="acts"><button type="button" data-act="edit">Edit</button><button type="button" data-act="dup">Duplicate</button><button type="button" data-act="del">${pendingRemove===it.uid?"Confirm remove":"Remove"}</button></span></li>`;}).join("")}</ul></section>`;}).join("");
  let adj="";if(R.commitSave>0.005)adj+=`<div class="adjrow"><span>Saving from commitments vs pay-as-you-go</span><span>${gbp(R.commitSave)}</span></div>`;
  if(R.disc>0)adj+=`<div class="adjrow"><span>Discount ${n(R.disc*100)}%</span><span>${gbp(-R.list*R.disc)}</span></div>`;
  if(R.cont>0)adj+=`<div class="adjrow"><span>Contingency ${n(R.cont*100)}%</span><span>${gbp(R.list*(1-R.disc)*R.cont)}</span></div>`;
  $("adjust").innerHTML=adj;renderChart();renderFY();
}
function niceMax(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const m=v/p;return (m<=1?1:m<=2?2:m<=5?5:10)*p;}
function shortGbp(v){return v>=1000?"£"+(v/1000).toLocaleString("en-GB",{maximumFractionDigits:1})+"k":"£"+Math.round(v);}
function renderChart(){const W=340,H=150,pl=44,pb=22,pt=10,pr=6;const nice=niceMax(Math.max(...R.months,1));const bw=(W-pl-pr)/R.months.length;
  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" font-family="IBM Plex Mono, monospace" font-size="9">`;
  [0,.5,1].forEach(f=>{const y=pt+(H-pt-pb)*(1-f);s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="var(--rule)" stroke-width="1"/><text x="${pl-5}" y="${y+3}" text-anchor="end" fill="var(--muted)">${shortGbp(nice*f)}</text>`;});
  R.months.forEach((v,i)=>{const h=(H-pt-pb)*(v/nice);s+=`<rect x="${(pl+i*bw+bw*.15).toFixed(1)}" y="${(H-pb-h).toFixed(1)}" width="${(bw*.7).toFixed(1)}" height="${h.toFixed(1)}" fill="var(--accent)" rx="1"/>`;});
  const step=R.months.length>24?12:6;for(let i=0;i<R.months.length;i+=step)s+=`<text x="${pl+i*bw+bw/2}" y="${H-6}" text-anchor="middle" fill="var(--muted)">${esc(monthLabel(S.acr.start,i))}</text>`;
  $("chart").innerHTML=s+"</svg>";$("chart").setAttribute("aria-label",`Monthly consumption over ${R.term} months, reaching ${gbp(R.monthly)} per month at steady state`);}
function renderFY(){const map=fiscalYears(S.acr.start,R.months);
  $("fyTable").innerHTML=`<caption class="sr">Consumption by Microsoft fiscal year (July to June)</caption><tr><th scope="col">Microsoft fiscal year</th><th scope="col">Consumption</th></tr>`+
   [...map.entries()].map(([f,v])=>`<tr><td>FY${String(f).slice(2)} (Jul ${f-1} – Jun ${f})</td><td>${gbp(v,0)}</td></tr>`).join("")+`<tr><th scope="row">Term total</th><td>${gbp(R.termTotal,0)}</td></tr>`;}
function syncTop(){document.querySelectorAll("#seg button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===S.mode)));$("customHours").value=S.custom;
  $("dClient").value=S.meta.client||"";$("dTitle").value=S.meta.title||"";$("dBy").value=S.meta.by||"";$("dStatus").value=S.meta.status||"Indicative";
  $("aStart").value=S.acr.start;$("aTerm").value=String(S.acr.term);$("aLive").value=S.acr.live;$("aRamp").value=S.acr.ramp;$("aDisc").value=S.acr.disc;$("aCont").value=S.acr.cont;
  $("snapDate").textContent=SNAP.live?`updated ${fmtStamp(SNAP.generatedAt||SNAP.generated)}`:`${SNAP.imported?"loaded ":"snapshot "}${fmtDate(SNAP.generated)}`;
  if(MAN&&!MAN.seed&&$("priceIntro"))$("priceIntro").textContent=`Prices refresh automatically every day at 06:00 GMT from Microsoft's Azure Retail Prices API, for ${(MAN.regions||[]).map(regionName).join(", ")}. You can still load a file here, for example to price another region, or reopen an estimate file copied from this page.`;
  $("catStat").innerHTML=CAT?`Catalogue loaded: <b>${n(Object.values(CAT.scopes).reduce((a,x)=>a+x.length,0))} meters</b> from ${esc(fmtDate(CAT.generated))}, covering ${esc(Object.keys(CAT.scopes).filter(k=>k&&k!=="global"&&!/^Zone/.test(k)).map(regionName).join(", ")||"shared services only")}.`:"No catalogue loaded.";}
function refresh(){R=computeAll(C(),S.items,S.acr);renderSheet();}
function full(){R=computeAll(C(),S.items,S.acr);renderMenu();renderCfgOrEdit();renderSheet();syncTop();}
function renderCfgOrEdit(){const ed=S.ui.editing&&S.items.find(x=>x.uid===S.ui.editing);if(ed&&(ed.svc==="generic"||ed.svc==="manual"))renderGenericEdit(ed);else renderCfg();}

/* =====================================================================
   EVENTS
   ===================================================================== */
function openView(v,sec){S.ui.view=v;S.ui.editing=null;if(v==="catalog"){catSec=sec||"";}else if(v!=="manual"){S.ui.draft=newDraft(v,S.ui.draft?.region);S.ui.moreOpen=false;}save();renderMenu();renderCfg();
  const h=$("cfg").querySelector("h2");if(h){h.setAttribute("tabindex","-1");h.focus({preventScroll:false});}}
$("menu").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(!b)return;openView(b.dataset.view,b.dataset.sec);});
const cfg=$("cfg");
cfg.addEventListener("input",e=>{const el=e.target;const d=S.ui.draft;
  const ed=S.ui.editing&&S.items.find(x=>x.uid===S.ui.editing);
  if(el.dataset.g&&ed){if(el.dataset.g==="label")ed.label=el.value;else ed.cfg[el.dataset.g]=el.value;touched();refresh();if(el.tagName!=="SELECT"){const res=computeGeneric(C(),ed);$("genLedger").innerHTML=res.lines.map(ledgerLi).join("");cfg.querySelector(".cta .price").innerHTML=`${gbp(res.amt)} <small>/ month</small>`;}return;}
  if(el.id==="catQ"){catQ=el.value;clearTimeout(cfg._t);cfg._t=setTimeout(renderResults,120);return;}
  if(el.dataset.d==="label"){d.label=el.value;syncEdit();return;}
  if(el.dataset.f&&el.tagName==="INPUT"){d.cfg[el.dataset.f]=el.value;syncEdit();updateCfg();return;}
});
cfg.addEventListener("change",e=>{const el=e.target;const d=S.ui.draft;
  const ed=S.ui.editing&&S.items.find(x=>x.uid===S.ui.editing);
  if(el.dataset.g==="pricing"&&ed){ed.cfg.pricing=el.value;touched();refresh();renderGenericEdit(ed);return;}
  if(el.id==="catSecSel"){catSec=el.value;renderMenu();renderResults();return;}
  if(el.id==="c-region"||el.id==="m-region"){S.ui.region=el.value;catIndex=null;save();if(el.id==="c-region")renderResults();return;}
  if(el.dataset.d==="region"){d.region=el.value;S.ui.region=el.value;syncEdit();renderCfg();return;}
  if(el.dataset.f&&el.tagName==="SELECT"){d.cfg[el.dataset.f]=el.value;syncEdit();renderCfg();const f=$("f-"+el.dataset.f);if(f)f.focus();}
});
cfg.addEventListener("toggle",e=>{if(e.target.id==="moreBox")S.ui.moreOpen=e.target.open;},true);
cfg.addEventListener("click",e=>{const t=e.target.closest("button");if(!t)return;const d=S.ui.draft;
  if(t.dataset.preset!=null){const def=SVCMAP[d.svc];Object.assign(d.cfg,defaults(d.svc),def.presets[Number(t.dataset.preset)][1]);syncEdit();renderCfg();toast(`Loaded “${def.presets[Number(t.dataset.preset)][0]}”`);return;}
  if(t.id==="addItem"||t.id==="addNew"){const it={uid:uid(),svc:d.svc,region:d.region,label:d.label,cfg:Object.assign({},d.cfg)};S.items.push(it);S.ui.editing=null;touched();full();flashItem(it.uid);toast(`Added ${itemName(it)} to the estimate`);return;}
  if(t.id==="saveEdit"){S.ui.editing=null;touched();full();toast("Changes saved");return;}
  if(t.id==="cancelEdit"){S.ui.editing=null;if(!SVCMAP[S.ui.view]&&S.ui.view!=="catalog"&&S.ui.view!=="manual")S.ui.view="vm";if(SVCMAP[S.ui.view])S.ui.draft=newDraft(S.ui.view,d?.region);save();full();return;}
  if(t.id==="resetRates"){delete S.overrides[d.region];touched();refresh();updateCfg();toast(`Rate edits cleared for ${regionName(d.region)}`);return;}
  if(t.id==="openPrice"){$("pricePanel").open=true;$("pricePanel").scrollIntoView?.({behavior:"smooth"});return;}
  if(t.dataset.view){openView(t.dataset.view);return;}
  if(t.dataset.add!=null){const x=($("catResults")._hits||[])[Number(t.dataset.add)];if(!x)return;const T=CAT.strings;const r=x.row;
    const it={uid:uid(),svc:"generic",sec:FAMILY_SEC[x.fam]||catSec||"other",region:S.ui.region||"uksouth",label:`${T[r[0]]}: ${T[r[2]]}`,meta:{svc:T[r[0]],prod:T[r[1]],sku:T[r[2]],meter:T[r[3]],scope:x.sc},
      unit:T[r[4]],payg:r[5],tiers:r[6]||null,ri1:r[7]||0,ri3:r[8]||0,sp1:r[9]||0,sp3:r[10]||0,date:CAT.generated,cfg:{qty:1,hours:"",pricing:"payg"}};
    S.items.push(it);S.ui.editing=it.uid;touched();full();flashItem(it.uid);toast(`Added ${it.label}. Set the quantity here.`);const q=$("g-qty");if(q)q.focus();return;}
  if(t.id==="mAdd"){const rate=$("mRate").value;if(rate===""||!(Number(rate)>=0)){toast("Enter a rate in pounds.");$("mRate").focus();return;}
    const it={uid:uid(),svc:"manual",sec:$("mSec").value,region:$("m-region").value,label:$("mName").value||"Manual line",unit:$("mUnit").value,payg:Number(rate),tiers:null,date:new Date().toISOString().slice(0,10),cfg:{qty:$("mQty").value||1,hours:"",pricing:"payg"}};
    S.items.push(it);touched();full();flashItem(it.uid);toast(`Added ${it.label}`);return;}
});
$("cfg").addEventListener("input",e=>{const k=e.target.dataset.rate;if(!k)return;const v=Number(e.target.value);if(isNaN(v)||e.target.value==="")return;const d=S.ui.draft;
  (S.overrides[d.region]=S.overrides[d.region]||{})[k]=v;e.target.classList.add("changed");touched();refresh();
  const it=draftItem();const res=computeItem(C(),it);$("cfgLedger").innerHTML=res.lines.map(ledgerLi).join("");$("cfgPrice").innerHTML=`${gbp(res.amt)} <small>/ month</small>`;});
/* while editing an estimate item, changes in the configurator apply to it live */
function syncEdit(){const ed=S.ui.editing&&S.items.find(x=>x.uid===S.ui.editing);if(ed){const d=S.ui.draft;ed.region=d.region;ed.label=d.label;ed.cfg=Object.assign({},d.cfg);touched();refresh();}else save();}
function flashItem(id){const el=document.querySelector(`.it[data-uid="${id}"]`);if(el){el.classList.add("sel");setTimeout(()=>{if(S.ui.editing!==id)el.classList.remove("sel");},1600);}}
$("groups").addEventListener("click",e=>{const b=e.target.closest("button[data-act]");if(!b)return;const id=b.closest("[data-uid]").dataset.uid;const it=S.items.find(x=>x.uid===id);if(!it)return;
  if(b.dataset.act==="edit"){S.ui.editing=id;if(it.svc==="generic"||it.svc==="manual"){S.ui.view="generic";}else{S.ui.view=it.svc;S.ui.draft={svc:it.svc,region:it.region,label:it.label,cfg:Object.assign(defaults(it.svc),it.cfg)};}
    save();full();$("cfg").scrollIntoView?.({behavior:"smooth",block:"start"});return;}
  if(b.dataset.act==="dup"){const c=JSON.parse(JSON.stringify(it));c.uid=uid();c.label=(it.label||itemName(it))+" (copy)";S.items.splice(S.items.indexOf(it)+1,0,c);touched();full();flashItem(c.uid);toast("Duplicated");return;}
  if(b.dataset.act==="del"){if(pendingRemove!==id){pendingRemove=id;renderSheet();setTimeout(()=>{if(pendingRemove===id){pendingRemove=null;renderSheet();}},4000);return;}
    pendingRemove=null;S.items=S.items.filter(x=>x.uid!==id);if(S.ui.editing===id){S.ui.editing=null;if(S.ui.view==="generic")S.ui.view="vm";S.ui.draft=newDraft(SVCMAP[S.ui.view]?S.ui.view:"vm");}touched();full();toast(`Removed ${itemName(it)}`);}
});
$("seg").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;S.mode=b.dataset.mode;touched();syncTop();refresh();renderCfgOrEdit();if(S.mode==="custom")$("customHours").focus();});
$("customHours").addEventListener("input",e=>{S.custom=e.target.value;S.mode="custom";touched();document.querySelectorAll("#seg button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===S.mode)));refresh();updateCfg();});
[["dClient","client"],["dTitle","title"],["dBy","by"],["dStatus","status"]].forEach(([i,k])=>$(i).addEventListener("input",e=>{S.meta[k]=e.target.value;touched();}));
[["aStart","start"],["aTerm","term"],["aLive","live"],["aRamp","ramp"],["aDisc","disc"],["aCont","cont"]].forEach(([i,k])=>{const h=e=>{S.acr[k]=e.target.value;touched();refresh();};$(i).addEventListener("input",h);$(i).addEventListener("change",h);});
$("themeBtn").addEventListener("click",()=>{const cur=document.documentElement.getAttribute("data-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",cur==="dark"?"light":"dark");});
let pendingNew=false;
$("newEst").addEventListener("click",e=>{if(!pendingNew){pendingNew=true;e.target.textContent="Confirm: clear this estimate";e.target.classList.add("primary");setTimeout(()=>{pendingNew=false;e.target.textContent="Start new estimate";e.target.classList.remove("primary");},4000);return;}
  pendingNew=false;e.target.textContent="Start new estimate";e.target.classList.remove("primary");const ov=S.overrides;S=exampleState();S.items=[];S.overrides=ov;isExample=false;save();full();toast("New estimate started");});

/* =====================================================================
   PRICE DATA
   ===================================================================== */
const IDB={db:null,open(){return new Promise((res,rej)=>{try{const r=indexedDB.open("seventhirty",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(this.db=r.result);r.onerror=()=>rej(r.error);}catch(e){rej(e);}});},
  async get(k){try{const db=this.db||await this.open();return await new Promise(res=>{const q=db.transaction("kv").objectStore("kv").get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res(null);});}catch(e){return null;}},
  async set(k,v){try{const db=this.db||await this.open();await new Promise(res=>{const t=db.transaction("kv","readwrite");t.objectStore("kv").put(v,k);t.oncomplete=res;t.onerror=res;});}catch(e){}}};
function applyPrices(obj,quiet,live){
  if(String(obj.currency||"").toUpperCase()!=="GBP"){toast(`That file is priced in ${obj.currency||"an unknown currency"}. SevenThirty needs GBP prices.`);return;}
  const merged=live==="seed"?BUILTIN.regions:Object.assign({},obj.regions||{});
  SNAP={generated:obj.generated,generatedAt:obj.generatedAt,currency:"GBP",source:obj.source,imported:live!=="seed",live:live===true,regions:merged};if(!live)store.set("st-snapshot2",SNAP);
  if(obj.catalog&&obj.catalog.scopes){CAT={generated:obj.generated,strings:obj.catalog.strings,scopes:obj.catalog.scopes};catIndex=null;IDB.set("catalog",CAT);}
  full();if(!quiet){const regs=Object.keys(obj.regions||{}).filter(k=>k&&k!=="global"&&!/^Zone/.test(k)).map(regionName);toast(`Loaded ${fmtDate(obj.generated)} prices${regs.length?` for ${regs.join(", ")}`:""}${obj.catalog?", with the full catalogue":""}`);}
}
function importText(txt){let obj;try{obj=JSON.parse(txt);}catch(e){toast("That isn't valid JSON. Check it was copied in full.");return;}
  if(obj&&obj.regions&&obj.currency){applyPrices(obj);return;}
  if(obj&&obj.v===2&&Array.isArray(obj.items)){S=Object.assign(exampleState(),obj);S.ui=S.ui||{view:"vm",region:"uksouth"};if(!S.ui.draft)S.ui.draft=newDraft("vm");S.ui.editing=null;save();full();toast("Estimate loaded");return;}
  toast("Not recognised. Load a SevenThirty rates or catalogue file, or an estimate file.");}
async function readFile(f){if(/\.gz$/i.test(f.name)){if(typeof DecompressionStream==="undefined")throw new Error("gzip");return await new Response(f.stream().pipeThrough(new DecompressionStream("gzip"))).text();}return await f.text();}
$("importBtn").addEventListener("click",()=>importText($("importBox").value.trim()));
$("importFile").addEventListener("change",async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;toast(`Reading ${f.name}…`);
  try{importText(await readFile(f));}catch(err){toast(err&&err.message==="gzip"?"This browser can't open .gz files. Run the script without --gzip.":"That file couldn't be read. Try choosing it again.");}});

/* =====================================================================
   EXPORTS
   ===================================================================== */
async function copy(text,msg){try{await navigator.clipboard.writeText(text);toast(msg);}catch(e){$("importBox").value=text;$("pricePanel").open=true;$("importBox").focus();$("importBox").select();toast("Clipboard blocked here. The text is selected in the box under Price data; copy it from there.");}}
$("copyMd").addEventListener("click",()=>copy(toMarkdown(S,R,SNAP),"Markdown copied"));
$("copyCsv").addEventListener("click",()=>copy(toCsv(S,R),"CSV copied"));
$("copyJson").addEventListener("click",()=>{const o=Object.assign({},S,{ui:undefined});copy(JSON.stringify(o),"Estimate file copied. Paste it under Price data to reopen it.");});
const fname=ext=>`${(S.meta.client||"azure")+"-"+(S.meta.title||"estimate")}`.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+`.${ext}`;
function blobSave(name,data,type){try{const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast(`Downloaded ${name}`);}catch(e){toast("The download didn't start. Use the copy buttons instead.");}}
(async()=>{try{const dl=window.claude&&window.claude.use?await window.claude.use("downloads"):null;$("dlCsv").hidden=false;$("dlMd").hidden=false;
  if(!dl){$("dlCsv").addEventListener("click",()=>blobSave(fname("csv"),toCsv(S,R),"text/csv"));$("dlMd").addEventListener("click",()=>blobSave(fname("md"),toMarkdown(S,R,SNAP),"text/markdown"));return;}
  const go=async(ext,data)=>{try{await dl.save({filename:fname(ext),data});toast("Saved");}catch(err){if(err&&err.code==="declined")return;if(err&&(err.code==="unavailable"||err.code==="not_granted")){$("dlCsv").hidden=true;$("dlMd").hidden=true;}toast("The file couldn't be saved here. Use the copy buttons instead.");}};
  $("dlCsv").addEventListener("click",()=>go("csv",toCsv(S,R)));$("dlMd").addEventListener("click",()=>go("md",toMarkdown(S,R,SNAP)));}catch(e){}})();

let tt;function toast(m){const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("show"),2800);}

full();
if(isExample)toast("Example estimate loaded. Edit any item, or start a new estimate under Price data.");
(async()=>{
  // Live prices published next to the page by the daily pipeline (data/manifest.json → data/prices.json)
  try{const r=await fetch(`data/manifest.json?t=${Date.now()}`,{cache:"no-store"});if(r.ok){const m=await r.json();if(m&&m.prices)MAN=m;}}catch(e){}
  if(MAN){try{const r=await fetch(`data/${MAN.prices}?v=${encodeURIComponent(MAN.generatedAt||MAN.generated)}`);if(r.ok){const obj=await r.json();obj.generatedAt=MAN.generatedAt;applyPrices(obj,true,MAN.seed?"seed":true);}}catch(e){}}
  const saved=await IDB.get("catalog");if(saved&&saved.scopes&&(!MAN||!MAN.catalogue||saved.generated===MAN.generated)){CAT=saved;catIndex=null;full();}
})();