"""Tests for the price pipeline. Standard library only:  python3 -m unittest discover -s pipeline -p "test_*.py" """
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import fetch_prices as fp  # noqa: E402


def meter(service, product, sku, name, price, unit="1 Hour", type_="Consumption", tier=0, **extra):
    row = dict(serviceName=service, productName=product, skuName=sku, meterName=name, retailPrice=price,
               unitOfMeasure=unit, type=type_, tierMinimumUnits=tier, isPrimaryMeterRegion=True)
    row.update(extra)
    return row


VM = dict(armSkuName="Standard_D4s_v5")


class BuildRates(unittest.TestCase):
    def test_vm_linux_windows_reservations_and_savings_plans(self):
        items = [
            meter("Virtual Machines", "Virtual Machines Dsv5 Series", "Standard_D4s_v5", "D4s v5", 0.2, **VM,
                  savingsPlan=[{"term": "1 Year", "retailPrice": 0.15}, {"term": "3 Years", "retailPrice": 0.1}]),
            meter("Virtual Machines", "Virtual Machines Dsv5 Series Windows", "Standard_D4s_v5", "D4s v5", 0.36, **VM),
            meter("Virtual Machines", "Virtual Machines Dsv5 Series", "Standard_D4s_v5", "D4s v5", 1200, type_="Reservation", reservationTerm="1 Year", **VM),
            meter("Virtual Machines", "Virtual Machines Dsv5 Series", "Standard_D4s_v5 Spot", "D4s v5 Spot", 0.03, **VM),
            meter("Virtual Machines", "Dsv5 Series Cloud Services", "Standard_D4s_v5", "D4s v5", 0.9, **VM),
        ]
        r = fp.build_rates(items)
        self.assertEqual(r["vm_Standard_D4s_v5_lin"], 0.2, "Spot and Cloud Services rows must not be picked")
        self.assertEqual(r["vm_Standard_D4s_v5_win"], 0.36)
        self.assertEqual((r["vm_Standard_D4s_v5_ri1"], r["vm_Standard_D4s_v5_sp1"], r["vm_Standard_D4s_v5_sp3"]), (1200, 0.15, 0.1))
        self.assertAlmostEqual(r["win_vcpu"], 0.04)

    def test_regional_copies_of_shared_meters_are_kept(self):
        row = meter("Virtual Network", "IP Addresses", "Standard", "Standard IPv4 Static Public IP", 0.003774)
        row["isPrimaryMeterRegion"] = False  # how Microsoft marks a region's copy of a shared meter
        self.assertEqual(fp.build_rates([row])["pip_h"], 0.003774)

    def test_tiered_prices_are_kept_and_collapsed(self):
        rows = [meter("Bandwidth", "Rtn Preference: MGN", "Standard", "Standard Data Transfer Out", p, unit="1 GB", tier=t)
                for t, p in [(0, 0), (100, 0.0657), (10335, 0.0626), (51295, 0.0626)]]
        self.assertEqual(fp.build_rates(rows)["egress"], [[0, 0], [100, 0.0657], [10335, 0.0626]])

    def test_cold_tier_blob_reads_use_their_own_meter_name(self):
        row = meter("Storage", "General Block Blob v2", "Cold LRS", "Cold LRS Read Operations", 0.0755, unit="10K")
        self.assertEqual(fp.build_rates([row])["blobr_Cold"], 0.0755)

    def test_sql_reservations_are_per_vcore_for_the_term(self):
        row = meter("SQL Database", "SQL Database Single/Elastic Pool General Purpose - Compute Gen5", "vCore", "vCore", 1698.18,
                    type_="Reservation", reservationTerm="3 Years")
        self.assertEqual(fp.build_rates([row])["sql_gp_ri3"], 1698.18)


class Validate(unittest.TestCase):
    def test_flags_big_moves_and_vanished_meters_only(self):
        prev = {"regions": {"uksouth": {"a": 1.0, "b": 1.0, "c": 1.0, "tiers": [[0, 1]]}}}
        new = {"regions": {"uksouth": {"a": 1.1, "b": 1.5, "tiers": [[0, 9]]}}}
        problems = fp.validate(new, prev, 0.25)
        self.assertEqual(len(problems), 2)
        self.assertTrue(any("uksouth.b" in p and "+50%" in p for p in problems))
        self.assertTrue(any("uksouth.c: meter disappeared" in p for p in problems))


class SiteData(unittest.TestCase):
    """The daily job end to end, with the API replaced by fixed rows."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.price = 0.2

    def fake_scope(self, scope, full):
        if scope not in ("uksouth", "ukwest"):
            return []
        rows = [meter("Virtual Machines", "Virtual Machines Dsv5 Series", "Standard_D4s_v5", "D4s v5", self.price, **VM, serviceFamily="Compute")]
        rows += [meter("Azure Firewall", "Azure Firewall", "Standard", f"Standard Deployment", 0.9 + i / 100, serviceFamily="Networking") for i in range(1)]
        return rows

    def run_job(self, *extra):
        argv = ["fetch_prices.py", "--site-data", self.dir, "--catalog-regions", "uksouth ukwest", *extra, "uksouth", "ukwest"]
        many = {f"k{i}": 1.0 for i in range(25)}
        with mock.patch.object(fp, "fetch_scope", self.fake_scope), mock.patch.object(sys, "argv", argv), \
                mock.patch.object(fp, "build_rates", lambda items: {**many, "vm": items[0]["retailPrice"]} if items else {}):
            return fp.main()

    def read(self, name):
        with open(os.path.join(self.dir, name), encoding="utf-8") as f:
            return json.load(f)

    def test_writes_every_file_and_the_manifest_last(self):
        self.assertEqual(self.run_job(), 0)
        for name in ("prices.json", "catalogue.json", "changes.json", "manifest.json"):
            self.assertTrue(os.path.exists(os.path.join(self.dir, name)), name)
        m = self.read("manifest.json")
        self.assertEqual((m["prices"], m["catalogue"], m["regions"]), ("prices.json", "catalogue.json", ["uksouth", "ukwest"]))
        self.assertEqual(self.read("prices.json")["currency"], "GBP")

    def test_a_big_price_move_is_held_back_until_forced(self):
        self.run_job()
        self.price = 0.5  # +150%
        self.assertEqual(self.run_job(), 2)
        self.assertEqual(self.read("prices.json")["regions"]["uksouth"]["vm"], 0.2, "yesterday's prices stay live")
        self.assertEqual(self.run_job("--force"), 0)
        self.assertEqual(self.read("prices.json")["regions"]["uksouth"]["vm"], 0.5)
        self.assertTrue(any(c["key"] == "vm" for c in self.read("changes.json")["changes"]))

    def test_the_bundled_seed_is_not_used_for_comparison(self):
        with open(os.path.join(self.dir, "prices.json"), "w") as f:
            json.dump({"regions": {"uksouth": {"vm": 0.01}}}, f)
        with open(os.path.join(self.dir, "manifest.json"), "w") as f:
            json.dump({"seed": True}, f)
        self.assertEqual(self.run_job(), 0)

    def test_catalogue_order_is_stable_between_runs(self):
        self.run_job()
        first = self.read("catalogue.json")["catalog"]
        self.run_job()
        self.assertEqual(first, self.read("catalogue.json")["catalog"])


if __name__ == "__main__":
    unittest.main()
