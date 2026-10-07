# SevenThirty Lite

A second, dependency-free version of SevenThirty that lives alongside the main app in this repository. It's a static site (one HTML file, one script, JSON price data) with a service menu, guided calculators and an estimate sheet.

- **Live:** `https://abby-v.github.io/seventhirty/lite/` (the main app stays at `/seventhirty/`)
- **Prices:** refreshed every day at 06:00 GMT by `.github/workflows/lite-prices.yml`
- **Covers:** networking, security (Firewall, DDoS, Bastion, Defender for Cloud, Sentinel, Log Analytics, Key Vault), storage and data (disks, Blob, Files, Backup, SQL Database, SQL Managed Instance), Azure Virtual Desktop (host pool sizing from users), compute (VMs) and Kubernetes (AKS), plus search across every Azure meter for UK South and UK West.

## How the daily refresh works

1. At 06:00 UTC (06:00 GMT; 07:00 UK time during BST) `lite-prices.yml` runs `pipeline/fetch_prices.py`, which calls the Azure Retail Prices API with `currencyCode='GBP'`.
2. It writes `site/data/`: `prices.json` (guided calculators), `catalogue.json` (every meter for the catalogue regions), `changes.json`, `history/` and, last, `manifest.json`.
3. If the API returns too little, a meter disappears or a price moves more than 25%, nothing is written, the run fails and GitHub emails you. Check the log and re-run with **force** if the change is real.
4. On success it commits the data, and "Preview on GitHub Pages" rebuilds the Pages site with both apps.

Change regions under **Settings → Secrets and variables → Actions → Variables**: `LITE_PRICE_REGIONS` (default `uksouth ukwest northeurope westeurope`) and `LITE_CATALOGUE_REGIONS` (default `uksouth ukwest`).

## Run it locally

```bash
python lite/pipeline/fetch_prices.py --site-data lite/site/data --catalog-regions "uksouth ukwest" uksouth ukwest
python -m http.server --directory lite/site 8080
```

## Hosting it somewhere else

Upload the contents of `lite/site/` to any static host. `hosting/refresh-prices.sh` sets up the daily refresh with cron, and `infra/main.tf` creates an Azure Static Web App.
