import { n, scalar, rt, money, vmName, DAYS, L, TL, HL, ML, CL } from './format.js';
import { redOpts, ok, PRICING, vmSizes, vmLines, DISK_OPTS, diskLines } from './blocks.js';

// SevenThirty: calculators for apps and integration, containers, more databases and storage,
// analytics and AI, and monitoring and management. Same shape as services.js.
const F=(k,label,def,extra)=>Object.assign({k,label,def,type:"num"},extra||{});
const SEL=(k,label,opts,def,extra)=>Object.assign({k,label,opts,def,type:"sel"},extra||{});
const HRS=(extra)=>Object.assign({k:"hours",type:"hours"},extra||{});

/** A rate re-expressed in bigger units: per = how many API units make one display unit (tiers scale too). */
function per(x,k){const v=Array.isArray(x.v)?x.v.map(([lo,p])=>[lo/k,p*k]):scalar(x.v)*k;return Object.assign({},x,{v});}
/** Pricing options with a published price for this meter in this region. */
const commitOpts=(r,key)=>PRICING.filter(([v])=>v==="payg"||ok(r,`${key}_${v}`));
/** Hourly meter with optional reservation (term total) or savings plan (hourly) pricing. */
function commitLines(r,key,pricing,count,h,nm){
  if(!count)return [];
  if(pricing==="ri1"||pricing==="ri3"){const ri=r(`${key}_${pricing}`);const m=pricing==="ri1"?12:36;
    return [L("standing",`${nm}, ${m/12}-year reservation`,`${n(count)} × ${rt(ri)} ÷ ${m} months`,count*scalar(ri.v)/m,[ri])];}
  if(pricing==="sp1"||pricing==="sp3")return [HL("standing",`${nm}, ${pricing==="sp1"?1:3}-year savings plan rate`,count,r(`${key}_${pricing}`),h)];
  return [HL("standing",nm,count,r(key),h)];
}
/** Usage with a monthly free grant: what's left after the grant, at the meter's price. */
function grantLine(what,units,free,word,x){const bill=Math.max(0,units-free);
  return L("usage",what,`(${n(Math.round(units))} − ${n(free)} free) ${word} × ${money(scalar(x.v))}`,bill*scalar(x.v),[x]);}
const notOffered=(what)=>({t:"note",x:`${what} has no published price in this region. Choose a region where it's offered, such as UK South.`});

/* ---------------- App Service ---------------- */
const APP_SIZES=[
  ["B1","Basic B1 · 1 core, 1.75 GB"],["B2","Basic B2 · 2 cores, 3.5 GB"],["B3","Basic B3 · 4 cores, 7 GB"],
  ["S1","Standard S1 · 1 core, 1.75 GB"],["S2","Standard S2 · 2 cores, 3.5 GB"],["S3","Standard S3 · 4 cores, 7 GB"],
  ["P0v3","Premium v3 P0v3 · 1 vCPU, 4 GB"],["P1v3","Premium v3 P1v3 · 2 vCPU, 8 GB"],["P2v3","Premium v3 P2v3 · 4 vCPU, 16 GB"],["P3v3","Premium v3 P3v3 · 8 vCPU, 32 GB"],
  ["P1mv3","Premium v3 P1mv3 · 2 vCPU, 16 GB"],["P2mv3","Premium v3 P2mv3 · 4 vCPU, 32 GB"],["P3mv3","Premium v3 P3mv3 · 8 vCPU, 64 GB"],
  ["P0v4","Premium v4 P0v4 · 1 vCPU, 4 GB"],["P1v4","Premium v4 P1v4 · 2 vCPU, 8 GB"],["P2v4","Premium v4 P2v4 · 4 vCPU, 16 GB"],["P3v4","Premium v4 P3v4 · 8 vCPU, 32 GB"],
  ["P1mv4","Premium v4 P1mv4 · 2 vCPU, 16 GB"],["P2mv4","Premium v4 P2mv4 · 4 vCPU, 32 GB"],["P3mv4","Premium v4 P3mv4 · 8 vCPU, 64 GB"],
  ["I1v2","Isolated v2 I1v2 · 2 vCPU, 8 GB"],["I2v2","Isolated v2 I2v2 · 4 vCPU, 16 GB"],["I3v2","Isolated v2 I3v2 · 8 vCPU, 32 GB"],
  ["I1mv2","Isolated v2 I1mv2 · 2 vCPU, 16 GB"],["I2mv2","Isolated v2 I2mv2 · 4 vCPU, 32 GB"],["I3mv2","Isolated v2 I3mv2 · 8 vCPU, 64 GB"],
];
const appKey=c=>`app_${c.os}_${c.size}`;

/* ---------------- Azure OpenAI (labels match AOAI_MODELS in pipeline/fetch_prices.py) ---------------- */
const AOAI=[["g55","GPT-5.5, Global"],["g54","GPT-5.4, Global"],["g54m","GPT-5.4 mini, Global"],["g54n","GPT-5.4 nano, Global"],["g5","GPT-5, Global"],
  ["g41","GPT-4.1, Global"],["g41m","GPT-4.1 mini, Global"],["g41mr","GPT-4.1 mini, Regional"],["g4o","GPT-4o, Global"],["g4or","GPT-4o, Regional"],["g4om","GPT-4o mini, Global"],
  ["e3l","text-embedding-3-large, Global"],["e3s","text-embedding-3-small, Global"],["e3sr","text-embedding-3-small, Regional"]];
const PTU=[["global","Global"],["dz","Data zone"],["regional","Regional"]];

/* ---------------- PostgreSQL and MySQL flexible server ---------------- */
const BURST=[["B1ms","B1ms · 1 vCore, 2 GiB"],["B2s","B2s · 2 vCores, 4 GiB"],["B2ms","B2ms · 2 vCores, 8 GiB"],["B4ms","B4ms · 4 vCores, 16 GiB"],["B8ms","B8ms · 8 vCores, 32 GiB"]];
const DB_TIERS=[["burst","Burstable"],["gp","General Purpose (Ddsv5)"],["mo","Memory Optimized (Edsv5)"]];
const dbFields=()=>[SEL("tier","Compute tier",DB_TIERS,"gp"),SEL("bsize","Burstable size",BURST,"B2ms",{hint:"Used for the Burstable tier."}),
  SEL("vc","vCores per server",["2","4","8","16","32","48","64"],"4",{hint:"Used for General Purpose and Memory Optimized."}),F("servers","Servers",1),
  SEL("ha","High availability",[["none","None"],["zone","Zone-redundant"],["same","Same-zone"]],"none",{hint:"HA adds a standby server and its storage. Not available on Burstable."}),
  F("gb","Storage per server",128,{unit:"GB"}),HRS(),F("bk","Backup storage above the free amount",0,{unit:"GB",more:true,hint:"Backup up to the server's provisioned storage is free."})];
function dbLines(p,c,h,r){
  const o=[];if(!c.servers)return o;const ha=c.tier!=="burst"&&c.ha!=="none";const copies=ha?2:1;
  let rate,label;
  if(c.tier==="burst"){rate=r(`${p}_${c.bsize}`);label=`Burstable ${c.bsize}`;o.push(HL("standing",`${label} compute`,c.servers,rate,h));}
  else{const vc=Number(c.vc);if(p==="my"&&c.tier==="mo"){const x=r("my_mo_2");rate=Object.assign({},x,{v:scalar(x.v)/2});}else rate=r(`${p}_${c.tier}`);
    label=`${c.tier==="gp"?"General Purpose":"Memory Optimized"} ${vc} vCores`;
    o.push(HL("standing",`${label} compute`,c.servers*vc,rate,h,`${n(c.servers)} × ${vc} vCores`));
    if(ha)o.push(HL("standing",`HA standby (${c.ha==="zone"?"zone-redundant":"same zone"})`,c.servers*vc,rate,h,`${n(c.servers)} × ${vc} vCores`));}
  const s=r(`${p}_storage`);o.push(L("standing",`Storage${ha?", primary and standby":""}`,`${n(c.servers*copies)} × ${n(c.gb)} GB × ${rt(s)}`,c.servers*copies*c.gb*scalar(s.v),[s]));
  if(c.bk>0){const b=r(`${p}_backup`);o.push(L("usage","Backup storage above the free amount",`${n(c.bk)} GB × ${rt(b)}`,c.bk*scalar(b.v),[b]));}
  return o;}
const dbNotes=(c,h)=>[...(c.tier==="burst"&&c.ha!=="none"?[{t:"note",x:"Burstable servers can't use high availability, so no standby is costed."}]:[]),
  ...(h.v<730?[{t:"note",x:"A stopped server doesn't bill compute, but storage keeps billing. Servers restart automatically after 7 days stopped."}]:[]),
  {t:"tip",x:"Reserved capacity for 1 or 3 years lowers the compute price on General Purpose and Memory Optimized. Check it in the price catalogue if the workload is steady."}];
const dbSum=c=>`${n(c.servers)} × ${c.tier==="burst"?c.bsize:`${c.vc} vCore ${c.tier==="gp"?"GP":"MO"}`}${c.tier!=="burst"&&c.ha!=="none"?" · HA":""}`;

/* ---------------- Container Apps dedicated profiles ---------------- */
const ACA_PROFILES=[["D4","D4 · 4 vCPU, 16 GiB",4,16],["D8","D8 · 8 vCPU, 32 GiB",8,32],["D16","D16 · 16 vCPU, 64 GiB",16,64],["D32","D32 · 32 vCPU, 128 GiB",32,128],
  ["E4","E4 · 4 vCPU, 32 GiB",4,32],["E8","E8 · 8 vCPU, 64 GiB",8,64],["E16","E16 · 16 vCPU, 128 GiB",16,128],["E32","E32 · 32 vCPU, 256 GiB",32,256]];
const FABRIC=["2","4","8","16","32","64","128","256","512","1024","2048"];
const DBX=[["jobs","Jobs compute (classic)",true],["allpurpose","All-purpose compute (classic)",true],["sqlpro","SQL warehouse Pro (classic)",true],
  ["jobssl","Jobs, serverless",false],["intsl","Notebooks, serverless",false],["sqlsl","SQL warehouse, serverless",false]];
const ACR_INCLUDED={Basic:10,Standard:100,Premium:500};

const MORE=[
/* ---------------- Apps and integration ---------------- */
{id:"app",sec:"apps",name:"App Service",blurb:"Web apps and APIs on a plan",pause:false,
 desc:"An App Service plan bills per instance for every hour it exists, whether the apps on it are running or not. Premium v3, v4 and Isolated v2 plans can be reserved or covered by a savings plan.",
 presets:[["Small web app",{os:"lin",size:"P0v3",count:1}],["Production web app",{os:"win",size:"P1v3",count:2}],["Line-of-business, 3-year",{os:"win",size:"P2v3",count:2,pricing:"ri3"}]],
 fields:[SEL("os","Operating system",[["win","Windows"],["lin","Linux"]],"win"),
   SEL("size","Plan size",(c,ctx)=>APP_SIZES.filter(([k])=>ok(ctx.r,`app_${c.os}_${k}`)),"P1v3",{wide:true}),F("count","Instances",2,{hint:"Average count if the plan autoscales."}),
   SEL("pricing","Pricing",(c,ctx)=>commitOpts(ctx.r,appKey(c)),"payg"),HRS()],
 calc:(c,h,r)=>commitLines(r,appKey(c),c.pricing,c.count,h,`${c.size} ${c.os==="lin"?"Linux":"Windows"} instances`),
 notes:(c)=>[...(c.size.startsWith("B")?[{t:"note",x:"Basic has no autoscale or deployment slots. Use Premium for production."}]:[]),
   ...(c.size.startsWith("I")?[{t:"tip",x:"Isolated v2 runs in an App Service Environment v3, which has no separate stamp fee."}]:[]),
   {t:"tip",x:"Private endpoints, Application Gateway and Front Door in front of the app are costed under Networking."}],
 sum:c=>`${n(c.count)} × ${c.size} ${c.os==="lin"?"Linux":"Windows"}${c.pricing!=="payg"?" · "+PRICING.find(p=>p[0]===c.pricing)[1].toLowerCase():""}`},

{id:"func",sec:"apps",name:"Azure Functions",blurb:"Flex Consumption or Premium",
 desc:"Flex Consumption bills execution time in GB-seconds and the number of executions, after a monthly free grant. Premium bills the vCPU and memory of its instances for every hour, with at least one always on.",
 presets:[["Light API",{plan:"flex",exec:5,dur:300,mem:"2"}],["Busy integration",{plan:"flex",exec:50,dur:800,mem:"2",ar:1}],["Premium, always warm",{plan:"prem",ep:"1",inst:2}]],
 fields:[SEL("plan","Plan",[["flex","Flex Consumption"],["prem","Premium (EP1–EP3)"]],"flex"),
   F("exec","Executions",5,{unit:"million/mo",hint:"Flex Consumption."}),F("dur","Average duration",500,{unit:"ms"}),
   SEL("mem","Instance memory",[["0.5","512 MB"],["2","2,048 MB"],["4","4,096 MB"]],"2"),
   SEL("ep","Premium plan",[["1","EP1 · 1 vCPU, 3.5 GB"],["2","EP2 · 2 vCPU, 7 GB"],["4","EP3 · 4 vCPU, 14 GB"]],"1"),F("inst","Premium instances (average)",1),HRS(),
   F("ar","Always ready instances",0,{more:true,hint:"Flex Consumption instances kept warm all month."})],
 calc:(c,h,r)=>{const o=[];
   if(c.plan==="prem"){const v=Number(c.ep),g=v*3.5,i=Math.max(1,c.inst);
     o.push(HL("standing",`EP${v===4?3:v} vCPU`,i*v,r("fn_prem_vcpu"),h,`${n(i)} × ${v} vCPU`),HL("standing",`EP${v===4?3:v} memory`,i*g,r("fn_prem_mem"),h,`${n(i)} × ${n(g)} GiB`));return o;}
   const mem=Number(c.mem);const gbs=c.exec*1e6*(c.dur/1000)*mem;
   o.push(...TL("usage","Execution time",Math.round(gbs),r("fn_flex_gbs"),"GB-s"),...TL("usage","Executions",c.exec,per(r("fn_flex_exec"),1e5),"million"));
   if(c.ar>0){const base=r("fn_flex_ar_base");const s=c.ar*mem*730*3600;o.push(L("standing","Always ready baseline",`${n(c.ar)} × ${n(mem)} GB × 2,628,000 s × ${money(scalar(base.v))}`,s*scalar(base.v),[base]));}
   return o;},
 notes:(c)=>[c.plan==="flex"?{t:"tip",x:"The free grant (100,000 GB-s and 250,000 executions a month) is per subscription, so it's only applied once if you add several function apps."}:{t:"note",x:"Premium always bills at least one instance, so it doesn't drop to zero out of hours."},
   {t:"tip",x:"Each function app also needs a storage account; it's usually a few pounds a month."}],
 sum:c=>c.plan==="prem"?`Premium EP${c.ep==="4"?3:c.ep} · ${n(Math.max(1,c.inst))} instance${c.inst>1?"s":""}`:`Flex · ${n(c.exec)}M executions`},

{id:"apim",sec:"apps",name:"API Management",blurb:"API gateway, by tier",pause:false,
 desc:"Classic and v2 tiers bill per unit for every hour. Consumption bills per call after the first million. Basic v2 and Standard v2 include a monthly call allowance and charge for calls above it.",
 presets:[["Production, Standard v2",{tier:"Standard v2",units:1,calls:20}],["Enterprise, Premium",{tier:"Premium",units:2,calls:100}],["Dev and test",{tier:"Developer",units:1,calls:1}]],
 fields:[SEL("tier","Tier",["Consumption","Developer","Basic","Standard","Premium","Basic v2","Standard v2","Premium v2"],"Standard v2"),F("units","Units",1),
   F("calls","API calls",10,{unit:"million/mo"}),HRS(),F("extra","Units in extra regions",0,{more:true,hint:"Premium and Premium v2 only."})],
 calc:(c,h,r)=>{const t=c.tier.replace(" ","");const o=[];
   if(c.tier==="Consumption")return TL("usage","API calls",c.calls,per(r("apim_Consumption_calls"),100),"million");
   o.push(HL("standing",`${c.tier} units`,c.units,r(`apim_${t}`),h));
   if(/^(Basic|Standard) v2$/.test(c.tier)&&c.calls>0)o.push(...TL("usage","API calls",c.calls,per(r(`apim_${t}_calls`),100),"million"));
   if(c.extra>0&&/^Premium/.test(c.tier))o.push(HL("standing","Units in extra regions",c.extra,r(`apim_${t}_extra`),h));return o;},
 notes:(c)=>[...(c.tier==="Developer"?[{t:"note",x:"Developer has no SLA. Don't use it for production."}]:[]),{t:"tip",x:"VNet injection needs Premium or Premium v2 (Standard v2 supports VNet integration for outbound traffic)."}],
 sum:c=>c.tier==="Consumption"?`Consumption · ${n(c.calls)}M calls`:`${n(c.units)} × ${c.tier}`},

{id:"sb",sec:"apps",name:"Service Bus",blurb:"Queues and topics",
 desc:"Basic and Standard bill per million operations; Standard adds a monthly base charge and includes the first 13 million operations. Premium bills per messaging unit per hour.",
 fields:[SEL("tier","Tier",["Basic","Standard","Premium"],"Standard"),F("ns","Namespaces",1),F("ops","Messaging operations",20,{unit:"million/mo"}),
   F("mu","Messaging units per namespace",1,{hint:"Premium only."}),HRS(),F("conns","Brokered connections",0,{more:true,hint:"Standard only. The first 1,000 are included."})],
 calc:(c,h,r)=>{const o=[];
   if(c.tier==="Premium"){o.push(HL("standing","Premium messaging units",c.ns*c.mu,r("sb_prem_mu"),h,`${n(c.ns)} × ${n(c.mu)}`));return o;}
   if(c.tier==="Basic")return c.ops>0?[L("usage","Messaging operations",`${n(c.ops)} million × ${rt(r("sb_basic_ops"))}`,c.ops*scalar(r("sb_basic_ops").v),[r("sb_basic_ops")])]:[];
   o.push(ML("standing","Standard base charge",c.ns,r("sb_std_base")));if(c.ops>0)o.push(...TL("usage","Messaging operations",c.ops,r("sb_std_ops"),"million"));
   if(c.conns>0)o.push(...TL("usage","Brokered connections",c.conns,r("sb_std_conn"),"connections"));return o;},
 notes:(c)=>c.tier==="Premium"?[{t:"tip",x:"Premium is the tier for private endpoints, VNet integration and predictable performance."}]:[],
 sum:c=>c.tier==="Premium"?`Premium · ${n(c.ns*c.mu)} MU`:`${c.tier} · ${n(c.ops)}M operations`},

{id:"eh",sec:"apps",name:"Event Hubs",blurb:"Event streaming and Kafka",
 desc:"Basic and Standard bill per throughput unit per hour plus ingress events. Premium bills processing units and Dedicated bills capacity units, with ingress included.",
 fields:[SEL("tier","Tier",["Basic","Standard","Premium","Dedicated"],"Standard"),F("units","Throughput, processing or capacity units",2),
   F("ev","Ingress events",100,{unit:"million/mo",hint:"Basic and Standard only."}),HRS(),
   SEL("capture","Capture to storage",["No","Yes"],"No",{more:true,hint:"Standard only."}),F("ret","Extended retention",0,{unit:"GB",more:true,hint:"Premium and Dedicated."})],
 calc:(c,h,r)=>{const o=[];
   if(c.tier==="Basic"||c.tier==="Standard"){o.push(HL("standing",`${c.tier} throughput units`,c.units,r(`eh_${c.tier}_tu`),h));
     if(c.ev>0){const x=r(`eh_${c.tier}_ingress`);o.push(L("usage","Ingress events",`${n(c.ev)} million × ${rt(x)}`,c.ev*scalar(x.v),[x]));}
     if(c.tier==="Standard"&&c.capture==="Yes")o.push(HL("standing","Capture",c.units,r("eh_capture"),h));return o;}
   o.push(HL("standing",c.tier==="Premium"?"Premium processing units":"Dedicated capacity units",c.units,r(c.tier==="Premium"?"eh_Premium_pu":"eh_Dedicated_cu"),h));
   if(c.ret>0)o.push(L("standing","Extended retention",`${n(c.ret)} GB × ${rt(r("eh_ret"))}`,c.ret*scalar(r("eh_ret").v),[r("eh_ret")]));return o;},
 sum:c=>`${c.tier} · ${n(c.units)} units`},

/* ---------------- Kubernetes and containers ---------------- */
{id:"aca",sec:"k8s",name:"Container Apps",blurb:"Serverless containers",
 desc:"Consumption bills each replica's vCPU and memory by the second while it runs, plus requests, after a monthly free grant. A dedicated workload profile bills its nodes by the hour plus a management charge.",
 presets:[["Small API",{plan:"cons",reps:2,vcpu:"0.5",mem:1,req:5}],["Busy service",{plan:"cons",reps:6,vcpu:"1",mem:2,req:100}],["Dedicated D4 pool",{plan:"ded",prof:"D4",nodes:3}]],
 fields:[SEL("plan","Plan",[["cons","Consumption"],["ded","Dedicated workload profile"]],"cons"),
   F("reps","Replicas running (average)",2),SEL("vcpu","vCPU per replica",["0.25","0.5","0.75","1","1.5","2","4"],"0.5"),F("mem","Memory per replica",1,{unit:"GiB"}),
   F("req","Requests",10,{unit:"million/mo"}),SEL("prof","Workload profile",ACA_PROFILES.map(p=>[p[0],p[1]]),"D4"),F("nodes","Profile nodes",1),HRS()],
 calc:(c,h,r)=>{const o=[];
   if(c.plan==="ded"){const p=ACA_PROFILES.find(x=>x[0]===c.prof)||ACA_PROFILES[0];
     o.push(HL("standing","Dedicated plan management",1,r("aca_ded_mgmt"),h),HL("standing",`${c.prof} vCPU`,c.nodes*p[2],r("aca_ded_vcpu"),h,`${n(c.nodes)} × ${p[2]} vCPU`),
       HL("standing",`${c.prof} memory`,c.nodes*p[3],r("aca_ded_mem"),h,`${n(c.nodes)} × ${p[3]} GiB`));return o;}
   const s=c.reps*h.v*3600;
   o.push(grantLine("vCPU, active",s*Number(c.vcpu),180000,"vCPU-s",r("aca_vcpu_active")),grantLine("Memory, active",s*c.mem,360000,"GiB-s",r("aca_mem_active")),
     grantLine("Requests",c.req,2,"million",r("aca_req")));return o;},
 notes:(c)=>c.plan==="cons"?[{t:"tip",x:"The free grant (180,000 vCPU-s, 360,000 GiB-s and 2 million requests a month) is per subscription. Replicas that scale to zero cost nothing while idle."}]:[{t:"tip",x:"Apps in a dedicated profile share its nodes; size the node count for peak load."}],
 sum:c=>c.plan==="ded"?`${n(c.nodes)} × ${c.prof} dedicated`:`${n(c.reps)} × ${c.vcpu} vCPU`},

{id:"acr",sec:"k8s",name:"Container Registry",blurb:"Images for AKS and Container Apps",
 desc:"A daily charge per registry by tier, with storage included (10 GB Basic, 100 GB Standard, 500 GB Premium). Premium adds geo-replication and private endpoints.",
 fields:[SEL("tier","Tier",["Basic","Standard","Premium"],"Standard"),F("qty","Registries",1),F("gb","Storage per registry",50,{unit:"GB"}),F("repl","Geo-replicas",0,{more:true,hint:"Premium only."})],
 calc:(c,h,r)=>{const u=r(`acr_${c.tier}`);const o=[L("standing",`${c.tier} registry`,`${n(c.qty)} × ${rt(u)}/day × 30.42 days`,c.qty*scalar(u.v)*DAYS,[u])];
   const extra=Math.max(0,c.gb-ACR_INCLUDED[c.tier]);if(extra>0){const s=r("acr_gb");o.push(L("standing","Storage above the included amount",`${n(c.qty)} × ${n(extra)} GB × ${rt(s)}`,c.qty*extra*scalar(s.v),[s]));}
   if(c.tier==="Premium"&&c.repl>0){const x=r("acr_repl");o.push(L("standing","Geo-replicas",`${n(c.qty*c.repl)} × ${rt(x)}/day × 30.42 days`,c.qty*c.repl*scalar(x.v)*DAYS,[x]));}return o;},
 notes:(c)=>c.tier!=="Premium"?[{t:"tip",x:"Private endpoints need Premium."}]:[],
 sum:c=>`${n(c.qty)} × ${c.tier}`},

/* ---------------- Storage and data ---------------- */
{id:"pg",sec:"data",name:"Azure Database for PostgreSQL",blurb:"Flexible server",pause:true,
 desc:"Compute per hour by tier and size, plus provisioned storage per GB. High availability adds a standby server and doubles both. A server can be stopped for up to 7 days at a time.",
 presets:[["Dev database",{tier:"burst",bsize:"B2ms",servers:1,gb:64,hours:"217"}],["Production",{tier:"gp",vc:"4",servers:1,ha:"zone",gb:256}],["Large, memory heavy",{tier:"mo",vc:"16",servers:1,ha:"zone",gb:1024}]],
 fields:dbFields(),calc:(c,h,r)=>dbLines("pg",c,h,r),notes:dbNotes,sum:dbSum},
{id:"mysql",sec:"data",name:"Azure Database for MySQL",blurb:"Flexible server",pause:true,
 desc:"Compute per hour by tier and size, plus provisioned storage per GB. High availability adds a standby server and doubles both. A server can be stopped for up to 30 days at a time.",
 presets:[["Dev database",{tier:"burst",bsize:"B2ms",servers:1,gb:64,hours:"217"}],["Production",{tier:"gp",vc:"4",servers:1,ha:"zone",gb:256}]],
 fields:dbFields(),calc:(c,h,r)=>dbLines("my",c,h,r),
 notes:(c,h)=>dbNotes(c,h).map(x=>({...x,x:x.x.replace("after 7 days","after 30 days")})),sum:dbSum},
{id:"filesstd",sec:"data",name:"Azure Files Standard",blurb:"Pay-as-you-go Hot and Cool shares",
 desc:"Standard file shares bill for the data stored plus operations. Cool stores for less but costs more per operation. For FSLogix or low-latency workloads, use Azure Files Premium.",
 fields:[SEL("tier","Access tier",["Hot","Cool"],"Hot"),SEL("red","Redundancy",(c,ctx)=>redOpts(ctx,["LRS","ZRS","GRS"]),"LRS",{hint:"ZRS is offered only in regions with availability zones."}),
   F("gb","Data stored",1000,{unit:"GB"}),F("w","Write operations",1,{unit:"million/mo",more:true}),F("rd","Read operations",5,{unit:"million/mo",more:true})],
 calc:(c,h,r)=>{const s=r(`fstd_${c.tier}_${c.red}`);const o=[L("standing",`${c.tier} ${c.red} data stored`,`${n(c.gb)} GB × ${rt(s)}`,c.gb*scalar(s.v),[s])];
   if(c.w>0){const x=r(`fstdw_${c.tier}_${c.red}`);o.push(L("usage","Write operations",`${n(c.w*100)} × 10K × ${rt(x)}`,c.w*100*scalar(x.v),[x]));}
   if(c.rd>0){const x=r(`fstdr_${c.tier}`);o.push(L("usage","Read operations",`${n(c.rd*100)} × 10K × ${rt(x)}`,c.rd*100*scalar(x.v),[x]));}return o;},
 sum:c=>`${n(c.gb)} GB ${c.tier} ${c.red}`},
{id:"anf",sec:"data",name:"Azure NetApp Files",blurb:"Enterprise NFS and SMB volumes",pause:false,
 desc:"Billed on the provisioned capacity pool, by service level, for every hour it exists, whatever is used. Pools start at 1 TiB.",
 fields:[SEL("level","Service level",[["Standard","Standard · 16 MiB/s per TiB"],["Premium","Premium · 64 MiB/s per TiB"],["Ultra","Ultra · 128 MiB/s per TiB"]],"Premium",{wide:true}),
   F("tib","Capacity pool",4,{unit:"TiB"}),F("bk","Backup stored",0,{unit:"GiB",more:true})],
 calc:(c,h,r)=>{const g=Math.max(1,c.tib)*1024;const x=r(`anf_${c.level}`);const o=[L("standing",`${c.level} capacity pool`,`${n(g)} GiB × ${money(scalar(x.v))}/h × 730 h`,g*scalar(x.v)*730,[x])];
   if(c.bk>0){const b=r("anf_backup");o.push(L("usage","Backup stored",`${n(c.bk)} GiB × ${rt(b)}`,c.bk*scalar(b.v),[b]));}return o;},
 sum:c=>`${n(Math.max(1,c.tib))} TiB ${c.level}`},
{id:"asr",sec:"data",name:"Azure Site Recovery",blurb:"Disaster recovery for VMs",
 desc:"A monthly fee per protected VM, plus the managed disks that hold the replicas in the target region and a cache storage account in the source region. Failover VMs only bill while they run.",
 presets:[["10 servers to UK West",{vms:10,disk:"E10",dpv:2,cache:200}]],
 fields:[F("vms","Protected VMs",10),SEL("disk","Replica disk",DISK_OPTS(),"E10",{wide:true}),F("dpv","Disks per VM",2),F("cache","Cache storage",100,{unit:"GB",more:true,hint:"Changed data held before it's sent; usually small."})],
 calc:(c,h,r)=>{const i=r("asr_vm");const o=[ML("standing","Protected VMs",c.vms,i),...diskLines(r,c.disk,"LRS",c.vms*c.dpv,"Replica disks")];
   if(c.cache>0){const s=r("blob_Hot_LRS");o.push(...TL("usage","Cache storage",c.cache,s,"GB"));}return o;},
 notes:()=>[{t:"tip",x:"The first 31 days of protection for each VM are free. Add this item in the target region so the replica disks are priced there."},{t:"note",x:"Test failovers and real failovers run VMs in the target region; add them under Compute if you want them costed."}],
 sum:c=>`${n(c.vms)} VMs`},

/* ---------------- Analytics and AI ---------------- */
{id:"adf",sec:"ai",name:"Data Factory",blurb:"Pipelines, copies and data flows",
 desc:"Pipelines bill per thousand activity runs, copy activity per DIU-hour, other activities per hour, and mapping data flows per vCore-hour. Self-hosted integration runtimes run on your own VMs.",
 presets:[["Nightly loads",{rt:"cloud",runs:10,diu:100,act:50,df:0}],["Hybrid from on-premises",{rt:"sh",runs:20,diu:200,act:100,df:0}],["With data flows",{rt:"cloud",runs:20,diu:200,act:100,df:300}]],
 fields:[SEL("rt","Integration runtime",[["cloud","Azure integration runtime"],["sh","Self-hosted integration runtime"]],"cloud",{wide:true}),
   F("runs","Activity runs",10,{unit:"thousand/mo"}),F("diu","Copy activity",100,{unit:"DIU-hours/mo",hint:"On self-hosted, hours of copy activity."}),
   F("act","Other pipeline activity",50,{unit:"hours/mo"}),F("df","Mapping data flows",0,{unit:"vCore-hours/mo",hint:"An 8-vCore cluster for 1 hour is 8 vCore-hours."})],
 calc:(c,h,r)=>{const o=[];const t=c.rt;const add=(what,q,key,word)=>{if(q>0){const x=r(key);o.push(L("usage",what,`${n(q)} ${word} × ${rt(x)}`,q*scalar(x.v),[x]));}};
   add("Orchestration",c.runs,`adf_orch_${t}`,"× 1,000 runs");add("Copy activity",c.diu,`adf_move_${t}`,t==="cloud"?"DIU-hours":"hours");add("Pipeline activity",c.act,`adf_act_${t}`,"hours");
   add("Mapping data flows, General Purpose",c.df,"adf_df_gp","vCore-hours");return o;},
 notes:(c)=>c.rt==="sh"?[{t:"tip",x:"The self-hosted runtime's VMs are costed separately: add them under Compute."}]:[],
 sum:c=>`${n(c.runs)}K runs · ${c.rt==="sh"?"self-hosted":"Azure IR"}`},
{id:"fabric",sec:"ai",name:"Microsoft Fabric",blurb:"F SKU capacity and OneLake",pause:true,
 desc:"A capacity bills its capacity units (CUs) for every hour it runs and can be paused. OneLake storage bills per GB whether the capacity runs or not.",
 presets:[["Department analytics, F64",{sku:"64",gb:2000}],["Starter, F8 office hours",{sku:"8",gb:200,hours:"217"}]],
 fields:[SEL("sku","Capacity",FABRIC.map(x=>[x,`F${x} · ${x} CUs`]),"64"),HRS(),F("gb","OneLake storage",1000,{unit:"GB"})],
 calc:(c,h,r)=>{const o=[HL("standing",`F${c.sku} capacity`,Number(c.sku),r("fabric_cu"),h,`${c.sku} CUs`)];
   if(c.gb>0){const s=r("onelake_hot");o.push(L("standing","OneLake storage",`${n(c.gb)} GB × ${rt(s)}`,c.gb*scalar(s.v),[s]));}return o;},
 notes:(c)=>[...(Number(c.sku)<64?[{t:"note",x:"Below F64, everyone viewing Power BI content needs a Power BI Pro or Premium Per User licence."}]:[{t:"tip",x:"From F64, users with a free licence can view Power BI content."}]),
   {t:"tip",x:"A 1-year reservation lowers the CU price for capacity that runs all month. Check it in the price catalogue."}],
 sum:c=>`F${c.sku}`},
{id:"aoai",sec:"ai",name:"Azure OpenAI",blurb:"Per token or provisioned throughput",
 desc:"Pay-as-you-go bills input and output tokens per million, with cached input cheaper. Provisioned throughput (PTU) reserves capacity and bills per PTU per hour. Global deployments may process data outside the UK.",
 presets:[["Chat assistant",{mode:"tok",model:"g54m",inM:200,outM:40,cached:30}],["Document processing",{mode:"tok",model:"g54",inM:500,outM:50}],["Provisioned, 50 PTU",{mode:"ptu",ptuType:"global",ptu:50}]],
 fields:[SEL("mode","Billing",[["tok","Pay per token"],["ptu","Provisioned throughput (PTU)"]],"tok"),
   SEL("model","Model",(c,ctx)=>AOAI.filter(([k])=>ok(ctx.r,`aoai_${k}_in`)),"g54m",{wide:true}),
   F("inM","Input tokens",50,{unit:"million/mo"}),F("outM","Output tokens",10,{unit:"million/mo"}),F("cached","Cached share of input",0,{unit:"%",more:true}),
   SEL("ptuType","PTU deployment",(c,ctx)=>PTU.filter(([k])=>ok(ctx.r,`aoai_ptu_${k}`)),"global"),F("ptu","PTUs",15),HRS()],
 calc:(c,h,r)=>{const o=[];
   if(c.mode==="ptu"){const x=r(`aoai_ptu_${c.ptuType}`);if(!ok(r,`aoai_ptu_${c.ptuType}`))return o;o.push(HL("standing",`${PTU.find(p=>p[0]===c.ptuType)[1]} provisioned throughput`,c.ptu,x,h,`${n(c.ptu)} PTU`));return o;}
   if(!ok(r,`aoai_${c.model}_in`))return o;const name=(AOAI.find(m=>m[0]===c.model)||[0,c.model])[1];
   const cp=Math.min(100,c.cached)/100;const cin=ok(r,`aoai_${c.model}_cin`)?r(`aoai_${c.model}_cin`):null;const inp=r(`aoai_${c.model}_in`);
   const fresh=cin?c.inM*(1-cp):c.inM;o.push(L("usage",`${name}, input tokens`,`${n(fresh)} million × ${rt(inp)}`,fresh*scalar(inp.v),[inp]));
   if(cin&&cp>0)o.push(L("usage","Cached input tokens",`${n(c.inM*cp)} million × ${rt(cin)}`,c.inM*cp*scalar(cin.v),[cin]));
   if(ok(r,`aoai_${c.model}_out`)&&c.outM>0){const out=r(`aoai_${c.model}_out`);o.push(L("usage","Output tokens",`${n(c.outM)} million × ${rt(out)}`,c.outM*scalar(out.v),[out]));}return o;},
 notes:(c,h,ctx,lines)=>[...(lines&&!lines.length&&(c.mode==="ptu"||c.inM>0)?[notOffered(c.mode==="ptu"?"This PTU deployment":"Azure OpenAI")]:[]),
   {t:"tip",x:"For UK data residency, choose a Regional deployment. Global deployments are cheaper but can process prompts in any Azure region."},
   ...(c.mode==="ptu"?[{t:"tip",x:"PTU reservations for a month or a year cost much less than the hourly rate. Use the hourly figure as the ceiling."}]:[])],
 sum:c=>c.mode==="ptu"?`${n(c.ptu)} PTU`:`${(AOAI.find(m=>m[0]===c.model)||[0,c.model])[1]} · ${n(c.inM+c.outM)}M tokens`},
{id:"dbx",sec:"ai",name:"Azure Databricks",blurb:"DBUs plus the VMs they run on",pause:true,
 desc:"Databricks bills DBUs (Databricks units) for every hour a cluster or warehouse runs, Premium tier. Classic compute also runs on VMs you pay for separately; serverless includes them.",
 presets:[["Nightly jobs cluster",{work:"jobs",dbu:4,nodes:3,size:"Standard_D4ds_v5",hours:"60"}],["Analysts, SQL serverless",{work:"sqlsl",dbu:12,hours:"217"}]],
 fields:[SEL("work","Workload",DBX.map(x=>[x[0],x[1]]),"jobs",{wide:true}),F("dbu","DBUs per hour",4,{hint:"From the cluster or warehouse size in Databricks."}),HRS({label:"Hours running per month"}),
   F("nodes","VMs in the cluster",3,{hint:"Classic compute only: driver plus workers."}),SEL("size","VM size",(c,ctx)=>vmSizes(ctx,k=>!/^Standard_B/.test(k)),"Standard_D4ds_v5",{wide:true})],
 calc:(c,h,r)=>{const w=DBX.find(x=>x[0]===c.work)||DBX[0];const o=[HL("usage",`${w[1]} DBUs`,c.dbu,r(`dbx_${c.work}`),h,`${n(c.dbu)} DBU`)];
   if(w[2]&&c.nodes>0)o.push(...vmLines(r,c.size,"Linux","payg",c.nodes,h,`Cluster VMs, ${vmName(c.size)}`));return o;},
 notes:(c)=>[{t:"tip",x:"Jobs clusters usually run a few hours a night: set the hours to match, not 730."},{t:"tip",x:"The workspace's storage account and any NAT Gateway or private endpoints are costed separately."}],
 sum:c=>`${(DBX.find(x=>x[0]===c.work)||DBX[0])[1]} · ${n(c.dbu)} DBU/h`},

/* ---------------- Monitoring and management ---------------- */
{id:"monitor",sec:"mgmt",name:"Azure Monitor",blurb:"App Insights, alerts, flow logs",
 desc:"Application Insights ingestion is billed like Log Analytics. Alert rules bill per monitored time series or rule each month, availability tests per run, and VNet flow logs per GB collected.",
 presets:[["Typical landing zone",{ai:2,metric:50,logal:10,web:2,flow:200,ta:"Yes"}]],
 fields:[F("ai","Application Insights ingestion",2,{unit:"GB/day"}),F("metric","Metric alert time series",20,{hint:"The first 10 are free."}),F("logal","Log search alert rules",10),
   SEL("freq","Log alert frequency",[["5","Every 5 minutes"],["10","Every 10 minutes"],["15","Every 15 minutes"],["1","Every minute"]],"5"),
   F("web","Standard availability tests",0),F("locs","Locations per test",5,{more:true}),F("flow","VNet flow logs collected",0,{unit:"GB/mo"}),
   SEL("ta","Traffic analytics",["No","Yes"],"No",{hint:"Processes the flow logs; billed per GB."}),F("cm","Connection monitor tests",0,{more:true}),F("basic","Basic logs ingestion",0,{unit:"GB/day",more:true})],
 calc:(c,h,r)=>{const o=[];
   if(c.ai>0)o.push(...TL("usage","Application Insights ingestion",Math.round(c.ai*DAYS*100)/100,r("la_ingest"),"GB"));
   if(c.basic>0){const x=r("mon_basic_logs");const g=c.basic*DAYS;o.push(L("usage","Basic logs ingestion",`${n(g)} GB × ${rt(x)}`,g*scalar(x.v),[x]));}
   if(c.metric>0)o.push(...TL("standing","Metric alert time series",c.metric,r("mon_alert_metric"),"series"));
   if(c.logal>0)o.push(ML("standing",`Log alert rules, every ${c.freq} min`,c.logal,r(`mon_alert_log_${c.freq}`)));
   if(c.web>0){const x=r("mon_webtest");const runs=c.web*c.locs*(730*60/5);o.push(L("usage","Availability test runs (every 5 minutes)",`${n(c.web)} × ${n(c.locs)} locations × 8,760 runs × ${rt(x)}`,runs*scalar(x.v),[x]));}
   if(c.flow>0){o.push(...TL("usage","VNet flow logs collected",c.flow,r("nw_flow"),"GB"));if(c.ta==="Yes"){const x=r("nw_ta");o.push(L("usage","Traffic analytics processing",`${n(c.flow)} GB × ${rt(x)}`,c.flow*scalar(x.v),[x]));}}
   if(c.cm>0)o.push(...TL("standing","Connection monitor tests",c.cm,r("nw_cm"),"tests"));return o;},
 notes:()=>[{t:"tip",x:"Flow logs are written to a storage account and traffic analytics sends results to a Log Analytics workspace; both bill separately."}],
 sum:c=>`${n(c.ai)} GB/day · ${n(c.metric+c.logal)} alerts`},
{id:"arc",sec:"mgmt",name:"Azure Arc and Update Manager",blurb:"Hybrid servers: updates, policy, ESU",
 desc:"Connecting servers to Azure Arc is free. Update Manager and machine configuration bill per Arc server per month, and Windows Server 2012 Extended Security Updates bill per core.",
 presets:[["50 on-premises servers",{servers:50,upd:"Yes",gcfg:"No"}],["2012 estate needing ESU",{servers:20,upd:"Yes",esu:"std",esuServers:20,cores:8}]],
 fields:[F("servers","Arc-enabled servers",20),SEL("upd","Update Manager",["Yes","No"],"Yes"),SEL("gcfg","Machine configuration",["No","Yes"],"No",{hint:"Guest policy and configuration auditing."}),
   SEL("esu","Extended Security Updates",[["none","None"],["std","Windows Server 2012 Standard"],["dc","Windows Server 2012 Datacenter"]],"none",{wide:true}),
   F("esuServers","Servers needing ESU",0),F("cores","Licensed cores per server",8,{hint:"At least 8 per VM, 16 per physical server."})],
 calc:(c,h,r)=>{const o=[];if(c.upd==="Yes"&&c.servers>0)o.push(ML("standing","Update Manager",c.servers,r("upd_server")));
   if(c.gcfg==="Yes"&&c.servers>0)o.push(ML("standing","Machine configuration",c.servers,r("arc_guestcfg")));
   if(c.esu!=="none"&&c.esuServers>0){const cores=c.esuServers*Math.max(8,c.cores);o.push(CL("standing",`WS2012 ${c.esu==="dc"?"Datacenter":"Standard"} ESU, per core`,cores,r(`esu_${c.esu}_1c`)));}return o;},
 notes:()=>[{t:"tip",x:"Update Manager is free for Azure VMs. Defender for Servers covers Arc servers too: add them under Security."}],
 sum:c=>`${n(c.servers)} servers${c.esu!=="none"?" · ESU":""}`},
];

export { MORE, APP_SIZES, AOAI, per };
