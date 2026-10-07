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
]

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
        r.append((f"blobr_{tier}", _m("Storage", "General Block Blob v2", f"{tier} LRS", f"{tier} Read Operations"), False))
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
    return r


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
    items = [i for i in items if i.get("isPrimaryMeterRegion", True)]
    cons = [i for i in items if i.get("type") == "Consumption"]
    out: dict = {}
    for key, pred, tiered in meter_rules():
        hits = [i for i in cons if pred(i)]
        if not hits:
            continue
        tiers = sorted({(float(i.get("tierMinimumUnits") or 0), float(i["retailPrice"])) for i in hits})
        if tiered:
            collapsed = []
            for lo, p in tiers:
                if collapsed and collapsed[-1][1] == p:
                    continue
                collapsed.append([lo, round(p, 6)])
            out[key] = collapsed if len(collapsed) > 1 else collapsed[0][1]
        else:
            out[key] = round(tiers[0][1], 6)
    # Reservations for SQL Database and Managed Instance compute (price per vCore for the term)
    for key, prod in (("sql_gp", "SQL Database Single/Elastic Pool General Purpose - Compute Gen5"), ("sql_bc", "SQL Database Single/Elastic Pool Business Critical - Compute Gen5"),
                      ("mi_gp", "SQL Managed Instance General Purpose - Compute Gen5"), ("mi_bc", "SQL Managed Instance Business Critical - Compute Gen5")):
        for i in items:
            if i.get("type") == "Reservation" and i.get("productName") == prod and i.get("skuName") == "vCore":
                term = i.get("reservationTerm", "")
                out[key + ("_ri1" if term.startswith("1") else "_ri3")] = round(float(i["retailPrice"]), 4)
    out.update(vm_rates(items))
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
    problems += validate(prices, previous, args.max_change)
    if problems and not args.force:
        print("Validation failed; the website keeps yesterday's prices:", *problems, sep="\n  ", file=sys.stderr)
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
