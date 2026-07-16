import { useState } from 'react';

/* ═══ helpers ═══ */
export const DW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
export const MS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
export const MFULL = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

export function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1000000) return (n / 1000000).toFixed(a >= 10000000 ? 0 : 1).replace('.', ',').replace(',0', '') + ' млн';
  if (a >= 1000) return (n / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',').replace(',0', '') + ' тыс';
  return String(Math.round(n));
}
export function fmtFull(n) { return Math.round(n || 0).toLocaleString('ru-RU'); }
export function pct(n, d = 1) { return (n || 0).toFixed(d).replace('.', ',') + '%'; }
export function fmtD(iso) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }
export function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
export function sum(a) { return a.reduce((x, y) => x + y, 0); }
export function groupBy(arr, fn) { const o = {}; arr.forEach(x => { const k = fn(x); (o[k] = o[k] || []).push(x); }); return o; }

/* ═══ Section wrapper ═══ */
export function Panel({ title, hint, children, right, pad = 18 }) {
  return <div className="ios-card" style={{ padding: pad, marginBottom: 16 }}>
    {(title || right) && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: hint ? 4 : 14 }}>
      {title && <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>{title}</div>}
      {right}
    </div>}
    {hint && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.45 }}>{hint}</div>}
    {children}
  </div>;
}

/* ═══ KPI card ═══ */
export function Kpi({ label, value, sub, color, trend }) {
  return <div className="ios-card" style={{ padding: 15 }}>
    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</div>
    <div style={{ fontSize: 23, fontWeight: 800, color: color || 'var(--text-primary)', letterSpacing: -0.5, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.35 }}>{sub}</div>}
    {trend !== undefined && trend !== null && <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 4, color: trend >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(0)}%</div>}
  </div>;
}
export function KpiRow({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10, marginBottom: 16 }}>{children}</div>;
}

/* ═══ Horizontal bar row ═══ */
export function BarRow({ label, value, frac, color = 'var(--accent-blue)', sub, labelW = 62, highlight }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `${labelW}px 1fr auto`, gap: 10, alignItems: 'center', marginBottom: 9 }}>
    <div style={{ fontSize: 12, fontWeight: highlight ? 700 : 600, color: highlight ? color : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
    <div style={{ height: 9, borderRadius: 5, background: 'var(--bg-surface)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(1.5, (frac || 0) * 100)}%`, height: '100%', borderRadius: 5, background: color, transition: 'width .4s cubic-bezier(.25,.1,.25,1)' }} />
    </div>
    <div style={{ fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap', minWidth: 56 }}>
      <strong style={{ color: highlight ? color : 'var(--text-primary)' }}>{value}</strong>
      {sub && <span style={{ color: 'var(--text-muted)' }}> {sub}</span>}
    </div>
  </div>;
}

/* ═══ Area/line chart (SVG) ═══ */
export function AreaChart({ data, color = 'var(--accent-blue)', height = 130, labels, fmt = fmtNum }) {
  const [hover, setHover] = useState(null);
  if (!data || !data.length) return null;
  const max = Math.max(...data, 1), min = 0;
  const W = 600, H = height;
  const pts = data.map((v, i) => [ (i / Math.max(1, data.length - 1)) * W, H - ((v - min) / (max - min || 1)) * (H - 10) - 5 ]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L ${W} ${H} L 0 ${H} Z`;
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  return <div style={{ position: 'relative' }}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)); if (i >= 0 && i < data.length) setHover(i); }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {hover !== null && <>
        <line x1={pts[hover][0]} y1="0" x2={pts[hover][0]} y2={H} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <circle cx={pts[hover][0]} cy={pts[hover][1]} r="4" fill={color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </>}
    </svg>
    {hover !== null && <div style={{ position: 'absolute', top: -4, left: `${(hover / Math.max(1, data.length - 1)) * 100}%`, transform: 'translate(-50%,-100%)', background: 'var(--text-primary)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      {labels ? labels[hover] + ' · ' : ''}{fmt(data[hover])}
    </div>}
  </div>;
}

/* ═══ Hour heatmap (24 cells) ═══ */
export function HourStrip({ values, color = 'var(--accent-blue)', fmt = fmtNum, note }) {
  const max = Math.max(...values.map(v => v.val), 1);
  return <div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2 }}>
      {values.map(v => {
        const f = v.val / max;
        return <div key={v.h} title={`${String(v.h).padStart(2, '0')}:00 — ${fmt(v.val)}${v.n ? ` (${v.n} шт.)` : ''}`}
          style={{ height: 46, borderRadius: 3, background: v.val ? color : 'var(--bg-surface)', opacity: v.val ? 0.18 + f * 0.82 : 1, cursor: 'default' }} />;
      })}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2, marginTop: 4 }}>
      {values.map(v => <div key={v.h} style={{ fontSize: 8, textAlign: 'center', color: 'var(--text-faint)' }}>{v.h % 3 === 0 ? v.h : ''}</div>)}
    </div>
    {note && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>{note}</div>}
  </div>;
}

/* ═══ Insight list ═══ */
export function Insights({ items, tint = 'var(--tint-blue)', border = '#C7DDF8', title = '💡 Выводы и советы' }) {
  if (!items || !items.length) return null;
  return <div className="ios-card" style={{ padding: 18, marginBottom: 16, background: tint, border: `1px solid ${border}` }}>
    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{title}</div>
    {items.map((t, i) => <div key={i} style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: i < items.length - 1 ? 9 : 0, display: 'flex', gap: 8 }}>
      <span style={{ flexShrink: 0, opacity: 0.5 }}>—</span><span dangerouslySetInnerHTML={{ __html: t }} />
    </div>)}
  </div>;
}

/* ═══ Sortable table ═══ */
export function SortTable({ cols, rows, initSort, maxRows }) {
  const [sortKey, setSortKey] = useState(initSort || cols[0].k);
  const [dir, setDir] = useState('desc');
  const [showAll, setShowAll] = useState(false);
  const sorted = [...rows].sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    const r = typeof x === 'number' ? x - y : String(x || '').localeCompare(String(y || ''));
    return dir === 'desc' ? -r : r;
  });
  const lim = showAll || !maxRows ? sorted : sorted.slice(0, maxRows);
  const grid = cols.map(c => c.w || '1fr').join(' ');
  return <>
    <div className="data-table" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: cols.length * 78 }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '8px 4px', borderBottom: '1.5px solid var(--border-light)' }}>
          {cols.map(c => <div key={c.k} onClick={() => { if (sortKey === c.k) setDir(dir === 'desc' ? 'asc' : 'desc'); else { setSortKey(c.k); setDir('desc'); } }}
            style={{ fontSize: 11.5, fontWeight: 600, color: sortKey === c.k ? 'var(--accent-blue)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, cursor: 'pointer', textAlign: c.a || 'left', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {c.l}{sortKey === c.k ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
          </div>)}
        </div>
        {lim.map((r, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '9px 4px', borderBottom: '1px solid var(--border-light)', alignItems: 'center' }}>
          {cols.map(c => <div key={c.k} style={{ fontSize: 12.5, textAlign: c.a || 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: c.wrap ? 'normal' : 'nowrap', color: c.muted ? 'var(--text-secondary)' : 'var(--text-primary)', fontWeight: c.b ? 600 : 400 }}>
            {c.r ? c.r(r) : r[c.k]}
          </div>)}
        </div>)}
      </div>
    </div>
    {maxRows && rows.length > maxRows && <button onClick={() => setShowAll(!showAll)} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '10px 0 0' }}>
      {showAll ? '↑ Свернуть' : `↓ Показать все (${rows.length})`}
    </button>}
  </>;
}

/* ═══ Goal card ═══ */
export function Goal({ icon, title, now, target, unit, note, color }) {
  const p = target ? Math.min(100, (now / target) * 100) : 0;
  return <div className="ios-card" style={{ padding: 15, marginBottom: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>{icon} {title}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{now} → {target}{unit ? ' ' + unit : ''}</div>
    </div>
    <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-surface)', overflow: 'hidden' }}>
      <div style={{ width: `${p}%`, height: '100%', borderRadius: 4, background: color }} />
    </div>
    {note && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.4 }}>{note}</div>}
  </div>;
}
