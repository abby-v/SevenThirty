import { SPECS, SENT_TIERS } from './prices.js';
import { n, scalar, rt, money, vmName, DAYS, L, TL, HL, ML, CL } from './format.js';
import { PRICING, vmSizes, pricingOpts, vmLines, DISK_OPTS, diskLines, sentTierCost, sqlLines } from './blocks.js';

// SevenThirty: every guided calculator: its inputs, presets, notes and pricing formula.
const SECTIONS=[["net","Networking"],["sec","Security"],["data","Storage and data"],["avd","Azure Virtual Desktop"],["compute","Compute"],["k8s","Kubernetes"]];
const ER_BW=["50 Mbps","100 Mbps","200 Mbps","500 Mbps","1 Gbps","2 Gbps","5 Gbps","10 Gbps"];
const ER_PLAN={"Standard metered":"std_metered","Premium metered":"prem_metered","Standard unlimited":"std_unl","Premium unlimited":"prem_unl"};
const F=(k,label,def,extra)=>Object.assign({k,label,def,type:"num"},extra||{});
const SEL=(k,label,opts,def,extra)=>Object.assign({k,label,opts,def,type:"sel"},extra||{});
const HRS=(extra)=>Object.assign({k:"hours",type:"hours"},extra||{});

/** Zone-redundant storage only exists in regions with availability zones (UK West has none).
 *  Offer ZRS when the region's price data has ZRS meters, or when no data is loaded for it yet. */
function redOpts(ctx,opts){const R=(ctx.snap&&ctx.snap.regions||{})[ctx.region];if(!R)return opts;return Object.keys(R).some(k=>k.endsWith("_ZRS"))?opts:opts.filter(o=>o!=="ZRS");}
const SVC=[
/* ---------------- Compute ---------------- */
{id:"vm",sec:"compute",name:"Virtual machines",blurb:"Any VM size, Linux or Windows",
 desc:"Pick a size and how many. Windows adds a licence per hour unless the client brings their own through Hybrid Benefit. Reservations and savings plans cut the compute price for steady workloads.",
 presets:[["Web servers",{size:"Standard_D2s_v5",count:2,os:"Windows",osdisk:"P10"}],["App servers",{size:"Standard_D4s_v5",count:2,os:"Windows",osdisk:"P10"}],["SQL Server on a VM",{size:"Standard_E8s_v5",count:1,os:"Windows",osdisk:"P10",ddisk:"P30",dcount:2}],["Dev box, office hours",{size:"Standard_B2ms",count:1,os:"Windows",hours:"217",osdisk:"E10"}]],
 fields:[SEL("size","Size",(c,ctx)=>vmSizes(ctx),"Standard_D4s_v5",{wide:true}),F("count","How many",2),SEL("os","Operating system",["Linux","Windows","Windows (Hybrid Benefit)"],"Windows"),
   SEL("pricing","Pricing",(c,ctx)=>pricingOpts(ctx.r,c.size),"payg"),HRS(),SEL("osdisk","OS disk",DISK_OPTS(),"P10"),
   SEL("ddisk","Data disk",DISK_OPTS("No data disks"),"none",{more:true}),F("dcount","Data disks per VM",1,{more:true}),SEL("red","Disk redundancy",(c,ctx)=>redOpts(ctx,["LRS","ZRS"]),"LRS",{more:true,hint:"ZRS is offered only in regions with availability zones."}),
   SEL("backup","Azure Backup",["No","Yes"],"No",{more:true}),F("bksize","Protected size per VM",128,{unit:"GB",more:true})],
 calc:(c,h,r)=>{const o=vmLines(r,c.size,c.os,c.pricing,c.count,h);
   o.push(...diskLines(r,c.osdisk,c.red,c.count,"OS disk"));if(c.ddisk!=="none")o.push(...diskLines(r,c.ddisk,c.red,c.count*c.dcount,"Data disk"));
   if(c.backup==="Yes"&&c.count){const i=r("bk_inst");const units=c.bksize<=50?0.5:Math.ceil(c.bksize/500);o.push(L("standing","Backup protected instances",`${n(c.count)} × ${n(units)} × ${rt(i)}/month`,c.count*units*scalar(i.v),[i]));
     const s=r(`bk_${c.red==="ZRS"?"ZRS":"GRS"}`);o.push(L("usage","Backup storage (estimated at protected size)",`${n(c.count*c.bksize)} GB × ${rt(s)}`,c.count*c.bksize*scalar(s.v),[s]));}
   return o;},
 notes:(c,h)=>[...(h.v<730?[{t:"note",x:"Stopped (deallocated) VMs don't bill compute, but their disks keep billing. Reservations bill whether the VM runs or not."}]:[]),
   ...(c.pricing!=="payg"?[{t:"tip",x:"Commitment pricing covers compute only. Windows licences and disks still bill at their normal rates."}]:[])],
 sum:c=>`${n(c.count)} × ${vmName(c.size)} ${c.os==="Linux"?"Linux":"Windows"}${c.pricing!=="payg"?" · "+PRICING.find(p=>p[0]===c.pricing)[1].toLowerCase():""}`},

/* ---------------- Kubernetes ---------------- */
{id:"aks",sec:"k8s",name:"AKS cluster",blurb:"Control plane tier and node pools",
 desc:"A cluster is its control plane tier plus the VMs in its node pools. Nodes bill as Linux VMs. Standard tier adds the uptime SLA you want for production; Premium adds long-term support.",
 presets:[["Dev/test",{tier:"Free",sysSize:"Standard_D2s_v5",sysCount:1,userCount:0,hours:"217"}],["Small production",{tier:"Standard",sysSize:"Standard_D4s_v5",sysCount:3,userSize:"Standard_D4s_v5",userCount:3}],["Medium production",{tier:"Standard",sysSize:"Standard_D4s_v5",sysCount:3,userSize:"Standard_D8s_v5",userCount:6}]],
 fields:[SEL("tier","Cluster tier",["Free","Standard","Premium"],"Standard",{hint:"Free has no SLA. Use Standard for production."}),F("clusters","Clusters",1),
   SEL("sysSize","System pool node size",(c,ctx)=>vmSizes(ctx,k=>!/^Standard_B/.test(k)),"Standard_D4s_v5",{wide:true}),F("sysCount","System nodes",3),
   SEL("userSize","User pool node size",(c,ctx)=>vmSizes(ctx),"Standard_D8s_v5",{wide:true}),F("userCount","User nodes",3,{hint:"Average count if the pool autoscales."}),
   SEL("pricing","Node pricing",(c,ctx)=>pricingOpts(ctx.r,c.userCount?c.userSize:c.sysSize),"payg"),HRS(),
   SEL("osdisk","Node OS disk",[["eph","Ephemeral (no charge)"],["P10","P10 managed disk"]],"eph",{more:true}),
   SEL("defender","Defender for Containers",["No","Yes"],"No",{more:true})],
 calc:(c,h,r)=>{const o=[];
   if(c.tier!=="Free"&&c.clusters){o.push(HL("standing",`${c.tier} tier control plane`,c.clusters,r("aks_std"),h));if(c.tier==="Premium")o.push(HL("standing","Long-term support",c.clusters,r("aks_lts"),h));}
   o.push(...vmLines(r,c.sysSize,"Linux",c.pricing,c.clusters*c.sysCount,h,`System nodes, ${vmName(c.sysSize)}`));
   o.push(...vmLines(r,c.userSize,"Linux",c.pricing,c.clusters*c.userCount,h,`User nodes, ${vmName(c.userSize)}`));
   if(c.osdisk==="P10")o.push(...diskLines(r,"P10","LRS",c.clusters*(c.sysCount+c.userCount),"Node OS disks"));
   if(c.defender==="Yes"){const v=c.clusters*((SPECS[c.sysSize]?.[0]||0)*c.sysCount+(SPECS[c.userSize]?.[0]||0)*c.userCount);o.push(CL("standing","Defender for Containers, per vCore",v,r("def_cont")));}
   return o;},
 notes:(c)=>[...(c.tier==="Free"?[{t:"note",x:"Free tier has no financially backed SLA. Use Standard or Premium for production clusters."}]:[]),{t:"tip",x:"Ingress usually needs an Application Gateway or Load Balancer and public IPs; add those from Networking."}],
 sum:c=>`${c.tier} tier · ${n(c.clusters*(c.sysCount+c.userCount))} nodes`},

/* ---------------- AVD ---------------- */
{id:"avd",sec:"avd",name:"AVD host pool",blurb:"Users in, session hosts out",
 desc:"Tell it how many users and how heavy their work is. It sizes the pooled session hosts, runs them at full strength in busy hours and keeps a minimum on overnight, then adds OS disks and FSLogix profile storage.",
 presets:[["100 office workers",{users:100,conc:80,work:"4",size:"Standard_D8s_v5"}],["50 task workers",{users:50,conc:90,work:"6",size:"Standard_D4s_v5"}],["20 power users",{users:20,conc:100,work:"2",size:"Standard_D8s_v5"}]],
 fields:[F("users","Named users",100),F("conc","Peak concurrency",80,{unit:"%"}),
   SEL("work","Workload",[["6","Light: task workers (6 users per vCPU)"],["4","Medium: office workers (4 per vCPU)"],["2","Heavy: developers, analysts (2 per vCPU)"],["1","Power: graphics or engineering (1 per vCPU)"]],"4",{wide:true}),
   SEL("size","Session host size",(c,ctx)=>vmSizes(ctx,k=>/_(D|E)\d+a?s_v5$/.test(k)),"Standard_D8s_v5",{wide:true}),
   HRS({label:"Busy hours per month"}),F("min","Hosts on outside busy hours",1),
   SEL("pricing","Pricing",[["payg","Pay-as-you-go"],["sp1","1-year savings plan"],["sp3","3-year savings plan"]],"payg"),
   SEL("osdisk","Host OS disk",[["P10","P10 Premium SSD"],["E10","E10 Standard SSD"]],"P10",{more:true}),F("profile","FSLogix profile per user",30,{unit:"GiB",more:true}),SEL("red","Profile storage redundancy",(c,ctx)=>redOpts(ctx,["LRS","ZRS"]),"LRS",{more:true,hint:"ZRS is offered only in regions with availability zones."})],
 calc:(c,h,r)=>{const o=[];const v=SPECS[c.size]?.[0]||4;const sessions=Math.ceil(c.users*c.conc/100);const per=v*Number(c.work);const hosts=Math.max(1,Math.ceil(sessions/per));
   const peak=Math.min(730,h.v);const off=Math.max(0,730-peak);const mn=Math.min(c.min,hosts);
   const rate=c.pricing==="payg"?r(`vm_${c.size}_lin`):r(`vm_${c.size}_${c.pricing}`);
   o.push(L("standing",`${n(hosts)} × ${vmName(c.size)} in busy hours`,`${n(hosts)} × ${rt(rate)}/h × ${n(peak)} h`,hosts*scalar(rate.v)*peak,[rate]));
   if(off>0&&mn>0)o.push(L("standing",`${n(mn)} host${mn>1?"s":""} on outside busy hours`,`${n(mn)} × ${rt(rate)}/h × ${n(off)} h`,mn*scalar(rate.v)*off,[rate]));
   o.push(...diskLines(r,c.osdisk,"LRS",hosts,"Host OS disks"));
   const gib=Math.max(100,c.users*c.profile);const f=r(`files_prem_${c.red}`);o.push(L("standing","FSLogix profiles, Azure Files Premium",`${n(gib)} GiB × ${rt(f)}`,gib*scalar(f.v),[f]));
   o._sizing={sessions,per,hosts,v};return o;},
 notes:(c,h,ctx,lines)=>{const s=lines&&lines._sizing;return [...(s?[{t:"tip",x:`${n(c.users)} users at ${n(c.conc)}% concurrency is ${n(s.sessions)} sessions. A ${vmName(c.size)} with ${s.v} vCPU holds about ${n(s.per)} at this workload, so ${n(s.hosts)} host${s.hosts>1?"s":""} at peak.`}]:[]),
   {t:"note",x:"Windows multi-session hosts are priced at the Linux rate: users need an eligible Microsoft 365 or Windows E3/E5 licence. AVD itself has no extra charge for internal users."}];},
 sum:c=>`${n(c.users)} users · ${vmName(c.size)}`},

/* ---------------- Storage and data ---------------- */
{id:"disk",sec:"data",name:"Managed disks",blurb:"Premium and Standard SSD",
 desc:"Disks bill a flat monthly price by size tier, whether or not anything is attached or running.",
 fields:[SEL("disk","Disk",DISK_OPTS(),"P30",{wide:true}),F("count","How many",4),SEL("red","Redundancy",(c,ctx)=>redOpts(ctx,["LRS","ZRS"]),"LRS",{hint:"ZRS is offered only in regions with availability zones."})],
 calc:(c,h,r)=>diskLines(r,c.disk,c.red,c.count,"Managed disk"),sum:c=>`${n(c.count)} × ${c.disk} ${c.red}`},
{id:"blob",sec:"data",name:"Blob storage",blurb:"Hot, cool, cold or archive",
 desc:"Data stored per GB each month, plus write and read operations. Cooler tiers store for less but cost more to access.",
 presets:[["File share replacement",{tier:"Hot",red:"ZRS",gb:2000,w:1,rd:5}],["Long-term archive",{tier:"Archive",red:"GRS",gb:20000,w:0.1,rd:0}]],
 fields:[SEL("tier","Access tier",["Hot","Cool","Cold","Archive"],"Hot"),SEL("red","Redundancy",(c,ctx)=>redOpts(ctx,["LRS","ZRS","GRS"]),"LRS",{hint:"Archive is priced here with GRS. ZRS is offered only in regions with availability zones."}),F("gb","Data stored",1000,{unit:"GB"}),
   F("w","Write operations",1,{unit:"million/mo",more:true}),F("rd","Read operations",5,{unit:"million/mo",more:true})],
 calc:(c,h,r)=>{const red=c.tier==="Archive"?"GRS":c.red;const o=[...TL("standing",`${c.tier} ${red} data stored`,c.gb,r(`blob_${c.tier}_${red}`),"GB")];
   if(c.w>0){const x=r(`blobw_${c.tier}_${red}`);o.push(L("usage","Write operations",`${n(c.w*100)} × 10K × ${rt(x)}`,c.w*100*scalar(x.v),[x]));}
   if(c.rd>0){const x=r(`blobr_${c.tier}`);o.push(L("usage","Read operations",`${n(c.rd*100)} × 10K × ${rt(x)}`,c.rd*100*scalar(x.v),[x]));}return o;},
 sum:c=>`${n(c.gb)} GB ${c.tier}`},
{id:"files",sec:"data",name:"Azure Files Premium",blurb:"Provisioned SMB/NFS shares",
 desc:"Premium file shares bill on provisioned size (minimum 100 GiB), not on what's used.",
 fields:[F("gib","Provisioned size",1024,{unit:"GiB"}),SEL("red","Redundancy",(c,ctx)=>redOpts(ctx,["LRS","ZRS"]),"LRS",{hint:"ZRS is offered only in regions with availability zones."})],
 calc:(c,h,r)=>{const g=Math.max(100,c.gib);const f=r(`files_prem_${c.red}`);return [L("standing",`Premium ${c.red} provisioned`,`${n(g)} GiB × ${rt(f)}`,g*scalar(f.v),[f])];},sum:c=>`${n(c.gib)} GiB ${c.red}`},
{id:"backup",sec:"data",name:"Azure Backup",blurb:"VM protected instances and storage",
 desc:"A monthly fee per protected VM, set by its size, plus the backup storage it uses.",
 fields:[F("vms","Protected VMs",10),F("size","Average size per VM",200,{unit:"GB"}),F("gb","Backup storage used",3000,{unit:"GB",hint:"Usually 1–2× the protected data, depending on retention."}),SEL("red","Storage redundancy",(c,ctx)=>redOpts(ctx,["LRS","ZRS","GRS"]),"GRS")],
 calc:(c,h,r)=>{const i=r("bk_inst");const u=c.size<=50?0.5:Math.ceil(c.size/500);const s=r(`bk_${c.red}`);
   return [L("standing","Protected instances",`${n(c.vms)} × ${n(u)} × ${rt(i)}/month`,c.vms*u*scalar(i.v),[i]),L("usage",`${c.red} backup storage`,`${n(c.gb)} GB × ${rt(s)}`,c.gb*scalar(s.v),[s])];},
 sum:c=>`${n(c.vms)} VMs · ${n(c.gb)} GB`},
{id:"sqldb",sec:"data",name:"Azure SQL Database",blurb:"vCore, General Purpose or Business Critical",
 desc:"Priced per vCore per hour. If the client has SQL Server licences with Software Assurance, Hybrid Benefit removes the licence part. Reservations cover the compute part.",
 presets:[["Small app database",{tier:"General Purpose",vc:"2",dbs:1}],["Line-of-business",{tier:"General Purpose",vc:"8",dbs:1}],["Mission critical",{tier:"Business Critical",vc:"8",dbs:1}]],
 fields:[SEL("tier","Service tier",["General Purpose","Business Critical"],"General Purpose"),SEL("vc","vCores per database",["2","4","6","8","10","12","16","20","24","32","40","80"],"4"),F("dbs","Databases",1),
   SEL("lic","SQL licence",["Licence included","Hybrid Benefit"],"Licence included"),SEL("pricing","Compute pricing",[["payg","Pay-as-you-go"],["ri1","1-year reservation"],["ri3","3-year reservation"]],"payg"),HRS()],
 calc:(c,h,r)=>sqlLines("sql",c,h,r),notes:()=>[{t:"tip",x:"Data and backup storage bill separately. Add them from More storage and data services if they matter to this estimate."}],
 sum:c=>`${n(c.dbs)} × ${c.vc} vCore ${c.tier==="General Purpose"?"GP":"BC"}${c.lic==="Hybrid Benefit"?" · AHB":""}`},
{id:"sqlmi",sec:"data",name:"SQL Managed Instance",blurb:"Near-full SQL Server compatibility",
 desc:"Priced per vCore per hour like SQL Database. The first 32 GB of storage is included; more is billed separately.",
 fields:[SEL("tier","Service tier",["General Purpose","Business Critical"],"General Purpose"),SEL("vc","vCores per instance",["4","8","16","24","32","40","64","80"],"8"),F("dbs","Instances",1),
   SEL("lic","SQL licence",["Licence included","Hybrid Benefit"],"Licence included"),SEL("pricing","Compute pricing",[["payg","Pay-as-you-go"],["ri1","1-year reservation"],["ri3","3-year reservation"]],"payg"),HRS()],
 calc:(c,h,r)=>sqlLines("mi",c,h,r),sum:c=>`${n(c.dbs)} × ${c.vc} vCore ${c.tier==="General Purpose"?"GP":"BC"}${c.lic==="Hybrid Benefit"?" · AHB":""}`},

/* ---------------- Security ---------------- */
{id:"fw",sec:"sec",name:"Azure Firewall",blurb:"Basic, Standard or Premium",pause:true,
 desc:"Deployment hours plus data processed. Can be deallocated with PowerShell or CLI to stop the hourly charge. Secured Virtual WAN hubs use the same rates.",
 fields:[SEL("sku","SKU",["Basic","Standard","Premium"],"Standard"),F("qty","Firewalls",1),F("gb","Data processed",1000,{unit:"GB/mo"}),HRS(),F("cu","Extra capacity units",0,{more:true,hint:"Only when it scales out under load."})],
 calc:(c,h,r)=>{const o=[HL("standing",`${c.sku} deployment`,c.qty,r(`fw_${c.sku}_h`),h),...TL("usage","Data processed",c.gb,r(`fw_${c.sku}_gb`),"GB")];
   if(c.cu>0&&c.sku!=="Basic")o.push(HL("standing","Extra capacity units",c.qty*c.cu,r(`fw_${c.sku}_cu`),h,`${n(c.qty)} × ${n(c.cu)}`));return o;},sum:c=>`${n(c.qty)} × ${c.sku}`},
{id:"ddos",sec:"sec",name:"DDoS Protection",blurb:"IP or Network Protection",
 desc:"Billed continuously, so always costed at 730 h. A Network Protection plan covers 100 public IPs and can span subscriptions: add it once.",
 fields:[SEL("mode","Plan",["IP Protection","Network Protection"],"IP Protection"),F("ips","Protected public IPs",2)],
 calc:(c,h,r)=>c.mode==="Network Protection"?[CL("standing","Network Protection plan",1,r("ddos_plan")),...(c.ips>100?[CL("standing","Protected IPs above 100",c.ips-100,r("ddos_res"))]:[])]:[CL("standing","IP Protection",c.ips,r("ddos_ip"))],
 sum:c=>`${c.mode} · ${n(c.ips)} IPs`},
{id:"bas",sec:"sec",name:"Azure Bastion",blurb:"Browser RDP/SSH without public IPs",
 desc:"Standard and Premium include two instances; each extra instance bills hourly.",
 fields:[SEL("sku","SKU",["Basic","Standard","Premium"],"Basic"),F("qty","Bastion hosts",1),HRS(),F("inst","Extra instances",0,{more:true})],
 calc:(c,h,r)=>{const o=[HL("standing",`${c.sku} host`,c.qty,r("bas_"+c.sku),h)];if(c.sku!=="Basic"&&c.inst>0)o.push(HL("standing","Extra instances",c.qty*c.inst,r(`bas_${c.sku}_add`),h,`${n(c.qty)} × ${n(c.inst)}`));return o;},
 sum:c=>`${n(c.qty)} × ${c.sku}`},
{id:"defender",sec:"sec",name:"Defender for Cloud",blurb:"Workload protection plans",
 desc:"Each plan bills per protected resource for every hour it is enabled. Enter only the plans you'll switch on.",
 presets:[["Servers and SQL",{servers:20,plan:"Plan 2",sql:2,stor:5,arm:1}],["Servers only",{servers:20,plan:"Plan 1",sql:0,stor:0,arm:0}]],
 fields:[F("servers","Servers",10),SEL("plan","Servers plan",["Plan 1","Plan 2"],"Plan 2",{hint:"Plan 2 adds vulnerability assessment, FIM and 500 MB/day of free log ingestion per server."}),
   F("sql","SQL servers or instances",0),F("stor","Storage accounts",0),F("arm","Subscriptions (Resource Manager)",1),
   F("kv","Key vaults",0,{more:true}),F("app","App Service instances",0,{more:true}),F("cont","Container vCores",0,{more:true})],
 calc:(c,h,r)=>{const o=[];const add=(what,q,key)=>{if(q>0)o.push(CL("standing",what,q,r(key)));};
   add(`Servers, ${c.plan}`,c.servers,c.plan==="Plan 1"?"def_p1":"def_p2");add("SQL",c.sql,"def_sql");add("Storage accounts",c.stor,"def_stor");add("Resource Manager",c.arm,"def_arm");
   add("Key Vault",c.kv,"def_kv");add("App Service",c.app,"def_app");add("Containers, per vCore",c.cont,"def_cont");return o;},
 sum:c=>`${n(c.servers)} servers ${c.plan}`},
{id:"sentinel",sec:"sec",name:"Microsoft Sentinel",blurb:"SIEM, by GB per day",
 desc:"Enter average daily ingestion. It compares pay-as-you-go with every commitment tier and picks the cheapest, unless you choose one.",
 fields:[F("gb","Average ingestion",10,{unit:"GB/day"}),SEL("mode","Pricing",[["auto","Cheapest option (recommended)"],["payg","Pay-as-you-go"],...SENT_TIERS.map(t=>[String(t),`${t} GB/day commitment tier`])],"auto",{wide:true})],
 calc:(c,h,r)=>{const payg=r("sent_payg");let best={k:"payg",cost:c.gb*DAYS*scalar(payg.v)};
   if(c.mode==="auto")SENT_TIERS.forEach(t=>{const x=sentTierCost(r,c.gb,t);if(x.cost<best.cost)best={k:String(t),cost:x.cost};});else best={k:c.mode};
   if(best.k==="payg")return [L("usage","Pay-as-you-go analysis",`${n(c.gb)} GB/day × 30.42 days × ${rt(payg)}`,c.gb*DAYS*scalar(payg.v),[payg])];
   const t=Number(best.k);const x=sentTierCost(r,c.gb,t);const o=[L("standing",`${t} GB/day commitment tier`,`${rt(x.p)}/day × 30.42 days`,scalar(x.p.v)*DAYS,[x.p])];
   if(c.gb>t)o.push(L("usage","Overage at the tier's effective rate",`${n(c.gb-t)} GB/day × 30.42 × ${money(scalar(x.p.v)/t)}`,(c.gb-t)*DAYS*scalar(x.p.v)/t,[x.p]));return o;},
 notes:()=>[{t:"tip",x:"Sentinel's simplified pricing includes Log Analytics ingestion for the same data, so don't add it again under Log Analytics."}],
 sum:c=>`${n(c.gb)} GB/day`},
{id:"la",sec:"sec",name:"Log Analytics",blurb:"Workspace ingestion and retention",
 desc:"Ingestion per GB (the first 5 GB a month is free), plus retention beyond the free 31 days.",
 fields:[F("gb","Average ingestion",5,{unit:"GB/day"}),F("ret","Extra retention held",0,{unit:"GB",more:true,hint:"GB kept beyond 31 days, on average."})],
 calc:(c,h,r)=>{const o=TL("usage","Ingestion",Math.round(c.gb*DAYS*100)/100,r("la_ingest"),"GB");if(c.ret>0){const x=r("la_ret");o.push(L("standing","Extra retention",`${n(c.ret)} GB × ${rt(x)}`,c.ret*scalar(x.v),[x]));}return o;},
 sum:c=>`${n(c.gb)} GB/day`},
{id:"kv",sec:"sec",name:"Key Vault",blurb:"Secrets, keys and certificates",
 desc:"Operations per 10,000, HSM-protected keys per month (Premium) and certificate renewals.",
 fields:[F("ops","Operations",1,{unit:"million/mo"}),F("hsm","HSM-protected keys",0),F("cert","Certificate renewals",0,{unit:"per month",more:true})],
 calc:(c,h,r)=>{const o=[];const x=r("kv_ops");if(c.ops>0)o.push(L("usage","Operations",`${n(c.ops*100)} × 10K × ${rt(x)}`,c.ops*100*scalar(x.v),[x]));
   if(c.hsm>0)o.push(ML("standing","HSM-protected keys",c.hsm,r("kv_hsm_key")));if(c.cert>0){const y=r("kv_cert");o.push(L("usage","Certificate renewals",`${n(c.cert)} × ${rt(y)}`,c.cert*scalar(y.v),[y]));}return o;},
 sum:c=>`${n(c.ops)}M operations`},

/* ---------------- Networking ---------------- */
{id:"vnet",sec:"net",name:"VNet peering",blurb:"Hub-and-spoke data",
 desc:"Charged per GB at both ends: out of the sending VNet and into the receiving one, so each figure here costs both. Spoke-to-spoke traffic through a hub crosses two peerings.",
 fields:[F("intra","Same-region traffic",500,{unit:"GB/mo"}),F("glob","Cross-region traffic",0,{unit:"GB/mo"})],
 calc:(c,h,r)=>{const o=[];if(c.intra>0){const x=r("peer_intra");o.push(L("usage","Same region, out + in",`${n(c.intra)} GB × 2 × ${rt(x)}`,c.intra*2*scalar(x.v),[x]));}
   if(c.glob>0){const x=r("peer_global");o.push(L("usage","Global, out + in",`${n(c.glob)} GB × 2 × ${rt(x)}`,c.glob*2*scalar(x.v),[x]));}return o;},sum:c=>`${n(c.intra+c.glob)} GB/mo`},
{id:"pip",sec:"net",name:"Public IP addresses",blurb:"Standard static IPv4",pause:false,
 desc:"Standard SKU, static. Bills every hour it exists, attached or not.",fields:[F("qty","How many",2),HRS()],
 calc:(c,h,r)=>[HL("standing","Static IPv4 addresses",c.qty,r("pip_h"),h)],sum:c=>`${n(c.qty)} IPs`},
{id:"nat",sec:"net",name:"NAT Gateway",blurb:"Outbound internet for subnets",pause:false,
 desc:"No stopped state: it bills until deleted, plus every GB it processes.",fields:[F("qty","Gateways",1),F("gb","Data processed",200,{unit:"GB/mo"}),HRS()],
 calc:(c,h,r)=>[HL("standing","Gateway hours",c.qty,r("nat_h"),h),...TL("usage","Data processed",c.gb,r("nat_gb"),"GB")],sum:c=>`${n(c.qty)} gateway${c.qty>1?"s":""}`},
{id:"pe",sec:"net",name:"Private Endpoints",blurb:"Private Link to PaaS",pause:false,
 desc:"Each endpoint bills hourly, plus data processed in both directions.",fields:[F("qty","Endpoints",5),F("gbin","Data in",100,{unit:"GB/mo"}),F("gbout","Data out",100,{unit:"GB/mo"}),HRS()],
 calc:(c,h,r)=>[HL("standing","Endpoint hours",c.qty,r("pe_h"),h),...TL("usage","Data in",c.gbin,r("pe_in"),"GB"),...TL("usage","Data out",c.gbout,r("pe_out"),"GB")],sum:c=>`${n(c.qty)} endpoints`},
{id:"vpn",sec:"net",name:"VPN Gateway",blurb:"Site-to-site and point-to-site",pause:false,
 desc:"Zone-redundant SKUs. Bills hourly from deployment whatever the traffic. The first 10 site-to-site tunnels are included.",
 fields:[SEL("sku","SKU",[["VpnGw1AZ","VpnGw1AZ · up to 650 Mbps"],["VpnGw2AZ","VpnGw2AZ · up to 1 Gbps"],["VpnGw3AZ","VpnGw3AZ · up to 1.25 Gbps"],["VpnGw4AZ","VpnGw4AZ · up to 5 Gbps"],["VpnGw5AZ","VpnGw5AZ · up to 10 Gbps"]],"VpnGw1AZ",{wide:true}),F("qty","Gateways",1),F("s2s","S2S tunnels per gateway",2),HRS()],
 calc:(c,h,r)=>{const o=[HL("standing",`${c.sku} gateway`,c.qty,r("vpn_"+c.sku),h)];const e=Math.max(0,c.s2s-10);if(e>0)o.push(HL("standing","S2S tunnels above 10",c.qty*e,r("vpn_s2s"),h,`${n(c.qty)} × ${n(e)}`));return o;},sum:c=>`${n(c.qty)} × ${c.sku}`},
{id:"er",sec:"net",name:"ExpressRoute",blurb:"Gateway and circuit",pause:false,
 desc:"The gateway bills hourly in the region. The circuit is a flat monthly fee from the moment it's provisioned, whatever the provider's status. Metered plans add outbound data.",
 fields:[SEL("gw","Gateway SKU",["ErGw1AZ","ErGw2AZ","ErGw3AZ","ErGwScale"],"ErGw1AZ"),F("gws","Gateways",1),SEL("plan","Circuit plan",Object.keys(ER_PLAN),"Standard metered"),SEL("bw","Bandwidth",ER_BW,"1 Gbps"),F("circ","Circuits",1),
   F("out","Outbound data",1000,{unit:"GB/mo",hint:"Metered plans only."}),HRS(),F("su","ErGwScale scale units",2,{more:true})],
 calc:(c,h,r)=>{const o=[];if(c.gws>0){if(c.gw==="ErGwScale")o.push(HL("standing","ErGwScale gateway",c.gws*c.su,r("er_ErGwScale"),h,`${n(c.gws)} × ${n(c.su)} units`));else o.push(HL("standing",`${c.gw} gateway`,c.gws,r("er_"+c.gw),h));}
   if(c.circ>0){o.push(ML("standing",`${c.plan} circuit, ${c.bw}`,c.circ,r(`er_${ER_PLAN[c.plan]}_${c.bw.replace(" ","")}`)));if(/metered/.test(ER_PLAN[c.plan])&&c.out>0)o.push(...TL("usage","Outbound data, metered",c.out,r("er_out"),"GB"));}return o;},
 sum:c=>`${c.gw} · ${c.bw} ${c.plan.toLowerCase()}`},
{id:"vwan",sec:"net",name:"Virtual WAN",blurb:"Managed hubs and gateways",pause:false,
 desc:"Standard hubs bill hourly. Gateways in a hub bill per scale unit; connections bill per connection hour. Cost a secured hub's firewall with Azure Firewall under Security.",
 presets:[["One hub with VPN",{hubs:1,s2s:1,sites:4,p2s:0,users:0,er:0,erc:0}],["Two hubs with ExpressRoute",{hubs:2,s2s:1,sites:4,er:1,erc:2}]],
 fields:[F("hubs","Hubs",1),F("s2s","S2S scale units per hub",1),F("sites","S2S connections",2),F("er","ER scale units per hub",0),F("erc","ER connections",0),F("gb","Data processed in hubs",1000,{unit:"GB/mo"}),HRS(),
   F("p2s","P2S scale units per hub",0,{more:true}),F("users","Concurrent P2S users",0,{more:true}),F("ru","Extra routing units",0,{more:true})],
 calc:(c,h,r)=>{const o=[];const hr=(what,q,key,pre)=>{if(q>0)o.push(HL("standing",what,q,r(key),h,pre));};
   hr("Standard hubs",c.hubs,"vwan_hub");hr("VPN S2S scale units",c.hubs*c.s2s,"vwan_s2s_su",`${n(c.hubs)} × ${n(c.s2s)}`);hr("VPN S2S connections",c.sites,"vwan_s2s_cu");
   hr("VPN P2S scale units",c.hubs*c.p2s,"vwan_p2s_su",`${n(c.hubs)} × ${n(c.p2s)}`);hr("P2S connected users",c.users,"vwan_p2s_cu");
   hr("ExpressRoute scale units",c.hubs*c.er,"vwan_er_su",`${n(c.hubs)} × ${n(c.er)}`);hr("ExpressRoute connections",c.erc,"vwan_er_cu");hr("Extra routing units",c.ru,"vwan_rin");
   if(c.gb>0)o.push(...TL("usage","Hub data processed",c.gb,r("vwan_dp"),"GB"));return o;},sum:c=>`${n(c.hubs)} hub${c.hubs>1?"s":""}`},
{id:"lb",sec:"net",name:"Load Balancer",blurb:"Standard, layer 4",pause:false,
 desc:"First five rules per hour, then each extra rule, plus data processed.",fields:[F("qty","Load balancers",1),F("rules","Rules each",5),F("gb","Data processed",200,{unit:"GB/mo"}),HRS()],
 calc:(c,h,r)=>{const o=[HL("standing","First 5 rules",c.qty,r("lb_h"),h)];const e=Math.max(0,c.rules-5);if(e>0)o.push(HL("standing","Extra rules",c.qty*e,r("lb_rule"),h,`${n(c.qty)} × ${n(e)}`));o.push(...TL("usage","Data processed",c.gb,r("lb_gb"),"GB"));return o;},
 sum:c=>`${n(c.qty)} × ${n(c.rules)} rules`},
{id:"agw",sec:"net",name:"Application Gateway",blurb:"Layer 7, with optional WAF",pause:true,
 desc:"A fixed hourly charge per gateway plus capacity units for the load it carries. One capacity unit is roughly 2,500 connections or 2.22 Mbps. Can be stopped with PowerShell or CLI.",
 fields:[SEL("tier","Tier",["Basic v2","Standard v2","WAF v2"],"WAF v2"),F("qty","Gateways",1),F("cu","Average capacity units each",5),HRS()],
 calc:(c,h,r)=>{const t=c.tier.split(" ")[0];return [HL("standing",`${c.tier} fixed`,c.qty,r(`agw_${t}_fixed`),h),HL("usage","Capacity units",c.qty*c.cu,r(`agw_${t}_cu`),h,`${n(c.qty)} × ${n(c.cu)}`)];},
 sum:c=>`${n(c.qty)} × ${c.tier}`},
{id:"afd",sec:"net",name:"Front Door",blurb:"Global CDN and WAF",global:true,
 desc:"A monthly base fee per profile, plus requests and data from the edge. Premium adds managed WAF rules and Private Link origins.",
 fields:[SEL("tier","Tier",["Standard","Premium"],"Standard"),F("qty","Profiles",1),F("req","Requests",10,{unit:"million/mo"}),F("out","Edge to client",500,{unit:"GB/mo"}),F("origin","Edge to origin",100,{unit:"GB/mo",more:true})],
 calc:(c,h,r)=>{const o=[ML("standing",`${c.tier} base fee`,c.qty,r(`afd_${c.tier}_base`))];if(c.req>0)o.push(...TL("usage","Requests",c.req*100,r(`afd_${c.tier}_req`),"× 10K requests"));
   if(c.out>0)o.push(...TL("usage","Edge to client",c.out,r("afd_out"),"GB"));if(c.origin>0)o.push(...TL("usage","Edge to origin",c.origin,r("afd_origin"),"GB"));return o;},sum:c=>`${c.tier} · ${n(c.out)} GB out`},
{id:"tm",sec:"net",name:"Traffic Manager",blurb:"DNS-based routing",global:true,
 desc:"Per million DNS queries, plus each monitored endpoint per month.",fields:[F("q","DNS queries",10,{unit:"million/mo"}),F("az","Azure endpoints",2),F("ext","External endpoints",0)],
 calc:(c,h,r)=>{const o=[];if(c.q>0)o.push(...TL("usage","DNS queries",c.q,r("tm_q"),"million"));if(c.az>0)o.push(ML("standing","Azure endpoint health checks",c.az,r("tm_az_hc")));if(c.ext>0)o.push(ML("standing","External endpoint health checks",c.ext,r("tm_ext_hc")));return o;},
 sum:c=>`${n(c.az+c.ext)} endpoints`},
{id:"dns",sec:"net",name:"Azure DNS",blurb:"Zones, queries, Private Resolver",global:true,
 desc:"Zones bill monthly (cheaper above 25), queries per million. Private Resolver endpoints and rulesets are monthly.",
 fields:[F("pub","Public zones",2),F("priv","Private zones",10),F("pq","Public queries",5,{unit:"million/mo"}),F("vq","Private queries",20,{unit:"million/mo"}),
   F("rin","Resolver inbound endpoints",0,{more:true}),F("rout","Resolver outbound endpoints",0,{more:true}),F("rs","Forwarding rulesets",0,{more:true})],
 calc:(c,h,r)=>{const o=[];if(c.pub>0)o.push(...TL("standing","Public zones",c.pub,r("dns_pub_zone"),"zones"));if(c.priv>0)o.push(...TL("standing","Private zones",c.priv,r("dns_priv_zone"),"zones"));
   if(c.pq>0)o.push(...TL("usage","Public queries",c.pq,r("dns_pub_q"),"million"));if(c.vq>0)o.push(...TL("usage","Private queries",c.vq,r("dns_priv_q"),"million"));
   if(c.rin>0)o.push(ML("standing","Resolver inbound endpoints",c.rin,r("dns_res_in")));if(c.rout>0)o.push(ML("standing","Resolver outbound endpoints",c.rout,r("dns_res_out")));if(c.rs>0)o.push(ML("standing","Forwarding rulesets",c.rs,r("dns_ruleset")));return o;},
 sum:c=>`${n(c.pub+c.priv)} zones`},
{id:"egress",sec:"net",name:"Internet egress",blurb:"Data out to the internet",
 desc:"Data leaving Azure to the internet over the Microsoft network. Tiered: the first 100 GB a month is free.",fields:[F("gb","Outbound data",500,{unit:"GB/mo"})],
 calc:(c,h,r)=>TL("usage","Outbound data",c.gb,r("egress"),"GB"),sum:c=>`${n(c.gb)} GB/mo`}
];
const SVCMAP=Object.fromEntries(SVC.map(s=>[s.id,s]));
const SECTION_ORDER={net:["vnet","pip","nat","pe","vpn","er","vwan","lb","agw","afd","tm","dns","egress"],sec:["fw","ddos","bas","defender","sentinel","la","kv"],data:["disk","blob","files","backup","sqldb","sqlmi"],avd:["avd"],compute:["vm"],k8s:["aks"]};
const FAMILY_SEC={Compute:"compute",Containers:"k8s",Networking:"net",Security:"sec",Storage:"data",Databases:"data",Analytics:"data","Management and Governance":"sec"};
function defaults(svc){const d={};SVCMAP[svc].fields.forEach(f=>{d[f.k]=f.type==="hours"?"":f.def;});return d;}

export { redOpts, SECTIONS, SVC, SVCMAP, SECTION_ORDER, FAMILY_SEC, ER_BW, ER_PLAN, defaults };
