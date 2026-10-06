# SevenThirty

Azure cost estimates in native GBP for UK consultants, with the working shown on every line.

SevenThirty is for senior MSP and partner consultants who put ACR estimates in front of clients. It is quicker than the Azure Pricing Calculator, it shows how every figure was worked out (unlike the opaque third-party calculators), and it produces a client pack you can send without reformatting it.

```
2 × £0.0040/h × 730 h = £5.84
100 GB free tier + 900 GB × £0.0700/GB = £63.00
```

## What it does

- **One hours model.** A single control sets the hours for every hourly resource: **730 h** (always on, 24 × 365 ÷ 12), **450 h** (extended), **217 h** (office hours) or a custom value. You can save your own presets. Any line can override the hours, and an override is clearly marked.
- **Data in GB per month only.** API units are converted when prices are imported, so you never see per-TB or per-day units.
- **Standing vs usage.** Every line is tagged as standing (bills while the resource exists) or usage (scales with traffic). The summary shows the split.
- **Pause warnings.** NAT Gateway, VPN Gateway, Bastion, public IPs, Load Balancer and similar resources have no stopped state. If they are set below 730 h, a warning says the figure only holds if the resource is deleted and redeployed on a schedule.
- **Native GBP.** Prices are pulled from the Azure Retail Prices API with `currencyCode='GBP'`. Nothing is converted from USD.
- **Starting architectures.** Six starting points so you never begin from a blank page: hub, application spoke, dev/test spoke, AVD, AKS and data platform.
- **Commitments side by side.** Pay-as-you-go, 1- and 3-year savings plans, 1- and 3-year reservations, and best per VM. Azure Hybrid Benefit is a toggle. Commitments never silently replace the list price. Reservations bill every hour of the term, so office-hours VMs show honestly when a reservation would cost more.
- **ACR ramp.** Each workload has a start month, a ramp length and an optional decommission month. The forecast is summed month by month and also reported by contract year and by Microsoft fiscal year (July to June).
- **Client-ready outputs.**
  - Markdown table
  - Full-precision CSV
  - Excel workbook with live formulas (Summary, Line items, Ramp, Assumptions)
  - Printable client pack (save as PDF) following the ACR checklist: cover, executive summary, breakdowns, commitment options, ramp chart, assumptions, exclusions, risks and the disclaimer
  - Share link that carries the whole estimate in the URL fragment
- **Private by default.** No sign-in, no tracking, no cookies. Estimates are saved only in your browser. A share link carries the estimate in the URL fragment, which browsers never send to the server.
- **Installable.** It works as a Progressive Web App on desktop and mobile, and keeps working offline with the last prices it fetched.
- **Accessible.** Targets WCAG 2.2 AA. axe runs in CI in light and dark themes, there is full keyboard support, a polite `aria-live` total, and the layout works at 320 px wide.

## Services covered

| Family | Calculators |
|---|---|
| Networking | Public IP, NAT Gateway, VNet peering (both directions), VPN Gateway, ExpressRoute gateway and circuit, Azure Firewall, Bastion, Load Balancer, Application Gateway v2, Front Door, Private Endpoint, DNS zones, DNS Private Resolver, DDoS Protection, data transfer out |
| Compute | Virtual machines (30 common sizes, Linux and Windows, reservations, savings plans, Hybrid Benefit, OS disk), managed disks |
| Platform | App Service plans, AKS control plane |
| Data | Azure SQL Database (vCore General Purpose, licence shown separately), Blob storage |
| Operations | Log Analytics, Key Vault |
| Other | Custom user-entered lines for support plans, Marketplace software and managed services |

## Getting started

Requires Node.js 22.18 or later. The pricing scripts use Node's native TypeScript support.

```bash
npm install
npm run prices        # pull live GBP prices (needs access to prices.azure.com)
npm run dev           # http://localhost:5173
```

If you have no network access to `prices.azure.com`, run `npm run prices:sample`. It writes **sample** snapshots so you can develop the UI. Those values are placeholders, not Microsoft prices. The app shows a banner while they are in use, and the deploy pipeline refuses to publish them.

| Script | What it does |
|---|---|
| `npm run prices` | Fetch, normalise and validate GBP prices for UK South and UK West |
| `npm run prices -- --accept-changes` | The same, but allows price moves over 20% (after you have checked them) |
| `npm run prices:explore "Azure Bastion" uksouth` | List every product, SKU, meter and unit for a service, to help fix a matcher |
| `npm test` | Unit and golden tests (engine, catalogue consistency, exports) |
| `npm run test:e2e` | Browser tests plus axe accessibility checks (light and dark) |
| `npm run lint` | oxlint |
| `npm run build` | Type-check and build to `dist/` |

## How pricing works

```
Azure Retail Prices API (GBP, api-version 2023-01-01-preview)
        │  scripts/fetch-prices.ts, daily
        ▼
normalise units → match meters (src/pricing/catalogue.ts) → validate against previous snapshot
        │  only if every region passes
        ▼
public/prices/<region>/latest.json + <YYYY-MM-DD>.json, index.json, changelog.json
        │
        ▼
static site loads one compact snapshot per region (never calls the API from the browser)
```

- **Catalogue.** `src/pricing/catalogue.ts` maps each calculator input to API rows by service name, product, SKU and meter patterns. Matching is case-insensitive and tolerant of small renames.
- **Validation.** The job fails, and writes nothing, if:
  - a required meter is missing
  - a meter that existed yesterday disappears
  - a unit of measure changes
  - a price moves by more than 20% (unless you pass `--accept-changes`)

  The site keeps serving the last good snapshot.
- **History.** Dated snapshots are kept, so you can see price changes in `changelog.json` and in the git history.
- **Missing meters.** If a meter is missing from the API, the line shows **Rate unavailable** and is left out of the total. Nothing is guessed. To fill a genuine gap, add an entry to `src/pricing/manual-overrides.json` with the rate, source URL, date checked and review-by date. The line is then marked as a manually maintained rate.
- **First live run.** The meter patterns were written without live API access, so check the first pipeline run's warnings and `missing` lists. Use `npm run prices:explore` to correct any pattern that does not match.

## Calculation rules

- Hourly: `quantity × hourly rate × hours`. Monthly: `quantity × monthly rate`, never multiplied by hours. Per GB: tiered by `tierMinimumUnits`, and free tiers are named in the working.
- Annual = monthly × 12. The multi-year total is summed month by month over the ramp.
- Values are rounded only for display: 2 dp for amounts, 4 dp for rates under £1. CSV and Excel keep full precision.
- The customer discount is applied after list price, and contingency after the discount. Breakdowns stay at list price.
- Lines marked DR are priced in the DR region (UK West by default).

## Deploying

The site is static and is hosted on **Azure Static Web Apps (Free plan, £0 a month)**.

1. Create the infrastructure with `cd infra/terraform && terraform init && terraform apply`.
2. Store the deployment token (`terraform output -raw deployment_token`) as the GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
3. Run the **Pricing job** workflow once. It commits the first live snapshot.
4. The **Deploy** workflow then publishes. It runs on every push to `main` and after each successful pricing run.

GitHub Actions:

- `ci.yml`: lint, type-check, golden tests, build, e2e and axe
- `prices.yml`: daily at 05:17 UTC
- `deploy.yml`: refuses to publish sample prices

If you use Azure DevOps, `pipelines/azure-pipelines.yml` does the same job in a single pipeline.

## Adding a calculator

1. Add its meters to `src/pricing/catalogue.ts` (and SKU names to `src/pricing/skus.ts` if the UI needs them).
2. Add a `ResourceDef` to `src/engine/resources.ts`. It declares:
   - inputs (with units in the label), defaults and `More options`
   - `hourly` and `pausable`
   - lines built with `standing()`, `data()` and `count()`, so the working, the standing/usage tag and the tiers come for free
3. Add golden cases to `src/engine/engine.test.ts`. Cross-check them against the Azure Pricing Calculator on the same date and note that date.
4. `catalogue.test.ts` fails if a calculator asks for a meter the pipeline does not fetch.

## Project layout

```
scripts/            pricing job and sample generator
src/pricing/        snapshot types, meter catalogue, unit normalisation, SKU lists
src/engine/         calculators, charges, estimate totals, ramp and commitments
src/state/          presets, browser storage, share links, snapshot loading
src/exports/        Markdown, CSV and Excel
src/components/     UI
public/prices/      price snapshots
infra/terraform/    Static Web App
e2e/                Playwright and axe tests
```

## Disclaimer

SevenThirty is an independent tool and is not affiliated with or endorsed by Microsoft. Its estimates are indicative and use Microsoft retail list prices in GBP for the stated region on the stated date. Actual charges depend on configuration, usage, agreement type and discounts. Prices exclude VAT.
