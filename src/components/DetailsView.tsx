import type { Estimate } from '../engine/types.ts'
import { REGIONS, type RegionId } from '../pricing/types.ts'
import { DEFAULT_EXCLUSIONS } from '../content.ts'
import { NumberInput } from './ui.tsx'

export function DetailsView({ est, update }: { est: Estimate; update: (fn: (e: Estimate) => Estimate) => void }) {
  const set = <K extends keyof Estimate>(k: K, v: Estimate[K]) => update((e) => ({ ...e, [k]: v }))
  const setPartner = (k: keyof Estimate['partner'], v: string | boolean) => update((e) => ({ ...e, partner: { ...e.partner, [k]: v } }))
  const text = (k: 'title' | 'client' | 'preparedBy' | 'version', label: string, help?: string) => (
    <div className="field">
      <label htmlFor={`d-${k}`}>{label}</label>
      <input id={`d-${k}`} className="input" value={est[k]} onChange={(e) => set(k, e.target.value)} aria-describedby={help ? `d-${k}-help` : undefined} />
      {help && (
        <span className="help" id={`d-${k}-help`}>
          {help}
        </span>
      )}
    </div>
  )

  return (
    <>
      <section className="card panel" aria-labelledby="scope-title">
        <h2 id="scope-title">Scope and context</h2>
        <p>Shown on the client pack cover and in every export.</p>
        <div className="form-grid">
          {text('title', 'Estimate title')}
          {text('client', 'Client name', 'Optional. Leave blank for sensitive clients; estimates are saved only in this browser.')}
          {text('preparedBy', 'Prepared by')}
          {text('version', 'Version')}
          <div className="field">
            <label htmlFor="d-status">Status</label>
            <select id="d-status" className="input" value={est.status} onChange={(e) => set('status', e.target.value as Estimate['status'])}>
              <option>Indicative</option>
              <option>Design-stage</option>
              <option>Final</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-confidence">Confidence</label>
            <select id="d-confidence" className="input" value={est.confidence} onChange={(e) => set('confidence', e.target.value)}>
              <option value="±10%">±10% (detailed design)</option>
              <option value="±20%">±20% (design stage)</option>
              <option value="±30%">±30% (early discovery)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-dr">Disaster recovery region</label>
            <select id="d-dr" className="input" value={est.drRegion} onChange={(e) => set('drRegion', e.target.value as RegionId | '')}>
              <option value="">Same as primary</option>
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <span className="help">Lines with environment DR are priced in this region.</span>
          </div>
        </div>
      </section>

      <section className="card panel" aria-labelledby="adjust-title">
        <h2 id="adjust-title">Discount and contingency</h2>
        <p>Both are optional. The list price column is never changed; the discount applies after list price and contingency after that.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="d-discount">Customer discount (EA, MCA or CSP), percent</label>
            <NumberInput id="d-discount" value={est.discountPct} min={0} max={100} step={0.5} onChange={(n) => set('discountPct', n)} />
          </div>
          <div className="field">
            <label htmlFor="d-contingency">Contingency, percent</label>
            <NumberInput id="d-contingency" value={est.contingencyPct} min={0} max={100} step={1} onChange={(n) => set('contingencyPct', n)} />
          </div>
        </div>
      </section>

      <section className="card panel" aria-labelledby="assume-title">
        <h2 id="assume-title">Assumptions and exclusions</h2>
        <p>Standard assumptions (hours model, region, licensing, VAT) are generated for you. Add anything specific to this client, one per line.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="d-assumptions">Additional assumptions</label>
            <textarea id="d-assumptions" className="input" value={est.assumptions} onChange={(e) => set('assumptions', e.target.value)} placeholder="Data volumes taken from the client's Azure Migrate assessment." />
          </div>
          <div className="field">
            <label htmlFor="d-exclusions">Additional exclusions</label>
            <textarea id="d-exclusions" className="input" value={est.exclusions} onChange={(e) => set('exclusions', e.target.value)} placeholder="Backup and Site Recovery." />
            <span className="help">Always excluded: {DEFAULT_EXCLUSIONS.map((x) => x.replace(/\.$/, '')).join('; ')}.</span>
          </div>
        </div>
      </section>

      <section className="card panel" aria-labelledby="partner-title">
        <h2 id="partner-title">Partner and Microsoft notes (internal)</h2>
        <p>Kept out of the client pack unless you choose to include them.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="p-route">ACR attribution route</label>
            <input id="p-route" className="input" value={est.partner.route} onChange={(e) => setPartner('route', e.target.value)} placeholder="Partner Admin Link, CSP" />
          </div>
          <div className="field">
            <label htmlFor="p-opp">Microsoft opportunity ID</label>
            <input id="p-opp" className="input" value={est.partner.opportunityId} onChange={(e) => setPartner('opportunityId', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="p-contacts">Microsoft account team contacts</label>
            <input id="p-contacts" className="input" value={est.partner.contacts} onChange={(e) => setPartner('contacts', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="p-funding">Funding programmes to check</label>
            <input id="p-funding" className="input" value={est.partner.funding} onChange={(e) => setPartner('funding', e.target.value)} placeholder="Check eligibility with the account team" />
          </div>
        </div>
        <label className="toggle" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={est.partner.include} onChange={(e) => setPartner('include', e.target.checked)} />
          <span>Include these notes in the client pack</span>
        </label>
      </section>
    </>
  )
}
