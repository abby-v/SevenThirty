import { SECTIONS } from './services.js';
import { regionName } from './regions.js';
import { gbp, n, fmtDate } from './format.js';
import { globalHours } from './blocks.js';
import { itemSection, itemName, monthLabel } from './engine.js';

// SevenThirty: client-ready exports. S = estimate state, R = computeAll result, SNAP = price data in use.
const mark=l=>(l.srcs.some(s=>s.src==="missing")?" ✕":l.srcs.some(s=>s.src==="proxy")?" ⚑":"");
function assumptions(S,R,SNAP){const g=globalHours(S);const a=[];
  a.push(`Hours model: ${n(g)} h/month${S.mode==="730"?" (always on)":S.mode==="217"?" (office hours, 8am–6pm weekdays)":" (custom)"}; per-item overrides shown in the calculation column.`);
  a.push(`Prices: Microsoft Azure retail list prices in GBP, from the ${fmtDate(SNAP.generated)} price data.`);
  const regs=[...new Set(S.items.map(i=>i.region))];a.push(`Regions: ${regs.map(regionName).join(", ")}.`);
  if(R.commitSave>0.005)a.push(`Reservations or savings plans are applied where shown, saving ${gbp(R.commitSave)} a month against pay-as-you-go. Commitments are a financial decision for the client.`);
  if(S.items.some(i=>i.svc==="avd"))a.push("AVD session hosts are priced at the Linux rate, assuming users hold eligible Microsoft 365 or Windows E3/E5 licences.");
  a.push(R.disc>0?`Discount of ${n(R.disc*100)}% applied to list price.`:"No customer discount applied.");if(R.cont>0)a.push(`Contingency of ${n(R.cont*100)}% added.`);
  a.push(`ACR forecast: ${R.term} months from ${monthLabel(S.acr.start,0)}, go-live in month ${S.acr.live}, ramp to full over ${S.acr.ramp} month(s).`);
  if(R.proxy)a.push("Lines marked ⚑ use a UK South or Zone 1 rate as a stand-in for a region without loaded prices.");
  if(R.missing)a.push("Lines marked ✕ have no published rate in the loaded price data and are costed at £0.");return a;}
function toMarkdown(S,R,SNAP){const m=S.meta;let md=`# ${m.title||"Azure estimate"}${m.client?` — ${m.client}`:""}\n\n| | |\n|---|---|\n| Prepared by | ${m.by||"—"} |\n| Status | ${m.status} |\n| Price date | ${fmtDate(SNAP.generated)} |\n| Currency | GBP, excl. VAT |\n\n`;
  md+=`## Summary\n\n| Measure | Amount |\n|---|---:|\n| Monthly run rate | ${gbp(R.monthly)} |\n| Annual | ${gbp(R.monthly*12)} |\n| ${R.term}-month ACR | ${gbp(R.termTotal)} |\n| Standing charges (list, monthly) | ${gbp(R.standing)} |\n| Usage charges (list, monthly) | ${gbp(R.usage)} |\n`;
  if(R.commitSave>0.005)md+=`| Saving from commitments (monthly) | ${gbp(R.commitSave)} |\n`;
  md+=`\n### By section\n\n| Section | Monthly |\n|---|---:|\n`;[...SECTIONS,["other","Other"]].forEach(([sid,label])=>{const t=R.items.filter(x=>itemSection(x.it)===sid).reduce((a,x)=>a+x.res.amt,0);if(t)md+=`| ${label} | ${gbp(t)} |\n`;});md+="\n";
  [...SECTIONS,["other","Other"]].forEach(([sid,label])=>{const its=R.items.filter(x=>itemSection(x.it)===sid);if(!its.length)return;md+=`## ${label}\n\n| Item | Region | Line | Type | Calculation | Monthly |\n|---|---|---|---|---|---:|\n`;
    its.forEach(({it,res})=>res.lines.forEach(l=>{md+=`| ${itemName(it).replace(/\|/g,"/")} | ${regionName(it.region)} | ${l.what}${mark(l)} | ${l.kind==="standing"?"Standing":"Usage"} | \`${l.calc}\` | ${gbp(l.amt)} |\n`;}));md+="\n";});
  md+=`## Assumptions\n\n${assumptions(S,R,SNAP).map(x=>"- "+x).join("\n")}\n\n## Exclusions\n\n- VAT\n- Support plans, marketplace software and licences not listed\n- Partner professional and managed service fees\n- Data volumes beyond those stated\n\n_Indicative estimate based on Microsoft Azure retail list prices in GBP, retrieved ${fmtDate(SNAP.generated)}. Actual charges depend on configuration, usage, agreement type and discounts. Not affiliated with Microsoft._\n`;return md;}
function toCsv(S,R){const q=s=>`"${String(s).replace(/"/g,'""')}"`;let c="Section,Item,Region,Line,Type,Calculation,Monthly GBP (list),Rate source\n";
  R.items.forEach(({it,res})=>res.lines.forEach(l=>{c+=[q(SECTIONS.find(s=>s[0]===itemSection(it))?.[1]||"Other"),q(itemName(it)),q(regionName(it.region)),q(l.what),l.kind==="standing"?"Standing":"Usage",q(l.calc),l.amt.toFixed(6),q([...new Set(l.srcs.map(s=>s.src))].join("+"))].join(",")+"\n";}));
  c+=`,,,,,List total,${R.list.toFixed(6)},\n,,,,,Monthly after discount and contingency,${R.monthly.toFixed(6)},\n,,,,,${R.term}-month ACR,${R.termTotal.toFixed(6)},\n`;return c;}

export { mark, assumptions, toMarkdown, toCsv };
