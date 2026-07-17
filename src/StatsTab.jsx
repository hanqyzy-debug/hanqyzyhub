import { useState, useMemo } from 'react';
import { IGPOSTS, IGSTORIES, IGAUDIENCE, TKDAILY, TKCONTENT, TKHOURLY, TKGENDER, TKGEO, YTDAILY, YTVIDEOS, YTTOTAL, YTAUDIENCE, TGPOSTS, STREAMS } from './statsData.js';
import { DW, MS, MFULL, fmtNum, fmtFull, pct, fmtD, mean, sum, groupBy, Panel, Kpi, KpiRow, BarRow, AreaChart, HourStrip, Insights, SortTable, Goal } from './statsUI.jsx';

const C = { ig: 'var(--accent-pink)', tk: 'var(--accent-indigo)', yt: 'var(--accent-red)', tg: 'var(--accent-cyan)', st: 'var(--accent-green)', pl: 'var(--accent-orange)' };
const PLATFORMS = [
  { id: 'overview', l: 'Обзор', c: 'var(--accent-blue)' },
  { id: 'instagram', l: 'Instagram', c: C.ig },
  { id: 'tiktok', l: 'TikTok', c: C.tk },
  { id: 'youtube', l: 'YouTube', c: C.yt },
  { id: 'telegram', l: 'Telegram', c: C.tg },
  { id: 'streaming', l: 'Стриминги', c: C.st },
  { id: 'plan', l: 'План', c: C.pl },
];
const er = p => (p.r ? (p.l + p.c + p.s + p.rp) / p.r * 100 : 0);
const byMonth = (arr, dk, vk) => { const o = {}; arr.forEach(x => { const d = x[dk]; if (!d) return; const k = d.slice(0, 7); o[k] = (o[k] || 0) + (typeof vk === 'function' ? vk(x) : x[vk]); }); return Object.entries(o).sort((a, b) => a[0].localeCompare(b[0])); };

export default function StatsTab() {
  const [p, setP] = useState('overview');
  const cur = PLATFORMS.find(x => x.id === p);
  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <div style={{ marginBottom: 16 }}>
      <div className="page-title-huge" style={{ fontSize: 32, fontWeight: 800, color: cur.c, letterSpacing: -0.6, lineHeight: 1.05 }}>Статистика</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>01.01.2026 — 15.07.2026 · время везде по МСК</div>
    </div>
    <div className="seg-control" style={{ marginBottom: 18, maxWidth: '100%', overflowX: 'auto' }}>
      {PLATFORMS.map(x => <button key={x.id} onClick={() => setP(x.id)} className={p === x.id ? 'seg-active' : ''}>{x.l}</button>)}
    </div>
    {p === 'overview' && <Overview go={setP} />}
    {p === 'instagram' && <Instagram />}
    {p === 'tiktok' && <TikTok />}
    {p === 'youtube' && <YouTube />}
    {p === 'telegram' && <Telegram />}
    {p === 'streaming' && <Streaming />}
    {p === 'plan' && <Plan />}
  </div>;
}

/* ═══════════ ОБЗОР ═══════════ */
function Overview({ go }) {
  const igV = sum(IGPOSTS.map(x => x.v)), igF = sum(IGAUDIENCE.followers.map(f => f.n));
  const tkV = sum(TKDAILY.map(x => x.v)), ytV = YTTOTAL.v;
  const tgR = sum(TGPOSTS.filter(x => x.date >= '2026').map(x => x.reac));
  const stQ = sum(STREAMS.filter(s => s.usage.includes('Stream')).map(s => s.qty));
  const stR = sum(STREAMS.map(s => s.roy));
  const total = igV + tkV + ytV;

  const rows = [
    { k: 'Instagram', v: igV, n: IGPOSTS.length, c: C.ig, note: `+${fmtNum(igF)} подписчиков` },
    { k: 'YouTube', v: ytV, n: YTVIDEOS.length, c: C.yt, note: `CTR ${pct(YTTOTAL.ctr)}` },
    { k: 'TikTok', v: tkV, n: TKCONTENT.length, c: C.tk, note: `${fmtNum(sum(TKDAILY.map(x => x.pv)))} визитов` },
  ].sort((a, b) => b.v - a.v);
  const mx = rows[0].v;

  // combined monthly views
  const igM = Object.fromEntries(byMonth(IGPOSTS, 'date', 'v'));
  const tkM = Object.fromEntries(byMonth(TKDAILY, 'd', 'v'));
  const ytM = Object.fromEntries(byMonth(YTDAILY, 'd', 'v'));
  const keys = [...new Set([...Object.keys(igM), ...Object.keys(tkM), ...Object.keys(ytM)])].sort();
  const combo = keys.map(k => (igM[k] || 0) + (tkM[k] || 0) + (ytM[k] || 0));

  const ins = [
    `<b>Общий охват — ${fmtNum(total)} просмотров за полгода</b> на трёх видеоплощадках. Это уровень, при котором можно говорить с фестивалями и брендами цифрами, а не «ощущениями».`,
    `<b>YouTube — недооценённый актив.</b> ${fmtNum(ytV)} просмотров всего с ${YTVIDEOS.length} роликов при CTR ${pct(YTTOTAL.ctr)} (норма 4–6%, у тебя выше). При этом ты вкладываешься в него меньше всего — это самый дешёвый рост.`,
    `<b>Отчёт по стримингам неполный — там только март</b> и без части площадок по одному из треков. Смотри вкладку «Стриминги»: там список, что запросить у лейбла. Реальные цифры сверяй в кабинете артиста, а не в роялти-отчёте.`,
    `<b>Три площадки — три разные аудитории.</b> В Instagram больше мужчин, в TikTok 56% женщин, на YouTube ядро 25–44. Один и тот же ролик стоит по-разному подписывать под каждую.`,
  ];

  return <>
    <KpiRow>
      <Kpi label="Просмотры всего" value={fmtNum(total)} sub="IG + YouTube + TikTok" color="var(--accent-blue)" />
      <Kpi label="Подписчики IG" value={'+' + fmtNum(igF)} sub="за 6,5 месяцев" color={C.ig} />
      <Kpi label="Прослушивания" value={fmtNum(stQ)} sub="только март 2026" color={C.st} />
      <Kpi label="Роялти" value={Math.round(stR) + ' €'} sub="только март 2026" color={C.st} />
    </KpiRow>
    <Insights items={ins} />
    <Panel title="Просмотры по месяцам — все площадки" hint="Суммарно Instagram + YouTube + TikTok">
      <AreaChart data={combo} labels={keys.map(k => MS[+k.slice(5) - 1])} color="var(--accent-blue)" />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {keys.map(k => <div key={k} style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{MS[+k.slice(5) - 1]}</div>)}
      </div>
    </Panel>
    <Panel title="Вклад площадок">
      {rows.map(r => <BarRow key={r.k} label={r.k} labelW={78} frac={r.v / mx} value={fmtNum(r.v)} sub={`· ${r.n} шт.`} color={r.c} />)}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Telegram: {TGPOSTS.filter(x => x.date >= '2026').length} постов, {fmtNum(tgR)} реакций (просмотры в экспорт не выгружаются)</div>
    </Panel>
    <Panel title="Куда смотреть дальше" pad={16}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {PLATFORMS.filter(x => x.id !== 'overview').map(x => <button key={x.id} onClick={() => go(x.id)} style={{ padding: '12px 10px', borderRadius: 12, border: '1px solid var(--border-light)', background: '#fff', color: x.c, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{x.l} →</button>)}
      </div>
    </Panel>
  </>;
}

/* ═══════════ INSTAGRAM ═══════════ */
function Instagram() {
  const [v, setV] = useState('posts');
  return <>
    <div className="seg-control" style={{ marginBottom: 16 }}>
      {[{ id: 'posts', l: 'Публикации' }, { id: 'stories', l: 'Сторис' }, { id: 'audience', l: 'Аудитория' }, { id: 'time', l: 'Время' }].map(x =>
        <button key={x.id} onClick={() => setV(x.id)} className={v === x.id ? 'seg-active' : ''}>{x.l}</button>)}
    </div>
    {v === 'posts' && <IgPosts />}
    {v === 'stories' && <IgStories />}
    {v === 'audience' && <IgAudience />}
    {v === 'time' && <IgTime />}
  </>;
}

function IgPosts() {
  const d = IGPOSTS;
  const t = d.reduce((a, p) => ({ v: a.v + p.v, r: a.r + p.r, l: a.l + p.l, f: a.f + p.f, c: a.c + p.c, s: a.s + p.s, rp: a.rp + p.rp }), { v: 0, r: 0, l: 0, f: 0, c: 0, s: 0, rp: 0 });
  const avgEr = mean(d.filter(p => p.r).map(er));
  const months = byMonth(d, 'date', 'v');
  const cnt = byMonth(d, 'date', () => 1);
  const FL = { reel: 'Reels', photo: 'Фото', carousel: 'Карусель' };
  const fmt = Object.entries(groupBy(d, x => x.type)).map(([k, a]) => ({ k, l: FL[k] || k, n: a.length, avg: mean(a.map(x => x.v)), er: mean(a.filter(x => x.r).map(er)) })).sort((a, b) => b.avg - a.avg);
  const B = [{ l: '≤15 с', f: x => x.dur <= 15 }, { l: '16–30 с', f: x => x.dur > 15 && x.dur <= 30 }, { l: '31–60 с', f: x => x.dur > 30 && x.dur <= 60 }, { l: '60+ с', f: x => x.dur > 60 }];
  const durs = B.map(b => { const a = d.filter(x => x.type === 'reel' && x.dur && b.f(x)); return { l: b.l, n: a.length, avg: mean(a.map(x => x.v)) }; }).filter(x => x.n);
  const bestDur = durs.length ? durs.reduce((a, b) => b.avg > a.avg ? b : a) : null;
  const worstDur = durs.length ? durs.reduce((a, b) => b.avg < a.avg ? b : a) : null;
  const savers = [...d].filter(x => x.r > 1000).sort((a, b) => (b.s / b.r) - (a.s / a.r)).slice(0, 3);
  const magnets = [...d].filter(x => x.r > 1000).sort((a, b) => (b.f / b.r) - (a.f / a.r)).slice(0, 3);
  const avgV = mean(d.map(x => x.v));
  const viral = d.filter(x => x.v > avgV * 3);

  const ins = [
    bestDur && worstDur && bestDur.l !== worstDur.l ? `<b>Длинные Reels выигрывают у коротких — и это против общих рекомендаций.</b> Ролики «${bestDur.l}» собирают в среднем ${fmtNum(bestDur.avg)}, «${worstDur.l}» — только ${fmtNum(worstDur.avg)}. Разница ${Math.round(bestDur.avg / Math.max(1, worstDur.avg))}×. Твоя аудитория пришла за содержанием, а не за секундными хуками: не режь истории ради «динамики».` : null,
    `<b>Средний ER ${pct(avgEr)}</b> при норме 2–5% для аккаунтов твоего размера — это верхняя планка. Аудитория живая, а не накрученная: с такими цифрами можно идти к брендам.`,
    viral.length ? `<b>${viral.length} ${viral.length === 1 ? 'ролик выстрелил' : 'роликов выстрелили'}</b> втрое выше среднего. Вирусность не случайность — это повторяемый формат. Разбери их на общие приёмы и делай серию.` : null,
    magnets.length ? `<b>Подписчиков приносит не самое просматриваемое.</b> Лучший по конверсии в подписку — «${magnets[0].t.slice(0, 45)}…»: ${magnets[0].f} подписок с ${fmtNum(magnets[0].r)} охвата. Просмотры — тщеславие, подписки — рост.` : null,
    savers.length ? `<b>Сохранения — сигнал №1 для алгоритма.</b> Чаще всего сохраняют «${savers[0].t.slice(0, 45)}…». Делай больше контента, который хочется вернуться пересмотреть.` : null,
  ].filter(Boolean);

  return <>
    <KpiRow>
      <Kpi label="Просмотры" value={fmtNum(t.v)} sub={`${d.length} публикаций`} color={C.ig} />
      <Kpi label="Охват" value={fmtNum(t.r)} sub={`ср. ${fmtNum(t.r / d.length)} на пост`} />
      <Kpi label="Подписки" value={'+' + fmtNum(t.f)} sub="с публикаций" color="var(--accent-green)" />
      <Kpi label="Средний ER" value={pct(avgEr)} sub="норма 2–5% — ты выше" color="var(--accent-green)" />
    </KpiRow>
    <Insights items={ins} tint="var(--tint-pink)" border="#F8CBD8" />
    <Panel title="Просмотры по месяцам">
      <AreaChart data={months.map(m => m[1])} labels={months.map(m => MS[+m[0].slice(5) - 1])} color={C.ig} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {months.map((m, i) => <div key={m[0]} style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center' }}>{MS[+m[0].slice(5) - 1]}<br /><span style={{ color: 'var(--text-faint)' }}>{cnt[i] ? cnt[i][1] : 0} п.</span></div>)}
      </div>
    </Panel>
    <Panel title="Длительность Reels" hint="Средние просмотры по длине ролика — ключ к формату">
      {durs.map(x => <BarRow key={x.l} label={x.l} labelW={56} frac={x.avg / Math.max(1, bestDur.avg)} value={fmtNum(x.avg)} sub={`· ${x.n} шт.`} color={C.ig} highlight={x.l === bestDur.l} />)}
    </Panel>
    <Panel title="Форматы">
      {fmt.map(f => <BarRow key={f.k} label={f.l} labelW={72} frac={f.avg / Math.max(1, fmt[0].avg)} value={fmtNum(f.avg)} sub={`· ER ${pct(f.er)} · ${f.n} шт.`} color="var(--accent-purple)" />)}
    </Panel>
    <Panel title="Все публикации" hint="Клик по заголовку столбца — сортировка">
      <SortTable maxRows={8} initSort="v" cols={[
        { k: 't', l: 'Название', w: '2fr', r: r => <span title={r.t}>{r.t}{r.url ? <a href={r.url} target="_blank" rel="noopener" style={{ color: 'var(--accent-blue)', marginLeft: 5 }}>↗</a> : null}</span> },
        { k: 'date', l: 'Дата', w: '80px', muted: 1, r: r => fmtD(r.date) },
        { k: 'v', l: 'Просм.', w: '70px', a: 'right', b: 1, r: r => fmtNum(r.v) },
        { k: 'erx', l: 'ER', w: '55px', a: 'right', r: r => pct(er(r)) },
        { k: 'f', l: '+подп.', w: '60px', a: 'right', r: r => '+' + r.f },
        { k: 's', l: 'Сохр.', w: '60px', a: 'right', muted: 1, r: r => fmtNum(r.s) },
      ]} rows={d.map(x => ({ ...x, erx: er(x) }))} />
    </Panel>
    <Panel title="Магниты подписчиков" hint="Конверсия охвата в подписку — что реально растит аккаунт">
      {magnets.map((m, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: i < magnets.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
        <div style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.t}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-green)', whiteSpace: 'nowrap' }}>+{m.f} · {(m.f / m.r * 10000).toFixed(1).replace('.', ',')}/10к</div>
      </div>)}
    </Panel>
  </>;
}

function IgStories() {
  const d = IGSTORIES;
  const t = d.reduce((a, s) => ({ v: a.v + s.v, pv: a.pv + s.pv, rep: a.rep + s.rep, st: a.st + s.st, f: a.f + s.f, lc: a.lc + s.lc }), { v: 0, pv: 0, rep: 0, st: 0, f: 0, lc: 0 });
  const avg = t.v / d.length;
  const mv = {}; d.forEach(s => { const k = s.date.slice(0, 7); (mv[k] = mv[k] || []).push(s.v); });
  const months = Object.entries(mv).sort((a, b) => a[0].localeCompare(b[0])).map(([k, a]) => [k, mean(a), a.length]);
  const mx = Math.max(...months.map(m => m[1]), 1);
  const top = [...d].sort((a, b) => b.v - a.v).slice(0, 5);
  const prof = [...d].filter(s => s.pv).sort((a, b) => b.pv - a.pv).slice(0, 5);
  const cr = t.pv / t.v * 100;
  const ins = [
    `<b>Сторис — твой самый недооценённый канал.</b> ${d.length} сторис дали ${fmtNum(t.pv)} переходов в профиль: каждая ${Math.round(t.v / Math.max(1, t.pv))}-я просмотревшая пара глаз идёт смотреть, кто ты. Конверсия в профиль ${pct(cr)}.`,
    `<b>Ср. ${fmtNum(avg)} просмотров на сторис</b> — это твоё «тёплое ядро», люди, которые следят за тобой ежедневно. Именно им продаются билеты и релизы, а не случайным зрителям Reels.`,
    t.lc > 0 ? `<b>Ссылки работают: ${t.lc} кликов.</b> Каждый анонс концерта и релиза обязан быть в сторис со ссылкой — это прямой путь к билетам.` : `<b>Ссылок в сторис почти нет.</b> Добавляй ссылку в каждый анонс — сторис единственное место, где можно вести напрямую.`,
    `<b>${fmtNum(t.st)} нажатий на стикеры и ${t.rep} ответов.</b> Опросы и вопросы — самый дешёвый способ поднять досматриваемость: алгоритм видит взаимодействие и показывает следующую сторис.`,
  ];
  return <>
    <KpiRow>
      <Kpi label="Сторис" value={d.length} sub={`${fmtNum(t.v)} просмотров`} color={C.ig} />
      <Kpi label="Ср. просмотры" value={fmtNum(avg)} sub="на одну сторис" />
      <Kpi label="Визиты в профиль" value={fmtNum(t.pv)} sub={`конверсия ${pct(cr)}`} color="var(--accent-cyan)" />
      <Kpi label="Подписки · клики" value={`+${t.f} · ${t.lc}`} color="var(--accent-green)" />
    </KpiRow>
    <Insights items={ins} tint="var(--tint-pink)" border="#F8CBD8" />
    <Panel title="Средние просмотры по месяцам" hint="Интерес ядра — не зависит от того, сколько сторис ты выложила">
      {months.map(m => <BarRow key={m[0]} label={MS[+m[0].slice(5) - 1]} labelW={44} frac={m[1] / mx} value={fmtNum(m[1])} sub={`· ${m[2]} шт.`} color={C.ig} />)}
    </Panel>
    <Panel title="Топ по просмотрам">
      <SortTable initSort="v" maxRows={5} cols={[
        { k: 't', l: 'Сторис', w: '2fr' }, { k: 'date', l: 'Дата', w: '80px', muted: 1, r: r => fmtD(r.date) },
        { k: 'v', l: 'Просм.', w: '70px', a: 'right', b: 1, r: r => fmtNum(r.v) },
        { k: 'pv', l: 'В профиль', w: '75px', a: 'right', r: r => r.pv },
      ]} rows={top} />
    </Panel>
    <Panel title="Ведут в профиль" hint="Эти сторис превращают зрителя в подписчика — повторяй их приём">
      {prof.map((s, i) => <BarRow key={i} label={s.t.slice(0, 22)} labelW={130} frac={s.pv / Math.max(1, prof[0].pv)} value={String(s.pv)} color="var(--accent-cyan)" />)}
    </Panel>
  </>;
}

function IgAudience() {
  const a = IGAUDIENCE;
  const tm = sum(a.age.map(x => x.m)), tw = sum(a.age.map(x => x.w));
  const core = [...a.age].sort((x, y) => (y.m + y.w) - (x.m + x.w))[0];
  const mxAge = Math.max(...a.age.map(x => Math.max(x.m, x.w)), 1);
  const fm = byMonth(a.followers, 'd', 'n');
  const totalF = sum(a.followers.map(f => f.n));
  const mxF = Math.max(...fm.map(m => m[1]), 1);
  const best = a.followers.reduce((x, y) => y.n > x.n ? y : x);
  const half = Math.floor(fm.length / 2);
  const h1 = mean(fm.slice(0, half).map(m => m[1])), h2 = mean(fm.slice(half).map(m => m[1]));
  const ru = a.countries[0];
  const foreign = sum(a.countries.slice(1).map(c => c.p));
  const ufa = a.cities.find(c => /Ufa|Уфа/i.test(c.name));
  const msk = a.cities.find(c => /Москва|Moscow/i.test(c.name));
  const ins = [
    `<b>Ядро — ${core.b} лет (${pct(core.m + core.w)}), мужчин ${Math.round(tm)}% против ${Math.round(tw)}% женщин.</b> Это платёжеспособная аудитория, которая ходит на техно-вечеринки сама, а не «за компанию». Билеты и мерч продавать можно смело.`,
    msk && ufa ? `<b>География даёт готовый гастрольный план:</b> Москва ${pct(msk.p)}, Уфа ${pct(ufa.p)}, Петербург ${pct(a.cities.find(c => /Санкт/i.test(c.name))?.p || 0)}. Это три города, где зал соберётся без разогрева — используй как аргумент в переговорах с площадками.` : null,
    `<b>${pct(foreign)} аудитории — вне России</b> (${a.countries.slice(1, 4).map(c => c.name).join(', ')}). Для этно-техно это прямой выход на зарубежные фестивали: башкирское звучание там уникально, а не «ещё одно техно».`,
    `<b>+${fmtNum(totalF)} подписчиков за полгода, ~${Math.round(totalF / a.followers.length)}/день.</b> Темп ${h2 > h1 ? 'растёт 📈 — держи текущую частоту, она работает' : 'замедляется 📉 — нужен новый вирусный формат, смотри вкладку «Публикации»'}.`,
    `<b>Рекорд — ${fmtD(best.d)}: +${fmtNum(best.n)} за сутки.</b> Подними, что выходило в тот день и накануне: это твой самый эффективный контент за полгода.`,
  ].filter(Boolean);
  return <>
    <KpiRow>
      <Kpi label="Новые подписчики" value={'+' + fmtNum(totalF)} sub={`~${Math.round(totalF / a.followers.length)} в день`} color="var(--accent-green)" />
      <Kpi label="Ядро" value={core.b} sub={pct(core.m + core.w) + ' всей аудитории'} color="var(--accent-purple)" />
      <Kpi label="М / Ж" value={`${Math.round(tm)}% / ${Math.round(tw)}%`} />
      <Kpi label="Топ-город" value={a.cities[0].name.split(',')[0]} sub={pct(a.cities[0].p)} color="var(--accent-cyan)" />
    </KpiRow>
    <Insights items={ins} tint="var(--tint-purple)" border="#E3CBF5" />
    <Panel title="Прирост подписчиков по месяцам">
      {fm.map(m => <BarRow key={m[0]} label={MS[+m[0].slice(5) - 1]} labelW={44} frac={m[1] / mxF} value={'+' + fmtNum(m[1])} color="var(--accent-green)" />)}
    </Panel>
    <Panel title="Возраст и пол">
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--accent-blue)', marginRight: 5 }} />Мужчины</span>
        <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--accent-pink)', marginRight: 5 }} />Женщины</span>
      </div>
      {a.age.map(x => <div key={x.b} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 92px', gap: 10, alignItems: 'center', marginBottom: 11 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{x.b}</div>
        <div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-surface)', marginBottom: 3, overflow: 'hidden' }}><div style={{ width: `${x.m / mxAge * 100}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: 4 }} /></div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-surface)', overflow: 'hidden' }}><div style={{ width: `${x.w / mxAge * 100}%`, height: '100%', background: 'var(--accent-pink)', borderRadius: 4 }} /></div>
        </div>
        <div style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--text-secondary)' }}>{pct(x.m)} / {pct(x.w)}</div>
      </div>)}
    </Panel>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 }}>
      <Panel title="Топ городов">
        {a.cities.slice(0, 8).map(c => <BarRow key={c.name} label={c.name.split(',')[0]} labelW={100} frac={c.p / a.cities[0].p} value={pct(c.p)} color="var(--accent-cyan)" />)}
      </Panel>
      <Panel title="Топ стран">
        {a.countries.slice(0, 8).map(c => <BarRow key={c.name} label={c.name} labelW={100} frac={c.p / a.countries[0].p} value={pct(c.p)} color="var(--accent-indigo)" />)}
      </Panel>
    </div>
  </>;
}

function IgTime() {
  const d = IGPOSTS;
  const hp = {}; d.forEach(p => (hp[p.h] = hp[p.h] || []).push(p.v));
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, val: hp[h] ? mean(hp[h]) : 0, n: hp[h] ? hp[h].length : 0 }));
  const solid = hours.filter(x => x.n >= 3);
  const bestH = solid.length ? solid.reduce((a, b) => b.val > a.val ? b : a) : null;
  const dp = {}; d.forEach(p => (dp[p.dow] = dp[p.dow] || []).push(p.v));
  const days = Array.from({ length: 7 }, (_, i) => ({ i, avg: dp[i] ? mean(dp[i]) : 0, n: dp[i] ? dp[i].length : 0 }));
  const mxD = Math.max(...days.map(x => x.avg), 1);
  const bestD = days.filter(x => x.n >= 3).reduce((a, b) => b.avg > a.avg ? b : a, { avg: 0, i: 0, n: 0 });
  const weak = days.filter(x => x.n > 0 && x.avg < mxD * 0.3);
  // stories hours
  const sh = {}; IGSTORIES.forEach(s => (sh[s.h] = sh[s.h] || []).push(s.v));
  const sHours = Array.from({ length: 24 }, (_, h) => ({ h, val: sh[h] ? mean(sh[h]) : 0, n: sh[h] ? sh[h].length : 0 }));
  const ins = [
    bestH ? `<b>Лучший час — ${String(bestH.h).padStart(2, '0')}:00 МСК</b> (${fmtNum(bestH.val)} в среднем, ${bestH.n} публикаций). Ты и так постишь в 16–18, и это подтверждается: вечерний слот перед ужином — твой.` : null,
    bestD.n ? `<b>Лучший день — ${['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'][bestD.i]}</b> (${fmtNum(bestD.avg)} в среднем). Ставь на него самый сильный ролик недели.` : null,
    weak.length ? `<b>Слабые дни: ${weak.map(x => DW[x.i]).join(', ')}</b> — в среднем в разы меньше просмотров. Не трать на них лучший контент: сюда лучше ставить сторис и лёгкие форматы.` : null,
    `<b>Важно:</b> Instagram выгружает время в тихоокеанском поясе — здесь оно уже пересчитано в МСК с учётом перехода на летнее время. Не сверяй с сырым файлом, там сдвиг на 10–11 часов.`,
  ].filter(Boolean);
  return <>
    <Insights items={ins} tint="var(--tint-pink)" border="#F8CBD8" title="🕐 Выводы по времени" />
    <Panel title="Средние просмотры по часу публикации" hint="Насыщенность = средние просмотры. Серые часы — ты в них не публиковала.">
      <HourStrip values={hours} color={C.ig} note={bestH ? `Пик — ${String(bestH.h).padStart(2, '0')}:00 МСК. Рабочее окно: 16:00–18:00.` : null} />
    </Panel>
    <Panel title="По дням недели">
      {days.map(x => <BarRow key={x.i} label={DW[x.i]} labelW={36} frac={x.avg / mxD} value={x.n ? fmtNum(x.avg) : '—'} sub={x.n ? `· ${x.n} п.` : ''} color={C.ig} highlight={x.i === bestD.i && bestD.n >= 3} />)}
    </Panel>
    <Panel title="Сторис: по часу публикации" hint="У сторис другая логика — их смотрят в течение дня, важно попадать в паузы аудитории">
      <HourStrip values={sHours} color="var(--accent-purple)" />
    </Panel>
  </>;
}

/* ═══════════ TIKTOK ═══════════ */
function TikTok() {
  const v = sum(TKDAILY.map(x => x.v)), pv = sum(TKDAILY.map(x => x.pv)), l = sum(TKDAILY.map(x => x.l)), sh = sum(TKDAILY.map(x => x.sh));
  const months = byMonth(TKDAILY, 'd', 'v');
  const active = TKDAILY.filter(x => x.v > 0);
  const mxH = Math.max(...TKHOURLY.map(x => x.a), 1);
  const hours = TKHOURLY.map(x => ({ h: x.h, val: x.a }));
  const peak = TKHOURLY.reduce((a, b) => b.a > a.a ? b : a);
  const low = TKHOURLY.reduce((a, b) => b.a < a.a ? b : a);
  const good = TKHOURLY.filter(x => x.a >= mxH * 0.9).map(x => x.h);
  const top = [...TKCONTENT].sort((a, b) => b.v - a.v);
  const shareRate = sh / Math.max(1, v) * 100;
  const ins = [
    `<b>Твоя аудитория в TikTok активна с ${Math.min(...good)}:00 до ${Math.max(...good) === 23 ? '01' : String(Math.max(...good)).padStart(2, '0')}:00, пик в ${String(peak.h).padStart(2, '0')}:00.</b> Публикуй за 30–60 минут до пика, чтобы первый тестовый показ пришёлся на максимум онлайна. Мёртвая зона — ${String(low.h).padStart(2, '0')}:00.`,
    `<b>${fmtNum(sh)} репостов на ${fmtNum(v)} просмотров (${pct(shareRate, 2)}).</b> Репост — сильнейший сигнал алгоритма TikTok, сильнее лайка. У тебя он высокий: контент пересылают друзьям, это и разгоняет охваты.`,
    `<b>Всего ${TKCONTENT.length} роликов за полгода — и это главный резерв.</b> TikTok устроен как лотерея: каждый ролик — билет. При том же качестве 5–7 публикаций в неделю дадут кратно больше, чем ${TKCONTENT.length} за 6 месяцев.`,
    `<b>${fmtNum(pv)} визитов в профиль.</b> Убедись, что в шапке стоит ссылка на Яндекс.Музыку и билеты — трафик есть, важно его не терять.`,
    `<b>В TikTok у тебя ${pct(TKGENDER.find(g => g.g === 'Female')?.p || 0)} женщин — противоположность Instagram</b>, где больше мужчин. Один и тот же ролик стоит подписывать по-разному: в TikTok заходит эмоция и история, в Instagram — техника и экспертиза.`,
  ];
  return <>
    <KpiRow>
      <Kpi label="Просмотры" value={fmtNum(v)} sub={`${TKCONTENT.length} роликов`} color={C.tk} />
      <Kpi label="Визиты в профиль" value={fmtNum(pv)} color="var(--accent-cyan)" />
      <Kpi label="Лайки" value={fmtNum(l)} />
      <Kpi label="Репосты" value={fmtNum(sh)} sub={`${pct(shareRate, 2)} от просмотров`} color="var(--accent-green)" />
    </KpiRow>
    <Insights items={ins} tint="#EDEBFE" border="#D3CDF8" />
    <Panel title="Когда твоя аудитория онлайн" hint="Средняя активность подписчиков по часам за последние 7 дней. Это самый точный ориентир для времени публикации.">
      <HourStrip values={hours} color={C.tk} fmt={x => fmtNum(x) + ' онлайн'} note={`Пик: ${String(peak.h).padStart(2, '0')}:00 (${fmtNum(peak.a)} активных). Публикуй в ${String((peak.h + 23) % 24).padStart(2, '0')}:00–${String(peak.h).padStart(2, '0')}:00.`} />
    </Panel>
    <Panel title="Просмотры по месяцам">
      <AreaChart data={months.map(m => m[1])} labels={months.map(m => MS[+m[0].slice(5) - 1])} color={C.tk} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>{months.map(m => <div key={m[0]} style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{MS[+m[0].slice(5) - 1]}</div>)}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Активных дней с просмотрами: {active.length} из {TKDAILY.length}</div>
    </Panel>
    <Panel title="Все ролики" hint="Клик по столбцу — сортировка">
      <SortTable initSort="v" cols={[
        { k: 't', l: 'Ролик', w: '2fr', r: r => <span title={r.t}>{r.t.slice(0, 45)}<a href={r.url} target="_blank" rel="noopener" style={{ color: 'var(--accent-blue)', marginLeft: 5 }}>↗</a></span> },
        { k: 'date', l: 'Дата', w: '80px', muted: 1, r: r => fmtD(r.date) },
        { k: 'v', l: 'Просм.', w: '70px', a: 'right', b: 1, r: r => fmtNum(r.v) },
        { k: 'l', l: 'Лайки', w: '65px', a: 'right', r: r => fmtNum(r.l) },
        { k: 'sh', l: 'Репосты', w: '70px', a: 'right', r: r => fmtNum(r.sh) },
      ]} rows={top} />
    </Panel>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
      <Panel title="Пол аудитории">
        {TKGENDER.map(g => <BarRow key={g.g} label={g.g === 'Female' ? 'Женщины' : 'Мужчины'} labelW={78} frac={g.p / 100} value={pct(g.p)} color={g.g === 'Female' ? 'var(--accent-pink)' : 'var(--accent-blue)'} />)}
      </Panel>
      <Panel title="География">
        {TKGEO.slice(0, 8).map(g => <BarRow key={g.c} label={g.c} labelW={60} frac={g.p / TKGEO[0].p} value={pct(g.p)} color={C.tk} />)}
      </Panel>
    </div>
  </>;
}

/* ═══════════ YOUTUBE ═══════════ */
function YouTube() {
  const d = YTVIDEOS;
  const months = byMonth(YTDAILY, 'd', 'v');
  const B = [{ l: '≤30 с', f: x => x.dur <= 30 }, { l: '31–45 с', f: x => x.dur > 30 && x.dur <= 45 }, { l: '46–60 с', f: x => x.dur > 45 && x.dur <= 60 }, { l: '60+ с', f: x => x.dur > 60 }];
  const durs = B.map(b => { const a = d.filter(x => x.dur && b.f(x)); return { l: b.l, n: a.length, avg: mean(a.map(x => x.v)), ctr: mean(a.map(x => x.ctr)) }; }).filter(x => x.n);
  const best = durs.reduce((a, b) => b.avg > a.avg ? b : a);
  const worst = durs.reduce((a, b) => b.avg < a.avg ? b : a);
  const top = [...d].sort((a, b) => b.v - a.v);
  const hiCtr = [...d].filter(x => x.imp > 20000).sort((a, b) => b.ctr - a.ctr).slice(0, 3);
  const wh = YTTOTAL.wh;
  const ins = [
    `<b>YouTube — твой самый эффективный канал, и ты его почти не используешь.</b> ${fmtNum(YTTOTAL.v)} просмотров с ${d.length} роликов при CTR ${pct(YTTOTAL.ctr)} — норма 4–6%, у тебя выше. Алгоритм тебя любит, нужно просто чаще давать ему материал.`,
    `<b>Длина решает всё: «${best.l}» дают ${fmtNum(best.avg)} в среднем против ${fmtNum(worst.avg)} у «${worst.l}» — разница ${Math.round(best.avg / Math.max(1, worst.avg))}×.</b> Короткие Shorts до 30 секунд у тебя не работают: не успевают зацепить. Не режь ролики короче ${best.l === '60+ с' ? '60' : '45'} секунд.`,
    `<b>${Math.round(wh).toLocaleString('ru-RU')} часов просмотра.</b> Для монетизации нужно 4 000 часов за 12 месяцев — ты этот порог уже прошла с запасом, если канал подключён к партнёрке. Если нет — подключай, это деньги, которые лежат на полу.`,
    hiCtr.length ? `<b>Лучшие обложки: «${hiCtr[0].t.slice(0, 40)}…» — CTR ${pct(hiCtr[0].ctr)}.</b> Разбери, чем этот превью отличается от остальных, и повтори приём: CTR — то, что решает, покажет ли YouTube ролик дальше.` : null,
    `<b>Часовые миксы — не про просмотры, а про удержание и деньги.</b> Они держат сессию и монетизируются, но открывают их редко. Пусть Shorts работают воронкой: 3–5 в неделю ведут на длинный микс раз в 2–4 недели.`,
  ].filter(Boolean);
  return <>
    <KpiRow>
      <Kpi label="Просмотры" value={fmtNum(YTTOTAL.v)} sub={`${d.length} роликов`} color={C.yt} />
      <Kpi label="Часы просмотра" value={fmtNum(wh)} sub="порог монетизации — 4 000" color="var(--accent-green)" />
      <Kpi label="CTR обложек" value={pct(YTTOTAL.ctr)} sub="норма 4–6% — ты выше" color="var(--accent-green)" />
      <Kpi label="Показы" value={fmtNum(YTTOTAL.imp)} />
    </KpiRow>
    <Insights items={ins} tint="var(--tint-red)" border="#F8CBCB" />
    <Panel title="Просмотры по месяцам">
      <AreaChart data={months.map(m => m[1])} labels={months.map(m => MS[+m[0].slice(5) - 1])} color={C.yt} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>{months.map(m => <div key={m[0]} style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{MS[+m[0].slice(5) - 1]}</div>)}</div>
    </Panel>
    <Panel title="Длительность → просмотры" hint="Средние просмотры и CTR по длине ролика">
      {durs.map(x => <BarRow key={x.l} label={x.l} labelW={58} frac={x.avg / best.avg} value={fmtNum(x.avg)} sub={`· CTR ${pct(x.ctr)} · ${x.n} шт.`} color={C.yt} highlight={x.l === best.l} />)}
    </Panel>
    <Panel title="Все ролики" hint="Клик по столбцу — сортировка. Ищи закономерности в топе.">
      <SortTable initSort="v" maxRows={10} cols={[
        { k: 't', l: 'Название', w: '2fr', r: r => <span title={r.t}>{r.t.slice(0, 46)}<a href={`https://youtu.be/${r.id}`} target="_blank" rel="noopener" style={{ color: 'var(--accent-blue)', marginLeft: 5 }}>↗</a></span> },
        { k: 'dur', l: 'Длит.', w: '55px', a: 'right', muted: 1, r: r => r.dur + 'с' },
        { k: 'v', l: 'Просм.', w: '70px', a: 'right', b: 1, r: r => fmtNum(r.v) },
        { k: 'ctr', l: 'CTR', w: '58px', a: 'right', r: r => pct(r.ctr) },
        { k: 'wh', l: 'Часы', w: '60px', a: 'right', muted: 1, r: r => fmtNum(r.wh) },
      ]} rows={top} />
    </Panel>
    <Panel title="Аудитория по возрасту и полу">
      {(() => {
        const g = groupBy(YTAUDIENCE, x => x.age);
        const rows = Object.entries(g).map(([age, a]) => ({ age, m: sum(a.filter(x => x.g === 'm').map(x => x.p)), w: sum(a.filter(x => x.g === 'w').map(x => x.p)) }));
        const mx = Math.max(...rows.map(r => Math.max(r.m, r.w)), 1);
        return <>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--accent-blue)', marginRight: 5 }} />Мужчины</span>
            <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--accent-pink)', marginRight: 5 }} />Женщины</span>
          </div>
          {rows.map(r => <div key={r.age} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 92px', gap: 10, alignItems: 'center', marginBottom: 11 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{r.age}</div>
            <div>
              <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-surface)', marginBottom: 3, overflow: 'hidden' }}><div style={{ width: `${r.m / mx * 100}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: 4 }} /></div>
              <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-surface)', overflow: 'hidden' }}><div style={{ width: `${r.w / mx * 100}%`, height: '100%', background: 'var(--accent-pink)', borderRadius: 4 }} /></div>
            </div>
            <div style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--text-secondary)' }}>{pct(r.m)} / {pct(r.w)}</div>
          </div>)}
        </>;
      })()}
    </Panel>
  </>;
}

/* ═══════════ TELEGRAM ═══════════ */
function Telegram() {
  const all = TGPOSTS.filter(x => x.date >= '2026');
  const tot = sum(all.map(x => x.reac));
  const avg = tot / Math.max(1, all.length);
  const months = byMonth(all, 'date', 'reac');
  const cnt = byMonth(all, 'date', () => 1);
  const mxM = Math.max(...months.map(m => m[1]), 1);
  // hour windows (aggregate for reliability)
  const WIN = [{ l: '06–09', f: h => h >= 6 && h < 9 }, { l: '09–12', f: h => h >= 9 && h < 12 }, { l: '12–15', f: h => h >= 12 && h < 15 }, { l: '15–18', f: h => h >= 15 && h < 18 }, { l: '18–21', f: h => h >= 18 && h < 21 }, { l: '21–24', f: h => h >= 21 }, { l: '00–06', f: h => h < 6 }];
  const wins = WIN.map(w => { const a = all.filter(x => w.f(x.h)); return { l: w.l, n: a.length, avg: mean(a.map(x => x.reac)) }; }).filter(x => x.n >= 3);
  const bestW = wins.reduce((a, b) => b.avg > a.avg ? b : a);
  const mxW = bestW.avg;
  const habit = wins.reduce((a, b) => b.n > a.n ? b : a);
  const top = [...all].sort((a, b) => b.reac - a.reac).slice(0, 8);
  const withMedia = all.filter(x => x.media || x.txt === '(медиа)');
  const mediaAvg = mean(withMedia.map(x => x.reac)), textAvg = mean(all.filter(x => !x.media).map(x => x.reac));
  const perWeek = all.length / 28;
  const ins = [
    habit.l !== bestW.l ? `<b>Ты постишь не в то время, когда тебя лучше читают.</b> Чаще всего ты публикуешь в окне ${habit.l} (${habit.n} постов) — там в среднем ${habit.avg.toFixed(1).replace('.', ',')} реакций. А лучшее окно — <b>${bestW.l}</b>: ${bestW.avg.toFixed(1).replace('.', ',')} реакций, в ${(bestW.avg / Math.max(0.1, habit.avg)).toFixed(1).replace('.', ',')} раза больше. Просто сдвинь время — это бесплатный рост вовлечённости.` : `<b>Лучшее окно — ${bestW.l}</b> (${bestW.avg.toFixed(1).replace('.', ',')} реакций в среднем), и ты в него попадаешь. Так держать.`,
    `<b>${all.length} постов за полгода — это ~${perWeek.toFixed(1).replace('.', ',')} в неделю.</b> Для Telegram это нормально: здесь меньше значит лучше. Исследование 26 тысяч каналов показало, что 1 пост в день даёт максимум просмотров, а 2+ режут охват на 20–40%. Не гонись за частотой — гонись за поводом.`,
    mediaAvg > textAvg ? `<b>Посты с медиа заходят лучше:</b> ${mediaAvg.toFixed(1).replace('.', ',')} реакций против ${textAvg.toFixed(1).replace('.', ',')} у текстовых. Фото и видео из студии — твой формат.` : `<b>Текстовые посты работают не хуже медийных.</b> Твоя аудитория читает — можно писать длиннее и личнее.`,
    `<b>Telegram — единственное место, где ты владеешь аудиторией.</b> Здесь нет алгоритма: кто подписался, тот видит. Это канал для билетов,预 предзаказов и живого разговора, а не для охватов. Пересылки — главный механизм роста: пиши то, что хочется переслать другу.`,
    `<b>Что делать:</b> закрепить ссылку на Яндекс.Музыку в описании канала, давать сюда эксклюзив (демо, ранний доступ к билетам) — так люди из Reels превращаются в ядро, которое платит.`,
  ];
  return <>
    <KpiRow>
      <Kpi label="Постов" value={all.length} sub={`~${perWeek.toFixed(1).replace('.', ',')} в неделю`} color={C.tg} />
      <Kpi label="Реакции" value={fmtNum(tot)} sub={`ср. ${avg.toFixed(1).replace('.', ',')} на пост`} />
      <Kpi label="Лучшее окно" value={bestW.l} sub={`${bestW.avg.toFixed(1).replace('.', ',')} реакций`} color="var(--accent-green)" />
      <Kpi label="Всего постов" value={TGPOSTS.length} sub="с момента создания канала" />
    </KpiRow>
    <Insights items={ins} tint="#E4F5FC" border="#BFE4F3" />
    <Panel title="Когда публиковать" hint="Средние реакции по окну публикации. Учтены только окна с 3+ постами — так надёжнее.">
      {wins.map(w => <BarRow key={w.l} label={w.l} labelW={50} frac={w.avg / mxW} value={w.avg.toFixed(1).replace('.', ',')} sub={`· ${w.n} п.`} color={C.tg} highlight={w.l === bestW.l} />)}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>💡 Реакции — прокси вовлечённости: просмотры Telegram в экспорт не отдаёт.</div>
    </Panel>
    <Panel title="Реакции по месяцам">
      {months.map((m, i) => <BarRow key={m[0]} label={MS[+m[0].slice(5) - 1]} labelW={44} frac={m[1] / mxM} value={fmtNum(m[1])} sub={`· ${cnt[i] ? cnt[i][1] : 0} п.`} color={C.tg} />)}
    </Panel>
    <Panel title="Топ постов">
      <SortTable initSort="reac" maxRows={8} cols={[
        { k: 'txt', l: 'Пост', w: '2fr' }, { k: 'date', l: 'Дата', w: '80px', muted: 1, r: r => fmtD(r.date) },
        { k: 'h', l: 'Час', w: '50px', a: 'right', muted: 1, r: r => String(r.h).padStart(2, '0') + ':00' },
        { k: 'reac', l: 'Реакции', w: '70px', a: 'right', b: 1 },
      ]} rows={top} />
    </Panel>
  </>;
}

/* ═══════════ СТРИМИНГИ ═══════════ */
function Streaming() {
  const s = STREAMS;
  const streams = s.filter(x => x.usage.includes('Stream'));
  const agg = (arr, key, val) => Object.entries(arr.reduce((o, x) => { o[x[key]] = (o[x[key]] || 0) + x[val]; return o; }, {})).sort((a, b) => b[1] - a[1]);
  const shops = agg(streams, 'shop', 'qty');
  const tracks = agg(streams, 'track', 'qty');
  const ctry = agg(streams, 'country', 'qty');
  const royShop = Object.fromEntries(agg(s, 'shop', 'roy'));
  const totQ = sum(streams.map(x => x.qty)), totR = sum(s.map(x => x.roy));
  const perK = totR / (totQ / 1000);
  const periods = [...new Set(s.map(x => x.period))];
  // detect tracks missing major DSPs -> reporting gap
  const perTrackShops = {};
  streams.forEach(x => { (perTrackShops[x.track] = perTrackShops[x.track] || new Set()).add(x.shop); });
  const gaps = Object.entries(perTrackShops).filter(([, sh]) => ![...sh].some(x => /Yandex/i.test(x)) || ![...sh].some(x => /Spotify/i.test(x)))
    .map(([t, sh]) => ({ t, missing: [!([...sh].some(x => /Yandex/i.test(x))) && 'Яндекс', !([...sh].some(x => /Spotify/i.test(x))) && 'Spotify'].filter(Boolean) }));
  const yandexShare = (shops.filter(x => /Yandex/i.test(x[0])).reduce((a, b) => a + b[1], 0)) / totQ * 100;
  const ruShare = (ctry.find(c => c[0] === 'RU')?.[1] || 0) / totQ * 100;
  const mxS = shops[0][1];

  const ins = [
    `<b>Это отчёт за один месяц — март 2026.</b> Несмотря на название файла «01.01–31.03», все строки помечены периодом ${periods.join(', ')}. Январь и февраль в выгрузку не попали — запроси их у лейбла, иначе картина квартала неполная.`,
    `<b>Цифры в кабинете артиста и в роялти-отчёте — это разные вещи.</b> В «Яндекс Музыке для артистов» и Spotify for Artists показаны накопленные прослушивания с момента релиза (lifetime). Здесь — начисления за один месяц. Если на треке 100 тыс. в кабинете, а тут 6 тыс. — это не ошибка, это разные метрики.`,
    gaps.length ? `<b>⚠️ Дыра в отчётности: у трека «${gaps[0].t}» нет строк ${gaps[0].missing.join(' и ')}.</b> У других треков они есть — значит дело не в том, что трека там нет. «${gaps[0].t}» идёт по отдельному контракту, и по нему отчитались только Apple Music и YouTube. <b>Это вопрос к лейблу/дистрибьютору:</b> почему не пришли данные ${gaps[0].missing.join(' и ')} и когда будут доначислены.` : null,
    `<b>Яндекс — ${pct(yandexShare)} прослушиваний</b> среди того, что попало в отчёт. Это твоя главная площадка. Там есть «Импульс» — платное продвижение от 5 000 слушателей в месяц через BandLink, до 70% охвата идёт на новую аудиторию.`,
    `<b>${Math.round(totR)} € за месяц — ${perK.toFixed(1).replace('.', ',')} € с тысячи прослушиваний.</b> Стриминг — не заработок, а витрина и доказательство спроса для букеров. Деньги — в концертах, а статистика нужна, чтобы их получать.`,
    `<b>Сверяй по кабинетам, а не по отчёту.</b> Роялти-отчёт приходит с задержкой 1–2 месяца и только по тем площадкам, что успели отчитаться. Для оперативной картины смотри «Яндекс Музыка для артистов», Spotify for Artists и BandLink.`,
  ].filter(Boolean);

  return <>
    <div className="ios-card" style={{ padding: 14, marginBottom: 14, background: 'var(--tint-orange)', border: '1px solid #F8DFB0' }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.5 }}><b>⚠️ Данные неполные.</b> Отчёт содержит только <b>март 2026</b>{gaps.length ? <> и в нём <b>нет данных {gaps[0].missing.join(' и ')} по треку «{gaps[0].t}»</b></> : ''}. Не сравнивай эти цифры с кабинетом артиста — там lifetime, здесь один месяц.</div>
    </div>
    <KpiRow>
      <Kpi label="Прослушивания" value={fmtNum(totQ)} sub="март 2026, что в отчёте" color={C.st} />
      <Kpi label="Роялти" value={Math.round(totR) + ' €'} sub={`${perK.toFixed(1).replace('.', ',')} € за 1000`} color={C.st} />
      <Kpi label="Площадок" value={shops.length} sub={`${ctry.length} стран`} />
      <Kpi label="Из России" value={pct(ruShare)} />
    </KpiRow>
    <Insights items={ins} tint="var(--tint-green)" border="#BFE8CE" />
    {gaps.length > 0 && <Panel title="Что запросить у лейбла" hint="Проверка полноты отчёта: какие площадки отчитались по каждому треку">
      {Object.entries(perTrackShops).map(([t, sh]) => {
        const has = n => [...sh].some(x => new RegExp(n, 'i').test(x));
        return <div key={t} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['Яндекс', 'Yandex'], ['Spotify', 'Spotify'], ['VK', 'Vkontakte|VK'], ['Apple', 'Apple'], ['YouTube', 'YouTube']].map(([l, rx]) =>
              <span key={l} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: has(rx) ? 'var(--tint-green)' : 'var(--tint-red)', color: has(rx) ? 'var(--accent-green)' : 'var(--accent-red)' }}>{has(rx) ? '✓' : '✕'} {l}</span>)}
          </div>
        </div>;
      })}
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
        Красное — площадка не отчиталась по треку в этом периоде. Спроси у лейбла: <b>«почему по треку {gaps[0].t} нет начислений {gaps[0].missing.join(' и ')} за март и когда они будут?»</b> Плюс запроси отчёты за январь и февраль.
      </div>
    </Panel>}
    <Panel title="Площадки" hint="Прослушивания и роялти за март по тому, что попало в отчёт">
      {shops.slice(0, 8).map(([k, v]) => <BarRow key={k} label={k} labelW={130} frac={v / mxS} value={fmtNum(v)} sub={royShop[k] ? `· ${royShop[k].toFixed(0)} €` : ''} color={/Yandex/i.test(k) ? 'var(--accent-yellow)' : /Vkontakte|VK/i.test(k) ? 'var(--accent-blue)' : /YouTube/i.test(k) ? 'var(--accent-red)' : /Apple/i.test(k) ? 'var(--text-secondary)' : /Spotify/i.test(k) ? 'var(--accent-green)' : 'var(--accent-cyan)'} />)}
    </Panel>
    <Panel title="Треки" hint="Только по данным отчёта за март — не сравнивай с кабинетом артиста">
      {tracks.map(([k, v]) => <BarRow key={k} label={k} labelW={92} frac={v / tracks[0][1]} value={fmtNum(v)} sub={`· ${pct(v / totQ * 100)}`} color="var(--accent-purple)" />)}
    </Panel>
    <Panel title="География прослушиваний">
      {ctry.slice(0, 10).map(([k, v]) => <BarRow key={k} label={k} labelW={50} frac={v / ctry[0][1]} value={fmtNum(v)} sub={`· ${pct(v / totQ * 100)}`} color={C.st} />)}
    </Panel>
  </>;
}

/* ═══════════ ПЛАН ═══════════ */
function Plan() {
  const igF = sum(IGAUDIENCE.followers.map(f => f.n));
  const igV = sum(IGPOSTS.map(x => x.v));
  const tgW = TGPOSTS.filter(x => x.date >= '2026').length / 28;
  const igW = IGPOSTS.length / 28;
  const tkW = TKCONTENT.length / 28;
  const ytW = YTVIDEOS.length / 28;
  const stW = IGSTORIES.length / 196;
  const totQ = sum(STREAMS.filter(x => x.usage.includes('Stream')).map(x => x.qty));

  const SCHED = [
    { d: 'Пн', items: [{ t: '17:00', p: 'IG Reels', c: C.ig }, { t: '21:00', p: 'TikTok', c: C.tk }, { t: '16:00', p: 'Telegram', c: C.tg }] },
    { d: 'Вт', items: [{ t: '17:00', p: 'IG Reels ⭐', c: C.ig }, { t: '21:00', p: 'TikTok', c: C.tk }, { t: '19:00', p: 'YT Shorts', c: C.yt }] },
    { d: 'Ср', items: [{ t: '21:00', p: 'TikTok', c: C.tk }, { t: '16:00', p: 'Telegram', c: C.tg }] },
    { d: 'Чт', items: [{ t: '17:00', p: 'IG Reels ⭐⭐', c: C.ig }, { t: '21:00', p: 'TikTok', c: C.tk }, { t: '19:00', p: 'YT Shorts', c: C.yt }] },
    { d: 'Пт', items: [{ t: '21:00', p: 'TikTok', c: C.tk }, { t: '19:00', p: 'YT микс', c: C.yt }, { t: '16:00', p: 'Telegram', c: C.tg }] },
    { d: 'Сб', items: [{ t: '17:00', p: 'IG Reels', c: C.ig }, { t: '22:00', p: 'TikTok', c: C.tk }] },
    { d: 'Вс', items: [{ t: '21:00', p: 'TikTok', c: C.tk }, { t: '19:00', p: 'YT Shorts', c: C.yt }] },
  ];

  return <>
    <Insights title="🎯 Логика плана" tint="var(--tint-orange)" border="#F8DFB0" items={[
      `<b>Главный вывод из всей статистики:</b> ты умеешь делать вирусный контент — ${fmtNum(igV)} просмотров в Instagram и ${fmtNum(YTTOTAL.v)} на YouTube это доказали. Проблема не в качестве, а в частоте и в том, что зритель не превращается в слушателя.`,
      `<b>Три рычага на полугодие:</b> 1) поднять частоту в TikTok и YouTube — там ты почти не публикуешь при отличных показателях; 2) сдвинуть время Telegram на ${'15–18'} — бесплатный рост вовлечённости; 3) вести трафик в Яндекс.Музыку из каждого ролика.`,
      `<b>Не увеличивай Instagram.</b> ${igW.toFixed(1).replace('.', ',')} поста в неделю при таком ER — это здоровый ритм. Лучше добери охват на площадках, где ты недоинвестируешь.`,
    ]} />

    <Panel title="Сколько публиковать" hint="Слева — как сейчас, справа — цель. Расчёт: твоя статистика + бенчмарки 2026 для артистов твоего масштаба.">
      <Goal icon="📷" title="Instagram Reels" now={igW.toFixed(1).replace('.', ',')} target="4–5" unit="в нед." color={C.ig} note="Ритм уже почти оптимальный. Ставь сильные ролики на вторник и четверг в 17:00 — по твоим данным это лучшие слоты. Длина 60+ секунд." />
      <Goal icon="⚡️" title="Instagram сторис" now={stW.toFixed(1).replace('.', ',')} target="2" unit="в день" color={C.ig} note="Сторис дают переходы в профиль и держат ядро. Утро, обед, вечер — по одной. Обязательно ссылка в анонсах." />
      <Goal icon="🎵" title="TikTok" now={tkW.toFixed(1).replace('.', ',')} target="5–7" unit="в нед." color={C.tk} note="Главный резерв роста. Публикуй в 21:00–00:00 — по твоим данным аудитория онлайн именно тогда. Заливай нативно, без водяного знака Instagram." />
      <Goal icon="▶️" title="YouTube Shorts" now={ytW.toFixed(1).replace('.', ',')} target="3–5" unit="в нед." color={C.yt} note="CTR 7,75% — алгоритм тебя любит. Длина 45–60+ секунд, короче 30 не работает. Публикация 19:00." />
      <Goal icon="🎬" title="YouTube миксы" now="~1" target="1" unit="в 2–4 нед." color={C.yt} note="Часовые сеты — для удержания и монетизации. Пятница вечер или суббота." />
      <Goal icon="✈️" title="Telegram" now={tgW.toFixed(1).replace('.', ',')} target="1" unit="в день" color={C.tg} note="Больше — вредно: 2+ поста в день режут охват на 20–40%. Сдвинь время с 21:00 на 15–18 — вовлечённость вырастет вдвое." />
    </Panel>

    <Panel title="Недельная сетка" hint="⭐ — слот под самый сильный ролик недели. Всё время по МСК.">
      <div className="data-table" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(112px, 1fr))', gap: 8, minWidth: 700 }}>
          {SCHED.map(d => <div key={d.d} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>{d.d}</div>
            {d.items.map((it, i) => <div key={i} style={{ background: '#fff', borderRadius: 8, padding: '6px 8px', marginBottom: 5, borderLeft: `2.5px solid ${it.c}` }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>{it.t}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: it.c }}>{it.p}</div>
            </div>)}
          </div>)}
        </div>
      </div>
    </Panel>

    <Panel title="Лучшее время — по твоим данным" hint="Не из общих рекомендаций, а посчитано из твоей статистики">
      <SortTable initSort="pl" cols={[
        { k: 'pl', l: 'Площадка', w: '1.1fr', b: 1 }, { k: 'tm', l: 'Время (МСК)', w: '1fr' },
        { k: 'dd', l: 'Дни', w: '1fr', muted: 1 }, { k: 'why', l: 'Почему', w: '2fr', muted: 1, wrap: 1 },
      ]} rows={[
        { pl: 'Instagram Reels', tm: '16:00–18:00', dd: 'Вт, Чт', why: 'Чт даёт 112 тыс. в среднем, Вт — 85 тыс. Пт и Сб проваливаются в 5–8 раз' },
        { pl: 'Instagram сторис', tm: '09:00, 13:00, 19:00', dd: 'ежедневно', why: 'Утро, обед, вечер — паузы, когда листают ленту' },
        { pl: 'TikTok', tm: '21:00–00:00', dd: 'ежедневно', why: 'Пик активности подписчиков в 00:00, плато с 21:00. Мёртвая зона — 06:00' },
        { pl: 'YouTube Shorts', tm: '19:00–21:00', dd: 'Вт, Чт, Вс', why: 'Вечерний просмотр; Shorts ведут на длинные миксы' },
        { pl: 'YouTube миксы', tm: '19:00 Пт', dd: 'раз в 2–4 нед.', why: 'Длинное смотрят на выходных, когда есть время на час музыки' },
        { pl: 'Telegram', tm: '15:00–18:00', dd: 'ежедневно', why: 'Окно 15–18 даёт вдвое больше реакций, чем твои привычные 21:00' },
      ]} />
    </Panel>

    <Panel title="Цели на полугодие" hint="Амбициозно, но достижимо при текущем темпе">
      <Goal icon="📈" title="Подписчики Instagram" now={'+' + fmtNum(igF)} target="+15 тыс." color={C.ig} note="Текущий темп ~4–6% в месяц — выше нормы (1–2%). Задача — удержать, не потеряв ER." />
      <Goal icon="👀" title="Просмотры Instagram" now={fmtNum(igV)} target="5 млн" color={C.ig} note="За счёт частоты 4–5 в неделю и длинных Reels 60+ секунд" />
      <Goal icon="🎵" title="Прослушивания" now={fmtNum(totQ)} target="60 тыс." unit="/мес" color={C.st} note="Данные за март. Рычаг — призыв к прослушиванию в каждом ролике + смартлинк в шапке профиля" />
      <Goal icon="🚀" title="Яндекс.Музыка" now="?" target="5 тыс." unit="слуш./мес" color="var(--accent-yellow)" note="Порог для инструмента «Импульс» — платного продвижения. Проверь показатель в BandLink: если рядом — это следующий большой рычаг" />
      <Goal icon="🎤" title="Второй хит" now="1" target="2" unit="трека" color="var(--accent-purple)" note="Каталог держится на KARA BAY. Нужен второй трек такого же уровня, чтобы снять зависимость от одного" />
    </Panel>

    <Insights title="⚠️ О чём помнить" tint="var(--bg-surface)" border="var(--border-light)" items={[
      `Время Instagram пересчитано из тихоокеанского пояса (так выгружает Meta) в МСК с учётом летнего времени. Часы TikTok — как отдаёт сам TikTok.`,
      `Данные по стримингу — только за март 2026 и без части площадок по треку SHAITAN. Соцсети — по 15 июля. Прямое сравнение периодов некорректно.`,
      `Выводы по дням недели для пятницы и субботы построены на 3 публикациях — это мало. Проверь ещё раз, прежде чем совсем убирать эти дни.`,
      `Telegram не отдаёт просмотры в экспорт — вовлечённость считалась по реакциям.`,
    ]} />
  </>;
}
