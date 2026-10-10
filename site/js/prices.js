// SevenThirty: built-in GBP price snapshot (Azure Retail Prices API, 7 Oct 2026). Used only until live data loads.
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

export { SPECS, VM_UKS, VM_UKW, DISK_P, DISK_GIB, SENT_TIERS, BUILTIN, VERIFY };
