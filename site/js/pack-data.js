// SevenThirty: everything the client pack shows, worked out from an estimate. Pure: no DOM.
import { SECTIONS, SVCMAP } from './services.js';
import { rateLookup } from './blocks.js';
import { computeAll, computeItem, itemSection, itemName, parseUnit, fiscalYears } from './engine.js';

/** Planning range by estimate status, as a fraction either side of the monthly figure. */
export const CONFIDENCE = { Indicative: 0.3, 'Design stage': 0.15, Final: 0.1 };

export const COMMITMENT_COLUMNS = [
  ['payg', 'Pay-as-you-go'],
  ['ri1', '1-year reservation'],
  ['ri3', '3-year reservation'],
  ['sp1', '1-year savings plan'],
  ['sp3', '3-year savings plan'],
];

/** Monthly cost of each item under every commitment option Microsoft offers for it. */
export function commitmentOptions(ctx, R) {
  const rows = [];
  for (const { it, res } of R.items) {
    let opts = [];
    if (it.svc === 'generic') {
      if (parseUnit(it.unit).cls === 'hour') opts = ['payg', ...['ri1', 'ri3', 'sp1', 'sp3'].filter((k) => it[k])];
    } else {
      const f = SVCMAP[it.svc]?.fields.find((x) => x.k === 'pricing');
      if (f) {
        const octx = { region: it.region, r: rateLookup(ctx, it.region), snap: ctx.snap };
        opts = (typeof f.opts === 'function' ? f.opts(res.c, octx) : f.opts).map((o) => (Array.isArray(o) ? o[0] : o));
      }
    }
    if (opts.length < 2) continue;
    const cost = {};
    for (const o of opts) cost[o] = computeItem(ctx, { ...it, cfg: { ...it.cfg, pricing: o } }).amt;
    const current = it.cfg.pricing && cost[it.cfg.pricing] != null ? it.cfg.pricing : 'payg';
    const best = opts.reduce((b, o) => (cost[o] < cost[b] - 0.005 ? o : b), current);
    rows.push({ name: itemName(it), region: it.region, cost, current, best, saving: Math.max(0, cost[current] - cost[best]) });
  }
  return rows;
}

/** All the figures for the client pack. S = estimate state, snap = the price data it was priced with. */
export function buildPack(S, snap) {
  const ctx = { snap, overrides: S.overrides || {}, mode: S.mode, custom: S.custom };
  const acr = S.acr || {};
  const R = computeAll(ctx, S.items || [], acr);
  const share = (v) => (R.list ? v / R.list : 0);

  const sections = [...SECTIONS, ['other', 'Other']]
    .map(([id, label]) => {
      const items = R.items.filter((x) => itemSection(x.it) === id);
      const amt = items.reduce((a, x) => a + x.res.amt, 0);
      return { id, label, items, amt, share: share(amt) };
    })
    .filter((s) => s.items.length);

  const byRegion = new Map();
  R.items.forEach(({ it, res }) => byRegion.set(it.region, (byRegion.get(it.region) || 0) + res.amt));
  const regions = [...byRegion.entries()].sort((a, b) => b[1] - a[1]).map(([id, amt]) => ({ id, amt, share: share(amt) }));

  const drivers = [...R.items]
    .sort((a, b) => b.res.amt - a.res.amt)
    .slice(0, 3)
    .filter((x) => x.res.amt > 0)
    .map(({ it, res }) => ({ name: itemName(it), region: it.region, amt: res.amt, share: share(res.amt) }));

  const commitments = commitmentOptions(ctx, R);
  const potentialSaving = commitments.reduce((a, r) => a + r.saving, 0);

  const conf = CONFIDENCE[S.meta?.status] ?? CONFIDENCE.Indicative;
  const years = [];
  for (let i = 0; i < R.months.length; i += 12) years.push(R.months.slice(i, i + 12).reduce((a, v) => a + v, 0));

  const flagged = [];
  R.items.forEach(({ it, res }) => res.lines.forEach((l) => {
    const s = l.srcs.find((x) => x.src === 'proxy' || x.src === 'missing');
    if (s) flagged.push({ item: itemName(it), line: l.what, region: it.region, kind: s.src });
  }));

  return {
    R, ctx, sections, regions, drivers, commitments, potentialSaving,
    confidence: { pct: conf, low: R.monthly * (1 - conf), high: R.monthly * (1 + conf) },
    contractYears: years,
    fiscalYears: [...fiscalYears(acr.start, R.months).entries()],
    flagged,
  };
}
