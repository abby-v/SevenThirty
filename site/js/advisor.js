// SevenThirty: missing-cost advisor. Reads the estimate and lists the costs that usually come with
// what's already in it (backup and monitoring for VMs, the shared services around a landing zone hub,
// networking and monitoring for AVD, and so on). Pure: no DOM, no storage.
//
// A suggestion is covered when the estimate already has that service (in the same region, for regional
// services), including lines added from the price catalogue. Each suggestion either adds a pre-sized
// item, with the sizing assumption stated, or points at an existing item to edit.
import { SPECS } from './prices.js';
import { defaults } from './services.js';

/** Service ids and the Azure service names that cover them when added from the catalogue. */
const COVER = {
  backup: ['Backup'], la: ['Log Analytics'], sentinel: ['Sentinel'], monitor: ['Azure Monitor', 'Application Insights', 'Network Watcher'],
  defender: ['Microsoft Defender for Cloud'], bas: ['Azure Bastion'], egress: ['Bandwidth'], nat: ['NAT Gateway'], fw: ['Azure Firewall'],
  ddos: ['Azure DDOS Protection'], dns: ['Azure DNS'], kv: ['Key Vault'], pe: [], vnet: [], lb: ['Load Balancer'], agw: ['Application Gateway'],
  pip: [], afd: ['Azure Front Door Service'], acr: ['Container Registry'], blob: [], vpn: ['VPN Gateway'], er: ['ExpressRoute'], vwan: ['Virtual WAN'], vm: ['Virtual Machines'],
};
const cfgOf = (it) => ({ ...(defaults(it.svc) || {}), ...(it.cfg || {}) });
const isSvc = (it, svc) => it.svc === svc || (it.svc === 'generic' && (COVER[svc] || []).includes(it.meta?.svc));
const has = (items, svcs, region, pred) => items.some((it) => svcs.some((s) => isSvc(it, s)) && (!region || it.region === region) && (!pred || it.svc === 'generic' || pred(cfgOf(it))));
const sum = (its, f) => its.reduce((a, it) => a + (Number(f(cfgOf(it))) || 0), 0);
const round1 = (v) => Math.round(v * 10) / 10;
function avdHosts(c) {
  const v = SPECS[c.size]?.[0] || 4;
  return Math.max(1, Math.ceil(Math.ceil(c.users * c.conc / 100) / (v * Number(c.work))));
}

/* A check: id, title, why, scope ('region' or 'any'), covered(items, region, triggers), and either
   add(triggers) -> {svc, cfg, label, note} or edit(triggers, items) -> {uid, label}. */
const C = {
  backup: (why, size) => ({ id: 'backup', title: 'Azure Backup', scope: 'region', why,
    covered: (items, region, tr) => has(items, ['backup'], region) || tr.every((it) => it.svc !== 'vm' || cfgOf(it).backup === 'Yes'),
    add: (tr) => { const vms = sum(tr.filter((it) => it.svc === 'vm' && cfgOf(it).backup !== 'Yes'), (c) => c.count) || 1;
      return { svc: 'backup', label: 'VM backup', cfg: { vms, size, gb: Math.round(vms * size * 1.5), red: 'GRS' }, note: `${vms} VMs at ${size} GB each, storage at 1.5× for retention` }; } }),
  la: (why, gbDay, note) => ({ id: 'la', title: 'Log Analytics workspace', scope: 'any', why,
    covered: (items) => has(items, ['la', 'sentinel']),
    add: (tr) => { const g = Math.max(0.5, round1(gbDay(tr))); return { svc: 'la', label: 'Log Analytics', cfg: { gb: g }, note: `${g} GB/day: ${note}` }; } }),
  defender: (why, servers, sql) => ({ id: 'defender', title: 'Defender for Cloud', scope: 'any', why,
    covered: (items) => has(items, ['defender'], null, (c) => (servers ? c.servers > 0 : true) && (sql ? c.sql > 0 : true)),
    edit: (tr, items) => { const d = items.find((it) => it.svc === 'defender'); return d ? { uid: d.uid, label: servers ? 'No servers are covered in your Defender item' : 'No SQL is covered in your Defender item' } : null; },
    add: (tr) => { const s = servers ? servers(tr) : 0, q = sql ? sql(tr) : 0;
      return { svc: 'defender', label: 'Defender for Cloud', cfg: { servers: s, plan: 'Plan 2', sql: q, stor: 0, arm: servers || sql ? 0 : 1 }, note: [s && `${s} servers, Plan 2`, q && `${q} SQL`, !s && !q && 'Resource Manager for the platform subscription'].filter(Boolean).join(', ') }; } }),
  bas: (why) => ({ id: 'bas', title: 'Azure Bastion', scope: 'region', why, covered: (items, region) => has(items, ['bas'], region),
    add: () => ({ svc: 'bas', label: 'Bastion', cfg: { sku: 'Basic', qty: 1 }, note: 'one Basic host' }) }),
  egress: (why, gb, note) => ({ id: 'egress', title: 'Internet egress', scope: 'any', why, covered: (items) => has(items, ['egress']),
    add: (tr) => { const g = Math.max(100, Math.round(gb(tr))); return { svc: 'egress', label: 'Internet egress', cfg: { gb: g }, note: `${g} GB a month: ${note}` }; } }),
  outbound: (why, gb) => ({ id: 'nat', title: 'Outbound internet (NAT Gateway)', scope: 'region', why,
    covered: (items, region) => has(items, ['nat', 'fw', 'vwan'], region),
    add: (tr) => { const g = Math.max(100, Math.round(gb(tr))); return { svc: 'nat', label: 'NAT Gateway', cfg: { qty: 1, gb: g }, note: `one gateway, ${g} GB processed` }; } }),
  pe: (why, qty, note) => ({ id: 'pe', title: 'Private Endpoints', scope: 'region', why, covered: (items, region) => has(items, ['pe'], region),
    add: (tr) => { const q = Math.max(1, qty(tr)); return { svc: 'pe', label: 'Private Endpoints', cfg: { qty: q, gbin: 50 * q, gbout: 50 * q }, note: `${q} endpoint${q > 1 ? 's' : ''} ${note}, 50 GB each way per endpoint` }; } }),
  kv: (why) => ({ id: 'kv', title: 'Key Vault', scope: 'any', why, covered: (items) => has(items, ['kv']),
    add: () => ({ svc: 'kv', label: 'Key Vault', cfg: { ops: 1, hsm: 0 }, note: '1 million operations a month' }) }),
  monitor: (why, cfg, note) => ({ id: 'monitor', title: 'Azure Monitor', scope: 'any', why, covered: (items) => has(items, ['monitor']),
    add: (tr) => ({ svc: 'monitor', label: 'Azure Monitor', cfg: cfg(tr), note }) }),
  acr: (why) => ({ id: 'acr', title: 'Container Registry', scope: 'any', why, covered: (items) => has(items, ['acr']),
    add: () => ({ svc: 'acr', label: 'Container Registry', cfg: { tier: 'Standard', qty: 1, gb: 50 }, note: 'one Standard registry, 50 GB' }) }),
  storage: (why, gb, note) => ({ id: 'blob', title: 'Storage account', scope: 'region', why, covered: (items, region) => has(items, ['blob'], region),
    add: (tr) => { const g = Math.max(10, Math.round(gb(tr))); return { svc: 'blob', label: 'Storage account', cfg: { tier: 'Hot', red: 'LRS', gb: g, w: 1, rd: 1 }, note: `${g} GB Hot LRS ${note}` }; } }),
};

/** Groups: what triggers them and which checks apply. Order is the order shown. */
const GROUPS = [
  { id: 'lz', label: 'Landing zone hub', when: (it) => ['vwan', 'fw', 'vpn', 'er'].includes(it.svc), checks: [
    { id: 'fw', title: 'Azure Firewall', scope: 'region', why: 'Hub traffic between spokes, on-premises and the internet usually goes through a firewall (a secured hub in Virtual WAN).',
      covered: (items, region) => has(items, ['fw'], region),
      add: (tr) => { const hubs = sum(tr.filter((it) => it.svc === 'vwan'), (c) => c.hubs) || 1; return { svc: 'fw', label: 'Hub firewall', cfg: { sku: 'Standard', qty: hubs, gb: 1000 * hubs }, note: `${hubs} Standard firewall${hubs > 1 ? 's' : ''}, 1,000 GB processed each` }; } },
    { id: 'dp', title: 'Virtual WAN hub data processing', scope: 'region', why: 'Traffic through a Virtual WAN hub is charged per GB, and this hub has none costed.',
      covered: (items, region, tr) => tr.every((it) => it.svc !== 'vwan' || cfgOf(it).gb > 0),
      edit: (tr) => { const v = tr.find((it) => it.svc === 'vwan' && !(cfgOf(it).gb > 0)); return v ? { uid: v.uid, label: 'Set the GB processed in the hub' } : null; } },
    { id: 'peer', title: 'VNet peering', scope: 'region', why: 'In hub and spoke, every GB between a spoke and the hub is charged at both ends of the peering.',
      covered: (items, region, tr) => has(items, ['vnet', 'vwan'], region) || tr.every((it) => it.svc === 'vwan'),
      add: () => ({ svc: 'vnet', label: 'Hub-spoke peering', cfg: { intra: 1000, glob: 0 }, note: '1,000 GB a month between spokes and hub' }) },
    { id: 'ddos', title: 'DDoS Protection', scope: 'any', why: 'Public IPs on the hub, firewall and gateways are often covered by DDoS Protection; IP Protection is cheaper below about 15 IPs.',
      covered: (items) => has(items, ['ddos']),
      add: (tr, items) => { const ips = Math.max(2, sum(items.filter((it) => it.svc === 'pip'), (c) => c.qty)); return { svc: 'ddos', label: 'DDoS Protection', cfg: { mode: 'IP Protection', ips }, note: `IP Protection for ${ips} public IPs` }; } },
    { id: 'dns', title: 'Private DNS and DNS Private Resolver', scope: 'region', why: 'Private endpoints need private DNS zones, and on-premises needs a resolver to look them up.',
      covered: (items, region) => has(items, ['dns'], region, (c) => c.rin > 0 || c.rout > 0),
      edit: (tr, items, region) => { const d = items.find((it) => it.svc === 'dns' && it.region === region); return d ? { uid: d.uid, label: 'Your Azure DNS item has no Private Resolver endpoints' } : null; },
      add: () => ({ svc: 'dns', label: 'Private DNS and resolver', cfg: { pub: 0, priv: 10, pq: 0, vq: 20, rin: 1, rout: 1, rs: 1 }, note: '10 private zones, one inbound and one outbound endpoint' }) },
    C.la('Firewall, gateway, activity and diagnostic logs go to a central workspace. A Standard firewall alone can log several GB a day.', () => 5, 'firewall, gateway and platform logs'),
    C.monitor('Flow logs, traffic analytics and alert rules for the hub.', () => ({ ai: 0, metric: 30, logal: 10, flow: 200, ta: 'Yes', web: 0 }), 'VNet flow logs (200 GB) with traffic analytics, 30 metric and 10 log alerts'),
    C.bas('Administrators need a way into VMs without public IPs.'),
    C.defender('Defender for Resource Manager and foundational posture management are usually switched on across the platform subscriptions.', null, null),
    C.kv('Certificates, secrets and keys for the platform, such as firewall TLS inspection or gateway certificates.'),
    C.egress('Traffic leaving Azure to the internet through the hub.', () => 500, 'outbound from the hub'),
  ] },
  { id: 'vm', label: 'Virtual machines', when: (it) => it.svc === 'vm', checks: [
    { id: 'disks', title: 'Data disks', scope: 'item', why: 'These VMs only have OS disks costed. Apps and databases normally store data on separate managed disks.',
      covered: (items, region, tr) => tr.every((it) => cfgOf(it).ddisk !== 'none'),
      edit: (tr) => { const v = tr.find((it) => cfgOf(it).ddisk === 'none'); return v ? { uid: v.uid, label: 'Add data disks under More options' } : null; } },
    C.backup('No backup is costed for these VMs. Production servers almost always need it.', 200),
    C.la('Azure Monitor Agent sends performance counters and event logs to a workspace.', (tr) => sum(tr, (c) => c.count) * 0.3, 'about 0.3 GB a day per server'),
    C.defender('Defender for Servers is billed per VM. Plan 2 includes 500 MB a day of free log ingestion per server.', (tr) => sum(tr, (c) => c.count), null),
    C.bas('Secure RDP and SSH without giving VMs public IPs.'),
    C.outbound('VMs without public IPs need a NAT Gateway or firewall for outbound internet access.', (tr) => sum(tr, (c) => c.count) * 20),
    C.egress('Updates, API calls and users downloading data all leave Azure as egress.', (tr) => sum(tr, (c) => c.count) * 20, 'about 20 GB per VM'),
  ] },
  { id: 'avd', label: 'Azure Virtual Desktop', when: (it) => it.svc === 'avd', checks: [
    C.la('AVD Insights and session host diagnostics need a Log Analytics workspace.', (tr) => sum(tr, (c) => c.users) / 100, 'about 1 GB a day per 100 users'),
    C.defender('Session hosts are servers to Defender: each one is billed while it runs.', (tr) => tr.reduce((a, it) => a + avdHosts(cfgOf(it)), 0), null),
    C.outbound('Session hosts browse the web and reach Microsoft 365; without public IPs they need a NAT Gateway or firewall.', (tr) => sum(tr, (c) => c.users) * 10),
    C.egress('Web browsing, Teams and file downloads from session hosts leave Azure as egress.', (tr) => sum(tr, (c) => c.users) * 10, 'about 10 GB per user'),
    C.pe('FSLogix profile shares are usually reached over a private endpoint.', () => 1, 'for the profile storage account'),
    { id: 'hybrid', title: 'Connection to on-premises', scope: 'any', why: 'Users usually reach on-premises apps and AD DS over VPN or ExpressRoute.',
      covered: (items) => has(items, ['vpn', 'er', 'vwan']),
      add: () => ({ svc: 'vpn', label: 'VPN Gateway', cfg: { sku: 'VpnGw1AZ', qty: 1, s2s: 1 }, note: 'one VpnGw1AZ with one site-to-site tunnel' }) },
  ] },
  { id: 'containers', label: 'Containers', when: (it) => ['aks', 'aca'].includes(it.svc), checks: [
    C.acr('Clusters and container apps pull their images from a registry. Use Premium for private endpoints.'),
    C.la('Container insights and Container Apps environments log to a workspace.', (tr) => sum(tr.filter((it) => it.svc === 'aks'), (c) => c.clusters * (c.sysCount + c.userCount)) * 0.2 + tr.filter((it) => it.svc === 'aca').length, 'about 0.2 GB a day per node'),
    { id: 'ingress', title: 'Load balancer and public IP', scope: 'region', why: 'AKS creates a Standard Load Balancer with a public IP for its services and outbound traffic; both are billed.',
      covered: (items, region, tr) => !tr.some((it) => it.svc === 'aks') || has(items, ['lb', 'agw'], region),
      add: () => ({ svc: 'lb', label: 'AKS load balancer', cfg: { qty: 1, rules: 5, gb: 500 }, note: 'one Standard Load Balancer, 500 GB processed' }) },
    { id: 'pip', title: 'Public IP addresses', scope: 'region', why: 'Ingress and outbound for the cluster need at least one public IP.',
      covered: (items, region, tr) => !tr.some((it) => it.svc === 'aks') || has(items, ['pip', 'nat', 'fw'], region),
      add: () => ({ svc: 'pip', label: 'AKS public IPs', cfg: { qty: 2 }, note: 'two Standard public IPs' }) },
    C.kv('Secrets and certificates for the workloads, mounted through the Key Vault provider.'),
  ] },
  { id: 'db', label: 'Databases', when: (it) => ['sqldb', 'sqlmi', 'pg', 'mysql'].includes(it.svc), checks: [
    C.pe('Production databases are normally reached privately rather than over public endpoints.', (tr) => tr.length, 'one per database server'),
    C.defender('Defender for SQL protects Azure SQL, Managed Instance and open-source databases, billed per server.', null, (tr) => tr.reduce((a, it) => { const c = cfgOf(it); return a + (it.svc === 'pg' || it.svc === 'mysql' ? c.servers : c.dbs); }, 0)),
  ] },
  { id: 'web', label: 'Web apps and APIs', when: (it) => ['app', 'func', 'apim'].includes(it.svc), checks: [
    C.monitor('Application Insights tracks requests, failures and performance; it is billed per GB ingested.', (tr) => ({ ai: Math.max(1, tr.length), metric: 20, logal: 5, web: 2, flow: 0, ta: 'No' }), 'Application Insights, 20 metric and 5 log alerts, 2 availability tests'),
    { id: 'front', title: 'Front Door or Application Gateway', scope: 'any', why: 'Public web apps usually sit behind a WAF.',
      covered: (items, region, tr) => !tr.some((it) => it.svc === 'app') || has(items, ['afd', 'agw']),
      add: () => ({ svc: 'afd', label: 'Front Door', cfg: { tier: 'Standard', qty: 1, req: 10, out: 500 }, note: 'Standard profile, 10 million requests, 500 GB out' }) },
    C.pe('App Service and Functions reach databases and storage privately through private endpoints.', (tr) => tr.length, 'one per app'),
    C.storage('Every function app needs a storage account for its code and state.', () => 10, 'for the function apps'),
    C.kv('App secrets and connection strings belong in Key Vault.'),
  ].map((ck) => ck.id === 'blob' ? { ...ck, covered: (items, region, tr) => !tr.some((it) => it.svc === 'func') || has(items, ['blob'], region) } : ck) },
  { id: 'data', label: 'Data and AI', when: (it) => ['dbx', 'adf', 'aoai'].includes(it.svc), checks: [
    { id: 'shir', title: 'Self-hosted integration runtime VMs', scope: 'region', why: 'The self-hosted runtime runs on VMs you pay for, usually two for resilience.',
      covered: (items, region, tr) => !tr.some((it) => it.svc === 'adf' && cfgOf(it).rt === 'sh') || has(items, ['vm'], region),
      add: () => ({ svc: 'vm', label: 'Integration runtime VMs', cfg: { size: 'Standard_D4s_v5', count: 2, os: 'Windows', osdisk: 'P10' }, note: 'two D4s v5 Windows VMs' }) },
    C.storage('Databricks and Data Factory read and write a data lake.', () => 1000, 'data lake'),
    C.outbound('Databricks clusters without public IPs need a NAT Gateway for outbound traffic.', () => 200),
    C.pe('Workspaces, the data lake and Azure OpenAI are usually reached privately.', (tr) => tr.length + 1, 'for the workspaces and data lake'),
    C.kv('Connection secrets for pipelines and notebooks.'),
  ].map((ck) => ck.id === 'nat' ? { ...ck, covered: (items, region, tr) => !tr.some((it) => it.svc === 'dbx') || has(items, ['nat', 'fw', 'vwan'], region) }
    : ck.id === 'blob' ? { ...ck, covered: (items, region, tr) => !tr.some((it) => it.svc === 'dbx' || it.svc === 'adf') || has(items, ['blob'], region) } : ck) },
];

/**
 * Suggestions for an estimate. items: estimate items; dismissed: ids marked not needed.
 * Returns {open, dismissed}: each {id, group, groupLabel, region, title, why, add|edit}.
 */
function advise(items, dismissed = []) {
  const out = [];
  const gone = new Set(dismissed);
  for (const g of GROUPS) {
    const triggers = items.filter(g.when);
    if (!triggers.length) continue;
    const regions = [...new Set(triggers.map((it) => it.region))];
    for (const ck of g.checks) {
      const scopes = ck.scope === 'any' ? [null] : regions;
      for (const region of scopes) {
        const tr = region ? triggers.filter((it) => it.region === region) : triggers;
        if (ck.covered(items, region, tr)) continue;
        const where = region || tr[0].region;
        const s = { id: `${g.id}:${ck.id}${region ? ':' + region : ''}`, group: g.id, groupLabel: g.label, region: where, title: ck.title, why: ck.why };
        const ed = ck.edit && ck.edit(tr, items, region);
        if (ed) s.edit = ed;
        else if (ck.add) { const a = ck.add(tr, items); s.add = { svc: a.svc, region: where, label: a.label, cfg: { ...defaults(a.svc), ...a.cfg } }; s.note = a.note; }
        else continue;
        // The same service can be suggested by several groups (Log Analytics for VMs and for AVD): keep the first.
        if (out.some((o) => o.add && s.add && o.add.svc === s.add.svc && (ck.scope === 'any' || o.region === s.region))) continue;
        if (out.some((o) => o.edit && s.edit && o.edit.uid === s.edit.uid && o.title === s.title)) continue;
        out.push(s);
      }
    }
  }
  return { open: out.filter((s) => !gone.has(s.id)), dismissed: out.filter((s) => gone.has(s.id)) };
}

export { advise, GROUPS };
