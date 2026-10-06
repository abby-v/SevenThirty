import { useState } from 'react'
import { defaultAssumptions, disclaimer, exclusions, hoursLabel } from '../content.ts'
import { commitmentScenarios, hasCommitEligible, type Breakdown, type EstimateResult } from '../engine/estimate.ts'
import { formatDate, gbp, gbpWhole, pct } from '../engine/format.ts'
import type { Estimate } from '../engine/types.ts'
import { workingText } from '../engine/working.ts'
import { regionName, type Snapshot } from '../pricing/types.ts'
import { Commitments } from './Commitments.tsx'
import { RampChart } from './RampChart.tsx'

interface Props {
  est: Estimate
  result: EstimateResult
  snap: Snapshot | undefined
  ahb: boolean
  onAhb: (v: boolean) => void
}

function BreakdownTable({ title, rows, list }: { title: string; rows: Breakdown[]; list: number }) {
  return (
    <table className="table">
      <caption style={{ textAlign: 'left', fontWeight: 650, padding: '6px 0' }}>{title}</caption>
      <thead>
        <tr>
          <th scope="col">{title.replace('By ', '').replace(/^./, (c) => c.toUpperCase())}</th>
          <th scope="col" className="r">
            Monthly
          </th>
          <th scope="col" className="r">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="r num">{gbp(r.total)}</td>
            <td className="r num">{list ? pct(r.total / list) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function PackView({ est, result, snap, ahb, onAhb }: Props) {
  const scenarios = commitmentScenarios(result, ahb)
  const payg = scenarios[0]
  const best = scenarios.reduce((a, s) => (s.monthly < a.monthly ? s : a), payg)
  const regions = [regionName(est.region), est.drRegion && est.items.some((i) => i.env === 'DR') ? `${regionName(est.drRegion)} (DR)` : ''].filter(Boolean).join(', ')
  const [today] = useState(() => formatDate(new Date().toISOString()))
  const standingShare = result.list ? result.standing / result.list : 0

  const drivers = result.drivers.filter((d) => d.total > 0)
  const driverText = drivers.length
    ? `The largest costs are ${drivers.map((d) => `${d.name} (${gbpWhole(d.total)} a month, ${pct(d.share)})`).join(', ')}.`
    : ''

  return (
    <>
      <div className="pack-toolbar no-print">
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <span className="help">Uses your browser’s print dialog. Choose “Save as PDF” for a tagged, accessible PDF. Edit cover details on the Details tab.</span>
      </div>

      <article className="pack" aria-label="Client pack preview">
        <header className="cover">
          <p style={{ margin: 0, color: '#0b6e66', fontWeight: 700, letterSpacing: '0.04em', fontSize: 13 }}>AZURE COST ESTIMATE</p>
          <h1>{est.title}</h1>
          {est.client && <p style={{ fontSize: 18, margin: 0 }}>Prepared for {est.client}</p>}
          <dl>
            <dt>Prepared by</dt>
            <dd>{est.preparedBy || '—'}</dd>
            <dt>Version and date</dt>
            <dd>
              {est.version}, {today}
            </dd>
            <dt>Status</dt>
            <dd>{est.status}</dd>
            <dt>Regions</dt>
            <dd>{regions}</dd>
            <dt>Currency and price basis</dt>
            <dd>GBP, Microsoft retail list price, pay-as-you-go unless stated</dd>
            <dt>Price date</dt>
            <dd>{snap ? formatDate(snap.retrievedAt) : '—'}</dd>
          </dl>
        </header>

        <section>
          <h2>Executive summary</h2>
          <div className="kpis">
            <div className="kpi">
              <span>Monthly run rate</span>
              <strong className="num">{gbpWhole(result.monthly)}</strong>
            </div>
            <div className="kpi">
              <span>Annual</span>
              <strong className="num">{gbpWhole(result.annual)}</strong>
            </div>
            <div className="kpi">
              <span>{est.termMonths}-month total over ramp</span>
              <strong className="num">{gbpWhole(result.termTotal)}</strong>
            </div>
          </div>
          <p>
            At steady state this design costs about <strong>{gbpWhole(result.monthly)} a month</strong> ({gbpWhole(result.annual)} a year) at list price
            {est.discountPct > 0 ? ` after a ${est.discountPct}% customer discount` : ''}
            {est.contingencyPct > 0 ? `, including ${est.contingencyPct}% contingency` : ''}. Over the {est.termMonths}-month ramp the forecast consumption is{' '}
            <strong>{gbpWhole(result.termTotal)}</strong>.
          </p>
          <p>
            {pct(standingShare)} of the cost ({gbpWhole(result.standing * result.factor)} a month) is standing charges that bill while resources exist; the
            remaining {pct(1 - standingShare)} ({gbpWhole(result.usage * result.factor)}) is usage that flexes with traffic. {driverText}
          </p>
          {hasCommitEligible(result) && best.id !== 'payg' && best.saving > 0 && (
            <p>
              Moving eligible virtual machines to <strong>{best.label.toLowerCase()}</strong> would bring the monthly figure to {gbpWhole(best.monthly)}, a
              saving of {gbpWhole(best.saving)} a month ({pct(best.savingPct)}).
            </p>
          )}
          <p>Estimate confidence: {est.confidence}.</p>
        </section>

        <section>
          <h2>Cost breakdown</h2>
          <BreakdownTable title="By workload" rows={result.byGroup} list={result.list} />
          <BreakdownTable title="By environment" rows={result.byEnv} list={result.list} />
          <BreakdownTable title="By service family" rows={result.byFamily} list={result.list} />
          {(result.discount > 0 || result.contingency > 0) && <p className="help">Breakdowns are at list price before discount and contingency.</p>}
        </section>

        <section>
          <h2>Commitment and licensing options</h2>
          <Commitments result={result} ahb={ahb} onAhb={onAhb} />
        </section>

        <section>
          <h2>Consumption ramp</h2>
          <RampChart forecast={result.forecast} startMonth={est.startMonth} title="Forecast monthly Azure consumption" />
          <table className="table" style={{ marginTop: 12 }}>
            <caption style={{ textAlign: 'left', fontWeight: 650, padding: '6px 0' }}>By Microsoft fiscal year (July to June)</caption>
            <thead>
              <tr>
                <th scope="col">Fiscal year</th>
                <th scope="col" className="r">
                  Consumption
                </th>
              </tr>
            </thead>
            <tbody>
              {result.fiscalYears.map((f) => (
                <tr key={f.label}>
                  <td>
                    {f.label}
                    {f.months < 12 ? ` (${f.months} months)` : ''}
                  </td>
                  <td className="r num">{gbp(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Assumptions</h2>
          <ul>
            {defaultAssumptions(est, result).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <h2>Exclusions</h2>
          <ul>
            {exclusions(est).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <h2>Risks and confidence</h2>
          <ul>
            <li>Confidence level: {est.confidence}.</li>
            {drivers.length > 0 && <li>Inputs to validate first, because they move the total most: {drivers.map((d) => d.name).join(', ')}.</li>}
            <li>{est.contingencyPct > 0 ? `Contingency of ${est.contingencyPct}% included (${gbp(result.contingency)} a month).` : 'No contingency included.'}</li>
            <li>Hours model: {hoursLabel(est.hours)}.</li>
          </ul>
        </section>

        {est.partner.include && (
          <section className="internal">
            <h2>Partner and Microsoft notes</h2>
            <ul>
              {est.partner.route && <li>ACR attribution route: {est.partner.route}</li>}
              {est.partner.opportunityId && <li>Opportunity ID: {est.partner.opportunityId}</li>}
              {est.partner.contacts && <li>Account team: {est.partner.contacts}</li>}
              {est.partner.funding && <li>Funding to check: {est.partner.funding}</li>}
            </ul>
          </section>
        )}

        <section className="page-break">
          <h2>Appendix: line items</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Resource</th>
                  <th scope="col">Charge</th>
                  <th scope="col">Working</th>
                  <th scope="col" className="r">
                    Monthly
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.flatMap((r) =>
                  r.lines.map((l, i) => (
                    <tr key={`${r.item.id}-${i}`}>
                      <td>{i === 0 ? `${r.item.name} (${r.item.group})` : ''}</td>
                      <td>
                        {l.label} <span className="help">· {l.kind}</span>
                      </td>
                      <td className="working">{workingText(l)}</td>
                      <td className="r num">{gbp(l.amount)}</td>
                    </tr>
                  )),
                )}
                <tr className="best">
                  <td colSpan={3}>List price per month</td>
                  <td className="r num">{gbp(result.list)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <p className="disclaimer">{disclaimer(snap, est)}</p>
      </article>
    </>
  )
}
