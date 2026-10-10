// SevenThirty: number formatting and the line-item helpers every calculator uses.
const gbp=(v,dp=2)=>(v<0?"−":"")+"£"+Math.abs(v).toLocaleString("en-GB",{minimumFractionDigits:dp,maximumFractionDigits:dp});
const n=v=>Number(v).toLocaleString("en-GB",{maximumFractionDigits:2});
function money(v){return "£"+(v>=100?v.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}):v>=1?v.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:4}):v.toLocaleString("en-GB",{minimumFractionDigits:4,maximumFractionDigits:6}));}
const scalar=v=>Array.isArray(v)?v[0][1]:Number(v)||0;
const rt=r=>money(scalar(r.v));
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const num=v=>Math.max(0,Number(v)||0);
const vmName=s=>String(s).replace(/^Standard_/,"").replace(/_/g," ");
const DAYS=730/24;
function bands(units,tiers){
  if(!Array.isArray(tiers))return [{lo:0,hi:Infinity,q:units,p:Number(tiers)||0}];
  const out=[];for(let i=0;i<tiers.length;i++){const lo=tiers[i][0],hi=i+1<tiers.length?tiers[i+1][0]:Infinity,q=Math.max(0,Math.min(units,hi)-lo);if(q>0)out.push({lo,hi,q,p:tiers[i][1]});}
  return out;}
function tierLabel(b,word){return b.hi===Infinity?`above ${n(b.lo)} ${word}`:b.lo===0?`first ${n(b.hi)} ${word}`:`${n(b.lo)}–${n(b.hi)} ${word}`;}
function L(kind,what,calc,amt,srcs){return {kind,what,calc,amt,srcs:srcs||[]};}
function TL(kind,what,units,r,word){const bs=bands(units,r.v);return bs.map(b=>L(kind,bs.length>1?`${what}, ${tierLabel(b,word)}`:what,`${n(b.q)} ${word} × ${money(b.p)}`,b.q*b.p,[r]));}
const HL=(kind,what,q,r,h,pre)=>L(kind,what,`${pre||n(q)} × ${rt(r)}/h × ${h.t}`,q*scalar(r.v)*h.v,[r]);
const ML=(kind,what,q,r)=>L(kind,what,`${n(q)} × ${rt(r)}/month`,q*scalar(r.v),[r]);
const CL=(kind,what,q,r)=>L(kind,what,`${n(q)} × ${rt(r)}/h × 730 h`,q*scalar(r.v)*730,[r]);
function fmtDate(s){const d=new Date(s);return isNaN(d)?String(s||""):d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});}
function fmtStamp(s){const d=new Date(s);return isNaN(d)?String(s||""):d.toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"});}

export { gbp, n, money, scalar, rt, esc, num, vmName, DAYS, bands, tierLabel, L, TL, HL, ML, CL, fmtDate, fmtStamp };
