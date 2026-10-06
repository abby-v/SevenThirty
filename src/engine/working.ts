// Renders a line's working as plain text, e.g. "2 × £0.0037/h × 730 h = £5.40".

import { gbp, num, rate } from './format.ts'
import type { Line } from './types.ts'

const perLabel = { '10k': '10K', '1m': '1M' }

export function workingText(line: Line): string {
  const w = line.working
  if (line.unavailable || !w) return 'Rate unavailable in this price snapshot'
  const total = gbp(line.amount)
  switch (w.t) {
    case 'hourly':
      return `${num(w.qty)} × ${rate(w.rate)}/h × ${num(w.hours)} h = ${total}`
    case 'monthly': {
      const noun = w.noun ? ` ${w.noun}` : ''
      if (w.segments.length <= 1) {
        const r = w.segments[0]?.rate ?? 0
        return `${num(w.qty)}${noun} × ${rate(r)}/month = ${total}`
      }
      return `${w.segments.map((s) => `${num(s.qty)}${noun} × ${rate(s.rate)}/month`).join(' + ')} = ${total}`
    }
    case 'gb': {
      const free = w.free ? `${num(w.free.gb)} GB free (${w.free.label})` : ''
      const parts = w.segments.map((s) => (s.rate === 0 ? `${num(s.gb)} GB free tier` : `${num(s.gb)} GB × ${rate(s.rate)}/GB`))
      const all = [free, ...parts].filter(Boolean)
      if (!all.length) return `0 GB = ${total}`
      return `${all.join(' + ')} = ${total}`
    }
    case 'count': {
      const per = perLabel[w.per]
      const parts = w.segments.map((s) => `${num(s.units)} × ${per} ${w.noun} × ${rate(s.rate)}/${per}`)
      if (!parts.length) return `0 ${w.noun} = ${total}`
      return `${parts.join(' + ')} = ${total}`
    }
    case 'manual':
      return `User-entered amount = ${total}`
  }
}
