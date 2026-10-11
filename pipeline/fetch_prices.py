#!/usr/bin/env python3
"""
SevenThirty pricing builder.

Pulls Microsoft's GBP retail list prices from the Azure Retail Prices API
(https://prices.azure.com/api/retail/prices) and writes one JSON file the
SevenThirty site loads in its "Price data" panel. Native GBP only: prices are
requested with currencyCode='GBP', never converted.

Two modes:

  Rates (default, a few minutes)
      The meters behind SevenThirty's guided calculators: networking,
      security, storage and data, AVD, compute and Kubernetes.
      python fetch_prices.py uksouth ukwest northeurope

  Catalogue (--catalog, every Azure service)
      Every published meter for the chosen regions, plus the Global and
      zone-priced meters, with 1- and 3-year reservation and savings plan
      prices where Microsoft publishes them. Powers the site's
      "Any Azure service" search. Also includes the guided-calculator rates.
      python fetch_prices.py --catalog uksouth ukwest
      python fetch_prices.py --catalog --gzip uksouth ukwest   # smaller file

  Website data (--site-data DIR, what the daily pipeline runs)
      Writes DIR/prices.json (guided-calculator rates for every region listed),
      DIR/catalogue.json (every meter for --catalog-regions), DIR/manifest.json
      (what the site reads first), DIR/changes.json (what moved since last run)
      and DIR/history/prices-YYYY-MM-DD.json. Nothing is replaced unless the new
      data passes validation, so a bad API day never reaches the website.
      python fetch_prices.py --site-data site/data --catalog-regions "uksouth ukwest" uksouth ukwest northeurope westeurope
Standard library only; Python 3.9+.
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://prices.azure.com/api/retail/prices"
API_VERSION = "2023-01-01-preview"  # needed for savings plan prices
PAUSE = 0.15  # seconds between page requests

# Zone-priced services (Front Door, ExpressRoute circuits, DNS, bandwidth between
# continents) use these pseudo-regions. Global holds NAT Gateway, Load Balancer,
# intra-region peering, Private Link, Traffic Manager and more.
SHARED_SCOPES = ["Global", "Zone 1", "Zone 2", "Zone 3", "Zone 4", ""]

# Services fetched in rates mode (catalogue mode fetches everything).
RATE_SERVICES = [
    "Virtual Network", "NAT Gateway", "Load Balancer", "VPN Gateway", "Azure Firewall",
    "Azure Bastion", "Azure DDOS Protection", "Bandwidth", "Virtual WAN", "Application Gateway",
    "ExpressRoute", "Azure Front Door Service", "Azure DNS", "Traffic Manager",
    "Virtual Machines", "Storage", "Azure Kubernetes Service", "SQL Database", "SQL Managed Instance",
    "Log Analytics", "Sentinel", "Microsoft Defender for Cloud", "Key Vault", "Backup",
    # Apps and integration, containers, databases, monitoring and management, analytics and AI
    "Azure App Service", "Functions", "Azure Container Apps", "Container Registry", "API Management",
    "Service Bus", "Event Hubs", "Azure Database for PostgreSQL", "Azure Database for MySQL",
    "Azure Site Recovery", "Azure NetApp Files", "Azure Monitor", "Network Watcher", "Azure Arc",
    "Azure Update Manager", "Azure Data Factory v2", "Microsoft Fabric", "Foundry Models", "Azure Databricks",
]

# App Service plan sizes: (product suffix, [skuName, ...]). Keys are app_<win|lin>_<sku without spaces>.
APP_SIZES = [
    ("Basic", ["B1", "B2", "B3"]),
    ("Standard", ["S1", "S2", "S3"]),
    ("Premium v3", ["P0v3", "P1 v3", "P2 v3", "P3 v3", "P1mv3", "P2mv3", "P3mv3"]),
    ("Premium v4", ["P0v4", "P1v4", "P2v4", "P3v4", "P1mv4", "P2mv4", "P3mv4"]),
    ("Isolated v2", ["I1 v2", "I2 v2", "I3 v2", "I1mv2", "I2mv2", "I3mv2"]),
]
APIM_CLASSIC = ["Developer", "Basic", "Standard", "Premium"]
APIM_V2 = ["Basic v2", "Standard v2", "Premium v2"]
PG_BURST = {"B1ms": "B1MS", "B2s": "B2S", "B2ms": "B2ms", "B4ms": "B4ms", "B8ms": "B8ms"}
MY_BURST = {"B1ms": "B1MS", "B2s": "B2S", "B2ms": "Standard_B2ms2", "B4ms": "Standard_B4ms", "B8ms": "Standard_B8ms"}

# Azure OpenAI pay-as-you-go models: id -> (label, input sku, output sku, cached input sku or None).
# Microsoft names these inconsistently and prices older models per 1K tokens; every rate is stored
# per 1M tokens as aoai_<id>_in / _out / _cin. Models come and go, so a model that disappears is
# not treated as a failed price check (see validate). Add new models here.
AOAI_MODELS = {
    "g55": ("GPT-5.5, Global", "5.5 ShortCo inp Gl", "5.5 ShortCo opt Gl", "5.5 ShortCo cd inp Gl"),
    "g54": ("GPT-5.4, Global", "5.4 inp Gl", "5.4 opt Gl", "5.4 cd inp Gl"),
    "g54m": ("GPT-5.4 mini, Global", "5.4 mini Inp Gl", "5.4 mini Opt Gl", "5.4 mini cd Inp Gl"),
    "g54n": ("GPT-5.4 nano, Global", "5.4 nano Inp Gl", "5.4 nano Opt Gl", "5.4 nano cd Inp Gl"),
    "g5": ("GPT-5, Global", "5 pp inp Gl", "5 pp opt Gl", "5 pp cd inp Gl"),
    "g41": ("GPT-4.1, Global", "gpt 4.1 Inp glbl", "gpt 4.1 Outp glbl", "gpt 4.1 cached Inp glbl"),
    "g41m": ("GPT-4.1 mini, Global", "gpt 4.1 mini Inp glbl", "gpt 4.1 mini Outp glbl", "gpt 4.1 mini cached Inp glbl"),
    "g41mr": ("GPT-4.1 mini, Regional", "gpt 4.1 mini Inp regnl", "gpt 4.1 mini Outp regnl", "gpt 4.1 mini cached Inp regnl"),
    "g4o": ("GPT-4o, Global", "gpt 4o 1120 Inp glbl", "gpt 4o 1120 Outp glbl", "gpt 4o 1120 cached Inp glbl"),
    "g4or": ("GPT-4o, Regional", "gpt 4o 1120 Inp regnl", "gpt 4o 1120 Outp regnl", "gpt 4o 1120 cached Inp regnl"),
    "g4om": ("GPT-4o mini, Global", "gpt-4o-mini-0718-Inp-glbl", "gpt-4o-mini-0718-Outp-glbl", None),
    "e3l": ("text-embedding-3-large, Global", "text-embedding-3-large-glbl", None, None),
    "e3s": ("text-embedding-3-small, Global", "text-embedding-3-small-glbl", None, None),
    "e3sr": ("text-embedding-3-small, Regional", "text-embedding-3-small-regional", None, None),
}
# Keys that may legitimately disappear from one day to the next (retired models).
VOLATILE_PREFIXES = ("aoai_",)
# Rule keys whose reservation and savings plan prices are also kept, as <key>_ri1/_ri3 (term totals) and <key>_sp1/_sp3 (per unit).
COMMIT_PREFIXES = ("app_",)

# VM sizes offered in the guided calculators (VM, AKS, AVD). Add any size here.
VM_SKUS = (
    [f"Standard_B{x}" for x in ("2s", "2ms", "4ms", "8ms")]
    + [f"Standard_D{n}{v}_v5" for n in (2, 4, 8, 16, 32, 48, 64) for v in ("s", "as", "ds")]
    + [f"Standard_E{n}{v}_v5" for n in (2, 4, 8, 16, 32, 64) for v in ("s", "as")]
    + [f"Standard_F{n}s_v2" for n in (2, 4, 8, 16)]
)
DISK_TIERS = ["P4", "P6", "P10", "P15", "P20", "P30", "P40", "P50"]
SENTINEL_TIERS = [50, 100, 200, 300, 400, 500, 1000, 2000, 5000]

VPN_SKUS = ["VpnGw1AZ", "VpnGw2AZ", "VpnGw3AZ", "VpnGw4AZ", "VpnGw5AZ"]
ER_GW_SKUS = ["ErGw1AZ", "ErGw2AZ", "ErGw3AZ"]
ER_BANDWIDTHS = ["50 Mbps", "100 Mbps", "200 Mbps", "500 Mbps", "1 Gbps", "2 Gbps", "5 Gbps", "10 Gbps"]


def _m(service=None, product=None, sku=None, meter=None):
    def pred(i):
        return ((service is None or i.get("serviceName") == service)
                and (product is None or i.get("productName") == product)
                and (sku is None or i.get("skuName") == sku)
                and (meter is None or i.get("meterName") == meter))
    return pred


def _vm(sku, windows):
    def pred(i):
        return (i.get("serviceName") == "Virtual Machines" and i.get("armSkuName") == sku
                and ("Windows" in (i.get("productName") or "")) == windows
                and "Cloud Services" not in (i.get("productName") or "")
                and not any(x in (i.get("skuName") or "") for x in ("Spot", "Low Priority")))
    return pred


def vm_rates(items: list[dict]) -> dict:
    """Linux/Windows pay-as-you-go, 1/3-year reservations and savings plans for VM_SKUS."""
    out: dict = {}
    lic_per_vcpu = []
    for sku in VM_SKUS:
        lin = [i for i in items if i.get("type") == "Consumption" and _vm(sku, False)(i)]
        win = [i for i in items if i.get("type") == "Consumption" and _vm(sku, True)(i)]
        res = [i for i in items if i.get("type") == "Reservation" and i.get("armSkuName") == sku and i.get("serviceName") == "Virtual Machines"]
        p = f"vm_{sku}"
        if lin:
            out[p + "_lin"] = round(float(lin[0]["retailPrice"]), 6)
            for sp in lin[0].get("savingsPlan") or []:
                term = sp.get("term", "")
                key = "_sp1" if term.startswith("1") else "_sp3" if term.startswith("3") else None
                if key:
                    out[p + key] = round(float(sp.get("retailPrice") or sp.get("unitPrice") or 0), 6)
        if win:
            out[p + "_win"] = round(float(win[0]["retailPrice"]), 6)
        for i in res:
            term = i.get("reservationTerm", "")
            out[p + ("_ri1" if term.startswith("1") else "_ri3")] = round(float(i["retailPrice"]), 4)
        if lin and win:
            m = re.search(r"(\d+)", sku.split("_")[1])
            if m and not sku.startswith("Standard_B"):
                lic_per_vcpu.append((out[p + "_win"] - out[p + "_lin"]) / int(m.group(1)))
    if lic_per_vcpu:
        out["win_vcpu"] = round(sorted(lic_per_vcpu)[len(lic_per_vcpu) // 2], 7)
    return out


def meter_rules():
    """(key, predicate, tiered) triples. Keys match RATE_INFO in seventhirty.html.
    tiered=True keeps every tier as [[tierMinimumUnits, price], ...]."""
    r = [
        ("pip_h", _m("Virtual Network", "IP Addresses", "Standard", "Standard IPv4 Static Public IP"), False),
        ("peer_global", _m("Virtual Network", "Global Virtual Network Peering", meter="Inter-Region Egress"), False),
        ("peer_intra", _m("Virtual Network", "Virtual Network Peering", meter="Intra-Region Egress"), False),
        ("pe_h", _m(product="Virtual Network Private Link", sku="Standard", meter="Standard Private Endpoint"), False),
        ("pe_in", _m(product="Virtual Network Private Link", sku="Standard", meter="Standard Data Processed - Ingress"), True),
        ("pe_out", _m(product="Virtual Network Private Link", sku="Standard", meter="Standard Data Processed - Egress"), True),
        ("nat_h", _m("NAT Gateway", sku="Standard", meter="Standard Gateway"), False),
        ("nat_gb", _m("NAT Gateway", sku="Standard", meter="Standard Data Processed"), False),
        ("lb_h", _m("Load Balancer", sku="Standard", meter="Standard Included LB Rules and Outbound Rules"), False),
        ("lb_rule", _m("Load Balancer", sku="Standard", meter="Standard Overage LB Rules and Outbound Rules"), False),
        ("lb_gb", _m("Load Balancer", sku="Standard", meter="Standard Data Processed"), False),
        ("vpn_s2s", _m("VPN Gateway", sku="VpnGw1AZ", meter="S2S Connection"), False),
        ("vpn_p2s", _m("VPN Gateway", sku="VpnGw1AZ", meter="P2S Connection"), False),
        ("ddos_plan", _m("Azure DDOS Protection", sku="Network Protection", meter="Network Protection Plan"), False),
        ("ddos_res", _m("Azure DDOS Protection", sku="Network Protection", meter="Network Protection Resource"), False),
        ("ddos_ip", _m("Azure DDOS Protection", meter="IP Protection Resource"), False),
        ("egress", _m("Bandwidth", "Rtn Preference: MGN", meter="Standard Data Transfer Out"), True),
        # Virtual WAN
        ("vwan_hub", _m("Virtual WAN", sku="Standard Hub", meter="Standard Hub Unit"), False),
        ("vwan_dp", _m("Virtual WAN", sku="Standard Hub", meter="Standard Hub Data Processed"), False),
        ("vwan_s2s_su", _m("Virtual WAN", meter="VPN S2S Scale Unit"), False),
        ("vwan_s2s_cu", _m("Virtual WAN", meter="VPN S2S Connection Unit"), False),
        ("vwan_p2s_su", _m("Virtual WAN", meter="VPN P2S Scale Unit"), False),
        ("vwan_p2s_cu", _m("Virtual WAN", meter="VPN P2S Connection Unit"), False),
        ("vwan_er_su", _m("Virtual WAN", meter="ExpressRoute Scale Unit"), False),
        ("vwan_er_cu", _m("Virtual WAN", meter="ExpressRoute Connection Unit"), False),
        ("vwan_rin", _m("Virtual WAN", meter="Routing Infrastructure Unit"), False),
        # Application Gateway v2
        ("agw_Basic_fixed", _m("Application Gateway", "Application Gateway Basic v2", meter="Basic Fixed Cost"), False),
        ("agw_Basic_cu", _m("Application Gateway", "Application Gateway Basic v2", meter="Basic Capacity Units"), False),
        ("agw_Standard_fixed", _m("Application Gateway", "Application Gateway Standard v2", meter="Standard Fixed Cost"), False),
        ("agw_Standard_cu", _m("Application Gateway", "Application Gateway Standard v2", meter="Standard Capacity Units"), False),
        ("agw_WAF_fixed", _m("Application Gateway", "Application Gateway WAF v2", meter="Standard Fixed Cost"), False),
        ("agw_WAF_cu", _m("Application Gateway", "Application Gateway WAF v2", meter="Standard Capacity Units"), False),
        # ExpressRoute
        ("er_ErGwScale", _m("ExpressRoute", "ExpressRoute Gateway", "ErGwScale", "ErGwScale Unit"), False),
        ("er_out", _m("ExpressRoute", "ExpressRoute", "1 Gbps Metered Data", "Metered Data - Data Transfer Out"), False),
        # Front Door Standard/Premium
        ("afd_Standard_base", _m(product="Azure Front Door", sku="Standard", meter="Standard Base Fees"), False),
        ("afd_Premium_base", _m(product="Azure Front Door", sku="Premium", meter="Premium Base Fees"), False),
        ("afd_Standard_req", _m(product="Azure Front Door", sku="Standard", meter="Standard Requests"), True),
        ("afd_Premium_req", _m(product="Azure Front Door", sku="Premium", meter="Premium Requests"), True),
        ("afd_out", _m(product="Azure Front Door", sku="Standard", meter="Standard Data Transfer Out"), True),
        ("afd_origin", _m(product="Azure Front Door", sku="Standard", meter="Standard Data Transfer In"), False),
        # DNS
        ("dns_pub_zone", _m("Azure DNS", sku="Public", meter="Public Zone"), True),
        ("dns_priv_zone", _m("Azure DNS", sku="Private", meter="Private Zone"), True),
        ("dns_pub_q", _m("Azure DNS", sku="Public", meter="Public Queries"), True),
        ("dns_priv_q", _m("Azure DNS", sku="Private", meter="Private Queries"), True),
        ("dns_res_in", _m("Azure DNS", sku="Private Resolver", meter="Private Resolver Inbound Endpoint"), False),
        ("dns_res_out", _m("Azure DNS", sku="Private Resolver", meter="Private Resolver Outbound Endpoint"), False),
        ("dns_ruleset", _m("Azure DNS", sku="Private Resolver", meter="Private Resolver DNS Forwarding Ruleset"), False),
        # Traffic Manager
        ("tm_q", _m("Traffic Manager", sku="Azure Endpoint", meter="DNS Queries"), True),
        ("tm_az_hc", _m("Traffic Manager", sku="Azure Endpoint", meter="Azure Endpoint Health Checks"), False),
        ("tm_ext_hc", _m("Traffic Manager", sku="Non-Azure Endpoint", meter="Non-Azure Endpoint Health Checks"), False),
    ]
    r += [(f"vpn_{s}", _m("VPN Gateway", sku=s, meter=s), False) for s in VPN_SKUS]
    # Storage, data, security, Kubernetes
    for d in DISK_TIERS:
        for red in ("LRS", "ZRS"):
            r.append((f"disk_{d}_{red}", _m("Storage", "Premium SSD Managed Disks", f"{d} {red}", f"{d} {red} Disk"), False))
    r += [(f"disk_E{e}_LRS", _m("Storage", "Standard SSD Managed Disks", f"E{e} LRS", f"E{e} LRS Disk"), False) for e in (4, 6, 10, 15, 20, 30, 40, 50)]
    for tier in ("Hot", "Cool", "Cold", "Archive"):
        for red in ("LRS", "ZRS", "GRS"):
            r.append((f"blob_{tier}_{red}", _m("Storage", "General Block Blob v2", f"{tier} {red}", f"{tier} {red} Data Stored"), True))
            r.append((f"blobw_{tier}_{red}", _m("Storage", "General Block Blob v2", f"{tier} {red}", f"{tier} {red} Write Operations"), False))
        # Hot/Cool/Archive name the read meter "<tier> Read Operations"; Cold names it "Cold LRS Read Operations".
        r.append((f"blobr_{tier}", lambda i, t=tier: i.get("serviceName") == "Storage" and i.get("productName") == "General Block Blob v2"
                  and i.get("skuName") == f"{t} LRS" and i.get("meterName") in (f"{t} Read Operations", f"{t} LRS Read Operations"), False))
    r += [(f"files_prem_{red}", _m("Storage", "Premium Files", f"Premium {red}", f"Premium {red} Provisioned"), False) for red in ("LRS", "ZRS")]
    r += [
        ("aks_std", _m("Azure Kubernetes Service", "Azure Kubernetes Service", "Standard", "Standard Uptime SLA"), False),
        ("aks_lts", _m("Azure Kubernetes Service", "Azure Kubernetes Service", "Standard", "Standard Long Term Support"), False),
        ("sql_gp", _m("SQL Database", "SQL Database Single/Elastic Pool General Purpose - Compute Gen5", "vCore", "vCore"), False),
        ("sql_bc", _m("SQL Database", "SQL Database Single/Elastic Pool Business Critical - Compute Gen5", "vCore", "vCore"), False),
        ("sql_lic_gp", _m("SQL Database", "SQL Database Single/Elastic Pool General Purpose - SQL License", "vCore", "vCore"), False),
        ("sql_lic_bc", _m("SQL Database", "SQL Database Single/Elastic Pool Business Critical - SQL License", "vCore", "vCore"), False),
        ("mi_gp", _m("SQL Managed Instance", "SQL Managed Instance General Purpose - Compute Gen5", "vCore", "vCore"), False),
        ("mi_bc", _m("SQL Managed Instance", "SQL Managed Instance Business Critical - Compute Gen5", "vCore", "vCore"), False),
        ("la_ingest", _m("Log Analytics", "Log Analytics", "Analytics Logs", "Analytics Logs Data Ingestion"), True),
        ("la_ret", _m("Log Analytics", "Log Analytics", "Analytics Logs", "Analytics Logs Data Retention"), False),
        ("sent_payg", _m("Sentinel", "Sentinel", "Pay-as-you-go", "Pay-as-you-go Analysis"), False),
        ("def_p1", _m("Microsoft Defender for Cloud", "Microsoft Defender for Servers", "Standard P1", "Standard P1 Node"), False),
        ("def_p2", _m("Microsoft Defender for Cloud", "Microsoft Defender for Servers", "Standard P2", "Standard P2 Node"), False),
        ("def_sql", _m("Microsoft Defender for Cloud", "Microsoft Defender for SQL", "Standard", "Standard Instance"), False),
        ("def_stor", _m("Microsoft Defender for Cloud", "Microsoft Defender for Storage", "Standard", "Standard Node"), False),
        ("def_kv", _m("Microsoft Defender for Cloud", "Microsoft Defender for Key Vault", "Per node Std", "Per node Std Node"), False),
        ("def_app", _m("Microsoft Defender for Cloud", "Microsoft Defender for App Service", "Standard", "Standard Node"), False),
        ("def_cont", _m("Microsoft Defender for Cloud", "Microsoft Defender for Containers", "Standard vCore", "Standard vCore vCore Pack"), False),
        ("def_arm", _m("Microsoft Defender for Cloud", "Microsoft Defender for Resource Manager", "Per node Std", "Per node Std Node"), False),
        ("kv_ops", _m("Key Vault", "Key Vault", "Standard", "Operations"), False),
        ("kv_hsm_key", _m("Key Vault", "Key Vault", "Premium", "Premium HSM-protected RSA 2048-bit key"), False),
        ("kv_cert", _m("Key Vault", "Key Vault", "Standard", "Certificate Renewal Request"), False),
        ("bk_inst", _m("Backup", "Backup", "Azure VM", "Azure VM Protected Instance"), False),
    ]
    r += [(f"bk_{red}", _m("Backup", "Backup", "Standard", f"Standard {red} Data Stored"), False) for red in ("LRS", "ZRS", "GRS")]
    r += [(f"sent_{t}", _m("Sentinel", "Sentinel", f"{t} GB Commitment Tier", f"{t} GB Commitment Tier Capacity Reservation"), False) for t in SENTINEL_TIERS]
    r += [(f"er_{s}", _m("ExpressRoute", "ExpressRoute Gateway", s, f"{s} Gateway"), False) for s in ER_GW_SKUS]
    for bw in ER_BANDWIDTHS:
        k = bw.replace(" ", "")
        r += [
            (f"er_std_metered_{k}", _m("ExpressRoute", "ExpressRoute", f"{bw} Metered Data", f"Standard Metered Data {bw} Circuit"), False),
            (f"er_prem_metered_{k}", _m("ExpressRoute", "ExpressRoute", f"{bw} Metered Data", f"Premium Metered Data {bw} Circuit"), False),
            (f"er_std_unl_{k}", _m("ExpressRoute", "ExpressRoute", f"{bw} Unlimited Data", f"Standard Unlimited Data {bw} Circuit"), False),
            (f"er_prem_unl_{k}", _m("ExpressRoute", "ExpressRoute", f"{bw} Unlimited Data", f"Premium Unlimited Data {bw} Circuit"), False),
        ]
    for s in ("Basic", "Standard", "Premium"):
        r += [
            (f"fw_{s}_h", _m("Azure Firewall", sku=s, meter=f"{s} Deployment"), False),
            (f"fw_{s}_gb", _m("Azure Firewall", sku=s, meter=f"{s} Data Processed"), False),
            (f"fw_{s}_cu", _m("Azure Firewall", sku=s, meter=f"{s} Capacity Unit"), False),
            (f"bas_{s}", _m("Azure Bastion", sku=s, meter=f"{s} Gateway"), False),
        ]
    r += [(f"bas_{s}_add", _m("Azure Bastion", sku=s, meter=f"{s} Additional Gateway"), False) for s in ("Standard", "Premium")]
    r += app_rules()
    return r


def app_rules():
    """Apps and integration, containers, databases, monitoring and management, analytics and AI."""
    r = []
    # App Service plans, Windows and Linux
    for tier, skus in APP_SIZES:
        for sku in skus:
            k = sku.replace(" ", "")
            r.append((f"app_win_{k}", _m("Azure App Service", f"Azure App Service {tier} Plan", sku), False))
            r.append((f"app_lin_{k}", _m("Azure App Service", f"Azure App Service {tier} Plan - Linux", sku), False))
    r += [
        # Functions
        ("fn_flex_gbs", _m("Functions", "Flex Consumption", "On Demand", "On Demand Execution Time"), True),
        ("fn_flex_exec", _m("Functions", "Flex Consumption", "On Demand", "On Demand Total Executions"), True),
        ("fn_flex_ar_base", _m("Functions", "Flex Consumption", "Always Ready", "Always Ready Baseline"), False),
        ("fn_flex_ar_gbs", _m("Functions", "Flex Consumption", "Always Ready", "Always Ready Execution Time"), False),
        ("fn_prem_vcpu", _m("Functions", "Premium Functions", "Premium", "Premium vCPU Duration"), False),
        ("fn_prem_mem", _m("Functions", "Premium Functions", "Premium", "Premium Memory Duration"), False),
        # Container Apps
        ("aca_vcpu_active", _m("Azure Container Apps", "Azure Container Apps", "Standard", "Standard vCPU Active Usage"), False),
        ("aca_vcpu_idle", _m("Azure Container Apps", "Azure Container Apps", "Standard", "Standard vCPU Idle Usage"), False),
        ("aca_mem_active", _m("Azure Container Apps", "Azure Container Apps", "Standard", "Standard Memory Active Usage"), False),
        ("aca_mem_idle", _m("Azure Container Apps", "Azure Container Apps", "Standard", "Standard Memory Idle Usage"), False),
        ("aca_req", _m("Azure Container Apps", "Azure Container Apps", "Standard", "Standard Requests"), False),
        ("aca_ded_mgmt", _m("Azure Container Apps", "Azure Container Apps", "Dedicated", "Dedicated Plan Management"), False),
        ("aca_ded_vcpu", _m("Azure Container Apps", "Azure Container Apps", "Dedicated", "Dedicated vCPU Usage"), False),
        ("aca_ded_mem", _m("Azure Container Apps", "Azure Container Apps", "Dedicated", "Dedicated Memory Usage"), False),
        # Container Registry
        ("acr_Basic", _m("Container Registry", "Container Registry", "Basic", "Basic Registry Unit"), False),
        ("acr_Standard", _m("Container Registry", "Container Registry", "Standard", "Standard Registry Unit"), False),
        ("acr_Premium", _m("Container Registry", "Container Registry", "Premium", "Premium Registry Unit"), False),
        ("acr_repl", _m("Container Registry", "Container Registry", "Premium", "Premium Registry Replication Unit"), False),
        ("acr_gb", _m("Container Registry", "Container Registry", "Standard", "Data Stored"), False),
        # Service Bus. Standard's base charge is listed as two rows (hourly and monthly); "max" keeps the monthly one.
        ("sb_basic_ops", _m("Service Bus", sku="Basic", meter="Basic Messaging Operations"), False),
        ("sb_std_base", _m("Service Bus", sku="Standard", meter="Standard Base Unit"), "max"),
        ("sb_std_ops", _m("Service Bus", sku="Standard", meter="Standard Messaging Operations"), True),
        ("sb_std_conn", _m("Service Bus", sku="Standard", meter="Standard Brokered Connection"), True),
        ("sb_prem_mu", _m("Service Bus", sku="Premium", meter="Premium Messaging Unit"), False),
        # Event Hubs
        ("eh_Basic_tu", _m("Event Hubs", sku="Basic", meter="Basic Throughput Unit"), False),
        ("eh_Basic_ingress", _m("Event Hubs", sku="Basic", meter="Basic Ingress Events"), False),
        ("eh_Standard_tu", _m("Event Hubs", sku="Standard", meter="Standard Throughput Unit"), False),
        ("eh_Standard_ingress", _m("Event Hubs", sku="Standard", meter="Standard Ingress Events"), False),
        ("eh_capture", _m("Event Hubs", sku="Standard", meter="Standard Capture"), False),
        ("eh_Premium_pu", _m("Event Hubs", sku="Premium", meter="Premium Processing Unit"), False),
        ("eh_ret", _m("Event Hubs", sku="Premium", meter="Premium Extended Retention"), False),
        ("eh_Dedicated_cu", _m("Event Hubs", sku="Dedicated", meter="Dedicated Capacity Unit"), False),
        # PostgreSQL and MySQL flexible server: per-vCore rates for the v5 series, burstable sizes per server
        ("pg_gp", _m("Azure Database for PostgreSQL", "Azure Database for PostgreSQL Flexible Server General Purpose Ddsv5 Series Compute", "1 vCore"), False),
        ("pg_mo", _m("Azure Database for PostgreSQL", "Azure Database for PostgreSQL Flexible Server Memory Optimized Edsv5 Series Compute", "1 vCore"), False),
        ("pg_storage", _m("Azure Database for PostgreSQL", "Azure Database for PostgreSQL Flex Server Storage", "Storage", "Storage Data Stored"), False),
        ("pg_backup", _m("Azure Database for PostgreSQL", "Azure Database for PostgreSQL Flexible Server Backup Storage", "Backup Storage LRS", "Backup Storage LRS Data Stored"), False),
        ("my_gp", _m("Azure Database for MySQL", "Azure Database for MySQL Flexible Server General Purpose Ddsv5 Series Compute", "1 vCore"), False),
        # MySQL lists Memory Optimized v5 by size only; the 2-vCore size gives the per-vCore rate (the calculator halves it).
        ("my_mo_2", _m("Azure Database for MySQL", "Azure Database for MySQL Flexible Server Memory Optimized Edsv5 Series Compute", "Standard_E2d_v5"), False),
        ("my_storage", _m("Azure Database for MySQL", "Azure Database for MySQL Flexible Server Storage", "Storage", "Storage Data Stored"), False),
        ("my_backup", _m("Azure Database for MySQL", "Azure Database for MySQL Flexible Server Backup Storage", "Backup Storage LRS", "Backup Storage LRS Data Stored"), False),
        # Site Recovery
        ("asr_vm", _m("Azure Site Recovery", sku="Azure", meter="VM Replicated to Azure"), False),
        # Azure NetApp Files (per GiB per hour)
        ("anf_Standard", _m("Azure NetApp Files", "Azure NetApp Files", "Standard", "Standard Capacity"), False),
        ("anf_Premium", _m("Azure NetApp Files", "Azure NetApp Files", "Premium", "Premium Capacity"), False),
        ("anf_Ultra", _m("Azure NetApp Files", "Azure NetApp Files", "Ultra", "Ultra Capacity"), False),
        ("anf_backup", _m("Azure NetApp Files", "Azure NetApp Files", "Backup", "Backup Capacity"), False),
        # Azure Monitor and Network Watcher
        ("mon_alert_metric", _m("Azure Monitor", sku="Alerts", meter="Alerts Metric Monitored"), True),
        *[(f"mon_alert_log_{m}", _m("Azure Monitor", sku="Alerts", meter=f"Alerts System Log Monitored at {m} Minute Frequency"), False) for m in (1, 5, 10, 15)],
        ("mon_webtest", _m("Azure Monitor", sku="Standard Web Test", meter="Standard Web Test Execution"), False),
        ("mon_basic_logs", _m("Azure Monitor", sku="Basic Logs", meter="Basic Logs Data Ingestion"), False),
        ("nw_flow", _m("Network Watcher", sku="Standard", meter="Standard VNet Flow Logs Collected"), True),
        ("nw_ta", _m("Network Watcher", sku="Standard", meter="Standard Traffic Analytics Processing"), False),
        ("nw_cm", _m("Network Watcher", sku="Standard", meter="Standard Connection Monitor Test"), True),
        # Azure Arc and Update Manager
        ("upd_server", _m("Azure Update Manager", sku="Basic", meter="Basic Server"), False),
        ("arc_guestcfg", _m("Azure Arc", sku="Server", meter="Guest Configuration Policy/Server"), False),
        ("esu_std_1c", _m("Azure Arc", sku="WS2012 Std 1C", meter="WS2012 Std 1C ESU"), False),
        ("esu_dc_1c", _m("Azure Arc", sku="WS2012 DC 1C", meter="WS2012 DC 1C ESU"), False),
        # Data Factory
        ("adf_orch_cloud", _m("Azure Data Factory v2", "Azure Data Factory v2", "Cloud", "Cloud Orchestration Activity Run"), False),
        ("adf_orch_sh", _m("Azure Data Factory v2", "Azure Data Factory v2", "Self Hosted", "Self Hosted Orchestration Activity Run"), False),
        ("adf_move_cloud", _m("Azure Data Factory v2", "Azure Data Factory v2", "Cloud", "Cloud Data Movement"), False),
        ("adf_move_sh", _m("Azure Data Factory v2", "Azure Data Factory v2", "Self Hosted", "Self Hosted Data Movement"), False),
        ("adf_act_cloud", _m("Azure Data Factory v2", "Azure Data Factory v2", "Cloud", "Cloud Pipeline Activity"), False),
        ("adf_act_sh", _m("Azure Data Factory v2", "Azure Data Factory v2", "Self Hosted", "Self Hosted Pipeline Activity"), False),
        ("adf_df_gp", _m("Azure Data Factory v2", "Azure Data Factory v2 Data Flow - General Purpose", "vCore", "vCore"), False),
        # Microsoft Fabric: one capacity unit hour, and OneLake storage
        ("fabric_cu", _m("Microsoft Fabric", "Fabric Capacity", "Compute Pool Capacity Usage", "Compute Pool Capacity Usage CU"), False),
        ("onelake_hot", _m("Microsoft Fabric", "OneLake", "OneLake Storage Hot", "OneLake Storage Hot Data Stored"), False),
        # Azure Databricks, Premium tier, per DBU hour
        ("dbx_jobs", _m("Azure Databricks", "Azure Databricks", "Premium Jobs Compute", "Premium Jobs Compute DBU"), False),
        ("dbx_allpurpose", _m("Azure Databricks", "Azure Databricks", "Premium All-purpose Compute", "Premium All-purpose Compute DBU"), False),
        ("dbx_sqlpro", _m("Azure Databricks", "Azure Databricks Regional", "Premium SQL Compute Pro", "Premium SQL Compute Pro DBU"), False),
        ("dbx_sqlsl", _m("Azure Databricks", "Azure Databricks Regional", "Premium Serverless SQL", "Premium Serverless SQL DBU"), False),
        ("dbx_jobssl", _m("Azure Databricks", "Azure Databricks Regional", "Premium Automated Serverless Compute", "Premium Automated Serverless Compute DBU"), False),
        ("dbx_intsl", _m("Azure Databricks", "Azure Databricks Regional", "Premium Interactive Serverless Compute", "Premium Interactive Serverless Compute DBU"), False),
    ]
    # API Management
    r += [(f"apim_{t.replace(' ', '')}", _m("API Management", sku=t, meter=f"{t} Unit"), False) for t in APIM_CLASSIC + APIM_V2]
    r += [(f"apim_{t.replace(' ', '')}_calls", _m("API Management", sku=t, meter=f"{t} Calls"), True) for t in ("Consumption", "Basic v2", "Standard v2")]
    r += [(f"apim_{t.replace(' ', '')}_extra", _m("API Management", sku=t, meter=f"{t} Secondary Unit"), False) for t in APIM_V2]
    r += [("apim_Premium_extra", _m("API Management", sku="Secondary", meter="Secondary Unit"), False)]
    # PostgreSQL and MySQL burstable sizes
    r += [(f"pg_{k}", _m("Azure Database for PostgreSQL", "Azure Database for PostgreSQL Flexible Server Burstable BS Series Compute", s), False) for k, s in PG_BURST.items()]
    r += [(f"my_{k}", _m("Azure Database for MySQL", "Azure Database for MySQL Flexible Server Burstable BS Series Compute", s), False) for k, s in MY_BURST.items()]
    # Azure Files Standard, pay-as-you-go v2 (Hot and Cool)
    for tier in ("Hot", "Cool"):
        for red in ("LRS", "ZRS", "GRS"):
            r.append((f"fstd_{tier}_{red}", _m("Storage", "Files v2", f"{tier} {red}", f"{tier} {red} Data Stored"), False))
            r.append((f"fstdw_{tier}_{red}", _m("Storage", "Files v2", f"{tier} {red}", f"{tier} {red} Write Operations"), False))
        r.append((f"fstdr_{tier}", _m("Storage", "Files v2", f"{tier} LRS", f"{tier} Read Operations"), False))
    # Azure OpenAI provisioned throughput units
    for k, sku in (("global", "Provisioned Managed Global"), ("dz", "Provisioned Managed Data Zone"), ("regional", "Provisioned Managed Regional")):
        r.append((f"aoai_ptu_{k}", lambda i, s=sku: i.get("serviceName") == "Foundry Models" and str(i.get("productName", "")).startswith("Azure OpenAI")
                  and i.get("skuName") == s and i.get("meterName") == f"{s} Unit", False))
    return r


def aoai_rates(items: list[dict]) -> dict:
    """Azure OpenAI pay-as-you-go token prices for AOAI_MODELS, normalised to per 1M tokens."""
    out: dict = {}
    rows = {}
    for i in items:
        if i.get("type") != "Consumption" or i.get("serviceName") != "Foundry Models" or not str(i.get("productName", "")).startswith("Azure OpenAI"):
            continue
        rows.setdefault(str(i.get("skuName", "")).lower(), i)
    def per_m(sku):
        i = rows.get(sku.lower()) if sku else None
        if not i:
            return None
        unit = str(i.get("unitOfMeasure", "")).upper().replace(" ", "")
        mult = 1000 if unit == "1K" else 1_000_000 if unit in ("1", "") else 1
        return round(float(i["retailPrice"]) * mult, 6)
    for mid, (_, sin, sout, scin) in AOAI_MODELS.items():
        p_in = per_m(sin)
        if p_in is None:
            continue
        out[f"aoai_{mid}_in"] = p_in
        p_out, p_cin = per_m(sout), per_m(scin)
        if p_out is not None:
            out[f"aoai_{mid}_out"] = p_out
        if p_cin is not None:
            out[f"aoai_{mid}_cin"] = p_cin
    return out


# ---------------------------------------------------------------- API access

def fetch_all(odata_filter: str, label: str = "") -> list[dict]:
    params = {"currencyCode": "'GBP'", "api-version": API_VERSION, "$filter": odata_filter}
    url = API + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    items: list[dict] = []
    pages = 0
    while url:
        time.sleep(PAUSE)  # be polite to a free public API
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=90) as r:
                    data = json.load(r)
                break
            except Exception as e:  # network blips and 429s
                if attempt == 4:
                    raise
                wait = 2 ** attempt * 2
                retry_after = getattr(e, "headers", None) and e.headers.get("Retry-After")
                if retry_after and str(retry_after).isdigit():
                    wait = max(wait, int(retry_after))
                print(f"  retrying in {wait}s ({e})", file=sys.stderr)
                time.sleep(wait)
        items.extend(data.get("Items", []))
        url = data.get("NextPageLink")
        pages += 1
        if label and pages % 10 == 0:
            print(f"  {label}: {len(items):,} meters so far", file=sys.stderr)
    return items


def fetch_scope(scope: str, catalog: bool) -> list[dict]:
    q = f"armRegionName eq '{scope}'"
    if catalog:
        return fetch_all(q, scope or "(no region)")
    out = []
    for svc in RATE_SERVICES:
        out += fetch_all(f"{q} and serviceName eq '{svc}'")
    return out


# ---------------------------------------------------------------- rates

def build_rates(items: list[dict]) -> dict:
    # Keep non-primary rows here: Microsoft marks a region's copy of a shared meter (public IPs,
    # VPN Gateway, DNS…) as non-primary, but it is still that region's price. Within one region
    # there is only one row per meter, so nothing is double counted.
    cons = [i for i in items if i.get("type") == "Consumption"]
    out: dict = {}
    for key, pred, tiered in meter_rules():
        hits = [i for i in cons if pred(i)]
        if not hits:
            continue
        tiers = sorted({(float(i.get("tierMinimumUnits") or 0), float(i["retailPrice"])) for i in hits})
        if tiered == "max":
            out[key] = round(max(p for _, p in tiers), 6)
        elif tiered:
            collapsed = []
            for lo, p in tiers:
                if collapsed and collapsed[-1][1] == p:
                    continue
                collapsed.append([lo, round(p, 6)])
            out[key] = collapsed if len(collapsed) > 1 else collapsed[0][1]
        else:
            out[key] = round(tiers[0][1], 6)
        if key.startswith(COMMIT_PREFIXES):
            out.update(commit_rates(key, hits, items))
    # Reservations for SQL Database and Managed Instance compute (price per vCore for the term)
    for key, prod in (("sql_gp", "SQL Database Single/Elastic Pool General Purpose - Compute Gen5"), ("sql_bc", "SQL Database Single/Elastic Pool Business Critical - Compute Gen5"),
                      ("mi_gp", "SQL Managed Instance General Purpose - Compute Gen5"), ("mi_bc", "SQL Managed Instance Business Critical - Compute Gen5")):
        for i in items:
            if i.get("type") == "Reservation" and i.get("productName") == prod and i.get("skuName") == "vCore":
                term = i.get("reservationTerm", "")
                out[key + ("_ri1" if term.startswith("1") else "_ri3")] = round(float(i["retailPrice"]), 4)
    out.update(vm_rates(items))
    out.update(aoai_rates(items))
    return out


def commit_rates(key: str, hits: list[dict], items: list[dict]) -> dict:
    """Savings plan (per unit) and reservation (term total) prices for the meter a rule matched."""
    out: dict = {}
    first = hits[0]
    for sp in first.get("savingsPlan") or []:
        term = sp.get("term", "")
        price = float(sp.get("retailPrice") or sp.get("unitPrice") or 0)
        if price and term[:1] in ("1", "3"):
            out[f"{key}_sp{term[0]}"] = round(price, 6)
    same = ("serviceName", "productName", "skuName")
    for i in items:
        if i.get("type") == "Reservation" and all(i.get(f) == first.get(f) for f in same):
            term = i.get("reservationTerm", "")
            if term[:1] in ("1", "3"):
                out[f"{key}_ri{term[0]}"] = round(float(i["retailPrice"]), 4)
    return out


# ---------------------------------------------------------------- catalogue

class Strings:
    def __init__(self):
        self.list: list[str] = []
        self.index: dict[str, int] = {}

    def id(self, s: str) -> int:
        s = s or ""
        if s not in self.index:
            self.index[s] = len(self.list)
            self.list.append(s)
        return self.index[s]


def build_catalog_rows(items: list[dict], strings: Strings) -> list[list]:
    """Row: [service, product, sku, meter, unit, payg, tiers|0, ri1|0, ri3|0, sp1|0, sp3|0, family]
    payg and sp are per unit of measure; ri1/ri3 are the total price for the term."""
    groups: dict[tuple, dict] = {}
    for i in items:
        if not i.get("isPrimaryMeterRegion", True):
            continue
        t = i.get("type")
        if t not in ("Consumption", "Reservation"):
            continue  # DevTestConsumption is left out
        key = (i.get("serviceName"), i.get("productName"), i.get("skuName"), i.get("meterName"))
        g = groups.setdefault(key, {"tiers": set(), "unit": i.get("unitOfMeasure"), "ri1": 0, "ri3": 0,
                                    "sp1": 0, "sp3": 0, "family": i.get("serviceFamily") or ""})
        if t == "Consumption":
            g["tiers"].add((float(i.get("tierMinimumUnits") or 0), float(i["retailPrice"])))
            g["unit"] = i.get("unitOfMeasure")
            for sp in i.get("savingsPlan") or []:
                term = sp.get("term", "")
                price = float(sp.get("retailPrice") or sp.get("unitPrice") or 0)
                if term.startswith("1"):
                    g["sp1"] = price
                elif term.startswith("3"):
                    g["sp3"] = price
        else:
            term = i.get("reservationTerm", "")
            if term.startswith("1"):
                g["ri1"] = float(i["retailPrice"])
            elif term.startswith("3"):
                g["ri3"] = float(i["retailPrice"])
    rows = []
    for (svc, prod, sku, meter), g in groups.items():
        if not g["tiers"]:
            continue  # reservation-only rows have no pay-as-you-go meter to anchor them
        tiers = sorted(g["tiers"])
        payg = tiers[0][1]
        rows.append([
            strings.id(svc), strings.id(prod), strings.id(sku), strings.id(meter), strings.id(g["unit"]),
            round(payg, 6),
            [[lo, round(p, 6)] for lo, p in tiers] if len(tiers) > 1 else 0,
            round(g["ri1"], 4) or 0, round(g["ri3"], 4) or 0,
            round(g["sp1"], 6) or 0, round(g["sp3"], 6) or 0,
            strings.id(g["family"]),
        ])
    return rows


# ---------------------------------------------------------------- validation

def validate(new: dict, previous: dict | None, threshold: float) -> list[str]:
    problems = []
    if not previous:
        return problems
    for region, rates in previous.get("regions", {}).items():
        cur = new["regions"].get(region)
        if cur is None:
            continue
        for k, old in rates.items():
            if not isinstance(old, (int, float)):
                continue
            if k not in cur:
                if not k.startswith(VOLATILE_PREFIXES):
                    problems.append(f"{region}.{k}: meter disappeared")
            elif isinstance(cur[k], (int, float)) and old and abs(cur[k] - old) / old > threshold:
                problems.append(f"{region}.{k}: {old} -> {cur[k]} ({(cur[k]-old)/old:+.0%})")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("regions", nargs="*", default=["uksouth", "ukwest"], help="armRegionName values, e.g. uksouth northeurope")
    ap.add_argument("--catalog", action="store_true", help="include every Azure meter (large; powers 'Any Azure service')")
    ap.add_argument("--gzip", action="store_true", help="write .json.gz (the site reads both)")
    ap.add_argument("--out", default=None, help="output file name")
    ap.add_argument("--previous", default=None, help="previous output to diff against")
    ap.add_argument("--max-change", type=float, default=0.25, help="fail if a guided-calculator price moves more than this fraction")
    ap.add_argument("--site-data", default=None, help="write website data files into this folder (daily pipeline mode)")
    ap.add_argument("--catalog-regions", default="uksouth ukwest", help="with --site-data: regions to include in the full catalogue ('' for none)")
    ap.add_argument("--force", action="store_true", help="with --site-data: publish even if validation flags large price moves")
    args = ap.parse_args()
    if args.site_data:
        return site_data(args)

    today = dt.date.today().isoformat()
    out = {
        "schema": "seventhirty-prices-1",
        "generated": today,
        "currency": "GBP",
        "source": "Azure Retail Prices API (prices.azure.com), GBP retail list prices",
        "regions": {},
    }
    strings = Strings()
    catalog: dict[str, list] = {}

    for scope in [*SHARED_SCOPES, *args.regions]:
        label = scope or "(no region)"
        print(f"Fetching {label}…", file=sys.stderr)
        items = fetch_scope(scope, args.catalog)
        key = "global" if scope == "Global" else scope
        rates = build_rates(items)
        if rates:
            out["regions"][key] = rates
        if args.catalog and items:
            catalog[key] = build_catalog_rows(items, strings)
            print(f"  {label}: {len(catalog[key]):,} meters", file=sys.stderr)

    if args.catalog:
        out["catalog"] = {"strings": strings.list, "scopes": catalog}

    previous = None
    if args.previous:
        opener = gzip.open if args.previous.endswith(".gz") else open
        with opener(args.previous, "rt", encoding="utf-8") as f:
            previous = json.load(f)
    problems = validate(out, previous, args.max_change)
    if problems:
        print("Validation failed; not writing:", *problems, sep="\n  ", file=sys.stderr)
        return 2

    name = args.out or f"seventhirty-{'catalogue' if args.catalog else 'rates'}-{today}.json" + (".gz" if args.gzip else "")
    data = json.dumps(out, separators=(",", ":"))
    if name.endswith(".gz"):
        with gzip.open(name, "wt", encoding="utf-8") as f:
            f.write(data)
    else:
        with open(name, "w", encoding="utf-8") as f:
            f.write(data)
    print(f"Wrote {name}", file=sys.stderr)
    return 0


def _write_json(path: str, obj, pretty: bool = False) -> None:
    """Write atomically so the website never sees a half-written file."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1 if pretty else None, separators=None if pretty else (",", ":"))
    os.replace(tmp, path)


def site_data(args) -> int:
    out_dir = args.site_data
    os.makedirs(os.path.join(out_dir, "history"), exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    today = now.date().isoformat()
    cat_regions = [r for r in args.catalog_regions.split() if r]
    rate_regions = list(dict.fromkeys([*args.regions, *cat_regions]))
    want_catalog = bool(cat_regions)

    prices = {"schema": "seventhirty-prices-1", "generated": today, "generatedAt": now.isoformat().replace("+00:00", "Z"),
              "currency": "GBP", "source": "Azure Retail Prices API (prices.azure.com), GBP retail list prices", "regions": {}}
    strings = Strings()
    catalog: dict[str, list] = {}
    for scope in [*SHARED_SCOPES, *rate_regions]:
        full = want_catalog and (scope in SHARED_SCOPES or scope in cat_regions)
        label = scope or "(no region)"
        print(f"Fetching {label}{' (full catalogue)' if full else ''}…", file=sys.stderr)
        items = fetch_scope(scope, full)
        key = "global" if scope == "Global" else scope
        rates = build_rates(items)
        if rates:
            prices["regions"][key] = rates
        if full and items:
            catalog[key] = build_catalog_rows(items, strings)
            print(f"  {label}: {len(catalog[key]):,} meters", file=sys.stderr)

    if os.environ.get("GITHUB_ACTIONS"):
        counts = ", ".join(f"{k or '(none)'}={len(v)}" for k, v in prices["regions"].items())
        cat = sum(len(v) for v in catalog.values())
        print(f"::notice title=Prices fetched::guided rates per region: {counts}; catalogue meters: {cat:,}")

    # Sanity checks before anything is replaced
    problems = []
    for r in rate_regions:
        got = prices["regions"].get(r, {})
        if len(got) < 20:
            problems.append(f"{r}: only {len(got)} guided-calculator rates found; the API may be failing")
    prev_path = os.path.join(out_dir, "prices.json")
    previous = None
    if os.path.exists(prev_path):
        with open(prev_path, encoding="utf-8") as f:
            previous = json.load(f)
    # The bundled seed snapshot isn't a pipeline output (different meter matching), so don't compare against it.
    man_path = os.path.join(out_dir, "manifest.json")
    if previous and os.path.exists(man_path):
        with open(man_path, encoding="utf-8") as f:
            if json.load(f).get("seed"):
                print("Previous data is the bundled seed snapshot; skipping the comparison this once.", file=sys.stderr)
                previous = None
    problems += validate(prices, previous, args.max_change)
    if problems and not args.force:
        print("Validation failed; the website keeps yesterday's prices:", *problems, sep="\n  ", file=sys.stderr)
        if os.environ.get("GITHUB_ACTIONS"):
            for p_ in problems[:40]:
                print(f"::error title=Price validation::{p_}")
            if len(problems) > 40:
                print(f"::error title=Price validation::…and {len(problems) - 40} more")
        print("Re-run with --force once you've checked the changes are real.", file=sys.stderr)
        return 2

    # What changed since the last run (for a changelog, and for the run log)
    changes = []
    if previous:
        for region, rates in prices["regions"].items():
            old = previous.get("regions", {}).get(region, {})
            for k, v in rates.items():
                if isinstance(v, (int, float)) and isinstance(old.get(k), (int, float)) and old[k] != v:
                    changes.append({"region": region, "key": k, "old": old[k], "new": v})
    print(f"{len(changes)} price changes since the last run", file=sys.stderr)

    if want_catalog:
        # Stable ordering so a day's file differs from yesterday's only where prices changed (small git diffs).
        order = sorted(range(len(strings.list)), key=lambda i: strings.list[i])
        remap = {old: new for new, old in enumerate(order)}
        strings.list = [strings.list[i] for i in order]
        for rows in catalog.values():
            for row in rows:
                for j in (0, 1, 2, 3, 4, 11):
                    row[j] = remap[row[j]]
            rows.sort(key=lambda r: r[:5])
        catalog = {k: catalog[k] for k in sorted(catalog)}
        _write_json(os.path.join(out_dir, "catalogue.json"), {"schema": "seventhirty-prices-1", "generated": today,
                    "generatedAt": prices["generatedAt"], "currency": "GBP", "catalog": {"strings": strings.list, "scopes": catalog}})
    _write_json(os.path.join(out_dir, "prices.json"), prices)
    _write_json(os.path.join(out_dir, "history", f"prices-{today}.json"), prices)
    _write_json(os.path.join(out_dir, "changes.json"), {"generatedAt": prices["generatedAt"], "changes": changes}, pretty=True)
    # The manifest goes last: the site only switches to the new files once it exists.
    _write_json(os.path.join(out_dir, "manifest.json"), {
        "schema": "seventhirty-manifest-1", "generated": today, "generatedAt": prices["generatedAt"],
        "regions": rate_regions, "catalogueRegions": cat_regions,
        "prices": "prices.json", "catalogue": "catalogue.json" if want_catalog else None,
        "source": prices["source"]}, pretty=True)
    print(f"Website data written to {out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
