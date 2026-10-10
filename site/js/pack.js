// SevenThirty: renders the client pack from the estimate handed over by the main page.
import { regionName } from './regions.js';
import { gbp, n, esc, fmtDate } from './format.js';
import { itemName, itemSum, monthLabel } from './engine.js';
import { assumptions } from './exports.js';
import { globalHours } from './blocks.js';
import { buildPack, COMMITMENT_COLUMNS } from './pack-data.js';

const $ = (id) => document.getElementById(id);
const pct = (v) => `${Math.round(v * 100)}%`;
const g0 = (v) => gbp(v, 0);
const SHORT = { payg: 'PAYG', ri1: '1-yr RI', ri3: '3-yr RI', sp1: '1-yr SP', sp3: '3-yr SP' };

let handoff = null;
try { handoff = JSON.parse(localStorage.getItem('st-pack') || 'null'); } catch (e) { handoff = null; }

$('printBtn').addEventListener('click', () => window.print());

if (!handoff || !handoff.S || !handoff.snap) {
  $('doc').innerHTML = `<div class="empty"><h2>No estimate to show</h2><p class="muted" style="margin:4mm auto">Open the client pack from your estimate with <b>Open client pack</b>. If your browser blocks site storage (for example in a private window), the pack can't receive the estimate.</p><p><a href="./">Back to SevenThirty</a></p></div>`;
} else {
  render(handoff.S, handoff.snap);
}

function render(S, snap) {
  const P = buildPack(S, snap);
  const { R } = P;
  const m = S.meta || {};
  const title = m.title || 'Azure cost estimate';
  const priceDate = fmtDate(snap.generatedAt || snap.generated);
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const regionList = P.regions.map((r) => regionName(r.id)).join(', ');
  document.title = `${title}${m.client ? ` · ${m.client}` : ''} · client pack`;

  if (!R.items.length) {
    $('doc').innerHTML = `<div class="empty"><h2>This estimate is empty</h2><p class="muted">Add services to the estimate, then open the client pack again.</p><p><a href="./">Back to SevenThirty</a></p></div>`;
    return;
  }

  const adjustments = [];
  if (R.disc > 0) adjustments.push(`a ${n(R.disc * 100)}% discount on list price`);
  if (R.cont > 0) adjustments.push(`${n(R.cont * 100)}% contingency`);

  const drivers = P.drivers.map((d) => `${esc(d.name)} (${g0(d.amt)}, ${pct(d.share)})`);
  const driverSentence = drivers.length === 1 ? drivers[0] : `${drivers.slice(0, -1).join(', ')} and ${drivers.at(-1)}`;

  const html = [];

  /* ---------- Cover ---------- */
  html.push(`<div class="cover">
    <div class="brand"><span class="mark" aria-hidden="true">730</span><span>Azure cost estimate</span></div>
    <div class="titles"><h1>${esc(title)}</h1>${m.client ? `<div class="for">Prepared for ${esc(m.client)}</div>` : ''}</div>
    <div class="figure">
      <div><span>Monthly run rate</span><b>${g0(R.monthly)}</b></div>
      <div><span>${R.term}-month consumption</span><b>${g0(R.termTotal)}</b></div>
    </div>
    <dl class="facts">
      ${m.by ? `<dt>Prepared by</dt><dd>${esc(m.by)}</dd>` : ''}
      <dt>Date</dt><dd>${today}</dd>
      <dt>Status</dt><dd>${esc(m.status || 'Indicative')}</dd>
      <dt>Regions</dt><dd>${esc(regionList)}</dd>
      <dt>Currency</dt><dd>GBP, excluding VAT</dd>
      <dt>Price basis</dt><dd>Microsoft Azure retail list prices${adjustments.length ? `, with ${esc(adjustments.join(' and '))}` : ''}</dd>
      <dt>Price date</dt><dd>${esc(priceDate)}</dd>
    </dl>
  </div>`);

  /* ---------- Executive summary ---------- */
  const commitNote = R.commitSave > 0.5
    ? `<p>Reservations and savings plans already in the estimate save ${g0(R.commitSave)} a month against pay-as-you-go.</p>` : '';
  const potentialNote = P.potentialSaving > 0.5
    ? `<p>A further ${g0(P.potentialSaving)} a month (about ${g0(P.potentialSaving * 12)} a year) is available by moving eligible items to their best commitment option. See <a href="#commitments">Commitment options</a>.</p>` : '';
  html.push(`<section aria-labelledby="h-sum"><h2 id="h-sum">Executive summary</h2>
    <p class="lead">At steady state this estimate runs at <b>${g0(R.monthly)} a month</b>, or ${g0(R.monthly * 12)} a year, across ${R.items.length} item${R.items.length > 1 ? 's' : ''} in ${esc(regionList)}. Over the ${R.term}-month term, forecast consumption is <b>${g0(R.termTotal)}</b>.</p>
    <p>The largest costs are ${driverSentence}.</p>
    ${commitNote}${potentialNote}
    <div class="kpis">
      <div class="kpi"><span>Monthly run rate</span><b>${g0(R.monthly)}</b></div>
      <div class="kpi"><span>Annual</span><b>${g0(R.monthly * 12)}</b></div>
      <div class="kpi"><span>${R.term}-month total</span><b>${g0(R.termTotal)}</b></div>
      <div class="kpi"><span>Planning range (±${pct(P.confidence.pct)})</span><b>${g0(P.confidence.low)}–${g0(P.confidence.high)}</b></div>
    </div>
    <div class="split" aria-hidden="true"><div class="s" style="width:${R.list ? (R.standing / R.list) * 100 : 0}%"></div><div class="u" style="width:${R.list ? (R.usage / R.list) * 100 : 0}%"></div></div>
    <div class="legend"><span><span class="sw" style="background:var(--standing)"></span>Standing charges ${g0(R.standing)} (${pct(R.list ? R.standing / R.list : 0)}): billed while resources exist</span><span><span class="sw" style="background:var(--usage)"></span>Usage ${g0(R.usage)} (${pct(R.list ? R.usage / R.list : 0)}): varies with traffic and data</span></div>
  </section>`);

  /* ---------- Cost breakdown ---------- */
  const secRows = P.sections.map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${s.items.length}</td><td class="num">${gbp(s.amt)}</td><td class="num">${pct(s.share)}</td></tr>`).join('');
  const regRows = P.regions.map((r) => `<tr><td>${esc(regionName(r.id))}</td><td class="num">${gbp(r.amt)}</td><td class="num">${pct(r.share)}</td></tr>`).join('');
  const adjRows = [
    R.disc > 0 ? `<tr><td>Discount ${n(R.disc * 100)}%</td><td></td><td class="num">${gbp(-R.list * R.disc)}</td><td></td></tr>` : '',
    R.cont > 0 ? `<tr><td>Contingency ${n(R.cont * 100)}%</td><td></td><td class="num">${gbp(R.list * (1 - R.disc) * R.cont)}</td><td></td></tr>` : '',
  ].join('');
  const itemTables = P.sections.map((s) => `<h3>${esc(s.label)}</h3><div class="tablewrap"><table>
      <thead><tr><th>Item</th><th>Region</th><th>Configuration</th><th class="num">Monthly</th></tr></thead>
      <tbody>${s.items.map(({ it, res }) => `<tr><td>${esc(itemName(it))}</td><td>${esc(regionName(it.region))}</td><td class="muted">${esc(itemSum(it, res))}</td><td class="num">${gbp(res.amt)}</td></tr>`).join('')}
      <tr class="total"><td colspan="3">${esc(s.label)} total</td><td class="num">${gbp(s.amt)}</td></tr></tbody></table></div>`).join('');
  html.push(`<section class="pagebreak" aria-labelledby="h-break"><h2 id="h-break">Cost breakdown</h2>
    <div class="tablewrap"><table><thead><tr><th>Section</th><th class="num">Items</th><th class="num">Monthly</th><th class="num">Share</th></tr></thead>
      <tbody>${secRows}<tr class="sub"><td>List price total</td><td></td><td class="num">${gbp(R.list)}</td><td class="num">100%</td></tr>${adjRows}
      <tr class="total"><td>Monthly run rate</td><td></td><td class="num">${gbp(R.monthly)}</td><td></td></tr></tbody></table></div>
    ${P.regions.length > 1 ? `<h3>By region</h3><div class="tablewrap"><table><thead><tr><th>Region</th><th class="num">Monthly</th><th class="num">Share</th></tr></thead><tbody>${regRows}</tbody></table></div>` : ''}
    ${itemTables}
  </section>`);

  /* ---------- Commitment options ---------- */
  if (P.commitments.length) {
    const cols = COMMITMENT_COLUMNS.filter(([k]) => P.commitments.some((r) => r.cost[k] != null));
    const rows = P.commitments.map((r) => `<tr><td>${esc(r.name)}<div class="muted" style="font-size:8pt">${esc(regionName(r.region))}</div></td>
      ${cols.map(([k]) => (r.cost[k] == null ? '<td class="num muted">—</td>' : `<td class="num${k === r.best ? ' best' : ''}${k === r.current ? ' cur' : ''}">${gbp(r.cost[k])}</td>`)).join('')}
      <td class="num">${r.saving > 0.005 ? gbp(r.saving) : '—'}</td></tr>`).join('');
    html.push(`<section id="commitments" aria-labelledby="h-commit"><h2 id="h-commit">Commitment options</h2>
      <p>Monthly cost of each eligible item under each option, at list price: pay-as-you-go (PAYG), 1- and 3-year reservations (RI) and 1- and 3-year savings plans (SP). <b style="color:var(--good)">Green</b> is the lowest; the underlined figure is what this estimate uses. Reservations bill every hour of their term whether or not the resource runs, so they can cost more than pay-as-you-go for workloads that run office hours only.</p>
      <div class="tablewrap"><table class="commit"><thead><tr><th>Item</th>${cols.map(([k, t]) => `<th class="num" title="${t}">${SHORT[k]}</th>`).join('')}<th class="num">Saving</th></tr></thead>
      <tbody>${rows}${P.potentialSaving > 0.005 ? `<tr class="total"><td colspan="${cols.length + 1}">Possible saving a month</td><td class="num">${gbp(P.potentialSaving)}</td></tr>` : ''}</tbody></table></div>
      <p class="muted">Commitments are a financial decision for the client. Azure Hybrid Benefit for Windows Server and SQL Server can reduce costs further where eligible licences exist.</p>
    </section>`);
  }

  /* ---------- ACR forecast ---------- */
  const acr = S.acr || {};
  html.push(`<section class="pagebreak" aria-labelledby="h-acr"><h2 id="h-acr">Consumption forecast</h2>
    <p>${R.term} months from ${esc(monthLabel(acr.start, 0))}. ${Number(acr.live) > 1 ? `Go-live in month ${n(acr.live)}` : 'Live from month 1'}${Number(acr.ramp) > 1 ? `, ramping to full consumption over ${n(acr.ramp)} months` : ''}.</p>
    <div class="chart">${chartSvg(R.months, acr.start)}</div>
    <div class="tablewrap"><table><thead><tr><th>Contract year</th><th class="num">Consumption</th></tr></thead><tbody>
      ${P.contractYears.map((v, i) => `<tr><td>Year ${i + 1}</td><td class="num">${gbp(v)}</td></tr>`).join('')}
      <tr class="total"><td>Term total</td><td class="num">${gbp(R.termTotal)}</td></tr></tbody></table></div>
    <h3>By Microsoft fiscal year (July to June)</h3>
    <div class="tablewrap"><table><thead><tr><th>Fiscal year</th><th class="num">Consumption</th></tr></thead><tbody>
      ${P.fiscalYears.map(([fy, v]) => `<tr><td>FY${String(fy).slice(2)} (Jul ${fy - 1} – Jun ${fy})</td><td class="num">${gbp(v)}</td></tr>`).join('')}</tbody></table></div>
  </section>`);

  /* ---------- Assumptions, exclusions, risks ---------- */
  const flaggedNote = P.flagged.length
    ? `<p class="note">${P.flagged.length} line${P.flagged.length > 1 ? 's use' : ' uses'} a stand-in or missing rate (${esc([...new Set(P.flagged.map((f) => `${f.item} in ${regionName(f.region)}`))].slice(0, 4).join('; '))}). Confirm these before relying on the figures.</p>` : '';
  html.push(`<section aria-labelledby="h-ass"><h2 id="h-ass">Assumptions, exclusions and risks</h2>
    <h3>Assumptions</h3><ul class="list">${assumptions(S, R, snap).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    <h3>Exclusions</h3><ul class="list"><li>VAT</li><li>Microsoft or partner support plans</li><li>Marketplace software and licences not listed</li><li>Partner professional and managed service fees</li><li>Data volumes and growth beyond those stated</li><li>One-off migration and parallel-running costs outside the forecast</li></ul>
    <h3>Confidence</h3>
    <p>This is a${/^[AEIOU]/i.test(m.status || 'I') ? 'n' : ''} ${esc((m.status || 'Indicative').toLowerCase())} estimate. Plan on ${g0(P.confidence.low)} to ${g0(P.confidence.high)} a month (±${pct(P.confidence.pct)}) until quantities and data volumes are confirmed, starting with ${esc(P.drivers.map((d) => d.name).join(', '))}.</p>
    ${flaggedNote}
  </section>`);

  /* ---------- Appendix: the working ---------- */
  const work = P.sections.map((s) => `<h3>${esc(s.label)}</h3><div class="tablewrap"><table>
    <thead><tr><th>Item</th><th>Line</th><th>Working</th><th class="num">Monthly</th></tr></thead><tbody>
    ${s.items.map(({ it, res }) => res.lines.map((l, i) => `<tr><td>${i ? '' : esc(itemName(it))}</td><td><span class="kind ${l.kind}">${l.kind}</span><br>${esc(l.what)}</td><td class="calc">${esc(l.calc)}</td><td class="num">${gbp(l.amt)}</td></tr>`).join('')).join('')}
    </tbody></table></div>`).join('');
  html.push(`<section class="pagebreak" aria-labelledby="h-work"><h2 id="h-work">Appendix: how each figure is worked out</h2>
    <p class="muted">Every line shows quantity × rate × hours or volume. Hourly charges use ${n(globalHours(S))} hours a month unless the line says otherwise.</p>${work}
    <p class="disclaimer">Indicative estimate based on Microsoft Azure retail list prices in GBP for ${esc(regionList)}, retrieved ${esc(priceDate)}. Actual charges depend on configuration, usage, agreement type and discounts. Prices exclude VAT. Not affiliated with Microsoft.</p>
  </section>`);

  $('doc').innerHTML = html.join('');
}

/** Monthly consumption bars: one series, so no legend; values in the tables beside it. */
function chartSvg(months, start) {
  const W = 680, H = 220, pl = 56, pr = 8, pt = 12, pb = 26;
  const max = Math.max(...months, 1);
  const p10 = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = [1, 2, 2.5, 5, 10].map((f) => f * p10).find((v) => v >= max) || max;
  const step = (W - pl - pr) / months.length;
  const bw = Math.max(1, step - 2);
  const y = (v) => pt + (H - pt - pb) * (1 - v / nice);
  const ticks = [0, 0.5, 1].map((f) => nice * f);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly consumption over ${months.length} months, reaching ${gbp(Math.max(...months), 0)} a month" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="10">`;
  ticks.forEach((t) => { s += `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="#D3DAE3" stroke-width="1"/><text x="${pl - 6}" y="${y(t) + 3}" text-anchor="end" fill="#556172">${t >= 1000 ? `£${n(t / 1000)}k` : gbp(t, 0)}</text>`; });
  months.forEach((v, i) => {
    const h = (H - pt - pb) * (v / nice);
    const x = pl + i * step + 1;
    const r = Math.min(3, bw / 2, h / 2);
    if (h > 0) s += `<path d="M${x},${H - pb} V${H - pb - h + r} Q${x},${H - pb - h} ${x + r},${H - pb - h} H${x + bw - r} Q${x + bw},${H - pb - h} ${x + bw},${H - pb - h + r} V${H - pb} Z" fill="#2347B8"><title>${monthLabel(start, i)}: ${gbp(v)}</title></path>`;
  });
  const every = months.length > 24 ? 6 : 3;
  for (let i = 0; i < months.length; i += every) s += `<text x="${pl + i * step + step / 2}" y="${H - 8}" text-anchor="middle" fill="#556172">${monthLabel(start, i)}</text>`;
  return s + '</svg>';
}
