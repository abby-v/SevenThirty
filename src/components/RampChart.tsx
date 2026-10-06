import { monthDate } from '../engine/estimate.ts'
import { gbp, gbpWhole } from '../engine/format.ts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Monthly consumption bars with a dashed cumulative line on its own scale. */
export function RampChart({ forecast, startMonth, title }: { forecast: number[]; startMonth: string; title: string }) {
  const W = 760
  const H = 260
  const pad = { l: 64, r: 70, t: 14, b: 34 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const maxM = Math.max(1, ...forecast)
  const cum = forecast.reduce<number[]>((a, v) => [...a, (a[a.length - 1] ?? 0) + v], [])
  const maxC = Math.max(1, cum[cum.length - 1] ?? 1)
  const bw = iw / Math.max(1, forecast.length)
  const label = (i: number) => {
    const d = monthDate(startMonth, i)
    return `${MONTHS[d.month0]} ${String(d.year).slice(-2)}`
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const step = Math.ceil(forecast.length / 12)
  const summary = `${title}. Month 1 ${gbp(forecast[0] ?? 0)}, final month ${gbp(forecast[forecast.length - 1] ?? 0)}, cumulative ${gbp(maxC)} over ${forecast.length} months.`

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={pad.t + ih * (1 - t)} y2={pad.t + ih * (1 - t)} />
            <text x={pad.l - 6} y={pad.t + ih * (1 - t) + 4} textAnchor="end">
              {gbpWhole(maxM * t)}
            </text>
            <text x={W - pad.r + 6} y={pad.t + ih * (1 - t) + 4}>
              {gbpWhole(maxC * t)}
            </text>
          </g>
        ))}
        {forecast.map((v, i) => (
          <rect key={i} className="bar" x={pad.l + i * bw + bw * 0.15} width={bw * 0.7} y={pad.t + ih * (1 - v / maxM)} height={(ih * v) / maxM}>
            <title>
              Month {i + 1} ({label(i)}): {gbp(v)}, cumulative {gbp(cum[i])}
            </title>
          </rect>
        ))}
        <polyline className="cum" points={cum.map((c, i) => `${pad.l + i * bw + bw / 2},${pad.t + ih * (1 - c / maxC)}`).join(' ')} />
        {forecast.map((_, i) =>
          i % step === 0 ? (
            <text key={i} x={pad.l + i * bw + bw / 2} y={H - 12} textAnchor="middle">
              {label(i)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="legend">
        <span>
          <i style={{ background: 'var(--chart-bar)' }} />
          Monthly consumption (left axis)
        </span>
        <span>
          <i style={{ borderTop: '3px dashed var(--chart-line)', height: 0 }} />
          Cumulative total (right axis)
        </span>
      </figcaption>
    </figure>
  )
}
