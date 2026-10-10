# SevenThirty

Azure cost estimates in native GBP for MSP consultants, with the working shown on every line.

```
2 × £0.306427/h × 730 h = £447.38
400 GB × £0.0657 = £26.28
```

**Live:** https://abby-v.github.io/seventhirty/ · Prices refresh daily from Microsoft's Azure Retail Prices API.

## What it does

- **Pick, configure, add.** A menu of services by section (Networking, Security, Storage and data, Azure Virtual Desktop, Compute, Kubernetes), a configurator with presets and only the inputs that matter, and an estimate sheet you build up item by item, each in its own region.
- **Every Azure service.** 29 guided calculators, plus search across every meter Microsoft publishes (about 24,700 for UK South, UK West and the global services), with reservation and savings plan prices where they exist.
- **One hours model.** 730 h (always on), 217 h (office hours) or custom, with per-line overrides and warnings for resources that can't be paused.
- **Native GBP.** Prices come from the Retail Prices API with `currencyCode='GBP'`; nothing is converted from USD.
- **ACR forecast.** Go-live month, ramp, discount and contingency, with a monthly chart and Microsoft fiscal-year (July–June) totals.
- **Exports.** Markdown and CSV for proposals and finance.

## How the daily refresh works

`.github/workflows/prices.yml` runs at 06:00 UTC (GitHub may start it late; see below):

1. `pipeline/fetch_prices.py` pulls GBP prices and writes `site/data/` (`prices.json`, `catalogue.json`, `changes.json`, `history/`, and `manifest.json` last).
2. The pipeline checks the data: enough meters, nothing vanished, nothing moved more than 25%.
3. The site's tests then price every calculator and option against the new data.
4. Only if both pass is the data committed, and `pages.yml` republishes the site. Otherwise the site keeps yesterday's prices and the failed run emails you; check the log and re-run with **force** if a big move is real.

Regions are set by repository variables `PRICE_REGIONS` (default `uksouth ukwest northeurope westeurope`) and `CATALOGUE_REGIONS` (default `uksouth ukwest`).

GitHub runs scheduled workflows on a best-effort basis; on this repository they have been starting around midday. A fixed-time trigger from Azure DevOps is the planned fix.

## Project layout

| Path | What it is |
|---|---|
| `site/` | The website: plain HTML, CSS and JavaScript modules, no build step. Upload it to any static host. |
| `site/js/prices.js` | Built-in snapshot used until live data loads |
| `site/js/blocks.js` | Rate lookup, the hours model, shared VM, disk and SQL pricing |
| `site/js/services.js` | Every guided calculator: inputs, presets, notes and formula |
| `site/js/engine.js` | Prices items and whole estimates (pure functions, no DOM) |
| `site/js/exports.js` | Markdown, CSV and assumptions |
| `site/js/ui.js` | The page: menu, configurator, estimate sheet, price data loading |
| `site/data/` | Price data written by the daily job |
| `pipeline/` | The price fetcher and its tests (Python, standard library only) |
| `tests/` | Pricing maths, every calculator against live data, golden totals, exports |
| `hosting/refresh-prices.sh` | Daily refresh with cron, for non-GitHub hosting |
| `infra/main.tf` | Terraform for an Azure Static Web App, if you move hosting to Azure |

## Working on it

Needs Node.js 20+ and Python 3.9+. No packages to install.

```bash
npm test               # pricing maths, every calculator against site/data, golden totals, exports
npm run test:pipeline  # the price fetcher
npm run serve          # http://localhost:8080
```

- **Golden totals** (`tests/fixtures/golden.json`) lock today's results for every calculator and a typical estimate, priced from a frozen copy of real prices. If you change a formula on purpose, regenerate them with `UPDATE_GOLDEN=1 npm test` and check the diff.
- **Adding a calculator:** define it in `site/js/services.js`, add it to `SECTION_ORDER`, and add any new meters to `meter_rules()` in `pipeline/fetch_prices.py`. The live-data test will tell you if a meter isn't matched.

## The previous app

The earlier React version of SevenThirty is preserved on the `archive/main-app` branch.

SevenThirty is an independent tool and is not affiliated with or endorsed by Microsoft. Figures are indicative estimates from Microsoft's retail list prices in GBP, excluding VAT.
