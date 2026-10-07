(function(){
"use strict";
/* =====================================================================
   PRICES  (GBP, Azure Retail Prices API, retrieved 7 Oct 2026)
   ===================================================================== */
const SPECS = { // vCPU, GiB RAM, family — used for labels and AVD sizing
  Standard_B2s:[2,4,"Burstable"],Standard_B2ms:[2,8,"Burstable"],Standard_B4ms:[4,16,"Burstable"],Standard_B8ms:[8,32,"Burstable"],
  Standard_D2s_v5:[2,8,"General purpose"],Standard_D4s_v5:[4,16,"General purpose"],Standard_D8s_v5:[8,32,"General purpose"],Standard_D16s_v5:[16,64,"General purpose"],Standard_D32s_v5:[32,128,"General purpose"],Standard_D48s_v5:[48,192,"General purpose"],Standard_D64s_v5:[64,256,"General purpose"],
  Standard_D2as_v5:[2,8,"General purpose, AMD"],Standard_D4as_v5:[4,16,"General purpose, AMD"],Standard_D8as_v5:[8,32,"General purpose, AMD"],Standard_D16as_v5:[16,64,"General purpose, AMD"],Standard_D32as_v5:[32,128,"General purpose, AMD"],
  Standard_D2ds_v5:[2,8,"General purpose, local disk"],Standard_D4ds_v5:[4,16,"General purpose, local disk"],Standard_D8ds_v5:[8,32,"General purpose, local disk"],Standard_D16ds_v5:[16,64,"General purpose, local disk"],
  Standard_E2s_v5:[2,16,"Memory optimised"],Standard_E4s_v5:[4,32,"Memory optimised"],Standard_E8s_v5:[8,64,"Memory optimised"],Standard_E16s_v5:[16,128,"Memory optimised"],Standard_E32s_v5:[32,256,"Memory optimised"],Standard_E64s_v5:[64,512,"Memory optimised"],
  Standard_E4as_v5:[4,32,"Memory optimised, AMD"],Standard_E8as_v5:[8,64,"Memory optimised, AMD"],Standard_E16as_v5:[16,128,"Memory optimised, AMD"],
  Standard_F2s_v2:[2,4,"Compute optimised"],Standard_F4s_v2:[4,8,"Compute optimised"],Standard_F8s_v2:[8,16,"Compute optimised"],Standard_F16s_v2:[16,32,"Compute optimised"]
};
// sku: [linux/h, windows/h, 1-yr RI total, 3-yr RI total, 1-yr SP/h, 3-yr SP/h]
const VM_UKS = {
  Standard_B2ms:[0.071518,0.077276,0,0,0.054175,0.037947], Standard_B4ms:[0.143187,0.155309,0,0,0.108464,0.075975],
  Standard_D2s_v5:[0.081723,0.149457,441.744892,848.150193,0.061407,0.042962], Standard_D4s_v5:[0.167553,0.306427,905.694555,1738.933545,0.1259,0.088083],
  Standard_D8s_v5:[0.335107,0.612853,1811.389109,3478.621835,0.251799,0.176166], Standard_D16s_v5:[0.670214,1.225707,3622.778218,6957.24367,0.503599,0.352331],
  Standard_D4as_v5:[0.150949,0.289822,815.879845,1566.851579,0.113393,0.079671], Standard_D8as_v5:[0.301898,0.579645,1631.759689,3133.703159,0.226786,0.159342],
  Standard_E4s_v5:[0.217927,0.353396,1177.98638,2262.47009,0.147363,0.103145], Standard_E8s_v5:[0.446809,0,2415.185479,4637.910865,0.302132,0.211475],
  Standard_E16s_v5:[0.893619,0,4829.616212,9276.576475,0.604265,0.42295], Standard_F4s_v2:[0.152459,0.291332,0,0,0.112545,0.076107]
};
const VM_UKW = { Standard_D4s_v5:[0.175101,0.313974,947.9603,1820.446055,0.133077,0.096306] };
function vmKeys(t){const o={};for(const k in t){const v=t[k];const p="vm_"+k;if(v[0])o[p+"_lin"]=v[0];if(v[1])o[p+"_win"]=v[1];if(v[2])o[p+"_ri1"]=v[2];if(v[3])o[p+"_ri3"]=v[3];if(v[4])o[p+"_sp1"]=v[4];if(v[5])o[p+"_sp3"]=v[5];}return o;}
const DISK_P={P4:[32,4.8395,7.2593],P6:[64,9.3563,14.0345],P10:[128,18.0674,27.1010],P15:[256,34.8442,52.2663],P20:[512,67.1192,100.6788],P30:[1024,123.9047,185.8570],P40:[2048,237.4566,356.1850],P50:[4096,454.2649,681.3973]};
function diskKeys(){const o={disk_E10_LRS:7.9701};for(const k in DISK_P){o[`disk_${k}_LRS`]=DISK_P[k][1];o[`disk_${k}_ZRS`]=DISK_P[k][2];}return o;}
const DISK_GIB=Object.assign({E10:128},Object.fromEntries(Object.entries(DISK_P).map(([k,v])=>[k,v[0]])));
const SENT_TIERS=[50,100,200,300,400,500,1000,2000,5000];

const BUILTIN = {
  generated:"2026-10-07", currency:"GBP", source:"Azure Retail Prices API (prices.azure.com), GBP",
  regions:{
    global:{
      nat_h:0.0340, nat_gb:0.0340, lb_h:0.0189, lb_rule:0.0075, lb_gb:0.0038, peer_intra:0.0075,
      pe_h:0.0074, pe_in:[[0,0.0074],[1000000,0.0044],[5000000,0.0029]], pe_out:[[0,0.0074],[1000000,0.0044],[5000000,0.0029]],
      tm_q:[[0,0.4076],[1000,0.2830]], tm_az_hc:0.2717, tm_ext_hc:0.4076,
      sql_lic_gp:0.0754, sql_lic_bc:0.2830
    },
    "Zone 1":{
      afd_Standard_base:26.3386, afd_Premium_base:248.3350,
      afd_Standard_req:[[0,0.0068],[25000,0.0061],[100000,0.0055],[500000,0.0049]], afd_Premium_req:[[0,0.0113],[25000,0.0106],[100000,0.0100],[500000,0.0095]],
      afd_out:[[0,0.0621],[10000,0.0489],[50000,0.0421],[150000,0.0106],[500000,0.0052],[1000000,0.0043],[5000000,0.0041]], afd_origin:0.0151,
      dns_pub_zone:[[0,0.3681],[25,0.0736]], dns_priv_zone:[[0,0.3681],[25,0.0736]], dns_pub_q:[[0,0.2945],[1000,0.1472]], dns_priv_q:0.2945,
      dns_res_in:132.5235, dns_res_out:132.5235, dns_ruleset:1.8406, er_out:0.0188,
      er_std_metered_50Mbps:41.3892, er_std_metered_100Mbps:82.7783, er_std_metered_200Mbps:109.1169, er_std_metered_500Mbps:218.2338,
      er_std_metered_1Gbps:328.1032, er_std_metered_2Gbps:656.2065, er_std_metered_5Gbps:1640.5162, er_std_metered_10Gbps:2558.6033,
      er_prem_metered_100Mbps:150.5061, er_prem_metered_200Mbps:221.9965, er_prem_metered_500Mbps:519.2460, er_prem_metered_2Gbps:1785.0021, er_prem_metered_10Gbps:4816.1945,
      er_std_unl_50Mbps:225.7591, er_std_unl_100Mbps:432.7050, er_std_unl_10Gbps:38604.8087, er_prem_unl_500Mbps:2370.4707, er_prem_unl_1Gbps:4853.8210
    },
    uksouth:Object.assign({
      pip_h:0.0038, peer_global:0.0264,
      vpn_VpnGw1AZ:0.1585, vpn_VpnGw2AZ:0.4076, vpn_VpnGw3AZ:1.0415, vpn_VpnGw4AZ:1.7435, vpn_VpnGw5AZ:3.0341, vpn_s2s:0.0113,
      fw_Basic_h:0.2908, fw_Basic_gb:0.0479, fw_Standard_h:0.9203, fw_Standard_gb:0.0118, fw_Standard_cu:0.0515, fw_Premium_h:1.2884, fw_Premium_gb:0.0118, fw_Premium_cu:0.0810,
      bas_Basic:0.1434, bas_Standard:0.2189, bas_Premium:0.3396, bas_Standard_add:0.1057, bas_Premium_add:0.1660,
      ddos_plan:3.0344, ddos_res:0.0303, ddos_ip:0.2051, egress:[[0,0],[100,0.0657],[10335,0.0626],[51295,0.0528],[153695,0.0377]],
      vwan_hub:0.1881, vwan_dp:0.0151, vwan_s2s_su:0.2717, vwan_s2s_cu:0.0376, vwan_p2s_su:0.2717, vwan_p2s_cu:0.0094, vwan_er_su:0.3161, vwan_er_cu:0.0376, vwan_rin:0.0753,
      agw_Basic_fixed:0.0195, agw_Basic_cu:0.0062, agw_Standard_fixed:0.1841, agw_Standard_cu:0.0059, agw_WAF_fixed:0.3313, agw_WAF_cu:0.0106,
      er_ErGw1AZ:0.2735, er_ErGw2AZ:0.4788, er_ErGw3AZ:1.6296, er_ErGwScale:0.1591,
      win_vcpu:0.0347185, aks_std:0.0755, aks_lts:0.4528,
      blob_Hot_LRS:[[0,0.0145],[51200,0.0139],[512000,0.0133]], blob_Hot_ZRS:[[0,0.0181],[51200,0.0174],[512000,0.0167]], blob_Hot_GRS:[[0,0.0290],[51200,0.0278],[512000,0.0267]],
      blob_Cool_LRS:0.0079, blob_Cool_ZRS:0.0099, blob_Cool_GRS:0.0158, blob_Cold_LRS:0.0038, blob_Cold_ZRS:0.0038, blob_Cold_GRS:0.0070, blob_Archive_GRS:0.0032,
      blobw_Hot_LRS:0.0445, blobw_Hot_ZRS:0.0557, blobw_Hot_GRS:0.0898, blobw_Cool_LRS:0.0830, blobw_Cool_ZRS:0.0830, blobw_Cool_GRS:0.1660,
      blobw_Cold_LRS:0.1359, blobw_Cold_ZRS:0.1509, blobw_Cold_GRS:0.3140, blobw_Archive_GRS:0.1743,
      blobr_Hot:0.0035, blobr_Cool:0.0083, blobr_Cold:0.0755, blobr_Archive:4.0002,
      files_prem_LRS:0.1328, files_prem_ZRS:0.1660,
      sql_gp:0.1436, sql_bc:0.2872, sql_gp_ri1:817.3893, sql_gp_ri3:1698.1773, sql_bc_ri1:1635.5334, sql_bc_ri3:3396.3546,
      mi_gp:0.1436, mi_bc:0.2872, mi_gp_ri1:817.3893, mi_gp_ri3:1698.1773, mi_bc_ri1:1635.5334, mi_bc_ri3:3396.3546,
      la_ingest:[[0,0],[5,2.1737]], la_ret:0.0981, sent_payg:4.0605,
      sent_50:152.1284, sent_100:279.2558, sent_200:517.0006, sent_300:754.7455, sent_400:978.6483, sent_500:1193.4413, sent_1000:2339.7109, sent_2000:4528.4728, sent_5000:10896.6376,
      def_p1:0.0051, def_p2:0.0151, def_sql:0.0152, def_stor:0.0101, def_kv:0.0003, def_app:0.0151, def_cont:0.0071, def_arm:0.0052,
      kv_ops:0.0226, kv_hsm_key:0.7547, kv_cert:2.2642,
      bk_inst:7.5475, bk_LRS:0.0211, bk_ZRS:0.0264, bk_GRS:0.0423
    },vmKeys(VM_UKS),diskKeys()),
    ukwest:Object.assign({
      pip_h:0.0038, peer_global:0.0264,
      vpn_VpnGw1AZ:0.1585, vpn_VpnGw2AZ:0.4076, vpn_VpnGw3AZ:1.0415, vpn_VpnGw4AZ:1.7435, vpn_VpnGw5AZ:3.0341, vpn_s2s:0.0113,
      fw_Basic_h:0.2993, fw_Basic_gb:0.0492, fw_Standard_h:0.9470, fw_Standard_gb:0.0121, fw_Standard_cu:0.0530, fw_Premium_h:1.3258, fw_Premium_gb:0.0121, fw_Premium_cu:0.0833,
      bas_Basic:0.1434, bas_Standard:0.2189, bas_Premium:0.3396, bas_Standard_add:0.1057, bas_Premium_add:0.1660,
      ddos_res:0.0297, ddos_ip:0.2057,
      vwan_hub:0.1887, vwan_dp:0.0151, vwan_s2s_su:0.2725, vwan_s2s_cu:0.0377, vwan_p2s_su:0.2725, vwan_p2s_cu:0.0094, vwan_er_su:0.3170, vwan_er_cu:0.0377, vwan_rin:0.0755,
      agw_Basic_fixed:0.0205, agw_Basic_cu:0.0073, agw_Standard_fixed:0.1977, agw_Standard_cu:0.0060, agw_WAF_fixed:0.3562, agw_WAF_cu:0.0109,
      er_ErGw1AZ:0.2725, er_ErGw2AZ:0.4770, er_ErGw3AZ:1.6235, er_ErGwScale:0.1585, win_vcpu:0.0347185
    },vmKeys(VM_UKW))
  }
};
// Built-in figures that read inconsistently while collecting. Flagged "verify" until a fresh rates file replaces them.
const VERIFY=new Set(["ddos_plan","afd_out","er_std_metered_10Gbps"]);

/* =====================================================================
   REGIONS
   ===================================================================== */
const REGIONS=[["uksouth","UK South"],["ukwest","UK West"],["northeurope","North Europe"],["westeurope","West Europe"],["francecentral","France Central"],["germanywestcentral","Germany West Central"],
 ["swedencentral","Sweden Central"],["switzerlandnorth","Switzerland North"],["norwayeast","Norway East"],["italynorth","Italy North"],["spaincentral","Spain Central"],["polandcentral","Poland Central"],
 ["eastus","East US"],["eastus2","East US 2"],["centralus","Central US"],["westus2","West US 2"],["westus3","West US 3"],["southcentralus","South Central US"],["canadacentral","Canada Central"],["brazilsouth","Brazil South"],
 ["uaenorth","UAE North"],["qatarcentral","Qatar Central"],["israelcentral","Israel Central"],["southafricanorth","South Africa North"],["centralindia","Central India"],
 ["southeastasia","Southeast Asia"],["eastasia","East Asia"],["japaneast","Japan East"],["koreacentral","Korea Central"],["australiaeast","Australia East"],["newzealandnorth","New Zealand North"]];
const regionName=id=>(REGIONS.find(r=>r[0]===id)||[id,id])[1];
function zoneOf(id){
  if(/asia|japan|korea|australia|india|newzealand/.test(id))return "Zone 2";
  if(/brazil/.test(id))return "Zone 3";
  if(/^(uk|north|west|france|germany|sweden|switzerland|norway|italy|spain|poland|east|central|south|canada)/.test(id)&&!/africa/.test(id))return "Zone 1";
  return null;
}

/* =====================================================================
   HELPERS
   ===================================================================== */
const gbp=(v,dp=2)=>(v<0?"−":"")+"£"+Math.abs(v).toLocaleString("en-GB",{minimumFractionDigits:dp,maximumFractionDigits:dp});
const n=v=>Number(v).toLocaleString("en-GB",{maximumFractionDigits:2});
function money(v){return "£"+(v>=100?v.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}):v>=1?v.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:4}):v.toLocaleString("en-GB",{minimumFractionDigits:4,maximumFractionDigits:6}));}
const scalar=v=>Array.isArray(v)?v[0][1]:Number(v)||0;
const rt=r=>money(scalar(r.v));
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const $=id=>document.getElementById(id);
const num=v=>Math.max(0,Number(v)||0);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const store={get(k){try{return JSON.parse(localStorage.getItem(k)||"null");}catch(e){return null;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
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

/* =====================================================================
   STATE + RATE LOOKUP
   ===================================================================== */
let SNAP=store.get("st-snapshot2")||BUILTIN;
let CAT=null;
let S=store.get("st-estimate-v2");
function rateLookup(region){
  const zone=zoneOf(region);
  return key=>{
    const ov=((S.overrides||{})[region]||{})[key];
    if(ov!=null&&!isNaN(ov))return {v:Number(ov),src:"manual",key};
    const R=SNAP.regions||{};
    if(R[region]&&R[region][key]!=null)return {v:R[region][key],src:"region",key,verify:VERIFY.has(key)&&!SNAP.imported};
    if(zone&&R[zone]&&R[zone][key]!=null)return {v:R[zone][key],src:"global",key,verify:VERIFY.has(key)&&!SNAP.imported};
    if(R.global&&R.global[key]!=null)return {v:R.global[key],src:"global",key};
    for(const p of ["uksouth","Zone 1"]){const P=R[p]||BUILTIN.regions[p];if(P&&P[key]!=null)return {v:P[key],src:"proxy",key,from:p};}
    return {v:0,src:"missing",key};
  };
}
const has=(r,key)=>r(key).src!=="missing";
function globalHours(){return S.mode==="custom"?Math.max(0,Math.min(744,Number(S.custom)||0)):Number(S.mode);}
function hoursOf(v){const g=globalHours();if(v!==""&&v!=null&&!isNaN(Number(v))){const x=Math.max(0,Math.min(744,Number(v)));return {v:x,t:`${n(x)} h`,ov:true};}return {v:g,t:`${n(g)} h`,ov:false};}

/* =====================================================================
   SHARED BUILDING BLOCKS
   ===================================================================== */
const PRICING=[["payg","Pay-as-you-go"],["ri1","1-year reservation"],["ri3","3-year reservation"],["sp1","1-year savings plan"],["sp3","3-year savings plan"]];
function vmSizes(region,filter){
  const r=rateLookup(region);const keys=new Set();
  const R=SNAP.regions||{};[region,"uksouth"].forEach(rg=>Object.keys(R[rg]||{}).forEach(k=>{const m=k.match(/^vm_(.+)_lin$/);if(m)keys.add(m[1]);}));
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

/* =====================================================================
   SERVICES
   ===================================================================== */
const SECTIONS=[["net","Networking"],["sec","Security"],["data","Storage and data"],["avd","Azure Virtual Desktop"],["compute","Compute"],["k8s","Kubernetes"]];
const ER_BW=["50 Mbps","100 Mbps","200 Mbps","500 Mbps","1 Gbps","2 Gbps","5 Gbps","10 Gbps"];
const ER_PLAN={"Standard metered":"std_metered","Premium metered":"prem_metered","Standard unlimited":"std_unl","Premium unlimited":"prem_unl"};
const F=(k,label,def,extra)=>Object.assign({k,label,def,type:"num"},extra||{});
const SEL=(k,label,opts,def,extra)=>Object.assign({k,label,opts,def,type:"sel"},extra||{});
const HRS=(extra)=>Object.assign({k:"hours",type:"hours"},extra||{});

const SVC=[
/* ---------------- Compute ---------------- */
{id:"vm",sec:"compute",name:"Virtual machines",blurb:"Any VM size, Linux or Windows",
 desc:"Pick a size and how many. Windows adds a licence per hour unless the client brings their own through Hybrid Benefit. Reservations and savings plans cut the compute price for steady workloads.",
 presets:[["Web servers",{size:"Standard_D2s_v5",count:2,os:"Windows",osdisk:"P10"}],["App servers",{size:"Standard_D4s_v5",count:2,os:"Windows",osdisk:"P10"}],["SQL Server on a VM",{size:"Standard_E8s_v5",count:1,os:"Windows",osdisk:"P10",ddisk:"P30",dcount:2}],["Dev box, office hours",{size:"Standard_B2ms",count:1,os:"Windows",hours:"217",osdisk:"E10"}]],
 fields:[SEL("size","Size",(c,ctx)=>vmSizes(ctx.region),"Standard_D4s_v5",{wide:true}),F("count","How many",2),SEL("os","Operating system",["Linux","Windows","Windows (Hybrid Benefit)"],"Windows"),
   SEL("pricing","Pricing",(c,ctx)=>pricingOpts(ctx.r,c.size),"payg"),HRS(),SEL("osdisk","OS disk",DISK_OPTS(),"P10"),
   SEL("ddisk","Data disk",DISK_OPTS("No data disks"),"none",{more:true}),F("dcount","Data disks per VM",1,{more:true}),SEL("red","Disk redundancy",["LRS","ZRS"],"LRS",{more:true}),
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
   SEL("sysSize","System pool node size",(c,ctx)=>vmSizes(ctx.region,k=>!/^Standard_B/.test(k)),"Standard_D4s_v5",{wide:true}),F("sysCount","System nodes",3),
   SEL("userSize","User pool node size",(c,ctx)=>vmSizes(ctx.region),"Standard_D8s_v5",{wide:true}),F("userCount","User nodes",3,{hint:"Average count if the pool autoscales."}),
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
   SEL("size","Session host size",(c,ctx)=>vmSizes(ctx.region,k=>/_(D|E)\d+a?s_v5$/.test(k)),"Standard_D8s_v5",{wide:true}),
   HRS({label:"Busy hours per month"}),F("min","Hosts on outside busy hours",1),
   SEL("pricing","Pricing",[["payg","Pay-as-you-go"],["sp1","1-year savings plan"],["sp3","3-year savings plan"]],"payg"),
   SEL("osdisk","Host OS disk",[["P10","P10 Premium SSD"],["E10","E10 Standard SSD"]],"P10",{more:true}),F("profile","FSLogix profile per user",30,{unit:"GiB",more:true}),SEL("red","Profile storage redundancy",["LRS","ZRS"],"LRS",{more:true})],
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
 fields:[SEL("disk","Disk",DISK_OPTS(),"P30",{wide:true}),F("count","How many",4),SEL("red","Redundancy",["LRS","ZRS"],"LRS")],
 calc:(c,h,r)=>diskLines(r,c.disk,c.red,c.count,"Managed disk"),sum:c=>`${n(c.count)} × ${c.disk} ${c.red}`},
{id:"blob",sec:"data",name:"Blob storage",blurb:"Hot, cool, cold or archive",
 desc:"Data stored per GB each month, plus write and read operations. Cooler tiers store for less but cost more to access.",
 presets:[["File share replacement",{tier:"Hot",red:"ZRS",gb:2000,w:1,rd:5}],["Long-term archive",{tier:"Archive",red:"GRS",gb:20000,w:0.1,rd:0}]],
 fields:[SEL("tier","Access tier",["Hot","Cool","Cold","Archive"],"Hot"),SEL("red","Redundancy",["LRS","ZRS","GRS"],"LRS",{hint:"Archive is priced here with GRS."}),F("gb","Data stored",1000,{unit:"GB"}),
   F("w","Write operations",1,{unit:"million/mo",more:true}),F("rd","Read operations",5,{unit:"million/mo",more:true})],
 calc:(c,h,r)=>{const red=c.tier==="Archive"?"GRS":c.red;const o=[...TL("standing",`${c.tier} ${red} data stored`,c.gb,r(`blob_${c.tier}_${red}`),"GB")];
   if(c.w>0){const x=r(`blobw_${c.tier}_${red}`);o.push(L("usage","Write operations",`${n(c.w*100)} × 10K × ${rt(x)}`,c.w*100*scalar(x.v),[x]));}
   if(c.rd>0){const x=r(`blobr_${c.tier}`);o.push(L("usage","Read operations",`${n(c.rd*100)} × 10K × ${rt(x)}`,c.rd*100*scalar(x.v),[x]));}return o;},
 sum:c=>`${n(c.gb)} GB ${c.tier}`},
{id:"files",sec:"data",name:"Azure Files Premium",blurb:"Provisioned SMB/NFS shares",
 desc:"Premium file shares bill on provisioned size (minimum 100 GiB), not on what's used.",
 fields:[F("gib","Provisioned size",1024,{unit:"GiB"}),SEL("red","Redundancy",["LRS","ZRS"],"LRS")],
 calc:(c,h,r)=>{const g=Math.max(100,c.gib);const f=r(`files_prem_${c.red}`);return [L("standing",`Premium ${c.red} provisioned`,`${n(g)} GiB × ${rt(f)}`,g*scalar(f.v),[f])];},sum:c=>`${n(c.gib)} GiB ${c.red}`},
{id:"backup",sec:"data",name:"Azure Backup",blurb:"VM protected instances and storage",
 desc:"A monthly fee per protected VM, set by its size, plus the backup storage it uses.",
 fields:[F("vms","Protected VMs",10),F("size","Average size per VM",200,{unit:"GB"}),F("gb","Backup storage used",3000,{unit:"GB",hint:"Usually 1–2× the protected data, depending on retention."}),SEL("red","Storage redundancy",["LRS","ZRS","GRS"],"GRS")],
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
function sqlLines(p,c,h,r){const t=c.tier==="General Purpose"?"gp":"bc";const q=c.dbs*Number(c.vc);const o=[];const unit=p==="sql"?"database":"instance";
  if(c.pricing==="ri1"||c.pricing==="ri3"){const ri=r(`${p}_${t}_${c.pricing}`);const m=c.pricing==="ri1"?12:36;o.push(L("standing",`Compute, ${m/12}-year reservation`,`${n(c.dbs)} ${unit}${c.dbs>1?"s":""} × ${c.vc} vCores × ${rt(ri)} ÷ ${m} months`,q*scalar(ri.v)/m,[ri]));}
  else o.push(HL("standing","Compute",q,r(`${p}_${t}`),h,`${n(c.dbs)} × ${c.vc} vCores`));
  if(c.lic==="Licence included")o.push(HL("standing","SQL licence",q,r(`sql_lic_${t}`),h,`${n(c.dbs)} × ${c.vc} vCores`));
  return o;}
const SVCMAP=Object.fromEntries(SVC.map(s=>[s.id,s]));
const SECTION_ORDER={net:["vnet","pip","nat","pe","vpn","er","vwan","lb","agw","afd","tm","dns","egress"],sec:["fw","ddos","bas","defender","sentinel","la","kv"],data:["disk","blob","files","backup","sqldb","sqlmi"],avd:["avd"],compute:["vm"],k8s:["aks"]};
const FAMILY_SEC={Compute:"compute",Containers:"k8s",Networking:"net",Security:"sec",Storage:"data",Databases:"data",Analytics:"data","Management and Governance":"sec"};

/* =====================================================================
   STATE
   ===================================================================== */
function defaults(svc){const d={};SVCMAP[svc].fields.forEach(f=>{d[f.k]=f.type==="hours"?"":f.def;});return d;}
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
   COMPUTE
   ===================================================================== */
function clean(def,cfg){const c={};def.fields.forEach(f=>{const v=cfg[f.k]??(f.type==="hours"?"":f.def);c[f.k]=f.type==="sel"?v:f.type==="hours"?v:num(v);});return c;}
function computeItem(it){
  if(it.svc==="generic"||it.svc==="manual")return computeGeneric(it);
  const def=SVCMAP[it.svc];if(!def)return {lines:[],amt:0,payg:0};
  const r=rateLookup(it.region);const c=clean(def,it.cfg);const h=hoursOf(c.hours);
  // keep select values valid for this region (e.g. a VM size without a reservation price)
  def.fields.forEach(f=>{if(f.type==="sel"&&typeof f.opts==="function"){const o=f.opts(c,{region:it.region,r}).map(x=>Array.isArray(x)?x[0]:x);if(o.length&&!o.includes(c[f.k]))c[f.k]=o.includes(f.def)?f.def:o[0];}});
  const lines=def.calc(c,h,r,{region:it.region});const amt=lines.reduce((a,l)=>a+l.amt,0);
  let payg=amt;if(c.pricing&&c.pricing!=="payg"){const pl=def.calc(Object.assign({},c,{pricing:"payg"}),h,r,{region:it.region});payg=pl.reduce((a,l)=>a+l.amt,0);}
  return {lines,amt,payg,h,c,def};
}
function parseUnit(u){const s=String(u||"1").trim();const low=s.toLowerCase();const m=low.match(/^([\d.,]+)\s*([km])?/);let k=m?parseFloat(m[1].replace(/,/g,""))||1:1;if(m&&m[2]==="k")k*=1000;if(m&&m[2]==="m")k*=1e6;
  const w=low.replace(/^[\d.,]+\s*[km]?\s*/,"").replace(/^\//,"").trim();let measure="";if(/\bgb\b/.test(w))measure="GB";else if(/\btb\b/.test(w))measure="TB";else if(/second/.test(w))measure="seconds";
  let cls="usage";if(/hour/.test(w))cls="hour";else if(/month/.test(w))cls="month";else if(/day/.test(w))cls="day";else if(/year/.test(w))cls="year";return {cls,n:k,measure,raw:s};}
function qtyLabel(pu){if(pu.cls==="hour")return "How many";if(pu.cls==="month")return pu.measure?`${pu.measure} per month`:"How many";if(pu.cls==="day"||pu.cls==="year")return "How many";return pu.measure?`${pu.measure} per month`:"Units per month";}
function computeGeneric(it){
  const c=it.cfg;const pu=parseUnit(it.unit);const q=num(c.qty);const h=hoursOf(c.hours);const out=[];const src={src:it.svc==="manual"?"manual":"catalogue"};let payg=0;
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
function computeAll(){
  const items=S.items.map(it=>({it,res:computeItem(it)}));
  let standing=0,usage=0,payg=0,proxy=0,missing=0;
  items.forEach(({res})=>{res.lines.forEach(l=>{if(l.kind==="standing")standing+=l.amt;else usage+=l.amt;if(l.srcs.some(s=>s.src==="proxy"))proxy++;if(l.srcs.some(s=>s.src==="missing"))missing++;});payg+=res.payg;});
  const list=standing+usage;const a=S.acr;const disc=Math.min(100,num(a.disc))/100,cont=num(a.cont)/100;const monthly=list*(1-disc)*(1+cont);
  const term=Number(a.term)||36,live=Math.max(1,Number(a.live)||1),ramp=Math.max(1,Number(a.ramp)||1);
  const months=[];for(let m=1;m<=term;m++){const f=m<live?0:Math.min(1,(m-live+1)/ramp);months.push(monthly*f);}
  return {items,standing,usage,list,payg,commitSave:Math.max(0,payg-list),disc,cont,monthly,months,termTotal:months.reduce((x,y)=>x+y,0),term,proxy,missing};
}

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
  if(f.type==="hours")return `<label class="field" for="${id}">${lab}<input id="${id}" type="number" min="0" max="744" step="1" inputmode="numeric" data-f="hours" value="${esc(c.hours??"")}" placeholder="${globalHours()}"><span class="hint">Blank uses the ${n(globalHours())} h set at the top.</span></label>`;
  return `<label class="field${f.wide?" wide":""}" for="${id}">${lab}<input id="${id}" type="number" min="0" step="any" inputmode="decimal" data-f="${f.k}" value="${esc(c[f.k])}">${hint}</label>`;}
function renderCfg(){
  const v=S.ui.view;if(v==="catalog")return renderCatalog();if(v==="manual")return renderManual();
  const d=S.ui.draft;const def=SVCMAP[d.svc];const r=rateLookup(d.region);const ctx={region:d.region,r};
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
  const it=draftItem();const res=computeItem(it);const def=SVCMAP[it.svc];
  $("cfgLedger").innerHTML=(res.lines.length?res.lines.map(ledgerLi).join(""):`<li class="empty">Enter a quantity to see the working.</li>`)+
    (res.payg-res.amt>0.005?`<li class="empty">Pay-as-you-go would be ${gbp(res.payg)} a month: this pricing saves ${gbp(res.payg-res.amt)}.</li>`:"");
  $("cfgPrice").innerHTML=`${gbp(res.amt)} <small>/ month</small>`;
  const notes=[...(def.notes?def.notes(res.c,res.h,{region:it.region},res.lines):[])];
  if(def.pause===false&&res.h&&res.h.v<730)notes.unshift({t:"note",x:`${def.name} has no stopped state. ${n(res.h.v)} h is only right if you delete and redeploy it on a schedule; otherwise use 730.`});
  if(res.lines.some(l=>l.srcs.some(s=>s.src==="proxy")))notes.unshift({t:"note",x:`Some rates aren't loaded for ${regionName(it.region)}, so UK South or Zone 1 rates stand in. Load a rates file that includes ${it.region} before sharing.`});
  if(res.lines.some(l=>l.srcs.some(s=>s.src==="missing")))notes.unshift({t:"note",x:"A line has no published rate in the loaded price data and is costed at £0. Load a rates file, or enter the rate under Rates used."});
  $("cfgNotes").innerHTML=notes.map(x=>`<p class="${x.t}">${esc(x.x)}</p>`).join("");
  renderRates(res,it.region);
}
function ledgerLi(l){const f=[];if(l.srcs.some(s=>s.src==="missing"))f.push('<span class="flag">no rate</span>');else if(l.srcs.some(s=>s.src==="proxy"))f.push('<span class="flag">stand-in rate</span>');
  if(l.srcs.some(s=>s.verify))f.push('<span class="flag verify">verify</span>');if(l.srcs.some(s=>s.src==="manual"&&s.key))f.push('<span class="flag edit">edited rate</span>');
  return `<li><span class="kind ${l.kind}">${l.kind}</span><span class="what">${esc(l.what)}${f.join("")}</span><span class="calc">${esc(l.calc)}</span><span class="amt">${gbp(l.amt)}</span></li>`;}
function renderRates(res,region){const t=$("ratesTable");if(!t)return;const seen=new Map();res.lines.forEach(l=>l.srcs.forEach(s=>{if(s.key&&!seen.has(s.key))seen.set(s.key,s);}));
  t.innerHTML=seen.size?[...seen.values()].map(s=>{const k=s.key;const tiered=Array.isArray(s.v);const src=s.src==="region"?"regional":s.src==="global"?"global or zone":s.src==="proxy"?`stand-in from ${s.from==="Zone 1"?"Zone 1":regionName(s.from)}`:s.src==="manual"?"edited":"missing";
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
  const hits=[];for(const x of idx){if(catSec&&(FAMILY_SEC[x.fam]||"other")!==catSec)continue;if(toks.every(t=>x.t.includes(t))){hits.push(x);if(hits.length>=60)break;}}
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
function renderGenericEdit(it){const res=computeGeneric(it);const pu=res.pu;const opts=[["payg","Pay-as-you-go"]];if(pu.cls==="hour"){if(it.ri1)opts.push(["ri1","1-year reservation"]);if(it.ri3)opts.push(["ri3","3-year reservation"]);if(it.sp1)opts.push(["sp1","1-year savings plan"]);if(it.sp3)opts.push(["sp3","3-year savings plan"]);}
  $("cfg").innerHTML=`<div class="crumb">${esc(SECTIONS.find(s=>s[0]===itemSection(it))?.[1]||"Other")}</div><h2>${esc(itemName(it))}</h2>
   <p class="lead">${it.svc==="manual"?`Manual rate ${money(Number(it.payg)||0)} ${esc(pu.raw)}.`:`${esc(it.meta.svc)} › ${esc(it.meta.prod)} · ${esc(it.meta.sku)} · ${esc(it.meta.meter)} · ${esc(it.unit)} · priced ${esc(fmtDate(it.date))}`}</p>
   <div class="editing"><span>Editing this item in your estimate. Changes apply as you type.</span><button class="btn sm" type="button" id="cancelEdit">Done</button></div>
   <div class="fields"><label class="field wide" for="g-label"><span class="fl">Name in estimate</span><input id="g-label" type="text" data-g="label" value="${esc(it.label||"")}"></label>
    <label class="field" for="g-qty"><span class="fl">${esc(qtyLabel(pu))}</span><input id="g-qty" type="number" min="0" step="any" data-g="qty" value="${esc(it.cfg.qty)}"></label>
    ${pu.cls==="hour"?`<label class="field" for="g-hours"><span class="fl">Hours per month</span><input id="g-hours" type="number" min="0" max="744" data-g="hours" value="${esc(it.cfg.hours??"")}" placeholder="${globalHours()}"></label>`:""}
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
function monthLabel(i){const [y,m]=(S.acr.start||"2026-10").split("-").map(Number);const d=new Date(y,(m-1)+i,1);return d.toLocaleDateString("en-GB",{month:"short",year:"2-digit"});}
function niceMax(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const m=v/p;return (m<=1?1:m<=2?2:m<=5?5:10)*p;}
function shortGbp(v){return v>=1000?"£"+(v/1000).toLocaleString("en-GB",{maximumFractionDigits:1})+"k":"£"+Math.round(v);}
function renderChart(){const W=340,H=150,pl=44,pb=22,pt=10,pr=6;const nice=niceMax(Math.max(...R.months,1));const bw=(W-pl-pr)/R.months.length;
  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" font-family="IBM Plex Mono, monospace" font-size="9">`;
  [0,.5,1].forEach(f=>{const y=pt+(H-pt-pb)*(1-f);s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="var(--rule)" stroke-width="1"/><text x="${pl-5}" y="${y+3}" text-anchor="end" fill="var(--muted)">${shortGbp(nice*f)}</text>`;});
  R.months.forEach((v,i)=>{const h=(H-pt-pb)*(v/nice);s+=`<rect x="${(pl+i*bw+bw*.15).toFixed(1)}" y="${(H-pb-h).toFixed(1)}" width="${(bw*.7).toFixed(1)}" height="${h.toFixed(1)}" fill="var(--accent)" rx="1"/>`;});
  const step=R.months.length>24?12:6;for(let i=0;i<R.months.length;i+=step)s+=`<text x="${pl+i*bw+bw/2}" y="${H-6}" text-anchor="middle" fill="var(--muted)">${esc(monthLabel(i))}</text>`;
  $("chart").innerHTML=s+"</svg>";$("chart").setAttribute("aria-label",`Monthly consumption over ${R.term} months, reaching ${gbp(R.monthly)} per month at steady state`);}
function fyOf(i){const [y,m]=(S.acr.start||"2026-10").split("-").map(Number);const d=new Date(y,(m-1)+i,1);return d.getMonth()>=6?d.getFullYear()+1:d.getFullYear();}
function renderFY(){const map=new Map();R.months.forEach((v,i)=>{const f=fyOf(i);map.set(f,(map.get(f)||0)+v);});
  $("fyTable").innerHTML=`<caption class="sr">Consumption by Microsoft fiscal year (July to June)</caption><tr><th scope="col">Microsoft fiscal year</th><th scope="col">Consumption</th></tr>`+
   [...map.entries()].map(([f,v])=>`<tr><td>FY${String(f).slice(2)} (Jul ${f-1} – Jun ${f})</td><td>${gbp(v,0)}</td></tr>`).join("")+`<tr><th scope="row">Term total</th><td>${gbp(R.termTotal,0)}</td></tr>`;}
function fmtStamp(s){const d=new Date(s);return isNaN(d)?String(s||""):d.toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"});}
function fmtDate(s){const d=new Date(s);return isNaN(d)?String(s||""):d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});}
function syncTop(){document.querySelectorAll("#seg button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===S.mode)));$("customHours").value=S.custom;
  $("dClient").value=S.meta.client||"";$("dTitle").value=S.meta.title||"";$("dBy").value=S.meta.by||"";$("dStatus").value=S.meta.status||"Indicative";
  $("aStart").value=S.acr.start;$("aTerm").value=String(S.acr.term);$("aLive").value=S.acr.live;$("aRamp").value=S.acr.ramp;$("aDisc").value=S.acr.disc;$("aCont").value=S.acr.cont;
  $("snapDate").textContent=SNAP.live?`updated ${fmtStamp(SNAP.generatedAt||SNAP.generated)}`:`${SNAP.imported?"loaded ":"snapshot "}${fmtDate(SNAP.generated)}`;
  if(MAN&&!MAN.seed&&$("priceIntro"))$("priceIntro").textContent=`Prices refresh automatically every day at 06:00 GMT from Microsoft's Azure Retail Prices API, for ${(MAN.regions||[]).map(regionName).join(", ")}. You can still load a file here, for example to price another region, or reopen an estimate file copied from this page.`;
  $("catStat").innerHTML=CAT?`Catalogue loaded: <b>${n(Object.values(CAT.scopes).reduce((a,x)=>a+x.length,0))} meters</b> from ${esc(fmtDate(CAT.generated))}, covering ${esc(Object.keys(CAT.scopes).filter(k=>k&&k!=="global"&&!/^Zone/.test(k)).map(regionName).join(", ")||"shared services only")}.`:"No catalogue loaded.";}
function refresh(){R=computeAll();renderSheet();}
function full(){R=computeAll();renderMenu();renderCfgOrEdit();renderSheet();syncTop();}
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
  if(el.dataset.g&&ed){if(el.dataset.g==="label")ed.label=el.value;else ed.cfg[el.dataset.g]=el.value;touched();refresh();if(el.tagName!=="SELECT"){const res=computeGeneric(ed);$("genLedger").innerHTML=res.lines.map(ledgerLi).join("");cfg.querySelector(".cta .price").innerHTML=`${gbp(res.amt)} <small>/ month</small>`;}return;}
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
  const it=draftItem();const res=computeItem(it);$("cfgLedger").innerHTML=res.lines.map(ledgerLi).join("");$("cfgPrice").innerHTML=`${gbp(res.amt)} <small>/ month</small>`;});
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
  const merged={};const keys=new Set([...Object.keys(BUILTIN.regions),...Object.keys(obj.regions||{})]);keys.forEach(k=>{merged[k]=Object.assign({},BUILTIN.regions[k]||{},(obj.regions||{})[k]||{});});
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
const mark=l=>(l.srcs.some(s=>s.src==="missing")?" ✕":l.srcs.some(s=>s.src==="proxy")?" ⚑":"");
function assumptions(){const g=globalHours();const a=[];
  a.push(`Hours model: ${n(g)} h/month${S.mode==="730"?" (always on)":S.mode==="217"?" (office hours, 8am–6pm weekdays)":" (custom)"}; per-item overrides shown in the calculation column.`);
  a.push(`Prices: Microsoft Azure retail list prices in GBP, from the ${fmtDate(SNAP.generated)} price data.`);
  const regs=[...new Set(S.items.map(i=>i.region))];a.push(`Regions: ${regs.map(regionName).join(", ")}.`);
  if(R.commitSave>0.005)a.push(`Reservations or savings plans are applied where shown, saving ${gbp(R.commitSave)} a month against pay-as-you-go. Commitments are a financial decision for the client.`);
  if(S.items.some(i=>i.svc==="avd"))a.push("AVD session hosts are priced at the Linux rate, assuming users hold eligible Microsoft 365 or Windows E3/E5 licences.");
  a.push(R.disc>0?`Discount of ${n(R.disc*100)}% applied to list price.`:"No customer discount applied.");if(R.cont>0)a.push(`Contingency of ${n(R.cont*100)}% added.`);
  a.push(`ACR forecast: ${R.term} months from ${monthLabel(0)}, go-live in month ${S.acr.live}, ramp to full over ${S.acr.ramp} month(s).`);
  if(R.proxy)a.push("Lines marked ⚑ use a UK South or Zone 1 rate as a stand-in for a region without loaded prices.");
  if(R.missing)a.push("Lines marked ✕ have no published rate in the loaded price data and are costed at £0.");return a;}
function toMarkdown(){const m=S.meta;let md=`# ${m.title||"Azure estimate"}${m.client?` — ${m.client}`:""}\n\n| | |\n|---|---|\n| Prepared by | ${m.by||"—"} |\n| Status | ${m.status} |\n| Price date | ${fmtDate(SNAP.generated)} |\n| Currency | GBP, excl. VAT |\n\n`;
  md+=`## Summary\n\n| Measure | Amount |\n|---|---:|\n| Monthly run rate | ${gbp(R.monthly)} |\n| Annual | ${gbp(R.monthly*12)} |\n| ${R.term}-month ACR | ${gbp(R.termTotal)} |\n| Standing charges (list, monthly) | ${gbp(R.standing)} |\n| Usage charges (list, monthly) | ${gbp(R.usage)} |\n`;
  if(R.commitSave>0.005)md+=`| Saving from commitments (monthly) | ${gbp(R.commitSave)} |\n`;
  md+=`\n### By section\n\n| Section | Monthly |\n|---|---:|\n`;[...SECTIONS,["other","Other"]].forEach(([sid,label])=>{const t=R.items.filter(x=>itemSection(x.it)===sid).reduce((a,x)=>a+x.res.amt,0);if(t)md+=`| ${label} | ${gbp(t)} |\n`;});md+="\n";
  [...SECTIONS,["other","Other"]].forEach(([sid,label])=>{const its=R.items.filter(x=>itemSection(x.it)===sid);if(!its.length)return;md+=`## ${label}\n\n| Item | Region | Line | Type | Calculation | Monthly |\n|---|---|---|---|---|---:|\n`;
    its.forEach(({it,res})=>res.lines.forEach(l=>{md+=`| ${itemName(it).replace(/\|/g,"/")} | ${regionName(it.region)} | ${l.what}${mark(l)} | ${l.kind==="standing"?"Standing":"Usage"} | \`${l.calc}\` | ${gbp(l.amt)} |\n`;}));md+="\n";});
  md+=`## Assumptions\n\n${assumptions().map(x=>"- "+x).join("\n")}\n\n## Exclusions\n\n- VAT\n- Support plans, marketplace software and licences not listed\n- Partner professional and managed service fees\n- Data volumes beyond those stated\n\n_Indicative estimate based on Microsoft Azure retail list prices in GBP, retrieved ${fmtDate(SNAP.generated)}. Actual charges depend on configuration, usage, agreement type and discounts. Not affiliated with Microsoft._\n`;return md;}
function toCsv(){const q=s=>`"${String(s).replace(/"/g,'""')}"`;let c="Section,Item,Region,Line,Type,Calculation,Monthly GBP (list),Rate source\n";
  R.items.forEach(({it,res})=>res.lines.forEach(l=>{c+=[q(SECTIONS.find(s=>s[0]===itemSection(it))?.[1]||"Other"),q(itemName(it)),q(regionName(it.region)),q(l.what),l.kind==="standing"?"Standing":"Usage",q(l.calc),l.amt.toFixed(6),q([...new Set(l.srcs.map(s=>s.src))].join("+"))].join(",")+"\n";}));
  c+=`,,,,,List total,${R.list.toFixed(6)},\n,,,,,Monthly after discount and contingency,${R.monthly.toFixed(6)},\n,,,,,${R.term}-month ACR,${R.termTotal.toFixed(6)},\n`;return c;}
async function copy(text,msg){try{await navigator.clipboard.writeText(text);toast(msg);}catch(e){$("importBox").value=text;$("pricePanel").open=true;$("importBox").focus();$("importBox").select();toast("Clipboard blocked here. The text is selected in the box under Price data; copy it from there.");}}
$("copyMd").addEventListener("click",()=>copy(toMarkdown(),"Markdown copied"));
$("copyCsv").addEventListener("click",()=>copy(toCsv(),"CSV copied"));
$("copyJson").addEventListener("click",()=>{const o=Object.assign({},S,{ui:undefined});copy(JSON.stringify(o),"Estimate file copied. Paste it under Price data to reopen it.");});
const fname=ext=>`${(S.meta.client||"azure")+"-"+(S.meta.title||"estimate")}`.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+`.${ext}`;
function blobSave(name,data,type){try{const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast(`Downloaded ${name}`);}catch(e){toast("The download didn't start. Use the copy buttons instead.");}}
(async()=>{try{const dl=window.claude&&window.claude.use?await window.claude.use("downloads"):null;$("dlCsv").hidden=false;$("dlMd").hidden=false;
  if(!dl){$("dlCsv").addEventListener("click",()=>blobSave(fname("csv"),toCsv(),"text/csv"));$("dlMd").addEventListener("click",()=>blobSave(fname("md"),toMarkdown(),"text/markdown"));return;}
  const go=async(ext,data)=>{try{await dl.save({filename:fname(ext),data});toast("Saved");}catch(err){if(err&&err.code==="declined")return;if(err&&(err.code==="unavailable"||err.code==="not_granted")){$("dlCsv").hidden=true;$("dlMd").hidden=true;}toast("The file couldn't be saved here. Use the copy buttons instead.");}};
  $("dlCsv").addEventListener("click",()=>go("csv",toCsv()));$("dlMd").addEventListener("click",()=>go("md",toMarkdown()));}catch(e){}})();

let tt;function toast(m){const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("show"),2800);}

full();
if(isExample)toast("Example estimate loaded. Edit any item, or start a new estimate under Price data.");
(async()=>{
  // Live prices published next to the page by the daily pipeline (data/manifest.json → data/prices.json)
  try{const r=await fetch(`data/manifest.json?t=${Date.now()}`,{cache:"no-store"});if(r.ok){const m=await r.json();if(m&&m.prices)MAN=m;}}catch(e){}
  if(MAN){try{const r=await fetch(`data/${MAN.prices}?v=${encodeURIComponent(MAN.generatedAt||MAN.generated)}`);if(r.ok){const obj=await r.json();obj.generatedAt=MAN.generatedAt;applyPrices(obj,true,MAN.seed?"seed":true);}}catch(e){}}
  const saved=await IDB.get("catalog");if(saved&&saved.scopes&&(!MAN||!MAN.catalogue||saved.generated===MAN.generated)){CAT=saved;catIndex=null;full();}
})();
})();
