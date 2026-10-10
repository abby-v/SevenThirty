import { SPECS, DISK_P, DISK_GIB, BUILTIN, VERIFY } from './prices.js';
import { zoneOf } from './regions.js';
import { gbp, n, money, scalar, rt, vmName, DAYS, L, HL, ML } from './format.js';

// SevenThirty: rate lookup, the hours model and shared building blocks for calculators.
/** Returns key → {v, src, key}. Order: your edits, region, billing zone, global, built-in snapshot (flagged), UK South (flagged), missing. */
function rateLookup(ctx,region){
  const SNAP=ctx.snap||BUILTIN;
  const zone=zoneOf(region);
  return key=>{
    const ov=((ctx.overrides||{})[region]||{})[key];
    if(ov!=null&&!isNaN(ov))return {v:Number(ov),src:"manual",key};
    const R=SNAP.regions||{};
    if(R[region]&&R[region][key]!=null)return {v:R[region][key],src:"region",key,verify:VERIFY.has(key)&&!SNAP.imported};
    if(zone&&R[zone]&&R[zone][key]!=null)return {v:R[zone][key],src:"global",key,verify:VERIFY.has(key)&&!SNAP.imported};
    if(R.global&&R.global[key]!=null)return {v:R.global[key],src:"global",key};
    if(R[""]&&R[""][key]!=null)return {v:R[""][key],src:"global",key};
    if(R!==BUILTIN.regions){const B=BUILTIN.regions;for(const p of [region,zone,"global"]){if(p&&B[p]&&B[p][key]!=null)return {v:B[p][key],src:"proxy",key,from:"snapshot"};}}
    for(const p of ["uksouth","Zone 1"]){const P=R[p]||BUILTIN.regions[p];if(P&&P[key]!=null)return {v:P[key],src:"proxy",key,from:p};}
    return {v:0,src:"missing",key};
  };
}
const has=(r,key)=>r(key).src!=="missing";
function globalHours(ctx){return ctx.mode==="custom"?Math.max(0,Math.min(744,Number(ctx.custom)||0)):Number(ctx.mode||730);}
function hoursOf(ctx,v){const g=globalHours(ctx);if(v!==""&&v!=null&&!isNaN(Number(v))){const x=Math.max(0,Math.min(744,Number(v)));return {v:x,t:`${n(x)} h`,ov:true};}return {v:g,t:`${n(g)} h`,ov:false};}
const PRICING=[["payg","Pay-as-you-go"],["ri1","1-year reservation"],["ri3","3-year reservation"],["sp1","1-year savings plan"],["sp3","3-year savings plan"]];
/** VM sizes priced in this region (or UK South), as [sku, label] options. octx = {region, r, snap}. */
function vmSizes(octx,filter){
  const region=octx.region,r=octx.r;const keys=new Set();
  const R=(octx.snap||BUILTIN).regions||{};[region,"uksouth"].forEach(rg=>Object.keys(R[rg]||{}).forEach(k=>{const m=k.match(/^vm_(.+)_lin$/);if(m)keys.add(m[1]);}));
  let list=[...keys].filter(k=>!filter||filter(k));
  list.sort((a,b)=>(SPECS[a]?.[2]||"").localeCompare(SPECS[b]?.[2]||"")||(SPECS[a]?.[0]||0)-(SPECS[b]?.[0]||0)||a.localeCompare(b));
  return list.map(k=>{const s=SPECS[k];const lin=r(`vm_${k}_lin`);return [k,`${vmName(k)} · ${s?`${s[0]} vCPU, ${s[1]} GiB · ${s[2]}`:"size"} · ${gbp(scalar(lin.v)*730)}/mo Linux`];});
}
function pricingOpts(r,sku){return PRICING.filter(([v])=>v==="payg"||has(r,`vm_${sku}_${v}`));}
/* VM compute lines with OS licensing and commitment pricing */
function vmLines(r,sku,os,pricing,count,h,label){
  const out=[];if(!count)return out;const lin=r(`vm_${sku}_lin`);const spec=SPECS[sku];
  let win=r(`vm_${sku}_win`);
  if(os==="Windows"&&(win.src==="missing"||win.src==="proxy"&&lin.src!=="proxy")&&spec){const w=r("win_vcpu");win={v:scalar(lin.v)+spec[0]*scalar(w.v),src:lin.src,key:`vm_${sku}_win`,verify:true};}
  const lic=os==="Windows"?Math.max(0,scalar(win.v)-scalar(lin.v)):0;const nm=label||vmName(sku);
  const licLine=()=>{if(lic>0)out.push(L("standing","Windows Server licence",`${n(count)} × ${money(lic)}/h × ${h.t}`,count*lic*h.v,[win]));};
  if(pricing==="ri1"||pricing==="ri3"){const ri=r(`vm_${sku}_${pricing}`);const m=pricing==="ri1"?12:36;
    out.push(L("standing",`${nm}, ${m/12}-year reservation`,`${n(count)} × ${rt(ri)} ÷ ${m} months`,count*scalar(ri.v)/m,[ri]));licLine();}
  else if(pricing==="sp1"||pricing==="sp3"){const sp=r(`vm_${sku}_${pricing}`);out.push(HL("standing",`${nm}, ${pricing==="sp1"?1:3}-year savings plan rate`,count,sp,h));licLine();}
  else if(os==="Windows")out.push(HL("standing",`${nm}, Windows`,count,win,h));
  else out.push(HL("standing",os==="Windows (Hybrid Benefit)"?`${nm}, Windows with Hybrid Benefit`:`${nm}, Linux`,count,lin,h));
  return out;
}
const DISK_OPTS=(none)=>[...(none?[["none",none]]:[]),...Object.keys(DISK_P).map(k=>[k,`${k} · ${DISK_GIB[k]} GiB Premium SSD`]),["E10","E10 · 128 GiB Standard SSD"]];
function diskLines(r,disk,red,count,what){if(!disk||disk==="none"||!count)return [];const key=`disk_${disk}_${disk==="E10"?"LRS":red||"LRS"}`;const d=r(key);
  return [ML("standing",`${what} ${disk}${disk!=="E10"&&red==="ZRS"?" ZRS":""}`,count,d)];}
const sentTierCost=(r,gbDay,t)=>{const p=r(`sent_${t}`);const eff=scalar(p.v)/t;return {p,cost:(scalar(p.v)+Math.max(0,gbDay-t)*eff)*DAYS};};
function sqlLines(p,c,h,r){const t=c.tier==="General Purpose"?"gp":"bc";const q=c.dbs*Number(c.vc);const o=[];const unit=p==="sql"?"database":"instance";
  if(c.pricing==="ri1"||c.pricing==="ri3"){const ri=r(`${p}_${t}_${c.pricing}`);const m=c.pricing==="ri1"?12:36;o.push(L("standing",`Compute, ${m/12}-year reservation`,`${n(c.dbs)} ${unit}${c.dbs>1?"s":""} × ${c.vc} vCores × ${rt(ri)} ÷ ${m} months`,q*scalar(ri.v)/m,[ri]));}
  else o.push(HL("standing","Compute",q,r(`${p}_${t}`),h,`${n(c.dbs)} × ${c.vc} vCores`));
  if(c.lic==="Licence included")o.push(HL("standing","SQL licence",q,r(`sql_lic_${t}`),h,`${n(c.dbs)} × ${c.vc} vCores`));
  return o;}

export { rateLookup, has, globalHours, hoursOf, PRICING, vmSizes, pricingOpts, vmLines, DISK_OPTS, diskLines, sentTierCost, sqlLines };
