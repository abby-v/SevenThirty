// Display formatting. Rounding happens here only; the engine keeps full precision.

const gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
const gbp4 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 4, maximumFractionDigits: 4 })
const plain = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })

/** Amounts in tables: £1,234.56 */
export const gbp = (n: number) => gbp2.format(n)
/** Headline amounts: £12,340 */
export const gbpWhole = (n: number) => gbp0.format(n)
/** Rates: 4 dp below £1, 2 dp otherwise. */
export const rate = (n: number) => (Math.abs(n) < 1 ? gbp4.format(n) : gbp2.format(n))
export const num = (n: number) => plain.format(n)
export const pct = (n: number) => `${percent.format(n * 100)}%`

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
