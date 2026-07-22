import { useState, useEffect, useRef } from 'react';
import { db, ref, push, remove, update, onValue, off, storage, storageRef, uploadBytes, getDownloadURL } from './firebase.js';
import { getYandexToken, startYandexAuth, checkYandexAuthCallback, uploadFile as ydUpload, deleteFile as ydDelete, getDownloadLink } from './yandexDisk.js';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import StatsTab from './StatsTab.jsx';

/* ═══ CONSTANTS ═══ */
const USERS = {
  leyla: { name: 'Leyla', color: '#FF3B30', avatar: 'L', photo: 'https://ui-avatars.com/api/?name=Leyla+H&background=FF3B30&color=fff&size=128&font-size=0.45&bold=true' },
  manager: { name: 'Manager', color: '#007AFF', avatar: 'M', photo: 'https://ui-avatars.com/api/?name=M&background=007AFF&color=fff&size=128&font-size=0.45&bold=true' },
};
const STATUSES = {
  idea: { label: 'Идея', color: '#AF52DE' },
  script: { label: 'Сценарий', color: '#007AFF' },
  shooting: { label: 'Съёмки', color: '#FF9500' },
  editing: { label: 'Монтаж', color: '#5856D6' },
  approval: { label: 'Утверждение', color: '#FF2D55' },
  done: { label: 'Готово', color: '#34C759' },
};
// Старые статусы из базы → новые (чтобы ничего не потерялось)
const LEGACY_STATUS = { todo: 'script', in_progress: 'shooting', review: 'approval', 'Идея': 'idea', 'Готово': 'done' };
const stKey = s => (STATUSES[s] ? s : (LEGACY_STATUS[s] || 'idea'));
const CONTENT_FORMATS = ['Reels','Story','Пост','Видео','Shorts','Клип','Подкаст','Статья','Другое'];
const PLATFORMS = ['Instagram','VK','YouTube','TikTok','Telegram','Spotify','Yandex Music','Другое'];
const PLATFORM_ICON = { 'Instagram': '/icons/Instagram.png', 'VK': '/icons/VK.png', 'YouTube': '/icons/Youtube.png', 'TikTok': '/icons/Tiktok.png', 'Telegram': '/icons/Telegram.png', 'Spotify': '🟢', 'Yandex Music': '🟡', 'Другое': '📱' };
function PlatformIcon({ platform, size = 12 }) { const src = PLATFORM_ICON[platform]; if (src && src.startsWith('/')) return <img src={src} alt={platform} style={{ width: size, height: size, borderRadius: 2, verticalAlign: 'middle', flexShrink: 0 }} />; return <span style={{ fontSize: size }}>{src || '📱'}</span>; }
const RELEASE_STAGES = ['Идея','Демо','Запись','Сведение','Мастеринг','Готов к релизу','Вышел'];
const COVER_STATES = ['Нет','В работе','Готова','Утверждена'];
const DAYS_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const STATUS_KEYS = Object.keys(STATUSES);
const FILE_TAGS = ['музыка','визуал','промо','документы','обложка','трек','фото','видео','другое'];
function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString().slice(0, 19); }
function fmtDate(d) { if (!d) return '—'; const p = d.split('-'); if (p.length !== 3) return d; return `${p[2]}/${p[1]}/${p[0]}`; }
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
// «30 июля — 12 августа», «15–18 июля», одиночная дата — как обычно
function fmtRange(start, end) {
  if (!start) return '—';
  if (!end || end === start) return fmtDate(start);
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  const curY = new Date().getFullYear();
  const yr = (y1 !== curY || y2 !== curY) ? ` ${y2}` : '';
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS_GEN[m2 - 1]}${yr}`;
  if (y1 === y2) return `${d1} ${MONTHS_GEN[m1 - 1]} — ${d2} ${MONTHS_GEN[m2 - 1]}${yr}`;
  return `${fmtDate(start)} — ${fmtDate(end)}`;
}
// Все даты периода (для календаря)
function daysInRange(start, end) {
  if (!start) return [];
  if (!end || end <= start) return [start];
  const out = []; const cur = new Date(start + 'T00:00:00'); const last = new Date(end + 'T00:00:00');
  let guard = 0;
  while (cur <= last && guard++ < 400) { out.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
  return out;
}
function timeAgo(t) { if (!t) return ''; const d = (Date.now() - new Date(t).getTime()) / 1000; if (d < 60) return 'только что'; if (d < 3600) return Math.floor(d / 60) + ' мин'; if (d < 86400) return Math.floor(d / 3600) + ' ч'; if (d < 172800) return 'вчера'; return fmtDate(t.slice(0, 10)); }
function getFileIcon(n) { if (!n) return '📎'; if (/\.(wav|mp3|flac|aac|ogg)$/i.test(n)) return '🎵'; if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(n)) return '🖼'; if (/\.(mp4|mov|avi|mkv)$/i.test(n)) return '🎬'; if (/\.(doc|docx|pdf|txt)$/i.test(n)) return '📄'; return '📎'; }

/* ═══ FIREBASE ═══ */
function useFirebase(path) { const [data, setData] = useState({}); useEffect(() => { const r = ref(db, path); const u = onValue(r, s => setData(s.val() || {})); return () => off(r); }, [path]); return [data]; }
function toList(obj) { return Object.entries(obj || {}).map(([id, v]) => ({ ...v, _id: id })); }
function fbPush(p, d) { return push(ref(db, p), d); }
function fbUpdate(p, d) { return update(ref(db, p), d); }
function fbRemove(p) { return remove(ref(db, p)); }
function logActivity(u, a) { fbPush('activity', { user: u, action: a, time: now() }); }
function notifyOther(c, m) { fbPush('notifications', { forUser: c === 'leyla' ? 'manager' : 'leyla', message: m, fromUser: c, time: now(), read: false }); }

/* Firebase Storage upload */
async function fbStorageUpload(file, path) {
  const sRef = storageRef(storage, path);
  await uploadBytes(sRef, file);
  return await getDownloadURL(sRef);
}

/* ═══ UI ═══ */
function Badge({ children, color }) { return <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, color, background: color + '16', whiteSpace: 'nowrap' }}>{children}</span>; }
function UserPhoto({ uid, size = 28 }) { const u = USERS[uid] || USERS.leyla; return <img src={u.photo} alt={u.name} title={u.name} style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }} />; }
/* Apple Reminders style page head: big colored title left, big colored count right */
function PageHead({ title, count, color, caption, children }) {
  return <div style={{ marginBottom: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div className="page-title-huge" style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: -0.6, lineHeight: 1.05 }}>{title}</div>
        {caption && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{caption}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {count !== undefined && <div style={{ fontSize: 32, fontWeight: 700, color, opacity: 0.85, lineHeight: 1.05 }}>{count}</div>}
      </div>
    </div>
    {children && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>{children}</div>}
  </div>;
}
function Btn({ children, onClick, color = 'var(--accent-blue)', outline, small, style, disabled }) {
  return <button disabled={disabled} onClick={onClick} style={{ padding: small ? '7px 16px' : '11px 22px', borderRadius: 999, border: outline ? `1.5px solid ${color}` : 'none', background: outline ? 'transparent' : color, color: outline ? color : '#fff', fontSize: small ? 13 : 14, fontWeight: 600, opacity: disabled ? 0.4 : 1, cursor: 'pointer', boxShadow: outline ? 'none' : '0 1px 2px rgba(0,0,0,0.06)', whiteSpace: 'nowrap', ...style }}>{children}</button>;
}
function Field({ label, children }) { return <div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>{label}</div>{children}</div>; }
function Card({ children, style, onClick, className }) { return <div className={className} onClick={onClick} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-sm)', ...style }}>{children}</div>; }
function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (<div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 22, boxShadow: 'var(--shadow-xl)', padding: 28, width: '100%', maxWidth: wide ? 820 : 560, maxHeight: '90vh', overflowY: 'auto', animation: 'slideUp .25s cubic-bezier(0.25, 0.1, 0.25, 1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 19, fontWeight: 600 }}>{title}</h3>
        <button className="modal-close" onClick={onClose} style={{ background: 'var(--bg-surface)', border: 'none', borderRadius: '50%', width: 32, height: 32, minHeight: 32, fontSize: 16, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>✕</button>
      </div>{children}
    </div>
  </div>);
}
function Empty({ text }) { return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 15 }}>{text}</div>; }
function TabBar({ items, active, onChange }) {
  return <div className="app-tabs" style={{ display: 'flex', overflowX: 'auto', whiteSpace: 'nowrap' }}>
    {items.map(t => { const isActive = active === t.id; const c = t.color || 'var(--accent-blue)'; return <button key={t.id} onClick={() => onChange(t.id)} className={isActive ? 'tab-active' : ''} style={{ border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, ...(isActive ? { background: `color-mix(in srgb, ${c} 12%, white)`, color: c } : {}) }}>
      <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
    </button>; })}
  </div>;
}

/* Firebase Storage file uploader (for riders) */
function FBStorageUploader({ path, label, currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await fbStorageUpload(file, path + '/' + file.name);
      onUploaded(url, file.name);
    } catch (e) { alert('Ошибка загрузки: ' + e.message); }
    setUploading(false);
  };
  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
      <Btn onClick={() => fileRef.current?.click()} small outline disabled={uploading}>{uploading ? 'Загрузка...' : '📎 Загрузить файл'}</Btn>
      {currentUrl && <a href={currentUrl} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--accent-blue)' }}>Скачать ↗</a>}
    </div>
  </div>;
}

/* YD Uploader */
function YDFileUploader({ currentUser, parentId = '', tag = 'другое', subFolder = '' }) {
  const [uploading, setUploading] = useState(false); const [progress, setProgress] = useState(''); const [dragging, setDragging] = useState(false); const fileRef = useRef(null); const token = getYandexToken();
  const handleFiles = async (files) => { if (!token) { startYandexAuth(); return; } if (!files.length) return; setUploading(true); for (const file of files) { setProgress(`Загружаю ${file.name}...`); try { const result = await ydUpload(file, subFolder || 'files'); fbPush('files', { name: result.name, size: result.size, url: result.publicUrl || '', ydPath: result.path, tag, uploadedBy: currentUser, date: today(), parentId }); logActivity(currentUser, `загрузил: ${result.name}`); notifyOther(currentUser, `загрузил: ${result.name}`); } catch (e) { setProgress(`Ошибка: ${e.message}`); await new Promise(r => setTimeout(r, 2000)); } } setUploading(false); setProgress(''); };
  if (!token) return <div style={{ padding: 12, textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border-light)' }}><Btn onClick={startYandexAuth} small>Подключить Яндекс Диск</Btn></div>;
  return <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onClick={() => fileRef.current?.click()} style={{ padding: 16 }}>
    <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleFiles(Array.from(e.target.files))} />
    {uploading ? <div style={{ color: 'var(--accent-blue)', fontSize: 13 }}>{progress}</div> : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>📁 Перетащите или нажмите</div>}
  </div>;
}
function FileList({ files }) { if (!files?.length) return null; const dl = async f => { if (f.url) { window.open(f.url, '_blank'); return; } if (f.ydPath) { try { window.open(await getDownloadLink(f.ydPath), '_blank'); } catch {} } }; return <div style={{ marginTop: 6 }}>{files.map(f => <div key={f._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12 }}><span>{getFileIcon(f.name)}</span><button onClick={() => dl(f)} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 12, cursor: 'pointer', padding: 0 }}>{f.name}</button>{f.size && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({f.size})</span>}<Badge color="var(--accent-purple)">{f.tag}</Badge></div>)}</div>; }

/* ═══ WORD EXPORT FOR EPK ═══ */
async function exportEPKtoWord(data) {
  const sections = [];
  const addLine = (label, value) => { if (value) sections.push(new Paragraph({ children: [new TextRun({ text: label + ': ', bold: true, size: 24 }), new TextRun({ text: value, size: 24 })] })); };
  
  sections.push(new Paragraph({ children: [new TextRun({ text: 'ELECTRONIC PRESS KIT', bold: true, size: 36 })], heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 400 } }));
  sections.push(new Paragraph({ children: [new TextRun({ text: data.artistName || 'Artist', bold: true, size: 32 })], heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 300 } }));
  if (data.genre) sections.push(new Paragraph({ children: [new TextRun({ text: data.genre, size: 26, italics: true, color: '666666' })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }));
  
  sections.push(new Paragraph({ text: '', spacing: { after: 200 } }));
  
  if (data.bioShort) { sections.push(new Paragraph({ children: [new TextRun({ text: 'О СЕБЕ', bold: true, size: 26 })], heading: HeadingLevel.HEADING_2, spacing: { after: 100 } })); sections.push(new Paragraph({ children: [new TextRun({ text: data.bioShort, size: 24 })], spacing: { after: 200 } })); }
  if (data.bioFull) { sections.push(new Paragraph({ children: [new TextRun({ text: 'БИОГРАФИЯ', bold: true, size: 26 })], heading: HeadingLevel.HEADING_2, spacing: { after: 100 } })); sections.push(new Paragraph({ children: [new TextRun({ text: data.bioFull, size: 24 })], spacing: { after: 200 } })); }
  if (data.highlights) { sections.push(new Paragraph({ children: [new TextRun({ text: 'ДОСТИЖЕНИЯ', bold: true, size: 26 })], heading: HeadingLevel.HEADING_2, spacing: { after: 100 } })); sections.push(new Paragraph({ children: [new TextRun({ text: data.highlights, size: 24 })], spacing: { after: 200 } })); }
  
  sections.push(new Paragraph({ children: [new TextRun({ text: 'ССЫЛКИ', bold: true, size: 26 })], heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }));
  addLine('Instagram', data.instagram);
  addLine('VK', data.vk);
  addLine('Spotify', data.spotify);
  addLine('Yandex Music', data.yandex);
  addLine('YouTube', data.youtube);
  addLine('TikTok', data.tiktok);
  addLine('Telegram', data.telegram);
  
  sections.push(new Paragraph({ text: '', spacing: { after: 200 } }));
  sections.push(new Paragraph({ children: [new TextRun({ text: 'КОНТАКТЫ', bold: true, size: 26 })], heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }));
  addLine('Букинг', data.bookingEmail);
  addLine('Менеджер', data.managerContact);
  
  if (data.pressPhotos) addLine('Пресс-фото', data.pressPhotos);
  if (data.liveVideos) addLine('Видео с выступлений', data.liveVideos);
  if (data.logoUrl) addLine('Логотип', data.logoUrl);
  if (data.techRiderUrl) addLine('Тех. райдер', data.techRiderUrl);
  if (data.hospitalityRiderUrl) addLine('Бытовой райдер', data.hospitalityRiderUrl);
  
  const doc = new Document({ sections: [{ children: sections }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `EPK_${(data.artistName || 'artist').replace(/\s/g, '_')}.docx`);
}

/* ═══ 1. CONTENT PLAN ═══ */
function ContentPlanTab({ currentUser, scripts, allFiles, onOpenScript }) {
  const [items] = useFirebase('contentPlan'); const [releases] = useFirebase('releases'); const [concerts] = useFirebase('concerts'); const [events] = useFirebase('calendarEvents');
  const [view, setView] = useState('month'); const [modal, setModal] = useState(null); const [eventModal, setEventModal] = useState(null); const [refDate, setRefDate] = useState(new Date());
  const [showArchive, setShowArchive] = useState(false);
  const [form, setForm] = useState({ title: '', platforms: ['Instagram'], format: 'Reels', date: today(), scriptId: '', status: 'idea', metricsUrl: '', metricsData: '', archived: false });
  const [eventForm, setEventForm] = useState({ title: '', date: today(), type: 'событие', color: '#007AFF' });
  const allItems = toList(items);
  const list = allItems.filter(it => !it.archived);
  const archivedList = allItems.filter(it => it.archived);
  const scriptList = toList(scripts), eventList = toList(events);
  const releaseEvents = toList(releases).filter(r => r.releaseDate).map(r => ({ _id: 'rel_' + r._id, title: '💿 ' + r.title, date: r.releaseDate, color: '#FF9500', auto: true }));
  const concertEvents = toList(concerts).filter(c => c.date).map(c => ({ _id: 'con_' + c._id, title: '🎤 ' + c.title, date: c.date, color: '#FF2D55', auto: true }));
  const allEvents = [...eventList, ...releaseEvents, ...concertEvents];
  const getPlatforms = (it) => { if (!it) return []; if (Array.isArray(it.platforms) && it.platforms.length) return it.platforms; if (it.platform) return [it.platform]; return []; };
  const addItem = () => {
    if (!form.title.trim()) return;
    // Normalize platforms: use array, fallback to platform string for legacy
    const data = { ...form };
    const r = fbPush('contentPlan', { ...data, createdBy: currentUser, updatedBy: currentUser, updatedAt: now(), statusChangedBy: currentUser });
    logActivity(currentUser, `добавил контент: ${form.title}`); notifyOther(currentUser, `добавил контент: ${form.title}`);
    setForm({ title: '', platforms: ['Instagram'], format: 'Reels', date: today(), scriptId: '', status: 'idea', metricsUrl: '', metricsData: '', archived: false });
    setModal(r.key);
  };
  const addEvent = () => { if (!eventForm.title.trim()) return; fbPush('calendarEvents', { ...eventForm, createdBy: currentUser }); setEventForm({ title: '', date: today(), type: 'событие', color: '#007AFF' }); setEventModal(null); };
  const updateItem = (id, u) => fbUpdate(`contentPlan/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() });
  const changeStatus = (id, s, t) => { fbUpdate(`contentPlan/${id}`, { status: s, statusChangedBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `статус «${t}» → ${STATUSES[s]?.label}`); notifyOther(currentUser, `статус «${t}» → ${STATUSES[s]?.label}`); };
  const archiveItem = (id, title) => { updateItem(id, { archived: true }); logActivity(currentUser, `в архив: ${title}`); setModal(null); };
  const unarchiveItem = (id, title) => { updateItem(id, { archived: false }); logActivity(currentUser, `вернул из архива: ${title}`); };
  const deleteItem = (id, title) => { if (!window.confirm(`Удалить «${title}» навсегда?`)) return; fbRemove(`contentPlan/${id}`); logActivity(currentUser, `удалил: ${title}`); setModal(null); };
  const moveToIdeas = (it) => {
    const platforms = getPlatforms(it).join(', ');
    fbPush('ideas', { text: `${it.title}${platforms ? ` (${platforms})` : ''}${it.metricsData ? ` · ${it.metricsData}` : ''}`, category: 'контент', createdBy: currentUser, createdAt: now() });
    logActivity(currentUser, `→ идеи: ${it.title}`); notifyOther(currentUser, `перенёс в идеи: ${it.title}`);
    fbRemove(`contentPlan/${it._id}`); setModal(null);
  };
  const year = refDate.getFullYear(), month = refDate.getMonth();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7; const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays = []; for (let i = 0; i < startDow; i++) calDays.push(null); for (let d = 1; d <= daysInMonth; d++) calDays.push(d);
  const getForDay = (d) => { const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return { content: list.filter(it => it.date === ds), events: allEvents.filter(e => e.date === ds) }; };
  const getWeekDays = () => { const d = new Date(refDate); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); const days = []; for (let i = 0; i < 7; i++) { days.push(new Date(d)); d.setDate(d.getDate() + 1); } return days; };
  const itemFiles = (id) => allFiles.filter(f => f.parentId === id);

  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <div className="cal-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
      <div className="cal-controls-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="cal-header-title" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: 'var(--text-primary)' }}>{MONTHS_RU[month]} <span className="cal-header-year" style={{ color: 'var(--text-muted)', fontWeight: 300 }}>{year}</span></div>
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          <button onClick={() => setRefDate(new Date(year, month - 1, 1))} style={{ background: 'transparent', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>‹</button>
          <button onClick={() => setRefDate(new Date())} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', height: 28, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}>Сегодня</button>
          <button onClick={() => setRefDate(new Date(year, month + 1, 1))} style={{ background: 'transparent', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>›</button>
        </div>
        <div className="seg-control" style={{ marginLeft: 8 }}>
          {['month','week'].map(v => <button key={v} onClick={() => setView(v)} className={view === v ? 'seg-active' : ''}>{v === 'month' ? 'Месяц' : 'Неделя'}</button>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Btn onClick={() => setShowArchive(!showArchive)} small outline color="var(--text-secondary)">{showArchive ? '◀ К календарю' : `📦 Архив${archivedList.length ? ` (${archivedList.length})` : ''}`}</Btn>
        {!showArchive && <><Btn onClick={() => setEventModal('add')} small outline color="var(--accent-purple)">+ Событие</Btn><Btn onClick={() => setModal('add')} small>+ Контент</Btn></>}
      </div>
    </div>

    {showArchive ? (
      <div className="list-card">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Архив контента — {archivedList.length}</div>
        {archivedList.length === 0 && <Empty text="В архиве пусто" />}
        {archivedList.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(it => <div key={it._id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => setModal(it._id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{it.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {getPlatforms(it).map(p => <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><PlatformIcon platform={p} size={11} /> {p}</span>)}
              <span>· {fmtDate(it.date)}</span>
              <span>· {it.format}</span>
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); unarchiveItem(it._id, it.title); }} style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 14, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Вернуть</button>
          <button onClick={(e) => { e.stopPropagation(); deleteItem(it._id, it.title); }} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>🗑</button>
        </div>)}
      </div>
    ) : (<>
    {view === 'month' ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, background: 'var(--border-cal)', border: '1px solid var(--border-cal)', borderRadius: 14, overflow: 'hidden' }}>
      {DAYS_RU.map(d => <div key={d} className="cal-day-header" style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', padding: '8px 4px', background: '#fff', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border-cal)', borderRight: '1px solid var(--border-cal)' }}>{d}</div>)}
      {calDays.map((d, i) => { if (!d) return <div key={i} style={{ background: '#FAFAFA', borderRight: '1px solid var(--border-cal)', borderBottom: '1px solid var(--border-cal)' }} />; const { content, events } = getForDay(d); const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear(); const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return <div key={i} className="cal-day-cell" onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('day-num-wrap') || e.target.classList.contains('day-cell-empty')) { setForm({ ...form, date: dateStr }); setModal('add'); } }} style={{ background: '#fff', minHeight: 96, padding: '4px 6px', borderRight: '1px solid var(--border-cal)', borderBottom: '1px solid var(--border-cal)', cursor: 'pointer', position: 'relative' }}>
        <div className="day-num-wrap" style={{ marginBottom: 3, display: 'flex', justifyContent: 'flex-end' }}>
          {isToday ? <div className="cal-day-today" style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{d}</div> : <div className="cal-day-num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', padding: '2px 6px' }}>{d}</div>}
        </div>
        {content.map(it => { const ps = getPlatforms(it); return <div key={it._id} className="cal-item" onClick={e => { e.stopPropagation(); setModal(it._id); }} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, marginBottom: 1, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUSES[stKey(it.status)].color, flexShrink: 0 }} />
          <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>{ps.slice(0, 3).map((p, i) => <PlatformIcon key={i} platform={p} size={10} />)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
        </div>; })}
        {events.map(ev => <div key={ev._id} className="cal-item" onClick={e => e.stopPropagation()} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, marginBottom: 1, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />{ev.title}</div>)}
        <div className="day-cell-empty" style={{ flex: 1, minHeight: 8 }}></div>
      </div>; })}
    </div> : <div className="cal-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
      {getWeekDays().map((d, i) => { const ds = d.toISOString().slice(0, 10); const isToday = ds === today(); const dc = list.filter(it => it.date === ds); const de = allEvents.filter(e => e.date === ds); return <Card key={i} style={{ padding: 12, borderColor: isToday ? 'var(--accent-blue)' : undefined, minHeight: 160, cursor: 'pointer' }} onClick={(e) => { if (e.target === e.currentTarget) { setForm({ ...form, date: ds }); setModal('add'); } }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{DAYS_RU[i]}</div>
        {isToday ? <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{d.getDate()}</div> : <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 8 }}>{d.getDate()}</div>}
        {dc.map(it => { const ps = getPlatforms(it); return <div key={it._id} onClick={e => { e.stopPropagation(); setModal(it._id); }} style={{ fontSize: 12, padding: 8, borderRadius: 8, marginBottom: 4, cursor: 'pointer', background: (STATUSES[stKey(it.status)].color) + '12', borderLeft: `3px solid ${STATUSES[stKey(it.status)].color}` }}>
          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-flex', gap: 2 }}>{ps.slice(0, 3).map((p, i) => <PlatformIcon key={i} platform={p} size={12} />)}</span> {it.title}</div>
        </div>; })}
        {de.map(ev => <div key={ev._id} style={{ fontSize: 12, padding: 6, borderRadius: 8, marginBottom: 4, background: ev.color + '15', borderLeft: `3px solid ${ev.color}`, color: ev.color }}>{ev.title}</div>)}
      </Card>; })}
    </div>}

    <Card className="table-card" style={{ overflow: 'hidden', marginTop: 16 }}>
      <div className="data-table"><div className="t-head" style={{ display: 'grid', gridTemplateColumns: '1.5fr 110px 70px 80px 80px 80px 60px 1fr 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}><span>Название</span><span>Платформы</span><span>Формат</span><span>Статус</span><span>Дата</span><span>Сценарий</span><span>Файлы</span><span>Метрики</span><span></span></div>
      {[...list].sort((a, b) => { const t0 = today(); const aU = (a.date || '') >= t0, bU = (b.date || '') >= t0; if (aU !== bU) return aU ? -1 : 1; return aU ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || ''); }).map(it => { const ls = scriptList.find(s => s._id === it.scriptId); const files = itemFiles(it._id); const ps = getPlatforms(it); return <div key={it._id} className="row-hover content-row" onClick={() => setModal(it._id)} style={{ display: 'grid', gridTemplateColumns: '1.5fr 110px 70px 80px 80px 80px 60px 1fr 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
        <div className="c-title"><div style={{ fontWeight: 500 }}>{it.title}</div>{it.statusChangedBy && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}><span style={{ color: USERS[it.statusChangedBy]?.color }}>{USERS[it.statusChangedBy]?.name}</span></span>}</div>
        <div className="c-plat" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>{ps.slice(0, 3).map((p, i) => <span key={i} title={p}><PlatformIcon platform={p} size={14} /></span>)}{ps.length > 3 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{ps.length - 3}</span>}</div>
        <Badge color="var(--accent-purple)">{it.format}</Badge>
        <Badge color={STATUSES[stKey(it.status)].color}>{STATUSES[stKey(it.status)].label}</Badge>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(it.date)}</span>
        {ls ? <button className="c-script" onClick={e => { e.stopPropagation(); onOpenScript(ls._id); }} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: 0 }}>📝 {ls.title}</button> : <span className="c-script" style={{ color: 'var(--text-muted)' }}>—</span>}
        <span className="c-files" style={{ fontSize: 12, color: files.length ? 'var(--accent-green)' : 'var(--text-muted)' }}>{files.length ? `📁${files.length}` : '—'}</span>
        <div className="c-metrics" style={{ fontSize: 11 }}>{it.metricsData ? <span style={{ color: 'var(--accent-green)' }}>{it.metricsData}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
        <button onClick={e => { e.stopPropagation(); archiveItem(it._id, it.title); }} title="В архив" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>📦</button>
      </div>; })}</div>{list.length === 0 && <Empty text="Нет контента" />}
    </Card>
    </>)}

    <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Новый контент' : 'Редактировать'} wide>
      {modal === 'add' ? <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus /></Field></div>
        <Field label="Дата"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Формат"><select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}>{CONTENT_FORMATS.map(f => <option key={f}>{f}</option>)}</select></Field>
        <div style={{ gridColumn: '1/-1' }}>
          <Field label="Платформы (выбери одну или несколько)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{PLATFORMS.map(p => { const sel = form.platforms.includes(p); return <button key={p} type="button" onClick={() => { setForm({ ...form, platforms: sel ? form.platforms.filter(x => x !== p) : [...form.platforms, p] }); }} style={{ padding: '6px 12px', borderRadius: 16, border: `1.5px solid ${sel ? 'var(--accent-blue)' : 'var(--border)'}`, background: sel ? 'var(--accent-blue)' : '#fff', color: sel ? '#fff' : 'var(--text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><PlatformIcon platform={p} size={12} /> {p}</button>; })}</div>
          </Field>
        </div>
        <Field label="Статус"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUS_KEYS.map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}</select></Field>
        <Field label="Сценарий"><select value={form.scriptId} onChange={e => setForm({ ...form, scriptId: e.target.value })}><option value="">— нет —</option>{scriptList.map(s => <option key={s._id} value={s._id}>{s.title}</option>)}</select></Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Метрики"><input value={form.metricsData} onChange={e => setForm({ ...form, metricsData: e.target.value })} placeholder="10K views" /></Field></div>
        <div style={{ gridColumn: '1/-1' }}><Btn onClick={addItem}>Создать и добавить файлы →</Btn></div>
      </div> : (() => { const it = allItems.find(x => x._id === modal); if (!it) return null; const ls = scriptList.find(s => s._id === it.scriptId); const files = itemFiles(it._id); const currentPlatforms = getPlatforms(it); return <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={it.title || ''} onChange={e => updateItem(it._id, { title: e.target.value })} /></Field></div>
        <Field label="Дата"><input type="date" value={it.date || ''} onChange={e => updateItem(it._id, { date: e.target.value })} /></Field>
        <Field label="Формат"><select value={it.format || ''} onChange={e => updateItem(it._id, { format: e.target.value })}>{CONTENT_FORMATS.map(f => <option key={f}>{f}</option>)}</select></Field>
        <div style={{ gridColumn: '1/-1' }}>
          <Field label="Платформы">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{PLATFORMS.map(p => { const sel = currentPlatforms.includes(p); return <button key={p} type="button" onClick={() => { const np = sel ? currentPlatforms.filter(x => x !== p) : [...currentPlatforms, p]; updateItem(it._id, { platforms: np, platform: null }); }} style={{ padding: '6px 12px', borderRadius: 16, border: `1.5px solid ${sel ? 'var(--accent-blue)' : 'var(--border)'}`, background: sel ? 'var(--accent-blue)' : '#fff', color: sel ? '#fff' : 'var(--text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><PlatformIcon platform={p} size={12} /> {p}</button>; })}</div>
          </Field>
        </div>
        <Field label="Статус"><select value={stKey(it.status)} onChange={e => changeStatus(it._id, e.target.value, it.title)}>{STATUS_KEYS.map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}</select>{it.statusChangedBy && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>отметил: <span style={{ color: USERS[it.statusChangedBy]?.color }}>{USERS[it.statusChangedBy]?.name}</span></div>}</Field>
        <Field label="Сценарий"><select value={it.scriptId || ''} onChange={e => updateItem(it._id, { scriptId: e.target.value })}><option value="">— нет —</option>{scriptList.map(s => <option key={s._id} value={s._id}>{s.title}</option>)}</select>{ls && <button onClick={() => { setModal(null); setTimeout(() => onOpenScript(ls._id), 100); }} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 12, cursor: 'pointer', marginTop: 4, padding: 0 }}>→ Открыть «{ls.title}»</button>}</Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Метрики"><input value={it.metricsData || ''} onChange={e => updateItem(it._id, { metricsData: e.target.value })} /></Field></div>
        <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border-light)', paddingTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Файлы</div>
          <FileList files={files} />
          <div className="release-files" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>🎬 Видео</div><YDFileUploader currentUser={currentUser} parentId={it._id} tag="видео" subFolder={`content/${it._id}`} /></div>
            <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>🖼 Фото</div><YDFileUploader currentUser={currentUser} parentId={it._id} tag="обложка" subFolder={`content/${it._id}`} /></div>
          </div>
        </div>
        <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border-light)', paddingTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Изменил: {USERS[it.updatedBy]?.name} · {it.updatedAt}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn onClick={() => setModal(null)} small>💾 Сохранить</Btn>
            <Btn onClick={() => moveToIdeas(it)} small outline color="var(--accent-purple)">💡 В идеи</Btn>
            {!it.archived && <Btn onClick={() => archiveItem(it._id, it.title)} small outline color="var(--text-secondary)">📦 В архив</Btn>}
            {it.archived && <Btn onClick={() => unarchiveItem(it._id, it.title)} small outline color="var(--accent-blue)">↩ Из архива</Btn>}
            <Btn onClick={() => deleteItem(it._id, it.title)} small color="var(--accent-red)">🗑 Удалить</Btn>
          </div>
        </div>
      </div>; })()}
    </Modal>
    <Modal open={!!eventModal} onClose={() => setEventModal(null)} title="Новое событие">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Название"><input value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} placeholder="Релиз трека, выступление..." autoFocus /></Field>
        <Field label="Дата"><input type="date" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} /></Field>
        <Field label="Тип"><select value={eventForm.type} onChange={e => setEventForm({ ...eventForm, type: e.target.value })}>{['событие','релиз','выступление','дедлайн','другое'].map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Цвет"><select value={eventForm.color} onChange={e => setEventForm({ ...eventForm, color: e.target.value })}><option value="#007AFF">Синий</option><option value="#FF9500">Оранжевый</option><option value="#FF2D55">Розовый</option><option value="#34C759">Зелёный</option><option value="#AF52DE">Фиолетовый</option></select></Field>
        <Btn onClick={addEvent} color="var(--accent-purple)">Добавить</Btn>
      </div>
    </Modal>
  </div>;
}

/* ═══ 2. SCRIPTS (auto-open editor on create) ═══ */
// Темпы речи (слов в минуту) — как на hronomer.ru
const SPEECH_PACE = [
  { id: 'slow', label: 'Медленно', wpm: 100, hint: 'вдумчиво, реклама, аудиогид' },
  { id: 'normal', label: 'Обычно', wpm: 130, hint: 'спокойная начитка, закадр' },
  { id: 'fast', label: 'Быстро', wpm: 160, hint: 'энергично, разговорный Reels' },
];
function analyzeText(text) {
  const t = (text || '').trim();
  const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
  const chars = (text || '').length;
  const charsNoSpace = (text || '').replace(/\s/g, '').length;
  // Стандартная «страница» = 1800 знаков с пробелами
  const pages = chars / 1800;
  return { words, chars, charsNoSpace, pages };
}
function fmtDur(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m === 0) return `${s} сек`;
  return `${m} мин ${String(s).padStart(2, '0')} сек`;
}
function Chronometer({ text, pace, setPace }) {
  const { words, chars, pages } = analyzeText(text);
  const wpm = SPEECH_PACE.find(p => p.id === pace)?.wpm || 130;
  const sec = words / wpm * 60;
  return <div className="ios-card" style={{ padding: 14, marginTop: 10, background: 'var(--bg-card)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>⏱ Хронометраж</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-purple)', letterSpacing: -0.5 }}>{fmtDur(sec)}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
      <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg-surface)', borderRadius: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{words}</div><div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>слов</div>
      </div>
      <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg-surface)', borderRadius: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{chars}</div><div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>знаков</div>
      </div>
      <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg-surface)', borderRadius: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{pages.toFixed(1).replace('.', ',')}</div><div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{pages < 2 ? 'страница' : 'страниц'}</div>
      </div>
    </div>
    <div className="seg-control" style={{ width: '100%', display: 'flex' }}>
      {SPEECH_PACE.map(p => <button key={p.id} onClick={() => setPace(p.id)} className={pace === p.id ? 'seg-active' : ''} style={{ flex: 1 }} title={`${p.wpm} слов/мин — ${p.hint}`}>{p.label}</button>)}
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>{SPEECH_PACE.find(p => p.id === pace)?.wpm} слов/мин · {SPEECH_PACE.find(p => p.id === pace)?.hint}</div>
  </div>;
}

function ScriptsTab({ currentUser, scripts, openScriptId, setOpenScriptId }) {
  const [modal, setModal] = useState(null); const [form, setForm] = useState({ title: '', location: '', format: '' }); const [saved, setSaved] = useState(false); const [localBody, setLocalBody] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [pace, setPace] = useState('normal');
  const all = toList(scripts);
  const list = all.filter(s => showArchive ? s.archived : !s.archived);
  const archivedCount = all.filter(s => s.archived).length;
  useEffect(() => { if (openScriptId) { const s = all.find(x => x._id === openScriptId); if (s) setLocalBody(s.body || ''); setModal(openScriptId); setOpenScriptId(null); } }, [openScriptId]);
  const addScript = () => { if (!form.title.trim()) return; const r = fbPush('scripts', { ...form, body: '', createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `создал сценарий: ${form.title}`); notifyOther(currentUser, `создал сценарий: ${form.title}`); setForm({ title: '', location: '', format: '' }); setLocalBody(''); setModal(r.key); };
  const openEditor = (id) => { const s = all.find(x => x._id === id); if (s) setLocalBody(s.body || ''); setModal(id); setSaved(false); };
  const saveScript = (id) => { fbUpdate(`scripts/${id}`, { body: localBody, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, 'сохранил сценарий'); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const deleteScript = (id) => { fbRemove(`scripts/${id}`); logActivity(currentUser, 'удалил сценарий'); setModal(null); };
  const toggleArchive = (id, s) => { fbUpdate(`scripts/${id}`, { archived: !s.archived, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `${s.archived ? 'вернул из архива' : 'убрал в архив'}: ${s.title}`); };
  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <PageHead title="Сценарии" count={list.length} color="var(--accent-purple)">
      {(archivedCount > 0 || showArchive) && <div className="seg-control">
        {[{ id: false, l: 'Активные' }, { id: true, l: `Архив · ${archivedCount}` }].map(v => <button key={String(v.id)} onClick={() => setShowArchive(v.id)} className={showArchive === v.id ? 'seg-active' : ''}>{v.l}</button>)}
      </div>}
      <Btn onClick={() => setModal('add')} small color="var(--accent-purple)">+ Сценарий</Btn>
    </PageHead>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>{list.map(s => <Card key={s._id} style={{ padding: 16, cursor: 'pointer', opacity: s.archived ? 0.7 : 1 }} onClick={() => openEditor(s._id)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
        <button onClick={e => { e.stopPropagation(); toggleArchive(s._id, s); }} title={s.archived ? 'Вернуть из архива' : 'В архив'} style={{ background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', padding: 2, flexShrink: 0, opacity: 0.6 }}>{s.archived ? '↩' : '📦'}</button>
      </div>
      {s.location && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>📍 {s.location}</div>}{s.format && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🎬 {s.format}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden', fontFamily: 'var(--font-mono)' }}>{s.body?.slice(0, 200) || 'Пусто'}</div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><UserPhoto uid={s.updatedBy} size={22} /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.updatedAt?.slice(0, 10)}</span></div>
    </Card>)}</div>{list.length === 0 && <Empty text={showArchive ? 'Архив пуст' : 'Нет сценариев'} />}
    <Modal open={!!modal} onClose={() => { setModal(null); setLocalBody(''); }} title={modal === 'add' ? 'Новый сценарий' : 'Редактор'} wide>
      {modal === 'add' ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Локация"><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Студия, улица..." /></Field>
        <Field label="Формат"><input value={form.format} onChange={e => setForm({ ...form, format: e.target.value })} placeholder="Reels, клип..." /></Field>
        <Btn onClick={addScript} color="var(--accent-purple)">Создать →</Btn>
      </div> : (() => { const s = all.find(x => x._id === modal); if (!s) return null; return <div>
        <div className="script-editor-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}><Field label="Название"><textarea value={s.title || ''} onChange={e => fbUpdate(`scripts/${s._id}`, { title: e.target.value })} rows={2} style={{ fontSize: 17, fontWeight: 600, border: 'none', padding: 0, boxShadow: 'none', resize: 'none', minHeight: 0, lineHeight: 1.3, background: 'transparent' }} /></Field></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>{saved && <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 500 }}>✓</span>}<Btn onClick={() => saveScript(s._id)} small>Сохранить</Btn><Btn onClick={() => { toggleArchive(s._id, s); setModal(null); }} outline small color="var(--accent-orange)">{s.archived ? '↩ Вернуть' : '📦 В архив'}</Btn><Btn onClick={() => deleteScript(s._id)} color="var(--accent-red)" outline small>Удалить</Btn></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <Field label="📍 Локация"><input value={s.location || ''} onChange={e => fbUpdate(`scripts/${s._id}`, { location: e.target.value, updatedBy: currentUser, updatedAt: now() })} /></Field>
          <Field label="🎬 Формат"><input value={s.format || ''} onChange={e => fbUpdate(`scripts/${s._id}`, { format: e.target.value, updatedBy: currentUser, updatedAt: now() })} /></Field>
        </div>
        <Field label="Сценарий"><textarea className="script-body" value={localBody} onChange={e => { setLocalBody(e.target.value); setSaved(false); }} rows={18} style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, lineHeight: 1.65, letterSpacing: 0, background: '#FAFAFA', border: '1px solid var(--border-light)', borderRadius: 14, padding: 20, width: '100%', minHeight: 400 }} placeholder="Напиши сценарий..." /></Field>
        <Chronometer text={localBody} pace={pace} setPace={setPace} />
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>{USERS[s.updatedBy]?.name} · {s.updatedAt}</div>
      </div>; })()}
    </Modal>
  </div>;
}

/* ═══ 3. IDEAS ═══ */
function IdeasTab({ currentUser }) {
  const [ideas] = useFirebase('ideas'); const [form, setForm] = useState({ text: '', category: 'общее' }); const list = toList(ideas).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const CATS = ['общее','музыка','контент','визуал','бизнес','тексты','другое']; const catC = { 'общее':'#007AFF','музыка':'#FF3B30','контент':'#AF52DE','визуал':'#FF9500','бизнес':'#34C759','тексты':'#FF2D55','другое':'#AEAEB2' };
  const add = () => { if (!form.text.trim()) return; fbPush('ideas', { ...form, createdBy: currentUser, createdAt: now() }); logActivity(currentUser, 'записал идею'); notifyOther(currentUser, 'записал новую идею'); setForm({ text: '', category: 'общее' }); };
  return <div style={{ animation: 'fadeIn .2s ease' }}><PageHead title="Идеи" count={list.length} color="var(--accent-yellow)" />
    <Card style={{ padding: 16, marginBottom: 20 }}><div className="idea-add" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}><div style={{ flex: 1 }}><textarea value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} placeholder="Запиши идею..." rows={2} style={{ minHeight: 50 }} /></div><div style={{ width: 120 }}><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div><Btn onClick={add} small>Записать</Btn></div></Card>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>{list.map(i => <Card key={i._id} style={{ padding: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Badge color={catC[i.category] || '#888'}>{i.category}</Badge><button onClick={() => fbRemove(`ideas/${i._id}`)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button></div><div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{i.text}</div><div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><UserPhoto uid={i.createdBy} size={20} /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(i.createdAt)}</span></div></Card>)}</div>
    {list.length === 0 && <Empty text="Пока нет идей" />}
  </div>;
}

/* ═══ 4. RELEASES (with save/delete buttons, streaming links) ═══ */
function ReleasesTab({ currentUser, allFiles }) {
  const [releases] = useFirebase('releases'); const [modal, setModal] = useState(null); const [saved, setSaved] = useState(false);
  const [localData, setLocalData] = useState(null);
  const [form, setForm] = useState({ title: '', releaseDate: '', stage: 'Идея', coverState: 'Нет', lyrics: '', notes: '', bpm: '', key: '', genre: '', spotifyUrl: '', yandexUrl: '', vkUrl: '', appleMusicUrl: '' });
  const list = toList(releases);
  const addR = () => { if (!form.title.trim()) return; const r = fbPush('releases', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `релиз: ${form.title}`); notifyOther(currentUser, `релиз: ${form.title}`); setForm({ title: '', releaseDate: '', stage: 'Идея', coverState: 'Нет', lyrics: '', notes: '', bpm: '', key: '', genre: '', spotifyUrl: '', yandexUrl: '', vkUrl: '', appleMusicUrl: '' }); openRelease(r.key); };
  const openRelease = (id) => { const r = list.find(x => x._id === id); if (r) setLocalData({ ...r }); setModal(id); setSaved(false); };
  const saveRelease = (id) => { if (!localData) return; const { _id, ...data } = localData; fbUpdate(`releases/${id}`, { ...data, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, 'сохранил релиз'); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const deleteRelease = (id) => { fbRemove(`releases/${id}`); logActivity(currentUser, 'удалил релиз'); setModal(null); setLocalData(null); };
  const stC = s => ({ 'Идея': '#AF52DE', 'Демо': '#FF9500', 'Запись': '#007AFF', 'Сведение': '#FF2D55', 'Мастеринг': '#FA903E', 'Готов к релизу': '#34C759', 'Вышел': '#32ADE6' }[s] || '#999');
  const rF = id => allFiles.filter(f => f.parentId === id);
  const ld = (field, val) => { setLocalData(prev => ({ ...prev, [field]: val })); setSaved(false); };

  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <PageHead title="Релизы" count={list.length} color="var(--accent-red)"><Btn onClick={() => setModal('add')} small color="var(--accent-red)">+ Релиз</Btn></PageHead>
    <Card className="table-card" style={{ overflow: 'hidden' }}>
      <div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.5fr 90px 100px 80px 60px 80px 1fr 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}><span>Трек</span><span>Дата</span><span>Стадия</span><span>Обложка</span><span>Файлы</span><span>Кто</span><span>Заметки</span><span></span></div>
      {list.sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || '')).map(r => { const f = rF(r._id); return <div key={r._id} className="row-hover" onClick={() => openRelease(r._id)} style={{ display: 'grid', gridTemplateColumns: '1.5fr 90px 100px 80px 60px 80px 1fr 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>{r.title}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(r.releaseDate)}</span><Badge color={stC(r.stage)}>{r.stage}</Badge><Badge color={r.coverState === 'Утверждена' ? 'var(--accent-green)' : 'var(--text-muted)'}>{r.coverState}</Badge>
        <span style={{ fontSize: 11, color: f.length ? 'var(--accent-green)' : 'var(--text-muted)' }}>{f.length ? `📁${f.length}` : '—'}</span><UserPhoto uid={r.updatedBy} size={22} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</span>
        <button onClick={e => { e.stopPropagation(); deleteRelease(r._id); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button>
      </div>; })}</div>{list.length === 0 && <Empty text="Нет релизов" />}
    </Card>
    <Modal open={!!modal} onClose={() => { setModal(null); setLocalData(null); }} title={modal === 'add' ? 'Новый релиз' : 'Релиз'} wide>
      {modal === 'add' ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field></div>
        <Field label="Дата"><input type="date" value={form.releaseDate} onChange={e => setForm({ ...form, releaseDate: e.target.value })} /></Field>
        <Field label="Стадия"><select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>{RELEASE_STAGES.map(s => <option key={s}>{s}</option>)}</select></Field>
        <Field label="BPM"><input value={form.bpm} onChange={e => setForm({ ...form, bpm: e.target.value })} /></Field>
        <Field label="Тональность"><input value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} /></Field>
        <Field label="Жанр"><input value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })} /></Field>
        <div style={{ gridColumn: '1/-1' }}><Btn onClick={addR} color="var(--accent-orange)">Создать и добавить файлы →</Btn></div>
      </div> : (() => { const r = list.find(x => x._id === modal); if (!r) return null; const d = localData || r; const f = rF(r._id);
        const coverF = f.filter(x => x.tag === 'обложка'), trackF = f.filter(x => x.tag === 'трек'), photoF = f.filter(x => x.tag === 'фото');
        return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Field label="Название"><input value={d.title || ''} onChange={e => ld('title', e.target.value)} style={{ fontSize: 18, fontWeight: 600, border: 'none', padding: 0, boxShadow: 'none' }} /></Field>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{saved && <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 500 }}>✓</span>}<Btn onClick={() => saveRelease(r._id)}>Сохранить</Btn><Btn onClick={() => deleteRelease(r._id)} color="var(--accent-red)" outline small>Удалить</Btn></div>
          </div>
          <Field label="Дата"><input type="date" value={d.releaseDate || ''} onChange={e => ld('releaseDate', e.target.value)} /></Field>
          <Field label="Стадия"><select value={d.stage} onChange={e => ld('stage', e.target.value)}>{RELEASE_STAGES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Обложка"><select value={d.coverState} onChange={e => ld('coverState', e.target.value)}>{COVER_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="BPM"><input value={d.bpm || ''} onChange={e => ld('bpm', e.target.value)} /></Field>
          <Field label="Тональность"><input value={d.key || ''} onChange={e => ld('key', e.target.value)} /></Field>
          <Field label="Жанр"><input value={d.genre || ''} onChange={e => ld('genre', e.target.value)} /></Field>
          <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border-light)', paddingTop: 12 }}><div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>🔗 Стриминги</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Spotify"><input value={d.spotifyUrl || ''} onChange={e => ld('spotifyUrl', e.target.value)} placeholder="https://open.spotify.com/..." /></Field>
            <Field label="Yandex Music"><input value={d.yandexUrl || ''} onChange={e => ld('yandexUrl', e.target.value)} /></Field>
            <Field label="VK Музыка"><input value={d.vkUrl || ''} onChange={e => ld('vkUrl', e.target.value)} /></Field>
            <Field label="Apple Music"><input value={d.appleMusicUrl || ''} onChange={e => ld('appleMusicUrl', e.target.value)} /></Field>
          </div></div>
          <div style={{ gridColumn: '1/-1' }}><Field label="Текст"><textarea rows={6} value={d.lyrics || ''} onChange={e => ld('lyrics', e.target.value)} /></Field></div>
          <div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={d.notes || ''} onChange={e => ld('notes', e.target.value)} /></Field></div>
          <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border-light)', paddingTop: 14 }}><div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Файлы</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>🖼 Обложка</div><FileList files={coverF} /><YDFileUploader currentUser={currentUser} parentId={r._id} tag="обложка" subFolder={`releases/${r._id}`} /></div>
            <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>🎵 Трек</div><FileList files={trackF} /><YDFileUploader currentUser={currentUser} parentId={r._id} tag="трек" subFolder={`releases/${r._id}`} /></div>
            <div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>📸 Фото</div><FileList files={photoF} /><YDFileUploader currentUser={currentUser} parentId={r._id} tag="фото" subFolder={`releases/${r._id}`} /></div>
          </div></div>
          <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)' }}>{USERS[r.updatedBy]?.name} · {r.updatedAt}</div>
        </div>; })()}
    </Modal>
  </div>;
}

/* ═══ 5. CONCERTS ═══ */
function ConcertsTab({ currentUser }) {
  const [concerts] = useFirebase('concerts'); const [modal, setModal] = useState(null);
  const [view, setView] = useState('list');
  const [refDate, setRefDate] = useState(new Date());
  const [form, setForm] = useState({ title: '', date: '', dateEnd: '', time: '', venue: '', city: '', fee: '', status: 'Подтверждено', notes: '', contactName: '', contactPhone: '' });
  const list = toList(concerts); const CS = ['Запрос', 'В обсуждении', 'Подтверждено', 'Отменено', 'Прошло'];
  const addC = () => { if (!form.title.trim()) return; fbPush('concerts', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `концерт: ${form.title}`); notifyOther(currentUser, `концерт: ${form.title}`); setForm({ title: '', date: '', dateEnd: '', time: '', venue: '', city: '', fee: '', status: 'Подтверждено', notes: '', contactName: '', contactPhone: '' }); setModal(null); };
  const upd = (id, u) => fbUpdate(`concerts/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() });
  
  const year = refDate.getFullYear(), month = refDate.getMonth();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays = []; for (let i = 0; i < startDow; i++) calDays.push(null); for (let d = 1; d <= daysInMonth; d++) calDays.push(d);
  const getForDay = (d) => { const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return list.filter(c => c.dateEnd && c.dateEnd > c.date ? (ds >= c.date && ds <= c.dateEnd) : c.date === ds); };
  const stColor = s => s === 'Подтверждено' ? 'var(--accent-green)' : s === 'Отменено' ? 'var(--accent-red)' : s === 'Прошло' ? 'var(--text-muted)' : 'var(--accent-yellow)';
  
  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <PageHead title="Концерты" count={list.length} color="var(--accent-pink)">
      <div className="seg-control">
        {[{ id: 'list', l: 'Список' }, { id: 'calendar', l: 'Календарь' }].map(v => <button key={v.id} onClick={() => setView(v.id)} className={view === v.id ? 'seg-active' : ''}>{v.l}</button>)}
      </div>
      <Btn onClick={() => setModal('add')} small color="var(--accent-pink)">+ Концерт</Btn>
    </PageHead>
    
    {view === 'calendar' ? <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{MONTHS_RU[month]} <span style={{ color: 'var(--text-muted)', fontWeight: 300 }}>{year}</span></div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button onClick={() => setRefDate(new Date(year, month - 1, 1))} style={{ background: 'transparent', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>‹</button>
          <button onClick={() => setRefDate(new Date())} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', height: 28, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}>Сегодня</button>
          <button onClick={() => setRefDate(new Date(year, month + 1, 1))} style={{ background: 'transparent', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>›</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, background: 'var(--border-cal)', border: '1px solid var(--border-cal)', overflow: 'hidden', borderRadius: 12 }}>
        {DAYS_RU.map(d => <div key={d} className="cal-day-header" style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', padding: '8px 4px', background: '#fff', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border-cal)', borderRight: '1px solid var(--border-cal)' }}>{d}</div>)}
        {calDays.map((d, i) => { if (!d) return <div key={i} style={{ background: '#FAFAFA', borderRight: '1px solid var(--border-cal)', borderBottom: '1px solid var(--border-cal)' }} />; const dayConcerts = getForDay(d); const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear(); const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return <div key={i} className="cal-day-cell" onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('day-num-wrap')) { setForm({ ...form, date: dateStr }); setModal('add'); } }} style={{ background: '#fff', minHeight: 96, padding: '4px 6px', borderRight: '1px solid var(--border-cal)', borderBottom: '1px solid var(--border-cal)', cursor: 'pointer' }}>
          <div className="day-num-wrap" style={{ marginBottom: 3, display: 'flex', justifyContent: 'flex-end' }}>
            {isToday ? <div className="cal-day-today" style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-pink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{d}</div> : <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', padding: '2px 6px' }}>{d}</div>}
          </div>
          {dayConcerts.map(c => <div key={c._id} className="cal-item" onClick={e => { e.stopPropagation(); setModal(c._id); }} style={{ fontSize: 11, padding: '3px 5px', borderRadius: 4, marginBottom: 2, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: stColor(c.status), flexShrink: 0 }} />
            {dateStr === c.date ? <>🎤 {c.time && <span style={{ opacity: 0.7 }}>{c.time} </span>}</> : <span style={{ opacity: 0.55 }}>→ </span>}{c.title}
          </div>)}
        </div>; })}
      </div>
    </div> : <Card className="table-card" style={{ overflow: 'hidden' }}><div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px 60px 1fr 1fr 90px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}><span>Название</span><span>Дата</span><span>Время</span><span>Площадка</span><span>Город</span><span>Статус</span><span>Кто</span><span></span></div>
      {[...list].sort((a, b) => { const t0 = today(); const ae = a.dateEnd || a.date || '', be = b.dateEnd || b.date || ''; const aU = ae >= t0, bU = be >= t0; if (aU !== bU) return aU ? -1 : 1; return aU ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || ''); }).map(c => <div key={c._id} className="row-hover" onClick={() => setModal(c._id)} style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px 60px 1fr 1fr 90px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}><span style={{ fontWeight: 500 }}>{c.title}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtRange(c.date, c.dateEnd)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.time || '—'}</span><span style={{ color: 'var(--text-secondary)' }}>{c.venue || '—'}</span><span style={{ color: 'var(--text-secondary)' }}>{c.city || '—'}</span><Badge color={stColor(c.status)}>{c.status}</Badge><UserPhoto uid={c.updatedBy} size={22} /><button onClick={e => { e.stopPropagation(); fbRemove(`concerts/${c._id}`); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button></div>)}</div>
      {list.length === 0 && <Empty text="Нет концертов" />}</Card>}
    
    <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Новый концерт' : 'Редактировать'}>{modal === 'add' ? <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field></div><Field label="Дата (начало)"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field><Field label="Дата окончания"><input type="date" value={form.dateEnd} min={form.date || undefined} onChange={e => setForm({ ...form, dateEnd: e.target.value })} /></Field><Field label="Время"><input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} placeholder="20:00" /></Field><Field label="Площадка"><input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} /></Field><Field label="Город"><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field><Field label="Гонорар"><input value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} /></Field><Field label="Статус"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{CS.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Контакт"><input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /></Field><Field label="Телефон"><input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></Field><div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div><div style={{ gridColumn: '1/-1' }}><Btn onClick={addC} color="var(--accent-pink)">Создать</Btn></div></div> : (() => { const c = list.find(x => x._id === modal); if (!c) return null; return <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={c.title || ''} onChange={e => upd(c._id, { title: e.target.value })} /></Field></div><Field label="Дата (начало)"><input type="date" value={c.date || ''} onChange={e => upd(c._id, { date: e.target.value })} /></Field><Field label="Дата окончания"><input type="date" value={c.dateEnd || ''} min={c.date || undefined} onChange={e => upd(c._id, { dateEnd: e.target.value })} /></Field><Field label="Время"><input value={c.time || ''} onChange={e => upd(c._id, { time: e.target.value })} /></Field><Field label="Площадка"><input value={c.venue || ''} onChange={e => upd(c._id, { venue: e.target.value })} /></Field><Field label="Город"><input value={c.city || ''} onChange={e => upd(c._id, { city: e.target.value })} /></Field><Field label="Гонорар"><input value={c.fee || ''} onChange={e => upd(c._id, { fee: e.target.value })} /></Field><Field label="Статус"><select value={c.status} onChange={e => upd(c._id, { status: e.target.value })}>{CS.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Контакт"><input value={c.contactName || ''} onChange={e => upd(c._id, { contactName: e.target.value })} /></Field><Field label="Телефон"><input value={c.contactPhone || ''} onChange={e => upd(c._id, { contactPhone: e.target.value })} /></Field><div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={c.notes || ''} onChange={e => upd(c._id, { notes: e.target.value })} /></Field></div><div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)' }}>{USERS[c.updatedBy]?.name} · {c.updatedAt}</div><div style={{ gridColumn: '1/-1' }}><Btn onClick={() => { fbRemove(`concerts/${c._id}`); setModal(null); }} color="var(--accent-red)" outline small>Удалить концерт</Btn></div></div>; })()}</Modal>
  </div>;
}

/* ═══ 6. CONTACTS ═══ */
function ContactsTab({ currentUser }) {
  const [contacts] = useFirebase('contacts'); const [modal, setModal] = useState(null); const [form, setForm] = useState({ name: '', company: '', role: '', offer: '', email: '', phone: '', social: '', status: 'Новый', notes: '' }); const list = toList(contacts); const CS = ['Новый', 'В переговорах', 'Согласовано', 'Отказ', 'Завершено'];
  const addC = () => { if (!form.name.trim()) return; fbPush('contacts', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `контакт: ${form.name}`); notifyOther(currentUser, `контакт: ${form.name}`); setForm({ name: '', company: '', role: '', offer: '', email: '', phone: '', social: '', status: 'Новый', notes: '' }); setModal(null); };
  const upd = (id, u) => fbUpdate(`contacts/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() });
  return <div style={{ animation: 'fadeIn .2s ease' }}><PageHead title="Контакты" count={list.length} color="var(--accent-green)"><Btn onClick={() => setModal('add')} small color="var(--accent-green)">+ Контакт</Btn></PageHead>
    <Card className="table-card" style={{ overflow: 'hidden' }}><div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.5fr 80px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}><span>Имя</span><span>Компания</span><span>Роль</span><span>Предложение</span><span>Статус</span><span>Кто</span><span></span></div>
      {list.map(c => <div key={c._id} className="row-hover" onClick={() => setModal(c._id)} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.5fr 80px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}><span style={{ fontWeight: 500 }}>{c.name}</span><span style={{ color: 'var(--text-secondary)' }}>{c.company || '—'}</span><span style={{ color: 'var(--text-secondary)' }}>{c.role || '—'}</span><span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.offer || '—'}</span><Badge color={c.status === 'Согласовано' ? 'var(--accent-green)' : c.status === 'Отказ' ? 'var(--accent-red)' : 'var(--accent-yellow)'}>{c.status}</Badge><UserPhoto uid={c.updatedBy} size={22} /><button onClick={e => { e.stopPropagation(); fbRemove(`contacts/${c._id}`); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button></div>)}</div>
      {list.length === 0 && <Empty text="Нет контактов" />}</Card>
    <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Новый контакт' : 'Редактировать'}>{modal === 'add' ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Имя"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><Field label="Компания"><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></Field><Field label="Роль"><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></Field><Field label="Статус"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{CS.map(s => <option key={s}>{s}</option>)}</select></Field><div style={{ gridColumn: '1/-1' }}><Field label="Предложение"><textarea value={form.offer} onChange={e => setForm({ ...form, offer: e.target.value })} /></Field></div><Field label="Email"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field><Field label="Телефон"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field><div style={{ gridColumn: '1/-1' }}><Field label="Соцсети"><input value={form.social} onChange={e => setForm({ ...form, social: e.target.value })} /></Field></div><div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div><div style={{ gridColumn: '1/-1' }}><Btn onClick={addC} color="var(--accent-cyan)">Создать</Btn></div></div> : (() => { const c = list.find(x => x._id === modal); if (!c) return null; return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Имя"><input value={c.name || ''} onChange={e => upd(c._id, { name: e.target.value })} /></Field><Field label="Компания"><input value={c.company || ''} onChange={e => upd(c._id, { company: e.target.value })} /></Field><Field label="Роль"><input value={c.role || ''} onChange={e => upd(c._id, { role: e.target.value })} /></Field><Field label="Статус"><select value={c.status} onChange={e => upd(c._id, { status: e.target.value })}>{CS.map(s => <option key={s}>{s}</option>)}</select></Field><div style={{ gridColumn: '1/-1' }}><Field label="Предложение"><textarea value={c.offer || ''} onChange={e => upd(c._id, { offer: e.target.value })} /></Field></div><Field label="Email"><input value={c.email || ''} onChange={e => upd(c._id, { email: e.target.value })} /></Field><Field label="Телефон"><input value={c.phone || ''} onChange={e => upd(c._id, { phone: e.target.value })} /></Field><div style={{ gridColumn: '1/-1' }}><Field label="Соцсети"><input value={c.social || ''} onChange={e => upd(c._id, { social: e.target.value })} /></Field></div><div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={c.notes || ''} onChange={e => upd(c._id, { notes: e.target.value })} /></Field></div><div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)' }}>{USERS[c.updatedBy]?.name} · {c.updatedAt}</div></div>; })()}</Modal>
  </div>;
}

/* ═══ 7. EPK (with Telegram, Firebase Storage riders, Word export) ═══ */
function EPKTab({ currentUser }) {
  const [epk] = useFirebase('epk'); const d = epk || {};
  const upd = u => fbUpdate('epk', { ...u, updatedBy: currentUser, updatedAt: now() });
  return <div style={{ animation: 'fadeIn .2s ease', maxWidth: 700 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div><h3 style={{ fontSize: 19, fontWeight: 600 }}>Electronic Press Kit</h3><p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Для прессы, промоутеров и организаторов</p></div>
      <Btn onClick={() => exportEPKtoWord(d)} small outline>📄 Экспорт в Word</Btn>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Имя артиста"><input value={d.artistName || ''} onChange={e => upd({ artistName: e.target.value })} placeholder="Leyla HANQYZY" /></Field>
      <Field label="Жанр"><input value={d.genre || ''} onChange={e => upd({ genre: e.target.value })} /></Field>
      <Field label="Краткая биография"><textarea value={d.bioShort || ''} onChange={e => upd({ bioShort: e.target.value })} /></Field>
      <Field label="Полная биография"><textarea rows={6} value={d.bioFull || ''} onChange={e => upd({ bioFull: e.target.value })} /></Field>
      <Field label="Достижения"><textarea value={d.highlights || ''} onChange={e => upd({ highlights: e.target.value })} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Instagram"><input value={d.instagram || ''} onChange={e => upd({ instagram: e.target.value })} /></Field>
        <Field label="VK"><input value={d.vk || ''} onChange={e => upd({ vk: e.target.value })} /></Field>
        <Field label="Spotify"><input value={d.spotify || ''} onChange={e => upd({ spotify: e.target.value })} /></Field>
        <Field label="Yandex Music"><input value={d.yandex || ''} onChange={e => upd({ yandex: e.target.value })} /></Field>
        <Field label="YouTube"><input value={d.youtube || ''} onChange={e => upd({ youtube: e.target.value })} /></Field>
        <Field label="TikTok"><input value={d.tiktok || ''} onChange={e => upd({ tiktok: e.target.value })} /></Field>
        <Field label="Telegram"><input value={d.telegram || ''} onChange={e => upd({ telegram: e.target.value })} placeholder="https://t.me/..." /></Field>
        <Field label="Сайт"><input value={d.website || ''} onChange={e => upd({ website: e.target.value })} /></Field>
      </div>
      <Field label="Букинг email"><input value={d.bookingEmail || ''} onChange={e => upd({ bookingEmail: e.target.value })} /></Field>
      <Field label="Менеджер"><input value={d.managerContact || ''} onChange={e => upd({ managerContact: e.target.value })} /></Field>
      <Field label="Пресс-фото (ссылка)"><input value={d.pressPhotos || ''} onChange={e => upd({ pressPhotos: e.target.value })} /></Field>
      <Field label="Видео с выступлений (ссылка)"><input value={d.liveVideos || ''} onChange={e => upd({ liveVideos: e.target.value })} placeholder="YouTube, Vimeo, VK Видео..." /></Field>
      <Field label="Логотип (ссылка)"><input value={d.logoUrl || ''} onChange={e => upd({ logoUrl: e.target.value })} /></Field>
      
      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>📎 Райдеры (загрузка файлов)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Технический райдер">
            <FBStorageUploader path="epk/tech-rider" currentUrl={d.techRiderUrl} onUploaded={(url, name) => upd({ techRiderUrl: url, techRiderName: name })} />
            {d.techRiderName && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>📄 {d.techRiderName}</div>}
          </Field>
          <Field label="Бытовой райдер">
            <FBStorageUploader path="epk/hospitality-rider" currentUrl={d.hospitalityRiderUrl} onUploaded={(url, name) => upd({ hospitalityRiderUrl: url, hospitalityRiderName: name })} />
            {d.hospitalityRiderName && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>📄 {d.hospitalityRiderName}</div>}
          </Field>
        </div>
      </div>
      
      {d.updatedBy && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Изменил: {USERS[d.updatedBy]?.name} · {d.updatedAt}</div>}
    </div>
  </div>;
}

/* ═══ 8. TASKS ═══ */
function TasksTab({ currentUser }) {
  const [tasks] = useFirebase('tasks'); const [modal, setModal] = useState(null);
  const [view, setView] = useState('list');
  const [refDate, setRefDate] = useState(new Date());
  const [form, setForm] = useState({ title: '', assignee: currentUser, due: '', description: '', done: false });
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDue, setQuickDue] = useState('');
  const [quickFocus, setQuickFocus] = useState(false);
  const list = toList(tasks).sort((a, b) => { if (a.done && !b.done) return 1; if (!a.done && b.done) return -1; return (a.due || 'zzz').localeCompare(b.due || 'zzz'); });
  const active = list.filter(t => !t.done);
  const completed = list.filter(t => t.done);
  const addTask = () => { if (!form.title.trim()) return; fbPush('tasks', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now(), created: today() }); logActivity(currentUser, `создал задачу: ${form.title}`); notifyOther(currentUser, `создал задачу: ${form.title}`); setForm({ title: '', assignee: currentUser, due: '', description: '', done: false }); setModal(null); };
  const quickAdd = () => { if (!quickTitle.trim()) return; fbPush('tasks', { title: quickTitle.trim(), assignee: currentUser, due: quickDue, description: '', done: false, createdBy: currentUser, updatedBy: currentUser, updatedAt: now(), created: today() }); logActivity(currentUser, `создал задачу: ${quickTitle.trim()}`); notifyOther(currentUser, `создал задачу: ${quickTitle.trim()}`); setQuickTitle(''); setQuickDue(''); };
  const upd = (id, u) => { fbUpdate(`tasks/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() }); };
  const toggleDone = (id, task) => { const newDone = !task.done; upd(id, { done: newDone, doneBy: newDone ? currentUser : null }); logActivity(currentUser, `${newDone ? '✓' : '○'} ${task.title}`); notifyOther(currentUser, `${newDone ? 'выполнил' : 'вернул'} задачу «${task.title}»`); };
  const dueStatus = (due) => { if (!due) return null; const today0 = new Date(today()).getTime(); const dueT = new Date(due).getTime(); const days = Math.floor((dueT - today0) / 86400000); if (days < 0) return { color: 'var(--accent-red)', label: `Просрочено на ${Math.abs(days)} д.` }; if (days === 0) return { color: 'var(--accent-red)', label: 'Сегодня' }; if (days === 1) return { color: 'var(--accent-orange)', label: 'Завтра' }; if (days <= 3) return { color: 'var(--accent-orange)', label: `Через ${days} д.` }; if (days <= 7) return { color: 'var(--accent-blue)', label: `Через ${days} д.` }; return { color: 'var(--text-muted)', label: fmtDate(due) }; };
  const dateInDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  // Calendar helpers
  const year = refDate.getFullYear(), month = refDate.getMonth();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays = []; for (let i = 0; i < startDow; i++) calDays.push(null); for (let d = 1; d <= daysInMonth; d++) calDays.push(d);
  const tasksForDay = (d) => { const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return list.filter(t => t.due === ds); };
  const taskColor = (t) => { if (t.done) return 'var(--accent-green)'; const ds = dueStatus(t.due); return ds ? ds.color : 'var(--accent-blue)'; };

  const TaskRow = ({ t }) => { const ds = dueStatus(t.due); return <div className="ios-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 16px', opacity: t.done ? 0.45 : 1 }}>
    <button className="task-checkbox" onClick={() => toggleDone(t._id, t)} style={{ background: t.done ? 'var(--accent-blue)' : 'transparent', border: `1.5px solid ${t.done ? 'var(--accent-blue)' : '#C7C7CC'}`, borderRadius: '50%', width: 23, height: 23, minWidth: 23, minHeight: 23, maxHeight: 23, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 12, flexShrink: 0, marginTop: 1, padding: 0, lineHeight: 1, transition: 'all .15s ease' }}>{t.done ? '✓' : ''}</button>
    <div onClick={() => setModal(t._id)} style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-primary)', textDecoration: t.done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{t.title}</div>
      {t.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{t.description}</div>}
      {(ds || t.assignee) && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
        {ds && !t.done && <div style={{ fontSize: 12, fontWeight: 500, color: ds.color }}>{ds.label}</div>}
        {ds && t.done && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(t.due)}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}><UserPhoto uid={t.assignee} size={16} /><span>{USERS[t.assignee]?.name}</span></div>
        {t.done && t.doneBy && <span style={{ fontSize: 12, color: 'var(--accent-blue)' }}>✓ {USERS[t.doneBy]?.name}</span>}
      </div>}
    </div>
    <button className="task-delete" onClick={(e) => { e.stopPropagation(); fbRemove(`tasks/${t._id}`); }} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 13, cursor: 'pointer', padding: '2px 4px', flexShrink: 0, minHeight: 0, alignSelf: 'flex-start', marginTop: 4 }}>✕</button>
  </div>; };

  const QUICK_CHIPS = [
    { label: 'Сегодня', value: dateInDays(0) },
    { label: 'Завтра', value: dateInDays(1) },
    { label: 'Через неделю', value: dateInDays(7) },
  ];

  return <div style={{ animation: 'fadeIn .2s ease', maxWidth: 760 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
      <div>
        <div className="page-title-huge" style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-orange)', letterSpacing: -0.5, lineHeight: 1 }}>Задачи</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{active.length} активных · {completed.length} выполнено</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="seg-control">
          {[{ id: 'list', l: 'Список' }, { id: 'calendar', l: 'Календарь' }].map(v => <button key={v.id} onClick={() => setView(v.id)} className={view === v.id ? 'seg-active' : ''}>{v.l}</button>)}
        </div>
        <Btn onClick={() => setModal('add')} small>+ Задача</Btn>
      </div>
    </div>

    {view === 'calendar' ? <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{MONTHS_RU[month]} <span style={{ color: 'var(--text-muted)', fontWeight: 300 }}>{year}</span></div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button onClick={() => setRefDate(new Date(year, month - 1, 1))} style={{ background: 'transparent', border: 'none', borderRadius: 8, width: 28, height: 28, fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>‹</button>
          <button onClick={() => setRefDate(new Date())} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 28, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}>Сегодня</button>
          <button onClick={() => setRefDate(new Date(year, month + 1, 1))} style={{ background: 'transparent', border: 'none', borderRadius: 8, width: 28, height: 28, fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>›</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, background: 'var(--border-cal)', border: '1px solid var(--border-cal)', overflow: 'hidden', borderRadius: 14 }}>
        {DAYS_RU.map(d => <div key={d} className="cal-day-header" style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', padding: '8px 4px', background: '#fff', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border-cal)', borderRight: '1px solid var(--border-cal)' }}>{d}</div>)}
        {calDays.map((d, i) => { if (!d) return <div key={i} style={{ background: '#FAFAFA', borderRight: '1px solid var(--border-cal)', borderBottom: '1px solid var(--border-cal)' }} />; const dayTasks = tasksForDay(d); const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear(); const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return <div key={i} className="cal-day-cell" onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('day-num-wrap')) { setForm({ title: '', assignee: currentUser, due: dateStr, description: '', done: false }); setModal('add'); } }} style={{ background: '#fff', minHeight: 96, padding: '4px 6px', borderRight: '1px solid var(--border-cal)', borderBottom: '1px solid var(--border-cal)', cursor: 'pointer' }}>
          <div className="day-num-wrap" style={{ marginBottom: 3, display: 'flex', justifyContent: 'flex-end' }}>
            {isToday ? <div className="cal-day-today" style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-orange)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{d}</div> : <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', padding: '2px 6px' }}>{d}</div>}
          </div>
          {dayTasks.map(t => <div key={t._id} className="cal-item" onClick={e => { e.stopPropagation(); setModal(t._id); }} style={{ fontSize: 11, padding: '3px 5px', borderRadius: 4, marginBottom: 2, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4, textDecoration: t.done ? 'line-through' : 'none' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: taskColor(t), flexShrink: 0 }} />
            {t.done ? '✓ ' : ''}{t.title}
          </div>)}
        </div>; })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>💡 Тапни на пустой день — создашь задачу с этим дедлайном. Без дедлайна задачи видны только в списке.</div>
    </div> : <>
      {/* Quick add — Apple Reminders style */}
      <div className="ios-card" style={{ marginBottom: 16, padding: '4px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
          <div style={{ width: 23, height: 23, borderRadius: '50%', border: '1.5px dashed #C7C7CC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 15, flexShrink: 0 }}>+</div>
          <input value={quickTitle} onChange={e => setQuickTitle(e.target.value)} onFocus={() => setQuickFocus(true)} onBlur={() => setTimeout(() => setQuickFocus(false), 200)} onKeyDown={e => { if (e.key === 'Enter') quickAdd(); }} placeholder="Новая задача — Enter чтобы добавить" style={{ border: 'none', boxShadow: 'none', background: 'transparent', padding: '6px 0', fontSize: 15 }} />
        </div>
        {(quickFocus || quickTitle) && <div style={{ display: 'flex', gap: 6, paddingBottom: 10, flexWrap: 'wrap' }}>
          {QUICK_CHIPS.map(c => <button key={c.label} onClick={() => setQuickDue(quickDue === c.value ? '' : c.value)} style={{ padding: '4px 12px', borderRadius: 999, border: quickDue === c.value ? '1.5px solid var(--accent-blue)' : '1px solid var(--border)', background: quickDue === c.value ? 'var(--tint-blue)' : '#fff', color: quickDue === c.value ? 'var(--accent-blue)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>{c.label}</button>)}
          {quickDue && !QUICK_CHIPS.find(c => c.value === quickDue) && <span style={{ fontSize: 12, color: 'var(--accent-blue)', alignSelf: 'center' }}>{fmtDate(quickDue)}</span>}
        </div>}
      </div>

      <div className="ios-card">
        {active.map(t => <TaskRow key={t._id} t={t} />)}
        {active.length === 0 && completed.length === 0 && <Empty text="Нет задач — добавь первую" />}
        {active.length === 0 && completed.length > 0 && <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Все задачи выполнены 🎉</div>}
      </div>
      {completed.length > 0 && <>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 28, marginBottom: 8, paddingLeft: 16 }}>Выполнено · {completed.length}</div>
        <div className="ios-card">
          {completed.map(t => <TaskRow key={t._id} t={t} />)}
        </div>
      </>}
    </>}

    <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Новая задача' : 'Задача'}>
      {modal === 'add' ? <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') addTask(); }} autoFocus /></Field></div>
        <Field label="Ответственный"><select value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })}>{Object.entries(USERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></Field>
        <Field label="Дедлайн"><input type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} /></Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Описание"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
        <div style={{ gridColumn: '1/-1' }}><Btn onClick={addTask}>Создать</Btn></div>
      </div> : (() => { const t = list.find(x => x._id === modal); if (!t) return null; return <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={t.title || ''} onChange={e => upd(t._id, { title: e.target.value })} /></Field></div>
        <Field label="Ответственный"><select value={t.assignee} onChange={e => upd(t._id, { assignee: e.target.value })}>{Object.entries(USERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></Field>
        <Field label="Дедлайн"><input type="date" value={t.due || ''} onChange={e => upd(t._id, { due: e.target.value })} /></Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Описание"><textarea value={t.description || ''} onChange={e => upd(t._id, { description: e.target.value })} /></Field></div>
        <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)' }}>Создал: {USERS[t.createdBy]?.name} · {fmtDate(t.created)}{t.done && t.doneBy && <> · Выполнил: <span style={{ color: 'var(--accent-green)' }}>{USERS[t.doneBy]?.name}</span></>}</div>
        <div style={{ gridColumn: '1/-1' }}><Btn onClick={() => { fbRemove(`tasks/${t._id}`); setModal(null); }} color="var(--accent-red)" outline small>Удалить задачу</Btn></div>
      </div>; })()}
    </Modal>
  </div>;
}

/* ═══ 9. FESTIVALS ═══ */
const INITIAL_FESTIVALS = [
  { name:'Архстояние', dates:'23-26 июля', genre:'Электроника, поп', website:'https://arch.stoyanie.ru/', status:'Подали', notes:'Заявку отправила 25.03', category:'Опен-колл', openCall:true },
  { name:'Solar Systo Togathering', dates:'20-25 мая', genre:'Электроника, регги, альтернатива, фолк, нойз', website:'https://2026.solarsysto.ru/', status:'Изучаем', category:'Опен-колл', openCall:true },
  { name:'Столица Закатов', dates:'29 мая — 31 августа', genre:'Электроника, классика, world music', website:'https://stolicazakatov.nn-afisha.ru/', status:'Изучаем', category:'Опен-колл', openCall:true },
  { name:'Музсходка', dates:'Не объявлены', genre:'Электроника, рэп, рок, поп, джаз', website:'https://vk.com/muzshodka', status:'Изучаем', category:'Опен-колл', openCall:true },
  { name:'Сказка', dates:'13-16 августа', genre:'Электроника, инди', website:'https://skazkafestival.ru/', status:'Подали', notes:'Подала заявку 17.04, ответ до 1 июля на почту arina_prodd. Без гонорара, оплата проезда и проживания', category:'Опен-колл', openCall:true },
  { name:'Paprika Loves', dates:'11 апреля', genre:'Электроника, рэп, рок', website:'https://t.me/paprika_magazine/3805', status:'Изучаем', notes:'Опен-колл завершён', category:'Опен-колл', openCall:true },
  { name:'Волга шепчет', dates:'Не объявлены', genre:'Любые', website:'', status:'Изучаем', category:'Опен-колл', openCall:true },
  { name:'Сумятица', dates:'Не объявлены', genre:'Электрофолк', website:'https://sumyatitsa.ru/', status:'Изучаем', notes:'Заявка на почту sumyatitsa.fest@gmail.com', category:'Опен-колл', openCall:true },
  { name:'Слияние', dates:'9-12 июля', genre:'Диджеи, саунд-дизайн, этно-электроника', website:'https://d-fusionfest.ru/', status:'Подали', notes:'Подали заявку, нам ответили', category:'Опен-колл', openCall:true },
  { name:'INDIA forest camping', dates:'30.06-05.07', genre:'Электронная музыка', website:'https://vk.com/indiafestival', status:'Подали', notes:'Подали заявку, нам ответили', category:'Опен-колл', openCall:true },
  { name:'Ural Music Night', dates:'19 июня', genre:'Электроника', website:'https://uralmusicnight.ru/', status:'Ждём', notes:'Подали заявку, ждём ответа', category:'Опен-колл', openCall:true },
  { name:'Bandlink Шоукейс', dates:'Не объявлены', genre:'Инди, рэп, электроника, поп', website:'https://bandlink.media/showcase', status:'Изучаем', category:'Шоукейс', openCall:true },
  { name:'Север слышит', dates:'', genre:'', website:'https://vk.com/arhsearch', status:'Изучаем', category:'Шоукейс', openCall:false },
  { name:'UU.SOUND', dates:'', genre:'', website:'https://vk.com/uu.sound', status:'Изучаем', category:'Шоукейс', openCall:false },
  { name:'Дикая мята', dates:'', genre:'', website:'https://mintmusic.ru/perform', status:'Изучаем', category:'Шоукейс', openCall:false },
  { name:'Intervals', dates:'23-26 апреля', genre:'Электроника, поп', website:'https://intervalsfest.com/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Signal Factory', dates:'22-24 мая', genre:'Электроника', website:'https://signal.live/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'НУР', dates:'28-31 мая', genre:'Электроника', website:'https://nurfestival.com/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Летник', dates:'29-30 мая', genre:'Инди, рэп, электроника, поп', website:'https://vk.com/letnikfest', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Субботник', dates:'Май', genre:'Электроника, поп', website:'https://stvol.tv/subbotnik-2026/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Пикник «Афиши»', dates:'20 июня; 8 августа', genre:'Инди, рэп, электроника, поп', website:'https://picnic.afisha.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Ömankö Day', dates:'27 июня', genre:'Поп, инди, электроника', website:'https://omankoday.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Gamma Festival', dates:'3-6 июля', genre:'Электроника', website:'https://gammafestival.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Планета K-30', dates:'9-12 июля', genre:'Электроника', website:'https://planetak30.com/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Outline', dates:'21-27 июля', genre:'Электроника, инди', website:'https://outlinefestival.org/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Trip Music Festival', dates:'23-26 июля', genre:'Электроника', website:'https://tripfestival.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Круто', dates:'7-9 августа', genre:'Электроника, инди', website:'http://krutofestival.com/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Это база', dates:'Не объявлены', genre:'Электроника, рэп, поп', website:'https://discoklub.com/baza2025', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'New Star Camp', dates:'23-29 марта', genre:'Инди, рэп, электроника', website:'https://newstarcamp.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Moscow Music School Festival', dates:'Не объявлены', genre:'Инди, рэп, электроника, поп', website:'https://vk.com/moscowmusicschoolrussia', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Пари Фест', dates:'Не объявлены', genre:'Рэп, инди, поп, электроника', website:'https://parifest.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'New Star Weekend', dates:'Не объявлены', genre:'Инди, рок, электроника, рэп', website:'https://newstarweekend.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Стереолето', dates:'Не объявлены', genre:'', website:'https://bestfest.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
];

function FestivalsTab({ currentUser }) {
  const [festivals] = useFirebase('festivals'); const [modal, setModal] = useState(null); const [catFilter, setCatFilter] = useState('all');
  const [form, setForm] = useState({ name: '', dateStart: '', dateEnd: '', dates: '', location: '', deadline: '', website: '', genre: '', status: 'Изучаем', notes: '', category: 'Опен-колл', openCall: true });
  const list = toList(festivals).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const filtered = catFilter === 'all' ? list : list.filter(f => f.category === catFilter);
  const FEST_STATUSES = ['Изучаем', 'Подаёмся', 'Подали', 'Приняли', 'Отказ', 'Ждём'];
  const FEST_CATS = ['Опен-колл', 'Шоукейс', 'Без опен-колла'];
  const addF = () => { if (!form.name.trim()) return; fbPush('festivals', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `добавил фестиваль: ${form.name}`); notifyOther(currentUser, `фестиваль: ${form.name}`); setForm({ name: '', dateStart: '', dateEnd: '', dates: '', location: '', deadline: '', website: '', genre: '', status: 'Изучаем', notes: '', category: 'Опен-колл', openCall: true }); setModal(null); };
  const upd = (id, u) => fbUpdate(`festivals/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() });
  const stC = s => ({ 'Изучаем': '#007AFF', 'Подаёмся': '#FF9500', 'Подали': '#AF52DE', 'Приняли': '#34C759', 'Отказ': '#FF3B30', 'Ждём': '#AEAEB2' }[s] || '#999');
  
  // Seed initial data if empty
  useEffect(() => { if (Object.keys(festivals).length === 0) { INITIAL_FESTIVALS.forEach(f => fbPush('festivals', { ...f, location: '', deadline: '', createdBy: 'leyla', updatedBy: 'leyla', updatedAt: now() })); } }, [festivals]);

  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <PageHead title="Фестивали" count={filtered.length} color="var(--accent-indigo)"><Btn onClick={() => setModal('add')} small color="var(--accent-indigo)">+ Фестиваль</Btn></PageHead>
    <div className="filter-pills" style={{ display: 'flex', gap: 2, background: 'var(--bg-surface)', borderRadius: 10, padding: 3, marginBottom: 16, width: 'fit-content', maxWidth: '100%' }}>
      {[{ id: 'all', l: 'Все' }, ...FEST_CATS.map(c => ({ id: c, l: c }))].map(f => <button key={f.id} onClick={() => setCatFilter(f.id)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500, background: catFilter === f.id ? '#fff' : 'transparent', color: catFilter === f.id ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: catFilter === f.id ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}>{f.l}</button>)}
    </div>
    <Card className="table-card" style={{ overflow: 'hidden' }}>
      <div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 1fr 90px 80px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', minWidth: 650 }}><span>Название</span><span>Категория</span><span>Даты / Жанры</span><span>Дедлайн</span><span>Статус</span><span>Кто</span><span></span></div>
      {filtered.map(f => <div key={f._id} className="row-hover" onClick={() => setModal(f._id)} style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 1fr 90px 80px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', fontSize: 13, minWidth: 650 }}>
        <div><span style={{ fontWeight: 500 }}>{f.name}</span>{f.website && <a href={f.website} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: 'var(--accent-blue)', fontSize: 11, marginLeft: 6 }}>↗</a>}{f.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f.notes.slice(0, 50)}{f.notes.length > 50 ? '...' : ''}</div>}</div>
        <Badge color={f.openCall ? 'var(--accent-green)' : 'var(--text-muted)'}>{f.category || '—'}</Badge>
        <div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.dateStart ? fmtRange(f.dateStart, f.dateEnd) : (f.dates || '—')}</div>{f.genre && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.genre}</div>}</div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(f.deadline)}</span>
        <Badge color={stC(f.status)}>{f.status}</Badge>
        <UserPhoto uid={f.updatedBy} size={22} />
        <button onClick={e => { e.stopPropagation(); fbRemove(`festivals/${f._id}`); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button>
      </div>)}</div>
      {filtered.length === 0 && <Empty text="Нет фестивалей" />}
    </Card>
    <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Новый фестиваль' : 'Фестиваль'}>
      {modal === 'add' ? <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field></div>
        <Field label="Категория"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{FEST_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Опен-колл"><select value={form.openCall ? 'Да' : 'Нет'} onChange={e => setForm({ ...form, openCall: e.target.value === 'Да' })}><option>Да</option><option>Нет</option></select></Field>
        <Field label="Начало"><input type="date" value={form.dateStart} onChange={e => setForm({ ...form, dateStart: e.target.value })} /></Field>
        <Field label="Окончание"><input type="date" value={form.dateEnd} min={form.dateStart || undefined} onChange={e => setForm({ ...form, dateEnd: e.target.value })} /></Field>
        <Field label="Место"><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Дедлайн подачи"><input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></Field>
        <Field label="Жанр"><input value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })} /></Field>
        <Field label="Сайт"><input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></Field>
        <Field label="Статус"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{FEST_STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
        <div style={{ gridColumn: '1/-1' }}><Btn onClick={addF} color="var(--accent-orange)">Добавить</Btn></div>
      </div> : (() => { const f = list.find(x => x._id === modal); if (!f) return null; return <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={f.name || ''} onChange={e => upd(f._id, { name: e.target.value })} /></Field></div>
        <Field label="Категория"><select value={f.category || 'Опен-колл'} onChange={e => upd(f._id, { category: e.target.value })}>{FEST_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Опен-колл"><select value={f.openCall ? 'Да' : 'Нет'} onChange={e => upd(f._id, { openCall: e.target.value === 'Да' })}><option>Да</option><option>Нет</option></select></Field>
        <Field label="Место"><input value={f.location || ''} onChange={e => upd(f._id, { location: e.target.value })} /></Field>
        <Field label="Начало"><input type="date" value={f.dateStart || ''} onChange={e => upd(f._id, { dateStart: e.target.value })} /></Field>
        <Field label="Окончание"><input type="date" value={f.dateEnd || ''} min={f.dateStart || undefined} onChange={e => upd(f._id, { dateEnd: e.target.value })} /></Field>
        {!f.dateStart && f.dates && <Field label="Даты (старая запись)"><input value={f.dates} onChange={e => upd(f._id, { dates: e.target.value })} /></Field>}
        <Field label="Дедлайн подачи"><input type="date" value={f.deadline || ''} onChange={e => upd(f._id, { deadline: e.target.value })} /></Field>
        <Field label="Жанр"><input value={f.genre || ''} onChange={e => upd(f._id, { genre: e.target.value })} /></Field>
        <Field label="Сайт"><input value={f.website || ''} onChange={e => upd(f._id, { website: e.target.value })} /></Field>
        <Field label="Статус"><select value={f.status} onChange={e => upd(f._id, { status: e.target.value })}>{FEST_STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={f.notes || ''} onChange={e => upd(f._id, { notes: e.target.value })} /></Field></div>
        <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)' }}>{USERS[f.updatedBy]?.name} · {f.updatedAt}</div>
      </div>; })()}
    </Modal>
  </div>;
}

/* ═══ 10. FINANCE (P&L by year) ═══ */
const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

const REVENUE_LINES = [
  { id: 'streaming', label: 'Прибыль от стриминга' },
  { id: 'concerts', label: 'Прибыль от выступлений' },
  { id: 'merch', label: 'Прибыль от продажи мерча' },
  { id: 'special', label: 'Прибыль от спецпроектов' },
  { id: 'other', label: 'Прибыль от других активностей' },
];

const EXPENSE_FIXED = [
  { id: 'studio', label: 'Аренда студии' },
  { id: 'smm', label: 'Зарплата SMM' },
  { id: 'accountant', label: 'Зарплата бухгалтера' },
];

const EXPENSE_VARIABLE = [
  { id: 'production', label: 'Производство музыки' },
  { id: 'ads', label: 'Диджитал реклама' },
  { id: 'taxes', label: 'Налоги' },
  { id: 'visual', label: 'Производство визуального контента' },
];

const EXPENSE_ONETIME = [
  { id: 'legal', label: 'Юридические услуги' },
];

function fmtMoney(n) { if (!n && n !== 0) return '—'; if (n === 0) return '0'; const sign = n < 0 ? '-' : ''; const abs = Math.abs(n); return `${sign}${abs.toLocaleString('ru-RU')} ₽`; }

function FinanceTab({ currentUser }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [finance] = useFirebase(`finance/${year}`);
  const [editing, setEditing] = useState(null); // {row, month}
  const [editValue, setEditValue] = useState('');
  const [shareManager, setShareManager] = useState(20);
  const [customRows, setCustomRows] = useState({ revenue: [], fixed: [], variable: [], onetime: [] });
  const [hiddenRows, setHiddenRows] = useState([]); // ids of built-in rows that user hid
  const [newRowModal, setNewRowModal] = useState(null);
  const [newRowName, setNewRowName] = useState('');
  const [monthDetail, setMonthDetail] = useState(null); // { rowId, label, month }
  const [newEntry, setNewEntry] = useState({ label: '', amount: '' });

  // Load custom rows & hidden rows from finance data
  useEffect(() => {
    if (finance?._customRows) {
      try { setCustomRows(JSON.parse(finance._customRows)); } catch {}
    }
    if (finance?._hiddenRows) {
      try { setHiddenRows(JSON.parse(finance._hiddenRows)); } catch {}
    }
    if (finance?._shareManager !== undefined) setShareManager(Number(finance._shareManager) || 20);
    else if (finance?._shareLeyla !== undefined) setShareManager(Number(finance._shareLeyla) || 20);
  }, [finance?._customRows, finance?._hiddenRows, finance?._shareManager, finance?._shareLeyla]);

  // Cell value: prefer sum of entries if any exist, else direct value
  const getEntries = (rowId, month) => { try { const raw = finance?.[`${rowId}_${month}_entries`]; return raw ? JSON.parse(raw) : []; } catch { return []; } };
  const get = (rowId, month) => { const entries = getEntries(rowId, month); if (entries.length) return entries.reduce((s, e) => s + (Number(e.amount) || 0), 0); return Number(finance?.[`${rowId}_${month}`]) || 0; };
  const setCell = (rowId, month, val) => fbUpdate(`finance/${year}`, { [`${rowId}_${month}`]: val, _updatedBy: currentUser, _updatedAt: now() });
  const setEntries = (rowId, month, entries) => fbUpdate(`finance/${year}`, { [`${rowId}_${month}_entries`]: JSON.stringify(entries), [`${rowId}_${month}`]: null, _updatedBy: currentUser, _updatedAt: now() });
  
  const allRevenueRows = [...REVENUE_LINES.filter(r => !hiddenRows.includes(r.id)), ...customRows.revenue.map(r => ({ id: 'cr_' + r.id, label: r.label, custom: 'revenue' }))];
  const allFixedRows = [...EXPENSE_FIXED.filter(r => !hiddenRows.includes(r.id)), ...customRows.fixed.map(r => ({ id: 'cf_' + r.id, label: r.label, custom: 'fixed' }))];
  const allVariableRows = [...EXPENSE_VARIABLE.filter(r => !hiddenRows.includes(r.id)), ...customRows.variable.map(r => ({ id: 'cv_' + r.id, label: r.label, custom: 'variable' }))];
  const allOnetimeRows = [...EXPENSE_ONETIME.filter(r => !hiddenRows.includes(r.id)), ...customRows.onetime.map(r => ({ id: 'co_' + r.id, label: r.label, custom: 'onetime' }))];
  
  const hideBuiltinRow = (rowId, label) => {
    if (!window.confirm(`Удалить строку «${label}»? Данные останутся в базе, строку можно вернуть позже.`)) return;
    const updated = [...hiddenRows, rowId];
    setHiddenRows(updated);
    fbUpdate(`finance/${year}`, { _hiddenRows: JSON.stringify(updated) });
  };
  const restoreRow = (rowId) => { const updated = hiddenRows.filter(id => id !== rowId); setHiddenRows(updated); fbUpdate(`finance/${year}`, { _hiddenRows: JSON.stringify(updated) }); };
  
  const allBuiltins = [...REVENUE_LINES, ...EXPENSE_FIXED, ...EXPENSE_VARIABLE, ...EXPENSE_ONETIME];
  const hiddenBuiltinRows = allBuiltins.filter(r => hiddenRows.includes(r.id));

  const sumRow = (rowId) => MONTHS_SHORT.reduce((s, _, m) => s + get(rowId, m), 0);
  const sumMonth = (rows, month) => rows.reduce((s, r) => s + get(r.id, month), 0);
  const sumAllRevenue = (month) => sumMonth(allRevenueRows, month);
  const sumFixed = (month) => sumMonth(allFixedRows, month);
  const sumVariable = (month) => sumMonth(allVariableRows, month);
  const sumOnetime = (month) => sumMonth(allOnetimeRows, month);
  const sumExpenses = (month) => sumFixed(month) + sumVariable(month) + sumOnetime(month);
  const profit = (month) => sumAllRevenue(month) - sumExpenses(month);
  const totalProfit = MONTHS_SHORT.reduce((s, _, m) => s + profit(m), 0);
  const totalRevenue = MONTHS_SHORT.reduce((s, _, m) => s + sumAllRevenue(m), 0);
  const totalExpenses = MONTHS_SHORT.reduce((s, _, m) => s + sumExpenses(m), 0);
  
  const startEdit = (rowId, month) => { setEditing({ rowId, month }); setEditValue(String(get(rowId, month) || '')); };
  const saveEdit = () => { if (!editing) return; const val = Number(editValue.replace(/[^\d.-]/g, '')) || 0; setCell(editing.rowId, editing.month, val); setEditing(null); setEditValue(''); };
  const cancelEdit = () => { setEditing(null); setEditValue(''); };

  const addCustomRow = () => {
    if (!newRowName.trim() || !newRowModal) return;
    const newRow = { id: Date.now().toString(36), label: newRowName.trim() };
    const updated = { ...customRows, [newRowModal]: [...customRows[newRowModal], newRow] };
    setCustomRows(updated);
    fbUpdate(`finance/${year}`, { _customRows: JSON.stringify(updated) });
    setNewRowName(''); setNewRowModal(null);
  };

  const removeCustomRow = (section, rowId) => {
    if (!window.confirm('Удалить эту строку и все её данные?')) return;
    const updated = { ...customRows, [section]: customRows[section].filter(r => r.id !== rowId) };
    setCustomRows(updated);
    const updates = { _customRows: JSON.stringify(updated) };
    const prefix = section === 'revenue' ? 'cr_' : section === 'fixed' ? 'cf_' : section === 'variable' ? 'cv_' : 'co_';
    MONTHS_SHORT.forEach((_, m) => { updates[`${prefix}${rowId}_${m}`] = null; });
    fbUpdate(`finance/${year}`, updates);
  };

  const updateShare = (val) => { const v = Math.max(0, Math.min(100, Number(val) || 0)); setShareManager(v); fbUpdate(`finance/${year}`, { _shareManager: v }); };

  const Cell = ({ rowId, month, bold, color, allowEdit = true, rowLabel }) => {
    const val = get(rowId, month);
    const entries = getEntries(rowId, month);
    const hasEntries = entries.length > 0;
    const isEditing = editing && editing.rowId === rowId && editing.month === month;
    if (isEditing) {
      return <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
        onBlur={saveEdit} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
        style={{ width: '100%', padding: '4px 6px', fontSize: 12, textAlign: 'right', border: '1.5px solid var(--accent-blue)', borderRadius: 4, boxShadow: 'none' }} />;
    }
    return <div onClick={() => { if (!allowEdit) return; if (hasEntries) { setMonthDetail({ rowId, label: rowLabel, month }); } else { startEdit(rowId, month); } }}
      onDoubleClick={() => allowEdit && setMonthDetail({ rowId, label: rowLabel, month })}
      title={hasEntries ? `${entries.length} записей — кликни для детализации` : 'Двойной клик — детализация по месяцу'}
      style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12, fontWeight: bold ? 600 : 400, color: color || (val ? 'var(--text-primary)' : 'var(--text-muted)'), cursor: allowEdit ? 'pointer' : 'default', minHeight: 28, borderRadius: 4, position: 'relative' }}>
      {val ? fmtMoney(val) : (allowEdit ? '' : '—')}
      {hasEntries && <span style={{ position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-blue)' }} />}
    </div>;
  };

  const SumCell = ({ value, bold, color }) => <div style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12, fontWeight: bold ? 600 : 500, color: color || 'var(--text-primary)', background: 'var(--bg-surface)' }}>{value === 0 ? '—' : fmtMoney(value)}</div>;

  const renderRow = (row, sectionKey) => <div key={row.id} className="fin-row" style={{ display: 'grid', gridTemplateColumns: '180px repeat(12, 90px) 110px 30px', borderBottom: '1px solid var(--border-light)', alignItems: 'stretch' }}>
    <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', background: '#fff', borderRight: '1px solid var(--border-light)' }}>{row.label}</div>
    {MONTHS_SHORT.map((_, m) => <Cell key={m} rowId={row.id} month={m} rowLabel={row.label} />)}
    <SumCell value={sumRow(row.id)} bold />
    {row.custom 
      ? <button onClick={() => removeCustomRow(sectionKey, row.id.slice(3))} title="Удалить строку" style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 13, cursor: 'pointer' }}>✕</button> 
      : <button onClick={() => hideBuiltinRow(row.id, row.label)} title="Удалить строку" style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 13, cursor: 'pointer' }}>✕</button>}
  </div>;

  const SectionHeader = ({ title, color, sumFn, addSection }) => <div style={{ display: 'grid', gridTemplateColumns: '180px repeat(12, 90px) 110px 30px', background: color + '12', borderBottom: '1px solid var(--border-light)', borderTop: '1px solid var(--border-light)' }}>
    <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{title}</span>
      {addSection && <button onClick={() => setNewRowModal(addSection)} style={{ background: 'none', border: 'none', color, fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 }} title="Добавить строку">+</button>}
    </div>
    {MONTHS_SHORT.map((_, m) => <SumCell key={m} value={sumFn(m)} bold color={color} />)}
    <SumCell value={MONTHS_SHORT.reduce((s, _, m) => s + sumFn(m), 0)} bold color={color} />
    <div />
  </div>;

  const managerCut = totalProfit > 0 ? Math.round(totalProfit * shareManager / 100) : 0;
  const artistCut = totalProfit > 0 ? Math.round(totalProfit * (100 - shareManager) / 100) : 0;

  return <div style={{ animation: 'fadeIn .2s ease' }}>
    {/* Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: 'var(--text-primary)' }}>Смета <span style={{ color: 'var(--text-muted)', fontWeight: 300 }}>{year}</span></div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>P&L по месяцам — клик на ячейку: ввести сумму, двойной клик: детализация по месяцу</div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={() => setYear(year - 1)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, width: 30, height: 30, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 500, padding: '0 8px' }}>{year}</span>
        <button onClick={() => setYear(year + 1)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, width: 30, height: 30, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>›</button>
      </div>
    </div>

    {/* Summary cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Выручка</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-green)' }}>{fmtMoney(totalRevenue)}</div>
      </Card>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Расходы</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-red)' }}>{fmtMoney(totalExpenses)}</div>
      </Card>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Прибыль</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: totalProfit >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)' }}>{fmtMoney(totalProfit)}</div>
      </Card>
    </div>

    {/* Main P&L table */}
    <Card className="table-card" style={{ overflow: 'hidden' }}>
      <div className="data-table" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 1500 }}>
          {/* Months header */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px repeat(12, 90px) 110px 30px', borderBottom: '2px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 5 }}>
            <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Месяц</div>
            {MONTHS_SHORT.map(m => <div key={m} style={{ padding: '10px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.4 }}>{m}</div>)}
            <div style={{ padding: '10px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.4 }}>Итог</div>
            <div />
          </div>

          {/* Revenue section */}
          <SectionHeader title="ВЫРУЧКА" color="var(--accent-green)" sumFn={sumAllRevenue} addSection="revenue" />
          {allRevenueRows.map(r => renderRow(r, 'revenue'))}

          {/* Fixed expenses */}
          <SectionHeader title="ПОСТОЯННЫЕ РАСХОДЫ" color="var(--accent-orange)" sumFn={sumFixed} addSection="fixed" />
          {allFixedRows.map(r => renderRow(r, 'fixed'))}

          {/* Variable expenses */}
          <SectionHeader title="ПЕРЕМЕННЫЕ РАСХОДЫ" color="var(--accent-orange)" sumFn={sumVariable} addSection="variable" />
          {allVariableRows.map(r => renderRow(r, 'variable'))}

          {/* One-time expenses */}
          <SectionHeader title="РАЗОВЫЕ РАСХОДЫ" color="var(--accent-orange)" sumFn={sumOnetime} addSection="onetime" />
          {allOnetimeRows.map(r => renderRow(r, 'onetime'))}

          {/* Total expenses */}
          <SectionHeader title="ВСЕГО РАСХОДОВ" color="var(--accent-red)" sumFn={sumExpenses} />

          {/* Profit */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px repeat(12, 90px) 110px 30px', background: 'var(--accent-blue)' + '10', borderTop: '2px solid var(--accent-blue)', borderBottom: '2px solid var(--accent-blue)' }}>
            <div style={{ padding: '12px', fontSize: 13, fontWeight: 700, color: 'var(--accent-blue)' }}>ПРИБЫЛЬ</div>
            {MONTHS_SHORT.map((_, m) => { const p = profit(m); return <div key={m} style={{ padding: '12px 8px', fontSize: 12, fontWeight: 600, textAlign: 'right', color: p >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)' }}>{p === 0 ? '—' : fmtMoney(p)}</div>; })}
            <div style={{ padding: '12px 8px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: totalProfit >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)' }}>{fmtMoney(totalProfit)}</div>
            <div />
          </div>
        </div>
      </div>
    </Card>

    {/* Share split */}
    <Card style={{ padding: 20, marginTop: 16, maxWidth: 560 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>💸 Распределение прибыли</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 110 }}>Доля менеджера:</span>
        <input type="number" min="0" max="100" value={shareManager} onChange={e => updateShare(e.target.value)} style={{ width: 70, textAlign: 'center', fontWeight: 600 }} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>%</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>Артист: <strong style={{ color: 'var(--text-primary)' }}>{100 - shareManager}%</strong></span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 14, background: 'var(--accent-red)' + '10', borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--accent-red)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Артист (Лейла)</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>{fmtMoney(artistCut)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Доля {100 - shareManager}%</div>
        </div>
        <div style={{ padding: 14, background: 'var(--accent-blue)' + '10', borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--accent-blue)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Менеджер</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>{fmtMoney(managerCut)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Доля {shareManager}%</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
        💡 До 1 млн ₽ — обычно 80/20, после 1 млн ₽ — 85/15
      </div>
    </Card>

    {/* Hidden rows — restore */}
    {hiddenBuiltinRows.length > 0 && <Card style={{ padding: 16, marginTop: 16, maxWidth: 560 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>🗑 Удалённые строки</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {hiddenBuiltinRows.map(r => <button key={r.id} onClick={() => restoreRow(r.id)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>↩ {r.label}</button>)}
      </div>
    </Card>}

    {/* Add row modal */}
    <Modal open={!!newRowModal} onClose={() => { setNewRowModal(null); setNewRowName(''); }} title="Новая строка">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Название"><input value={newRowName} onChange={e => setNewRowName(e.target.value)} placeholder="Например: Прибыль от коллабораций" autoFocus onKeyDown={e => { if (e.key === 'Enter') addCustomRow(); }} /></Field>
        <Btn onClick={addCustomRow}>Добавить</Btn>
      </div>
    </Modal>

    {/* Month detail modal */}
    <Modal open={!!monthDetail} onClose={() => { setMonthDetail(null); setNewEntry({ label: '', amount: '' }); }} title={monthDetail ? `${monthDetail.label} — ${MONTHS_RU[monthDetail.month]}` : ''}>
      {monthDetail && (() => {
        const entries = getEntries(monthDetail.rowId, monthDetail.month);
        const directValue = Number(finance?.[`${monthDetail.rowId}_${monthDetail.month}`]) || 0;
        const sum = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const addEntry = () => {
          if (!newEntry.amount || !newEntry.label.trim()) return;
          const amount = Number(String(newEntry.amount).replace(/[^\d.-]/g, '')) || 0;
          if (!amount) return;
          const newEntries = [...entries, { id: Date.now().toString(36), label: newEntry.label.trim(), amount, date: today() }];
          setEntries(monthDetail.rowId, monthDetail.month, newEntries);
          setNewEntry({ label: '', amount: '' });
        };
        const removeEntry = (id) => { const newEntries = entries.filter(e => e.id !== id); setEntries(monthDetail.rowId, monthDetail.month, newEntries); };
        return <div>
          {directValue > 0 && entries.length === 0 && <div style={{ padding: 12, background: 'var(--bg-surface)', borderRadius: 10, marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)' }}>
            💡 Сейчас за этот месяц вписана общая сумма <strong style={{ color: 'var(--text-primary)' }}>{fmtMoney(directValue)}</strong>. Можешь оставить её или разбить на детальные записи ниже — тогда общая сумма пересчитается автоматически.
          </div>}
          
          {entries.length > 0 && <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Записи · {entries.length}</div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, overflow: 'hidden' }}>
              {entries.map(e => <div key={e.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-light)', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{e.label}</div>
                  {e.date && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate(e.date)}</div>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fmtMoney(e.amount)}</div>
                <button onClick={() => removeEntry(e.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 14, cursor: 'pointer', padding: 4 }}>✕</button>
              </div>)}
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-surface)', fontSize: 13, fontWeight: 600 }}>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>Итого</span>
                <span style={{ color: 'var(--text-primary)' }}>{fmtMoney(sum)}</span>
              </div>
            </div>
          </div>}
          
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Новая запись</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 8, marginBottom: 10 }}>
            <input value={newEntry.label} onChange={e => setNewEntry({ ...newEntry, label: e.target.value })} placeholder="Что это (концерт, релиз, услуга)" autoFocus />
            <input value={newEntry.amount} onChange={e => setNewEntry({ ...newEntry, amount: e.target.value })} placeholder="Сумма ₽" inputMode="decimal" onKeyDown={e => { if (e.key === 'Enter') addEntry(); }} />
          </div>
          <Btn onClick={addEntry} small>Добавить запись</Btn>
          
          {entries.length === 0 && directValue === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.5 }}>💡 Добавляй сюда каждое выступление, релиз или платёж отдельно — итог за месяц посчитается сам.</div>}
        </div>;
      })()}
    </Modal>
  </div>;
}

/* ═══ 11. FILES ═══ */
function FilesTab({ currentUser, allFiles }) {
  return <div style={{ animation: 'fadeIn .2s ease' }}><PageHead title="Файлы" count={allFiles.length} color="var(--accent-teal)" />
    <Card style={{ padding: 16, marginBottom: 16 }}><YDFileUploader currentUser={currentUser} /></Card>
    <Card className="table-card" style={{ overflow: 'hidden' }}><div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 80px 90px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}><span>Файл</span><span>Ссылка</span><span>Размер</span><span>Тег</span><span>Дата</span><span>Кто</span><span></span></div>
      {allFiles.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(f => <div key={f._id} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 80px 90px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', fontSize: 13 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>{getFileIcon(f.name)}</span><span style={{ fontWeight: 500 }}>{f.name}</span></div><div>{f.url ? <a href={f.url} target="_blank" rel="noopener" style={{ color: 'var(--accent-blue)', fontSize: 12 }}>открыть ↗</a> : <span style={{ color: 'var(--text-muted)' }}>Я.Диск</span>}</div><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.size || '—'}</span><Badge color="var(--accent-purple)">{f.tag}</Badge><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(f.date)}</span><UserPhoto uid={f.uploadedBy} size={22} /><button onClick={() => { fbRemove(`files/${f._id}`); if (f.ydPath) ydDelete(f.ydPath).catch(() => { }); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button></div>)}</div>
      {allFiles.length === 0 && <Empty text="Нет файлов" />}</Card>
  </div>;
}

/* ═══ ACTIVITY + NOTIFICATIONS ═══ */
function ActivityLog() { const [log] = useFirebase('activity'); const list = toList(log).sort((a, b) => (b.time || '').localeCompare(a.time || '')).slice(0, 40); return <div className="activity-log" style={{ position: 'fixed', right: 0, top: 0, width: 230, height: '100vh', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-light)', padding: '56px 12px 12px', overflowY: 'auto', zIndex: 50 }}><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Активность</div>{list.map(a => <div key={a._id} style={{ fontSize: 11, padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}><UserPhoto uid={a.user} size={16} /><span style={{ fontWeight: 600, color: USERS[a.user]?.color, fontSize: 11 }}>{USERS[a.user]?.name}</span></div><div style={{ color: 'var(--text-secondary)' }}>{a.action}</div><div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{timeAgo(a.time)}</div></div>)}</div>; }
function NotificationBell({ currentUser }) { const [notifs] = useFirebase('notifications'); const list = toList(notifs).filter(n => n.forUser === currentUser).sort((a, b) => (b.time || '').localeCompare(a.time || '')); const unread = list.filter(n => !n.read); const [open, setOpen] = useState(false); return <div style={{ position: 'relative' }}><button onClick={() => { setOpen(!open); if (!open) unread.forEach(n => fbUpdate(`notifications/${n._id}`, { read: true })); }} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 20, padding: '5px 10px', fontSize: 15, color: 'var(--text-primary)', position: 'relative', cursor: 'pointer' }}>🔔{unread.length > 0 && <span style={{ position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-red)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread.length}</span>}</button>{open && <div style={{ position: 'absolute', right: 0, top: 40, width: 300, background: '#fff', border: '1px solid var(--border-light)', borderRadius: 14, padding: 8, zIndex: 200, maxHeight: 320, overflowY: 'auto', boxShadow: 'var(--shadow-lg)', animation: 'fadeIn .15s ease' }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, padding: '4px 8px' }}>Уведомления</div>{list.slice(0, 20).map(n => <div key={n._id} style={{ fontSize: 12, padding: '6px 8px', borderBottom: '1px solid var(--border-light)', opacity: n.read ? 0.5 : 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserPhoto uid={n.fromUser} size={16} /><span style={{ color: USERS[n.fromUser]?.color, fontWeight: 600, fontSize: 11 }}>{USERS[n.fromUser]?.name}</span></div><div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{n.message}</div><div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{timeAgo(n.time)}</div></div>)}{list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>Нет уведомлений</div>}</div>}</div>; }

/* ═══ AUTH ═══ */
function AuthScreen({ onSelect }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}><div style={{ textAlign: 'center', animation: 'fadeIn .4s ease' }}>
    <div style={{ fontSize: 34, fontWeight: 700, marginBottom: 8, letterSpacing: -0.5 }}><span style={{ color: 'var(--accent-red)' }}>HANQYZY</span><span style={{ color: 'var(--text-muted)' }}> / </span><span style={{ color: 'var(--accent-blue)' }}>hub</span></div>
    <p style={{ color: 'var(--text-muted)', fontSize: 16, marginBottom: 40 }}>Выбери кто ты</p>
    <div className="auth-buttons" style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>{Object.entries(USERS).map(([id, u]) =>
      <button key={id} onClick={() => onSelect(id)} style={{ width: 160, padding: '32px 24px', borderRadius: 18, border: '2px solid var(--border-light)', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)', transition: 'all .2s', cursor: 'pointer' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = u.color; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}>
        <img src={u.photo} alt={u.name} style={{ width: 56, height: 56, borderRadius: '50%' }} />
        <span style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 600 }}>{u.name}</span>
      </button>)}</div>
  </div></div>;
}

/* ═══ MAIN ═══ */

const TABS = [
  { id: 'content', label: 'Контент-план', icon: '📅', color: 'var(--accent-blue)' },
  { id: 'scripts', label: 'Сценарии', icon: '📝', color: 'var(--accent-purple)' },
  { id: 'tasks', label: 'Задачи', icon: '☑', color: 'var(--accent-orange)' },
  { id: 'ideas', label: 'Идеи', icon: '💡', color: 'var(--accent-yellow)' },
  { id: 'releases', label: 'Релизы', icon: '💿', color: 'var(--accent-red)' },
  { id: 'concerts', label: 'Концерты', icon: '🎤', color: 'var(--accent-pink)' },
  { id: 'festivals', label: 'Фестивали', icon: '🎪', color: 'var(--accent-indigo)' },
  { id: 'contacts', label: 'Контакты', icon: '🤝', color: 'var(--accent-green)' },
  { id: 'finance', label: 'Смета', icon: '💰', color: 'var(--accent-green)' },
  { id: 'stats', label: 'Статистика', icon: '📊', color: 'var(--accent-cyan)' },
  { id: 'epk', label: 'EPK', icon: '📋', color: 'var(--accent-indigo)' },
  { id: 'files', label: 'Файлы', icon: '📁', color: 'var(--accent-teal)' },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(null); const [tab, setTab] = useState('content'); const [showLog, setShowLog] = useState(true); const [openScriptId, setOpenScriptId] = useState(null);
  const [scripts] = useFirebase('scripts'); const [files] = useFirebase('files'); const allFiles = toList(files);
  const handleOpenScript = (id) => { setOpenScriptId(id); setTab('scripts'); };
  useEffect(() => { checkYandexAuthCallback(); }, []);
  if (!currentUser) return <AuthScreen onSelect={setCurrentUser} />;
  const user = USERS[currentUser]; const ydConnected = !!getYandexToken();
  return <div style={{ background: 'var(--bg-root)', minHeight: '100vh' }}>
    <div className="app-header" style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="logo" style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}><span style={{ color: 'var(--accent-red)' }}>HANQYZY</span><span style={{ color: 'var(--text-faint)', fontWeight: 400, margin: '0 4px' }}>/</span><span style={{ color: 'var(--accent-blue)' }}>hub</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{ydConnected && <Badge color="var(--accent-green)">Я.Диск ✓</Badge>}<NotificationBell currentUser={currentUser} /><button className="log-toggle" onClick={() => setShowLog(!showLog)} style={{ background: 'var(--bg-surface)', border: 'none', borderRadius: 999, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, padding: '6px 14px', cursor: 'pointer' }}>{showLog ? '◀ Лог' : '▶ Лог'}</button><img src={user.photo} alt={user.name} style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid var(--bg-card)', boxShadow: 'var(--shadow-sm)' }} /><span className="user-name" style={{ fontSize: 14, fontWeight: 600, color: user.color }}>{user.name}</span><button onClick={() => setCurrentUser(null)} style={{ background: 'var(--bg-surface)', border: 'none', borderRadius: 999, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, padding: '6px 14px', cursor: 'pointer' }}>Выйти</button></div>
    </div>
    <TabBar items={TABS} active={tab} onChange={setTab} />
    <div className="app-content" style={{ padding: 24, marginRight: showLog ? 230 : 0, transition: 'margin-right .2s' }}>
      <div className="content-inner">
      {tab === 'content' && <ContentPlanTab currentUser={currentUser} scripts={scripts} allFiles={allFiles} onOpenScript={handleOpenScript} />}
      {tab === 'scripts' && <ScriptsTab currentUser={currentUser} scripts={scripts} openScriptId={openScriptId} setOpenScriptId={setOpenScriptId} />}
      {tab === 'tasks' && <TasksTab currentUser={currentUser} />}
      {tab === 'ideas' && <IdeasTab currentUser={currentUser} />}
      {tab === 'releases' && <ReleasesTab currentUser={currentUser} allFiles={allFiles} />}
      {tab === 'concerts' && <ConcertsTab currentUser={currentUser} />}
      {tab === 'festivals' && <FestivalsTab currentUser={currentUser} />}
      {tab === 'contacts' && <ContactsTab currentUser={currentUser} />}
      {tab === 'finance' && <FinanceTab currentUser={currentUser} />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'epk' && <EPKTab currentUser={currentUser} />}
      {tab === 'files' && <FilesTab currentUser={currentUser} allFiles={allFiles} />}
      </div>
    </div>
    {showLog && <ActivityLog />}
  </div>;
}
