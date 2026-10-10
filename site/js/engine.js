import { SVCMAP } from './services.js';
import { rateLookup, hoursOf } from './blocks.js';
import { n, money, scalar, num, DAYS, bands, tierLabel, L } from './format.js';

// SevenThirty: prices items and whole estimates. Pure functions: no DOM, no storage.
function clean(def,cfg){const c={};def.fields.forEach(f=>{const v=cfg[f.k]??(f.type==="hours"?"":f.def);c[f.k]=f.type==="sel"?v:f.type==="hours"?v:num(v);});return c;}
/** Price one estimate item. ctx = {snap, overrides, mode, custom}. */
function computeItem(ctx,it){
  if(it.svc==="generic"||it.svc==="manual")return computeGeneric(ctx,it);
  const def=SVCMAP[it.svc];if(!def)return {lines:[],amt:0,payg:0};
  const r=rateLookup(ctx,it.region);const c=clean(def,it.cfg);const h=hoursOf(ctx,c.hours);const octx={region:it.region,r,snap:ctx.snap};
  // keep select values valid for this region (e.g. a VM size without a reservation price)
  def.fields.forEach(f=>{if(f.type==="sel"&&typeof f.opts==="function"){const o=f.opts(c,octx).map(x=>Array.isArray(x)?x[0]:x);if(o.length&&!o.includes(c[f.k]))c[f.k]=o.includes(f.def)?f.def:o[0];}});
  const lines=def.calc(c,h,r,{region:it.region});const amt=lines.reduce((a,l)=>a+l.amt,0);
  let payg=amt;if(c.pricing&&c.pricing!=="payg"){const pl=def.calc(Object.assign({},c,{pricing:"payg"}),h,r,{region:it.region});payg=pl.reduce((a,l)=>a+l.amt,0);}
  return {lines,amt,payg,h,c,def};
}
function parseUnit(u){const s=String(u||"1").trim();const low=s.toLowerCase();const m=low.match(/^([\d.,]+)\s*([km])?/);let k=m?parseFloat(m[1].replace(/,/g,""))||1:1;if(m&&m[2]==="k")k*=1000;if(m&&m[2]==="m")k*=1e6;
  const w=low.replace(/^[\d.,]+\s*[km]?\s*/,"").replace(/^\//,"").trim();let measure="";if(/\bgb\b/.test(w))measure="GB";else if(/\btb\b/.test(w))measure="TB";else if(/second/.test(w))measure="seconds";
  let cls="usage";if(/hour/.test(w))cls="hour";else if(/month/.test(w))cls="month";else if(/day/.test(w))cls="day";else if(/year/.test(w))cls="year";return {cls,n:k,measure,raw:s};}
function qtyLabel(pu){if(pu.cls==="hour")return "How many";if(pu.cls==="month")return pu.measure?`${pu.measure} per month`:"How many";if(pu.cls==="day"||pu.cls==="year")return "How many";return pu.measure?`${pu.measure} per month`:"Units per month";}
function computeGeneric(ctx,it){
  const c=it.cfg;const pu=parseUnit(it.unit);const q=num(c.qty);const h=hoursOf(ctx,c.hours);const out=[];const src={src:it.svc==="manual"?"manual":"catalogue"};let payg=0;
  const base=scalar(it.tiers||it.payg)/pu.n;
  if(pu.cls==="hour"){payg=q*base*h.v;
    if(c.pricing==="ri1"&&it.ri1)out.push(L("standing","1-year reservation",`${n(q)} × ${money(it.ri1)} ÷ 12 months`,q*it.ri1/12,[src]));
    else if(c.pricing==="ri3"&&it.ri3)out.push(L("standing","3-year reservation",`${n(q)} × ${money(it.ri3)} ÷ 36 months`,q*it.ri3/36,[src]));
    else if(c.pricing==="sp1"&&it.sp1)out.push(L("standing","1-year savings plan rate",`${n(q)} × ${money(it.sp1/pu.n)}/h × ${h.t}`,q*it.sp1/pu.n*h.v,[src]));
    else if(c.pricing==="sp3"&&it.sp3)out.push(L("standing","3-year savings plan rate",`${n(q)} × ${money(it.sp3/pu.n)}/h × ${h.t}`,q*it.sp3/pu.n*h.v,[src]));
    else out.push(L("standing","Pay-as-you-go",`${n(q)} × ${money(base)}/h × ${h.t}`,payg,[src]));}
  else if(pu.cls==="day"){payg=q*base*DAYS;out.push(L("standing","Daily charge",`${n(q)} × ${money(base)}/day × 30.42 days`,payg,[src]));}
  else if(pu.cls==="year"){payg=q*base/12;out.push(L("standing","Annual charge, monthly share",`${n(q)} × ${money(base)}/year ÷ 12`,payg,[src]));}
  else{const kind=pu.cls==="month"&&!pu.measure?"standing":"usage";const units=q/pu.n;const bs=bands(units,it.tiers||it.payg);const word=pu.n>1?`× ${n(pu.n)}${pu.measure?" "+pu.measure:""}`:(pu.measure||"units");
    bs.forEach(b=>out.push(L(kind,bs.length>1?tierLabel(b,pu.n>1?`× ${n(pu.n)}`:(pu.measure||"units")):(kind==="standing"?"Monthly charge":"Usage"),`${n(b.q)} ${word} × ${money(b.p)}`,b.q*b.p,[src])));payg=out.reduce((a,l)=>a+l.amt,0);}
  return {lines:out,amt:out.reduce((a,l)=>a+l.amt,0),payg,h,pu};
}
function itemSection(it){if(it.svc==="generic"||it.svc==="manual")return it.sec||"other";return SVCMAP[it.svc]?.sec||"other";}
function itemName(it){if(it.label)return it.label;if(it.svc==="generic")return `${it.svc_name||it.meta?.svc}`;if(it.svc==="manual")return "Manual line";return SVCMAP[it.svc]?.name||it.svc;}
function itemSum(it,res){if(it.svc==="generic")return `${it.meta.sku} ${it.meta.meter}`.trim();if(it.svc==="manual")return `${money(Number(it.payg)||0)} ${parseUnit(it.unit).raw}`;try{return SVCMAP[it.svc].sum(res.c);}catch(e){return "";}}
/** Price a whole estimate: totals, standing/usage split, commitment saving and the ACR ramp. */
function computeAll(ctx,itemsIn,acr){
  const items=itemsIn.map(it=>({it,res:computeItem(ctx,it)}));
  let standing=0,usage=0,payg=0,proxy=0,missing=0;
  items.forEach(({res})=>{res.lines.forEach(l=>{if(l.kind==="standing")standing+=l.amt;else usage+=l.amt;if(l.srcs.some(s=>s.src==="proxy"))proxy++;if(l.srcs.some(s=>s.src==="missing"))missing++;});payg+=res.payg;});
  const list=standing+usage;const a=acr||{};const disc=Math.min(100,num(a.disc))/100,cont=num(a.cont)/100;const monthly=list*(1-disc)*(1+cont);
  const term=Number(a.term)||36,live=Math.max(1,Number(a.live)||1),ramp=Math.max(1,Number(a.ramp)||1);
  const months=[];for(let m=1;m<=term;m++){const f=m<live?0:Math.min(1,(m-live+1)/ramp);months.push(monthly*f);}
  return {items,standing,usage,list,payg,commitSave:Math.max(0,payg-list),disc,cont,monthly,months,termTotal:months.reduce((x,y)=>x+y,0),term,proxy,missing};
}
/** Calendar helpers for the ACR forecast. start is "YYYY-MM"; i is the month index from 0. */
function monthDate(start,i){const [y,m]=(start||"2026-10").split("-").map(Number);return new Date(y,(m-1)+i,1);}
function monthLabel(start,i){return monthDate(start,i).toLocaleDateString("en-GB",{month:"short",year:"2-digit"});}
/** Microsoft's fiscal year runs July to June and is named after the year it ends in. */
function fiscalYearOf(start,i){const d=monthDate(start,i);return d.getMonth()>=6?d.getFullYear()+1:d.getFullYear();}
function fiscalYears(start,months){const map=new Map();months.forEach((v,i)=>{const f=fiscalYearOf(start,i);map.set(f,(map.get(f)||0)+v);});return map;}

export { clean, computeItem, parseUnit, qtyLabel, computeGeneric, itemSection, itemName, itemSum, computeAll, monthDate, monthLabel, fiscalYearOf, fiscalYears };
