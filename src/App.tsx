import { useEffect, useMemo, useRef, useState } from 'react'
import { DetailsView } from './components/DetailsView.tsx'
import { EstimateView } from './components/EstimateView.tsx'
import { HoursControl } from './components/HoursControl.tsx'
import { PackView } from './components/PackView.tsx'
import { RampView } from './components/RampView.tsx'
import { SavedDialog } from './components/SavedDialog.tsx'
import { Summary } from './components/Summary.tsx'
import { LiveAnnouncer, Logo, Toast } from './components/ui.tsx'
import { useToast } from './components/useToast.ts'
import { priceEstimate } from './engine/estimate.ts'
import { formatDate, gbp, gbpWhole } from './engine/format.ts'
import type { Estimate } from './engine/types.ts'
import { toExcel } from './exports/excel.ts'
import { download, fileSlug, toCsv, toMarkdown } from './exports/text.ts'
import { REGIONS, type RegionId } from './pricing/types.ts'
import { emptyEstimate } from './state/presets.ts'
import { decodeShare, loadCurrent, saveCurrent, saveNamed, shareUrl } from './state/storage.ts'
import { useSnapshots } from './state/useSnapshots.ts'

type Tab = 'estimate' | 'ramp' | 'pack' | 'details'
const TABS: { id: Tab; label: string }[] = [
  { id: 'estimate', label: 'Estimate' },
  { id: 'ramp', label: 'Ramp and ACR forecast' },
  { id: 'pack', label: 'Client pack' },
  { id: 'details', label: 'Details and assumptions' },
]

export default function App() {
  const [est, setEst] = useState<Estimate>(() => loadCurrent() ?? emptyEstimate())
  const [tab, setTab] = useState<Tab>('estimate')
  const [ahb, setAhb] = useState(true)
  const [savedOpen, setSavedOpen] = useState(false)
  const [toast, showToast] = useToast()
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ estimate: null, ramp: null, pack: null, details: null })

  const update = (fn: (e: Estimate) => Estimate) => setEst((e) => fn(e))

  // Open an estimate from a share link, then clear the fragment so edits are not confused with the link.
  useEffect(() => {
    const open = () => {
      const m = window.location.hash.match(/^#e=(.+)$/)
      if (!m) return
      decodeShare(m[1])
        .then((e) => {
          setEst(e)
          setTab('estimate')
          showToast('Opened the shared estimate')
        })
        .catch(() => showToast('That share link could not be read. It may be incomplete.'))
        .finally(() => history.replaceState(null, '', window.location.pathname + window.location.search))
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => saveCurrent(est), 400)
    return () => clearTimeout(t)
  }, [est])

  const regions: RegionId[] = [est.region, ...(est.drRegion ? [est.drRegion] : [])]
  const { snaps, error } = useSnapshots(regions)
  const snap = snaps[est.region]
  const result = useMemo(() => priceEstimate(est, snaps), [est, snaps])
  const sample = Object.values(snaps).some((s) => s?.source === 'sample')

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(done)
    } catch {
      showToast('Copy failed. Your browser blocked clipboard access.')
    }
  }

  const actions = (
    <>
      <button type="button" className="btn" onClick={() => copy(toMarkdown(est, result, snap), 'Markdown table copied')}>
        Copy as Markdown table
      </button>
      <button type="button" className="btn" onClick={() => download(`${fileSlug(est)}.csv`, toCsv(est, result, snap), 'text/csv;charset=utf-8')}>
        Download CSV
      </button>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          showToast('Building workbook…')
          const buf = await toExcel(est, result, snap, ahb)
          download(`${fileSlug(est)}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          showToast('Workbook downloaded')
        }}
      >
        Download Excel workbook
      </button>
      <button type="button" className="btn" onClick={async () => copy(await shareUrl(est), 'Share link copied. It contains the whole estimate.')}>
        Copy share link
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          saveNamed(est)
          showToast(`Saved “${est.title}” in this browser`)
        }}
      >
        Save in this browser
      </button>
      <button type="button" className="btn ghost" onClick={() => setSavedOpen(true)}>
        Open saved
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          if (!est.items.length || confirm('Start a new estimate? The current one is replaced. Save it first if you need it.')) {
            setEst(emptyEstimate())
            setTab('estimate')
          }
        }}
      >
        New estimate
      </button>
    </>
  )

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null
    if (n === null) return
    e.preventDefault()
    const next = TABS[(n + TABS.length) % TABS.length].id
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to estimate
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="./" aria-label="SevenThirty home">
            <Logo />
            <span>
              <span className="brand-name">SevenThirty</span>
              <br />
              <span className="brand-tag">Azure cost estimates in £, with the working shown</span>
            </span>
          </a>
          <div className="controls">
            <label className="control" htmlFor="region">
              Region
              <select id="region" className="input" style={{ width: 'auto' }} value={est.region} onChange={(e) => update((x) => ({ ...x, region: e.target.value as RegionId }))}>
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="control">
              <span aria-hidden="true">Hours per month</span>
              <HoursControl hours={est.hours} onChange={(h) => update((x) => ({ ...x, hours: h }))} />
            </div>
          </div>
        </div>
      </header>

      <div className="shell">
        {sample && (
          <div className="banner" role="note">
            <strong>Sample rates.</strong> This build is using development sample data, not Microsoft prices. Run <code>npm run prices</code> (or the
            scheduled pricing workflow) to load live GBP rates from the Azure Retail Prices API.
          </div>
        )}
        {error && (
          <div className="banner" role="alert">
            <strong>Prices did not load.</strong> {error}
          </div>
        )}

        <div className="tabs" role="tablist" aria-label="Estimate views">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="main"
              tabIndex={tab === t.id ? 0 : -1}
              className="tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={tab === 'pack' ? undefined : 'layout'}>
          <main id="main" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
            <h1 className="sr-only">{est.title}</h1>
            {tab === 'estimate' && <EstimateView est={est} result={result} update={update} />}
            {tab === 'ramp' && <RampView est={est} result={result} update={update} />}
            {tab === 'pack' && <PackView est={est} result={result} snap={snap} ahb={ahb} onAhb={setAhb} />}
            {tab === 'details' && <DetailsView est={est} update={update} />}
          </main>
          {tab !== 'pack' && <Summary est={est} result={result} snap={snap} ahb={ahb} onAhb={setAhb} actions={actions} />}
        </div>
        {tab === 'pack' && (
          <div className="actions no-print" style={{ marginTop: 20 }}>
            {actions}
          </div>
        )}
      </div>

      <div className="bottom-bar no-print" aria-hidden={tab === 'pack'}>
        <span className="total num">
          {gbpWhole(result.monthly)} <span className="help">a month</span>
        </span>
        <span className="help num">{gbpWhole(result.annual)} a year</span>
        <a className="btn small" href="#summary">
          Summary
        </a>
      </div>

      <footer className="footer">
        <p>
          SevenThirty is an independent tool for Azure consultants and is not affiliated with or endorsed by Microsoft. Prices are Microsoft retail list prices in GBP from
          the Azure Retail Prices API{snap ? `, retrieved ${formatDate(snap.retrievedAt)}` : ''}, excluding VAT. Every line shows quantity × rate × hours or GB, so you
          can check it against the official calculator.
        </p>
        <p>No sign-in, no tracking. Estimates are stored only in your browser unless you copy a share link.</p>
      </footer>

      <LiveAnnouncer message={`Monthly total ${gbp(result.monthly)}, annual ${gbp(result.annual)}`} />
      <Toast message={toast} />
      <SavedDialog
        open={savedOpen}
        onClose={() => setSavedOpen(false)}
        onOpen={(e) => {
          setEst(e)
          setSavedOpen(false)
          showToast(`Opened “${e.title}”`)
        }}
      />
    </>
  )
}
