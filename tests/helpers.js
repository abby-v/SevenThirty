// Shared test helpers: a tiny, hand-made price snapshot so every expected figure can be
// worked out on paper, plus loaders for the real price data.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaults } from '../site/js/services.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** Round to pennies for comparisons, to dodge floating-point noise. */
export const p = (v) => Math.round(v * 100) / 100;

/** A small snapshot with simple numbers. Keys match the real data. */
export const TINY = {
  generated: '2026-01-01',
  currency: 'GBP',
  regions: {
    global: { peer_intra: 0.01, nat_h: 0.05, nat_gb: 0.04, sql_lic_gp: 0.1, sql_lic_bc: 0.3 },
    'Zone 1': { afd_Standard_base: 30 },
    '': { tm_az_hc: 0.5 },
    uksouth: {
      pip_h: 0.004,
      peer_global: 0.03,
      egress: [[0, 0], [100, 0.06], [10100, 0.05]],
      vm_Standard_D4s_v5_lin: 0.2, vm_Standard_D4s_v5_win: 0.35,
      vm_Standard_D4s_v5_ri1: 1200, vm_Standard_D4s_v5_ri3: 2160,
      vm_Standard_D4s_v5_sp1: 0.15, vm_Standard_D4s_v5_sp3: 0.1,
      vm_Standard_D8s_v5_lin: 0.4, vm_Standard_D8s_v5_win: 0.7,
      vm_Standard_E8s_v5_lin: 0.5,
      win_vcpu: 0.04,
      disk_P10_LRS: 20, disk_P10_ZRS: 30, disk_E10_LRS: 8,
      files_prem_LRS: 0.15, files_prem_ZRS: 0.2,
      sql_gp: 0.15, sql_gp_ri1: 900, sql_gp_ri3: 1800,
      ddos_plan: 3, ddos_ip: 0.2,
      sent_payg: 4,
      sent_50: 150, sent_100: 280, sent_200: 520, sent_300: 750, sent_400: 980,
      sent_500: 1190, sent_1000: 2340, sent_2000: 4530, sent_5000: 10900,
    },
    ukwest: { pip_h: 0.005, disk_P10_LRS: 21 },
  },
};

/** Pricing context the engine expects. */
export const ctxFor = (snap, extra = {}) => ({ snap, overrides: {}, mode: '730', custom: 196, ...extra });

/** An estimate item for a guided calculator, starting from its defaults. */
export const item = (svc, cfg = {}, region = 'uksouth') => ({ uid: svc, svc, region, label: '', cfg: { ...defaults(svc), ...cfg } });

/** The price data the live site is serving right now (refreshed daily by the pipeline). */
export const livePrices = () => JSON.parse(fs.readFileSync(here('../site/data/prices.json'), 'utf8'));

/** A frozen copy of real prices, so golden totals don't move when Microsoft changes a price. */
export const frozenPrices = () => JSON.parse(fs.readFileSync(here('./fixtures/prices-2026-10-10.json'), 'utf8'));

/** Sum of an item's lines. */
export const total = (res) => p(res.lines.reduce((a, l) => a + l.amt, 0));
