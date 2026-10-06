import { useState } from 'react'
import { hoursLabel } from '../content.ts'
import type { EstimateResult } from '../engine/estimate.ts'
import { formatDate, gbp, gbpWhole, pct } from '../engine/format.ts'
import type { Estimate } from '../engine/types.ts'
import { regionName, type Snapshot } from '../pricing/types.ts'
import { Commitments } from './Commitments.tsx'

type View = 'group' | 'env' | 'family'

interface Props {
  est: Estimate
  result: EstimateResult
  snap: Snapshot | undefined
  ahb: boolean
  onAhb: (v: boolean) => void
  actions: React.ReactNode
}

export function Summary({ est, result, snap, ahb, onAhb, actions }: Props) {
  const [view, setView] = useState<View>('group')
  const breakdown = view === 'group' ? result.byGroup : view === 'env' ? result.byEnv : result.byFamily
  const standingShare = result.list ? result.standing / result.list : 0

  return (
    <aside className="aside" id="summary" aria-label="Estimate summary" tabIndex={-1}>
      <div className="card summary">
        <h2>Monthly run rate</h2>
        <p className="headline num">{gbpWhole(result.monthly)}</p>
        <p className="headline-sub">
          per month · {regionName(est.region)} · {est.hours} h model
        </p>

        <dl className="stats">
          <div className="stat">
            <dt>Annual</dt>
            <dd className="num">{gbpWhole(result.annual)}</dd>
          </div>
          <div className="stat">
            <dt>{est.termMonths} months over ramp</dt>
            <dd className="num">{gbpWhole(result.termTotal)}</dd>
          </div>
        </dl>

        <div>
          <div className="split-bar" role="img" aria-label={`Standing ${pct(standingShare)}, usage ${pct(1 - standingShare)}`}>
            <div className="s" style={{ width: `${standingShare * 100}%` }} />
            <div className="u" style={{ width: `${(1 - standingShare) * 100}%` }} />
          </div>
          <div className="split-legend num">
            <span>
              <strong>Standing</strong> {gbp(result.standing)}
            </span>
            <span>
              <strong>Usage</strong> {gbp(result.usage)}
            </span>
          </div>
          <p className="help" style={{ margin: '4px 0 0' }}>
            Standing charges bill while resources exist. Usage charges scale with traffic and transactions.
          </p>
        </div>

        {(result.discount > 0 || result.contingency > 0) && (
          <div className="section">
            <table className="kv">
              <tbody>
                <tr>
                  <th scope="row">List price</th>
                  <td className="num">{gbp(result.list)}</td>
                </tr>
                {result.discount > 0 && (
                  <tr>
                    <th scope="row">Customer discount ({est.discountPct}%)</th>
                    <td className="num">−{gbp(result.discount)}</td>
                  </tr>
                )}
                {result.contingency > 0 && (
                  <tr>
                    <th scope="row">Contingency ({est.contingencyPct}%)</th>
                    <td className="num">{gbp(result.contingency)}</td>
                  </tr>
                )}
                <tr className="total">
                  <th scope="row">Monthly total</th>
                  <td className="num">{gbp(result.monthly)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Breakdown</h3>
            <label className="sr-only" htmlFor="breakdown-view">
              Group breakdown by
            </label>
            <select id="breakdown-view" className="input" style={{ width: 'auto' }} value={view} onChange={(e) => setView(e.target.value as View)}>
              <option value="group">By workload</option>
              <option value="env">By environment</option>
              <option value="family">By service family</option>
            </select>
          </div>
          <table className="kv">
            <tbody>
              {breakdown.map((b) => (
                <tr key={b.key}>
                  <th scope="row">{b.key}</th>
                  <td className="num">{gbp(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.discount + result.contingency > 0 && <p className="help">Breakdown at list price.</p>}
        </div>

        <details className="section">
          <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: 13 }}>Commitment options</summary>
          <div style={{ marginTop: 10 }}>
            <Commitments result={result} ahb={ahb} onAhb={onAhb} compact />
          </div>
        </details>

        {result.unavailable > 0 && (
          <p className="warning">
            <span aria-hidden="true">⚠</span>
            <span>
              {result.unavailable} {result.unavailable === 1 ? 'line has' : 'lines have'} no rate in this snapshot and {result.unavailable === 1 ? 'is' : 'are'} excluded.
            </span>
          </p>
        )}

        <div className="section">
          <h3>Export and share</h3>
          <div className="actions">{actions}</div>
        </div>

        <p className="meta-line">
          {snap ? (
            <>
              Prices retrieved {formatDate(snap.retrievedAt)}
              {snap.source === 'sample' && ' (sample data)'}. {hoursLabel(est.hours)}. GBP, excluding VAT.
            </>
          ) : (
            'Loading prices…'
          )}
        </p>
      </div>
    </aside>
  )
}
