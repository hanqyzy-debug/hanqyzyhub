import { useState, useEffect, useRef } from 'react';
import { db, ref, push, remove, update, onValue, off, storage, storageRef, uploadBytes, getDownloadURL } from './firebase.js';
import { getYandexToken, startYandexAuth, checkYandexAuthCallback, uploadFile as ydUpload, deleteFile as ydDelete, getDownloadLink } from './yandexDisk.js';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

/* ═══ CONSTANTS ═══ */
const USERS = {
  leyla: { name: 'Leyla', color: '#FF3B30', avatar: 'L', photo: 'https://ui-avatars.com/api/?name=Leyla+H&background=FF3B30&color=fff&size=128&font-size=0.45&bold=true' },
  manager: { name: 'Manager', color: '#007AFF', avatar: 'M', photo: 'https://ui-avatars.com/api/?name=M&background=007AFF&color=fff&size=128&font-size=0.45&bold=true' },
};
const STATUSES = { idea: { label: 'Идея', color: '#AF52DE' }, todo: { label: 'To Do', color: '#FF9500' }, in_progress: { label: 'В работе', color: '#007AFF' }, review: { label: 'Ревью', color: '#FF2D55' }, done: { label: 'Готово', color: '#34C759' } };
const CONTENT_FORMATS = ['Reels','Story','Пост','Видео','Shorts','Клип','Подкаст','Статья','Другое'];
const PLATFORMS = ['Instagram','VK','YouTube','TikTok','Telegram','Spotify','Yandex Music','Другое'];
const PLATFORM_ICON = { 'Instagram': '/icons/Instagram.png', 'VK': '/icons/VK.png', 'YouTube': '/icons/Youtube.png', 'TikTok': '/icons/tiktok.png', 'Telegram': '/icons/Telegram.png', 'Spotify': '🟢', 'Yandex Music': '🟡', 'Другое': '📱' };
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
function timeAgo(t) { if (!t) return ''; const d = (Date.now() - new Date(t).getTime()) / 1000; if (d < 60) return 'только что'; if (d < 3600) return Math.floor(d / 60) + ' мин'; if (d < 86400) return Math.floor(d / 3600) + ' ч'; return t.slice(0, 10); }
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
function Badge({ children, color }) { return <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, color, background: color + '14', whiteSpace: 'nowrap' }}>{children}</span>; }
function UserPhoto({ uid, size = 28 }) { const u = USERS[uid] || USERS.leyla; return <img src={u.photo} alt={u.name} title={u.name} style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }} />; }
function Btn({ children, onClick, color = 'var(--accent-blue)', outline, small, style, disabled }) {
  return <button disabled={disabled} onClick={onClick} style={{ padding: small ? '6px 16px' : '9px 22px', borderRadius: 20, border: outline ? `1.5px solid ${color}` : 'none', background: outline ? 'transparent' : color, color: outline ? color : '#fff', fontSize: small ? 13 : 14, fontWeight: 500, opacity: disabled ? 0.4 : 1, cursor: 'pointer', ...style }}>{children}</button>;
}
function Field({ label, children }) { return <div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 500 }}>{label}</div>{children}</div>; }
function Card({ children, style, onClick, className }) { return <div className={className} onClick={onClick} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-sm)', ...style }}>{children}</div>; }
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (<div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, boxShadow: 'var(--shadow-lg)', padding: 28, width: '100%', maxWidth: wide ? 820 : 560, maxHeight: '90vh', overflowY: 'auto', animation: 'fadeIn .2s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 19, fontWeight: 600 }}>{title}</h3>
        <button className="modal-close" onClick={onClose} style={{ background: 'var(--bg-surface)', border: 'none', borderRadius: '50%', width: 32, height: 32, minHeight: 32, fontSize: 16, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>✕</button>
      </div>{children}
    </div>
  </div>);
}
function Empty({ text }) { return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 15 }}>{text}</div>; }
function TabBar({ items, active, onChange }) {
  return <div className="app-tabs" style={{ display: 'flex', gap: 0, overflowX: 'auto', padding: '0 24px', borderBottom: '1px solid var(--border-light)', background: '#fff' }}>
    {items.map(t => <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: '12px 18px', border: 'none', background: 'transparent', color: active === t.id ? 'var(--accent-blue)' : 'var(--text-secondary)', fontSize: 13, fontWeight: active === t.id ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', borderBottom: active === t.id ? '2px solid var(--accent-blue)' : '2px solid transparent', cursor: 'pointer' }}>
      <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
    </button>)}
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
  const [form, setForm] = useState({ title: '', platform: 'Instagram', format: 'Reels', date: today(), scriptId: '', status: 'idea', metricsUrl: '', metricsData: '' });
  const [eventForm, setEventForm] = useState({ title: '', date: today(), type: 'событие', color: '#007AFF' });
  const list = toList(items), scriptList = toList(scripts), eventList = toList(events);
  const releaseEvents = toList(releases).filter(r => r.releaseDate).map(r => ({ _id: 'rel_' + r._id, title: '💿 ' + r.title, date: r.releaseDate, color: '#FF9500', auto: true }));
  const concertEvents = toList(concerts).filter(c => c.date).map(c => ({ _id: 'con_' + c._id, title: '🎤 ' + c.title, date: c.date, color: '#FF2D55', auto: true }));
  const allEvents = [...eventList, ...releaseEvents, ...concertEvents];
  const addItem = () => { if (!form.title.trim()) return; const r = fbPush('contentPlan', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now(), statusChangedBy: currentUser }); logActivity(currentUser, `добавил контент: ${form.title}`); notifyOther(currentUser, `добавил контент: ${form.title}`); setForm({ title: '', platform: 'Instagram', format: 'Reels', date: today(), scriptId: '', status: 'idea', metricsUrl: '', metricsData: '' }); setModal(r.key); };
  const addEvent = () => { if (!eventForm.title.trim()) return; fbPush('calendarEvents', { ...eventForm, createdBy: currentUser }); setEventForm({ title: '', date: today(), type: 'событие', color: '#007AFF' }); setEventModal(null); };
  const updateItem = (id, u) => fbUpdate(`contentPlan/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() });
  const changeStatus = (id, s, t) => { fbUpdate(`contentPlan/${id}`, { status: s, statusChangedBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `статус «${t}» → ${STATUSES[s]?.label}`); notifyOther(currentUser, `статус «${t}» → ${STATUSES[s]?.label}`); };
  const year = refDate.getFullYear(), month = refDate.getMonth();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7; const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays = []; for (let i = 0; i < startDow; i++) calDays.push(null); for (let d = 1; d <= daysInMonth; d++) calDays.push(d);
  const getForDay = (d) => { const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return { content: list.filter(it => it.date === ds), events: allEvents.filter(e => e.date === ds) }; };
  const getWeekDays = () => { const d = new Date(refDate); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); const days = []; for (let i = 0; i < 7; i++) { days.push(new Date(d)); d.setDate(d.getDate() + 1); } return days; };
  const itemFiles = (id) => allFiles.filter(f => f.parentId === id);

  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <div className="cal-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
      <div className="cal-controls-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="cal-header-title" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: 'var(--text-primary)' }}>{MONTHS_RU[month]} <span className="cal-header-year" style={{ color: 'var(--text-muted)', fontWeight: 300 }}>{year}</span></div>
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          <button onClick={() => setRefDate(new Date(year, month - 1, 1))} style={{ background: 'transparent', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>‹</button>
          <button onClick={() => setRefDate(new Date())} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', height: 28, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}>Сегодня</button>
          <button onClick={() => setRefDate(new Date(year, month + 1, 1))} style={{ background: 'transparent', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 2, marginLeft: 8, background: 'var(--bg-surface)', borderRadius: 7, padding: 2 }}>
          {['month','week'].map(v => <button key={v} onClick={() => setView(v)} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', fontSize: 12, fontWeight: 500, background: view === v ? '#fff' : 'transparent', color: view === v ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: view === v ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}>{v === 'month' ? 'Месяц' : 'Неделя'}</button>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}><Btn onClick={() => setEventModal('add')} small outline color="var(--accent-purple)">+ Событие</Btn><Btn onClick={() => setModal('add')} small>+ Контент</Btn></div>
    </div>
    {view === 'month' ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, background: 'var(--border-cal)', border: '1px solid var(--border-cal)', borderRadius: 0, overflow: 'hidden' }}>
      {DAYS_RU.map(d => <div key={d} className="cal-day-header" style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', padding: '8px 4px', background: '#fff', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border-cal)', borderRight: '1px solid var(--border-cal)' }}>{d}</div>)}
      {calDays.map((d, i) => { if (!d) return <div key={i} style={{ background: '#FAFAFA', borderRight: '1px solid var(--border-cal)', borderBottom: '1px solid var(--border-cal)' }} />; const { content, events } = getForDay(d); const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear(); const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return <div key={i} className="cal-day-cell" onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('day-num-wrap') || e.target.classList.contains('day-cell-empty')) { setForm({ ...form, date: dateStr }); setModal('add'); } }} style={{ background: '#fff', minHeight: 96, padding: '4px 6px', borderRight: '1px solid var(--border-cal)', borderBottom: '1px solid var(--border-cal)', cursor: 'pointer', position: 'relative' }}>
        <div className="day-num-wrap" style={{ marginBottom: 3, display: 'flex', justifyContent: 'flex-end' }}>
          {isToday ? <div className="cal-day-today" style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{d}</div> : <div className="cal-day-num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', padding: '2px 6px' }}>{d}</div>}
        </div>
        {content.map(it => <div key={it._id} className="cal-item" onClick={e => { e.stopPropagation(); setModal(it._id); }} style={{ fontSize: 10, padding: '2px 4px', borderRadius: 3, marginBottom: 1, cursor: 'pointer', background: (STATUSES[it.status]?.color || '#888') + '18', color: STATUSES[it.status]?.color, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3, borderLeft: `2px solid ${STATUSES[it.status]?.color || '#888'}` }}><PlatformIcon platform={it.platform} size={10} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span></div>)}
        {events.map(ev => <div key={ev._id} className="cal-item" onClick={e => e.stopPropagation()} style={{ fontSize: 10, padding: '2px 4px', borderRadius: 3, marginBottom: 1, background: ev.color + '18', color: ev.color, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderLeft: `2px solid ${ev.color}` }}>{ev.title}</div>)}
        <div className="day-cell-empty" style={{ flex: 1, minHeight: 8 }}></div>
      </div>; })}
    </div> : <div className="cal-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
      {getWeekDays().map((d, i) => { const ds = d.toISOString().slice(0, 10); const isToday = ds === today(); const dc = list.filter(it => it.date === ds); const de = allEvents.filter(e => e.date === ds); return <div key={i} onClick={(e) => { if (e.target === e.currentTarget) { setForm({ ...form, date: ds }); setModal('add'); } }} style={{ padding: 10, background: '#fff', border: `1px solid ${isToday ? 'var(--accent-red)' : 'var(--border-light)'}`, borderRadius: 8, minHeight: 160, cursor: 'pointer' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{DAYS_RU[i]}</div>
          {isToday ? <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, marginTop: 4 }}>{d.getDate()}</div> : <div style={{ fontSize: 18, fontWeight: 300, color: 'var(--text-primary)', marginTop: 2 }}>{d.getDate()}</div>}
        </div>
        {dc.map(it => <div key={it._id} onClick={e => { e.stopPropagation(); setModal(it._id); }} style={{ fontSize: 11, padding: 6, borderRadius: 6, marginBottom: 4, cursor: 'pointer', background: (STATUSES[it.status]?.color || '#888') + '15', borderLeft: `2px solid ${STATUSES[it.status]?.color}` }}><div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, color: STATUSES[it.status]?.color }}><PlatformIcon platform={it.platform} size={12} /> {it.title}</div></div>)}
        {de.map(ev => <div key={ev._id} onClick={e => e.stopPropagation()} style={{ fontSize: 11, padding: 6, borderRadius: 6, marginBottom: 4, background: ev.color + '15', borderLeft: `2px solid ${ev.color}`, color: ev.color, fontWeight: 500 }}>{ev.title}</div>)}
      </div>; })}
    </div>}
    <Card style={{ marginTop: 20, overflow: 'hidden' }}>
      <div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 70px 70px 80px 80px 70px 1fr 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}><span>Название</span><span>Платформа</span><span>Формат</span><span>Статус</span><span>Дата</span><span>Сценарий</span><span>Файлы</span><span>Метрики</span><span></span></div>
      {list.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(it => { const ls = scriptList.find(s => s._id === it.scriptId); const files = itemFiles(it._id); return <div key={it._id} className="row-hover" onClick={() => setModal(it._id)} style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 70px 70px 80px 80px 70px 1fr 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
        <div><div style={{ fontWeight: 500 }}>{it.title}</div>{it.statusChangedBy && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}><span style={{ color: USERS[it.statusChangedBy]?.color }}>{USERS[it.statusChangedBy]?.name}</span></span>}</div>
        <Badge color="var(--accent-blue)">{it.platform}</Badge><Badge color="var(--accent-purple)">{it.format}</Badge><Badge color={STATUSES[it.status]?.color}>{STATUSES[it.status]?.label}</Badge>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(it.date)}</span>
        {ls ? <button onClick={e => { e.stopPropagation(); onOpenScript(ls._id); }} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: 0 }}>📝 {ls.title}</button> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        <span style={{ fontSize: 12, color: files.length ? 'var(--accent-green)' : 'var(--text-muted)' }}>{files.length ? `📁${files.length}` : '—'}</span>
        <div style={{ fontSize: 11 }}>{it.metricsData ? <span style={{ color: 'var(--accent-green)' }}>{it.metricsData}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
        <button onClick={e => { e.stopPropagation(); fbRemove(`contentPlan/${it._id}`); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button>
      </div>; })}</div>{list.length === 0 && <Empty text="Нет контента" />}
    </Card>
    <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Новый контент' : 'Редактировать'} wide>
      {modal === 'add' ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field></div>
        <Field label="Дата"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Платформа"><select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Формат"><select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}>{CONTENT_FORMATS.map(f => <option key={f}>{f}</option>)}</select></Field>
        <Field label="Статус"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUS_KEYS.map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}</select></Field>
        <Field label="Сценарий"><select value={form.scriptId} onChange={e => setForm({ ...form, scriptId: e.target.value })}><option value="">— нет —</option>{scriptList.map(s => <option key={s._id} value={s._id}>{s.title}</option>)}</select></Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Метрики"><input value={form.metricsData} onChange={e => setForm({ ...form, metricsData: e.target.value })} placeholder="10K views" /></Field></div>
        <div style={{ gridColumn: '1/-1' }}><Btn onClick={addItem}>Создать и добавить файлы →</Btn></div>
      </div> : (() => { const it = list.find(x => x._id === modal); if (!it) return null; const ls = scriptList.find(s => s._id === it.scriptId); const files = itemFiles(it._id); return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={it.title || ''} onChange={e => updateItem(it._id, { title: e.target.value })} /></Field></div>
        <Field label="Дата"><input type="date" value={it.date || ''} onChange={e => updateItem(it._id, { date: e.target.value })} /></Field>
        <Field label="Платформа"><select value={it.platform || ''} onChange={e => updateItem(it._id, { platform: e.target.value })}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Формат"><select value={it.format || ''} onChange={e => updateItem(it._id, { format: e.target.value })}>{CONTENT_FORMATS.map(f => <option key={f}>{f}</option>)}</select></Field>
        <Field label="Статус"><select value={it.status || 'idea'} onChange={e => changeStatus(it._id, e.target.value, it.title)}>{STATUS_KEYS.map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}</select>{it.statusChangedBy && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>отметил: <span style={{ color: USERS[it.statusChangedBy]?.color }}>{USERS[it.statusChangedBy]?.name}</span></div>}</Field>
        <Field label="Сценарий"><select value={it.scriptId || ''} onChange={e => updateItem(it._id, { scriptId: e.target.value })}><option value="">— нет —</option>{scriptList.map(s => <option key={s._id} value={s._id}>{s.title}</option>)}</select>{ls && <button onClick={() => { setModal(null); setTimeout(() => onOpenScript(ls._id), 100); }} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 12, cursor: 'pointer', marginTop: 4, padding: 0 }}>→ Открыть «{ls.title}»</button>}</Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Метрики"><input value={it.metricsData || ''} onChange={e => updateItem(it._id, { metricsData: e.target.value })} /></Field></div>
        <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border-light)', paddingTop: 14 }}><div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Файлы</div><FileList files={files} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}><div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>🎬 Видео</div><YDFileUploader currentUser={currentUser} parentId={it._id} tag="видео" subFolder={`content/${it._id}`} /></div><div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>🖼 Фото</div><YDFileUploader currentUser={currentUser} parentId={it._id} tag="обложка" subFolder={`content/${it._id}`} /></div></div></div>
        <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)' }}>Изменил: {USERS[it.updatedBy]?.name} · {it.updatedAt}</div>
      </div>; })()}
    </Modal>
    <Modal open={!!eventModal} onClose={() => setEventModal(null)} title="Новое событие">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Название"><input value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} placeholder="Релиз трека, выступление..." /></Field>
        <Field label="Дата"><input type="date" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} /></Field>
        <Field label="Тип"><select value={eventForm.type} onChange={e => setEventForm({ ...eventForm, type: e.target.value })}>{['событие','релиз','выступление','дедлайн','другое'].map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Цвет"><select value={eventForm.color} onChange={e => setEventForm({ ...eventForm, color: e.target.value })}><option value="#007AFF">Синий</option><option value="#FF9500">Оранжевый</option><option value="#FF2D55">Розовый</option><option value="#34C759">Зелёный</option><option value="#AF52DE">Фиолетовый</option></select></Field>
        <Btn onClick={addEvent} color="var(--accent-purple)">Добавить</Btn>
      </div>
    </Modal>
  </div>;
}

/* ═══ 2. SCRIPTS (auto-open editor on create) ═══ */
function ScriptsTab({ currentUser, scripts, openScriptId, setOpenScriptId }) {
  const [modal, setModal] = useState(null); const [form, setForm] = useState({ title: '', location: '', format: '' }); const [saved, setSaved] = useState(false); const [localBody, setLocalBody] = useState('');
  const list = toList(scripts);
  useEffect(() => { if (openScriptId) { const s = list.find(x => x._id === openScriptId); if (s) setLocalBody(s.body || ''); setModal(openScriptId); setOpenScriptId(null); } }, [openScriptId]);
  const addScript = () => { if (!form.title.trim()) return; const r = fbPush('scripts', { ...form, body: '', createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `создал сценарий: ${form.title}`); notifyOther(currentUser, `создал сценарий: ${form.title}`); setForm({ title: '', location: '', format: '' }); setLocalBody(''); setModal(r.key); };
  const openEditor = (id) => { const s = list.find(x => x._id === id); if (s) setLocalBody(s.body || ''); setModal(id); setSaved(false); };
  const saveScript = (id) => { fbUpdate(`scripts/${id}`, { body: localBody, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, 'сохранил сценарий'); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const deleteScript = (id) => { fbRemove(`scripts/${id}`); logActivity(currentUser, 'удалил сценарий'); setModal(null); };
  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{list.length} сценариев</span><Btn onClick={() => setModal('add')} small color="var(--accent-purple)">+ Сценарий</Btn></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>{list.map(s => <Card key={s._id} style={{ padding: 16, cursor: 'pointer' }} onClick={() => openEditor(s._id)}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>{s.location && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>📍 {s.location}</div>}{s.format && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🎬 {s.format}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden', fontFamily: 'var(--font-mono)' }}>{s.body?.slice(0, 200) || 'Пусто'}</div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><UserPhoto uid={s.updatedBy} size={22} /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.updatedAt?.slice(0, 10)}</span></div>
    </Card>)}</div>{list.length === 0 && <Empty text="Нет сценариев" />}
    <Modal open={!!modal} onClose={() => { setModal(null); setLocalBody(''); }} title={modal === 'add' ? 'Новый сценарий' : 'Редактор'} wide>
      {modal === 'add' ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Локация"><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Студия, улица..." /></Field>
        <Field label="Формат"><input value={form.format} onChange={e => setForm({ ...form, format: e.target.value })} placeholder="Reels, клип..." /></Field>
        <Btn onClick={addScript} color="var(--accent-purple)">Создать →</Btn>
      </div> : (() => { const s = list.find(x => x._id === modal); if (!s) return null; return <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Название"><input value={s.title || ''} onChange={e => fbUpdate(`scripts/${s._id}`, { title: e.target.value })} style={{ fontSize: 18, fontWeight: 600, border: 'none', padding: 0, boxShadow: 'none' }} /></Field></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{saved && <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 500 }}>✓</span>}<Btn onClick={() => saveScript(s._id)}>Сохранить</Btn><Btn onClick={() => deleteScript(s._id)} color="var(--accent-red)" outline small>Удалить</Btn></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <Field label="📍 Локация"><input value={s.location || ''} onChange={e => fbUpdate(`scripts/${s._id}`, { location: e.target.value, updatedBy: currentUser, updatedAt: now() })} /></Field>
          <Field label="🎬 Формат"><input value={s.format || ''} onChange={e => fbUpdate(`scripts/${s._id}`, { format: e.target.value, updatedBy: currentUser, updatedAt: now() })} /></Field>
        </div>
        <Field label="Сценарий"><textarea value={localBody} onChange={e => { setLocalBody(e.target.value); setSaved(false); }} rows={18} style={{ fontFamily: "'Courier New', monospace", fontSize: 14, lineHeight: 1.7, background: '#FAFAFA', border: '1px solid var(--border-light)', borderRadius: 14, padding: 24, width: '100%', minHeight: 400 }} placeholder="Напиши сценарий..." /></Field>
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
  return <div style={{ animation: 'fadeIn .2s ease' }}><h3 className="page-title" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, marginBottom: 16 }}>Идеи 💡</h3>
    <Card style={{ padding: 16, marginBottom: 20 }}><div className="idea-add" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}><div style={{ flex: 1 }}><textarea value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} placeholder="Запиши идею..." rows={2} style={{ minHeight: 50 }} /></div><div style={{ width: 120 }}><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div><Btn onClick={add} small>Записать</Btn></div></Card>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>{list.map(i => <Card key={i._id} style={{ padding: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Badge color={catC[i.category] || '#888'}>{i.category}</Badge><button onClick={() => fbRemove(`ideas/${i._id}`)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button></div><div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{i.text}</div><div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><UserPhoto uid={i.createdBy} size={20} /><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(i.createdAt)}</span></div></Card>)}</div>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{list.length} релизов</span><Btn onClick={() => setModal('add')} small color="var(--accent-orange)">+ Релиз</Btn></div>
    <Card className="table-card" style={{ overflow: 'hidden' }}>
      <div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.5fr 90px 100px 80px 60px 80px 1fr 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}><span>Трек</span><span>Дата</span><span>Стадия</span><span>Обложка</span><span>Файлы</span><span>Кто</span><span>Заметки</span><span></span></div>
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
  const [concerts] = useFirebase('concerts'); const [modal, setModal] = useState(null); const [form, setForm] = useState({ title: '', date: '', time: '', venue: '', city: '', fee: '', status: 'Подтверждено', notes: '', contactName: '', contactPhone: '' }); const list = toList(concerts); const CS = ['Запрос', 'В обсуждении', 'Подтверждено', 'Отменено', 'Прошло'];
  const addC = () => { if (!form.title.trim()) return; fbPush('concerts', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `концерт: ${form.title}`); notifyOther(currentUser, `концерт: ${form.title}`); setForm({ title: '', date: '', time: '', venue: '', city: '', fee: '', status: 'Подтверждено', notes: '', contactName: '', contactPhone: '' }); setModal(null); };
  const upd = (id, u) => fbUpdate(`concerts/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() });
  return <div style={{ animation: 'fadeIn .2s ease' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{list.length} событий</span><Btn onClick={() => setModal('add')} small color="var(--accent-pink)">+ Концерт</Btn></div>
    <Card className="table-card" style={{ overflow: 'hidden' }}><div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px 60px 1fr 1fr 90px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}><span>Название</span><span>Дата</span><span>Время</span><span>Площадка</span><span>Город</span><span>Статус</span><span>Кто</span><span></span></div>
      {list.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(c => <div key={c._id} className="row-hover" onClick={() => setModal(c._id)} style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px 60px 1fr 1fr 90px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}><span style={{ fontWeight: 500 }}>{c.title}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(c.date)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.time || '—'}</span><span style={{ color: 'var(--text-secondary)' }}>{c.venue || '—'}</span><span style={{ color: 'var(--text-secondary)' }}>{c.city || '—'}</span><Badge color={c.status === 'Подтверждено' ? 'var(--accent-green)' : c.status === 'Отменено' ? 'var(--accent-red)' : 'var(--accent-yellow)'}>{c.status}</Badge><UserPhoto uid={c.updatedBy} size={22} /><button onClick={e => { e.stopPropagation(); fbRemove(`concerts/${c._id}`); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button></div>)}</div>
      {list.length === 0 && <Empty text="Нет концертов" />}</Card>
    <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Новый концерт' : 'Редактировать'}>{modal === 'add' ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field></div><Field label="Дата"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field><Field label="Время"><input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} placeholder="20:00" /></Field><Field label="Площадка"><input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} /></Field><Field label="Город"><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field><Field label="Гонорар"><input value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} /></Field><Field label="Статус"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{CS.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Контакт"><input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /></Field><Field label="Телефон"><input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></Field><div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div><div style={{ gridColumn: '1/-1' }}><Btn onClick={addC} color="var(--accent-pink)">Создать</Btn></div></div> : (() => { const c = list.find(x => x._id === modal); if (!c) return null; return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={c.title || ''} onChange={e => upd(c._id, { title: e.target.value })} /></Field></div><Field label="Дата"><input type="date" value={c.date || ''} onChange={e => upd(c._id, { date: e.target.value })} /></Field><Field label="Время"><input value={c.time || ''} onChange={e => upd(c._id, { time: e.target.value })} /></Field><Field label="Площадка"><input value={c.venue || ''} onChange={e => upd(c._id, { venue: e.target.value })} /></Field><Field label="Город"><input value={c.city || ''} onChange={e => upd(c._id, { city: e.target.value })} /></Field><Field label="Гонорар"><input value={c.fee || ''} onChange={e => upd(c._id, { fee: e.target.value })} /></Field><Field label="Статус"><select value={c.status} onChange={e => upd(c._id, { status: e.target.value })}>{CS.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Контакт"><input value={c.contactName || ''} onChange={e => upd(c._id, { contactName: e.target.value })} /></Field><Field label="Телефон"><input value={c.contactPhone || ''} onChange={e => upd(c._id, { contactPhone: e.target.value })} /></Field><div style={{ gridColumn: '1/-1' }}><Field label="Заметки"><textarea value={c.notes || ''} onChange={e => upd(c._id, { notes: e.target.value })} /></Field></div><div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)' }}>{USERS[c.updatedBy]?.name} · {c.updatedAt}</div></div>; })()}</Modal>
  </div>;
}

/* ═══ 6. CONTACTS ═══ */
function ContactsTab({ currentUser }) {
  const [contacts] = useFirebase('contacts'); const [modal, setModal] = useState(null); const [form, setForm] = useState({ name: '', company: '', role: '', offer: '', email: '', phone: '', social: '', status: 'Новый', notes: '' }); const list = toList(contacts); const CS = ['Новый', 'В переговорах', 'Согласовано', 'Отказ', 'Завершено'];
  const addC = () => { if (!form.name.trim()) return; fbPush('contacts', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `контакт: ${form.name}`); notifyOther(currentUser, `контакт: ${form.name}`); setForm({ name: '', company: '', role: '', offer: '', email: '', phone: '', social: '', status: 'Новый', notes: '' }); setModal(null); };
  const upd = (id, u) => fbUpdate(`contacts/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() });
  return <div style={{ animation: 'fadeIn .2s ease' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{list.length} контактов</span><Btn onClick={() => setModal('add')} small color="var(--accent-cyan)">+ Контакт</Btn></div>
    <Card className="table-card" style={{ overflow: 'hidden' }}><div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.5fr 80px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}><span>Имя</span><span>Компания</span><span>Роль</span><span>Предложение</span><span>Статус</span><span>Кто</span><span></span></div>
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
  const [form, setForm] = useState({ title: '', assignee: currentUser, due: '', description: '', done: false });
  const list = toList(tasks).sort((a, b) => { if (a.done && !b.done) return 1; if (!a.done && b.done) return -1; return (a.due || 'zzz').localeCompare(b.due || 'zzz'); });
  const active = list.filter(t => !t.done);
  const completed = list.filter(t => t.done);
  const addTask = () => { if (!form.title.trim()) return; fbPush('tasks', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now(), created: today() }); logActivity(currentUser, `создал задачу: ${form.title}`); notifyOther(currentUser, `создал задачу: ${form.title}`); setForm({ title: '', assignee: currentUser, due: '', description: '', done: false }); setModal(null); };
  const upd = (id, u) => { fbUpdate(`tasks/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() }); };
  const toggleDone = (id, task) => { const newDone = !task.done; upd(id, { done: newDone, doneBy: newDone ? currentUser : null }); logActivity(currentUser, `${newDone ? '✓' : '○'} ${task.title}`); notifyOther(currentUser, `${newDone ? 'выполнил' : 'вернул'} задачу «${task.title}»`); };
  const dueStatus = (due) => { if (!due) return null; const today0 = new Date(today()).getTime(); const dueT = new Date(due).getTime(); const days = Math.floor((dueT - today0) / 86400000); if (days < 0) return { color: 'var(--accent-red)', label: `Просрочено на ${Math.abs(days)} д.` }; if (days === 0) return { color: 'var(--accent-red)', label: 'Сегодня' }; if (days === 1) return { color: 'var(--accent-orange)', label: 'Завтра' }; if (days <= 3) return { color: 'var(--accent-orange)', label: `Через ${days} д.` }; if (days <= 7) return { color: 'var(--accent-blue)', label: `Через ${days} д.` }; return { color: 'var(--text-muted)', label: fmtDate(due) }; };

  const TaskRow = ({ t }) => { const ds = dueStatus(t.due); return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border-light)', opacity: t.done ? 0.45 : 1 }}>
    <button className="task-checkbox" onClick={() => toggleDone(t._id, t)} style={{ background: t.done ? 'var(--accent-blue)' : '#fff', border: `1.5px solid ${t.done ? 'var(--accent-blue)' : '#C7C7CC'}`, borderRadius: '50%', width: 22, height: 22, minWidth: 22, minHeight: 22, maxHeight: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 12, flexShrink: 0, marginTop: 2, padding: 0, lineHeight: 1 }}>{t.done ? '✓' : ''}</button>
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

  return <div style={{ animation: 'fadeIn .2s ease', maxWidth: 760 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
      <div>
        <div className="page-title-huge" style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-orange)', letterSpacing: -0.5, lineHeight: 1 }}>Задачи</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{active.length} активных · {completed.length} выполнено</div>
      </div>
      <Btn onClick={() => setModal('add')} small>+ Задача</Btn>
    </div>
    <div>
      {active.map(t => <TaskRow key={t._id} t={t} />)}
      {active.length === 0 && completed.length === 0 && <Empty text="Нет задач — добавь первую" />}
      {completed.length > 0 && <>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 28, marginBottom: 4 }}>Выполнено · {completed.length}</div>
        {completed.map(t => <TaskRow key={t._id} t={t} />)}
      </>}
    </div>
    <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Новая задача' : 'Задача'}>
      {modal === 'add' ? <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="Название"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus /></Field></div>
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
      </div>; })()}
    </Modal>
  </div>;
}

/* ═══ 9. FESTIVALS ═══ */
const INITIAL_FESTIVALS = [
  { name:'Архстояние', dates:'23-26 июля', genre:'Электроника, поп', website:'https://arch.stoyanie.ru/', status:'Подали', notes:'Заявку отправила 25.03', category:'Опен-колл', openCall:true },
  { name:'Solar Systo Togathering', dates:'20-25 мая', genre:'Электроника, регги, альтернатива, фолк, нойз', website:'https://2026.solarsysto.ru/', status:'Изучаем', category:'Опен-колл', openCall:true },
  { name:'Столица Закатов', dates:'29 мая — 31 августа', genre:'Электроника, классика, world music', website:'https://stolicazakatov.nn-afisha.ru/', status:'Изучаем', category:'Опен-колл', openCall:true },
  { name:'Bandlink Шоукейс', dates:'Не объявлены', genre:'Инди, рэп, электроника, поп', website:'https://bandlink.media/showcase', status:'Изучаем', category:'Шоукейс', openCall:true },
  { name:'Музсходка', dates:'Не объявлены', genre:'Электроника, рэп, рок, поп, джаз', website:'https://vk.com/muzshodka', status:'Изучаем', category:'Опен-колл', openCall:true },
  { name:'Сказка', dates:'13-16 августа', genre:'Электроника, инди', website:'https://skazkafestival.ru/', status:'Подали', notes:'Подала заявку 17.04, ответ до 1 июля на почту arina_prodd. Без гонорара, оплата проезда и проживания', category:'Опен-колл', openCall:true },
  { name:'Paprika Loves', dates:'11 апреля', genre:'Электроника, рэп, рок', website:'https://t.me/paprika_magazine/3805', status:'Изучаем', notes:'Опен-колл завершён', category:'Опен-колл', openCall:true },
  { name:'Волга шепчет', dates:'Не объявлены', genre:'Любые', website:'', status:'Изучаем', category:'Опен-колл', openCall:true },
  { name:'Сумятица', dates:'Не объявлены', genre:'Электрофолк', website:'https://sumyatitsa.ru/', status:'Изучаем', notes:'Заявка на почту sumyatitsa.fest@gmail.com', category:'Опен-колл', openCall:true },
  { name:'Слияние', dates:'9-12 июля', genre:'Диджеи, саунд-дизайн, этно-электроника', website:'https://d-fusionfest.ru/', status:'Подали', notes:'Подали заявку, нам ответили', category:'Опен-колл', openCall:true },
  { name:'INDIA forest camping', dates:'30.06-05.07', genre:'Электронная музыка', website:'https://vk.com/indiafestival', status:'Подали', notes:'Подали заявку, нам ответили', category:'Опен-колл', openCall:true },
  { name:'Ural Music Night', dates:'19 июня', genre:'Электроника', website:'https://uralmusicnight.ru/', status:'Ждём', notes:'Подали заявку, ждём ответа', category:'Опен-колл', openCall:true },
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
  { name:'Signal', dates:'Не объявлены', genre:'Электроника, инди', website:'https://signal.live/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Это база', dates:'Не объявлены', genre:'Электроника, рэп, поп', website:'https://discoklub.com/baza2025', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'New Star Camp', dates:'23-29 марта', genre:'Инди, рэп, электроника', website:'https://newstarcamp.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Moscow Music School Festival', dates:'Не объявлены', genre:'Инди, рэп, электроника, поп', website:'https://vk.com/moscowmusicschoolrussia', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Пари Фест', dates:'Не объявлены', genre:'Рэп, инди, поп, электроника', website:'https://parifest.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'New Star Weekend', dates:'Не объявлены', genre:'Инди, рок, электроника, рэп', website:'https://newstarweekend.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
  { name:'Стереолето', dates:'Не объявлены', genre:'', website:'https://bestfest.ru/', status:'Изучаем', category:'Без опен-колла', openCall:false },
];

function FestivalsTab({ currentUser }) {
  const [festivals] = useFirebase('festivals'); const [modal, setModal] = useState(null); const [catFilter, setCatFilter] = useState('all');
  const [form, setForm] = useState({ name: '', dates: '', location: '', deadline: '', website: '', genre: '', status: 'Изучаем', notes: '', category: 'Опен-колл', openCall: true });
  const list = toList(festivals).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const filtered = catFilter === 'all' ? list : list.filter(f => f.category === catFilter);
  const FEST_STATUSES = ['Изучаем', 'Подаёмся', 'Подали', 'Приняли', 'Отказ', 'Ждём'];
  const FEST_CATS = ['Опен-колл', 'Шоукейс', 'Без опен-колла'];
  const addF = () => { if (!form.name.trim()) return; fbPush('festivals', { ...form, createdBy: currentUser, updatedBy: currentUser, updatedAt: now() }); logActivity(currentUser, `добавил фестиваль: ${form.name}`); notifyOther(currentUser, `фестиваль: ${form.name}`); setForm({ name: '', dates: '', location: '', deadline: '', website: '', genre: '', status: 'Изучаем', notes: '', category: 'Опен-колл', openCall: true }); setModal(null); };
  const upd = (id, u) => fbUpdate(`festivals/${id}`, { ...u, updatedBy: currentUser, updatedAt: now() });
  const stC = s => ({ 'Изучаем': '#007AFF', 'Подаёмся': '#FF9500', 'Подали': '#AF52DE', 'Приняли': '#34C759', 'Отказ': '#FF3B30', 'Ждём': '#AEAEB2' }[s] || '#999');
  
  // Seed initial data if empty
  useEffect(() => { if (Object.keys(festivals).length === 0) { INITIAL_FESTIVALS.forEach(f => fbPush('festivals', { ...f, location: '', deadline: '', createdBy: 'leyla', updatedBy: 'leyla', updatedAt: now() })); } }, [festivals]);

  return <div style={{ animation: 'fadeIn .2s ease' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
      <h3 className="page-title" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Фестивали 🎪</h3>
      <Btn onClick={() => setModal('add')} small color="var(--accent-orange)">+ Фестиваль</Btn>
    </div>
    <div className="filter-pills" style={{ display: 'flex', gap: 2, background: 'var(--bg-surface)', borderRadius: 10, padding: 3, marginBottom: 16, width: 'fit-content', maxWidth: '100%' }}>
      {[{ id: 'all', l: 'Все' }, ...FEST_CATS.map(c => ({ id: c, l: c }))].map(f => <button key={f.id} onClick={() => setCatFilter(f.id)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500, background: catFilter === f.id ? '#fff' : 'transparent', color: catFilter === f.id ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: catFilter === f.id ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}>{f.l}</button>)}
    </div>
    <Card className="table-card" style={{ overflow: 'hidden' }}>
      <div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 1fr 90px 80px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', minWidth: 650 }}><span>Название</span><span>Категория</span><span>Даты / Жанры</span><span>Дедлайн</span><span>Статус</span><span>Кто</span><span></span></div>
      {filtered.map(f => <div key={f._id} className="row-hover" onClick={() => setModal(f._id)} style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 1fr 90px 80px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', fontSize: 13, minWidth: 650 }}>
        <div><span style={{ fontWeight: 500 }}>{f.name}</span>{f.website && <a href={f.website} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: 'var(--accent-blue)', fontSize: 11, marginLeft: 6 }}>↗</a>}{f.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{f.notes.slice(0, 50)}{f.notes.length > 50 ? '...' : ''}</div>}</div>
        <Badge color={f.openCall ? 'var(--accent-green)' : 'var(--text-muted)'}>{f.category || '—'}</Badge>
        <div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.dates || '—'}</div>{f.genre && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.genre}</div>}</div>
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
        <Field label="Даты"><input value={form.dates} onChange={e => setForm({ ...form, dates: e.target.value })} placeholder="15-18 июля 2026" /></Field>
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
        <Field label="Даты"><input value={f.dates || ''} onChange={e => upd(f._id, { dates: e.target.value })} /></Field>
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

/* ═══ 10. FILES ═══ */
function FilesTab({ currentUser, allFiles }) {
  return <div style={{ animation: 'fadeIn .2s ease' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{allFiles.length} файлов</span></div>
    <Card style={{ padding: 16, marginBottom: 16 }}><YDFileUploader currentUser={currentUser} /></Card>
    <Card className="table-card" style={{ overflow: 'hidden' }}><div className="data-table"><div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 80px 90px 70px 36px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}><span>Файл</span><span>Ссылка</span><span>Размер</span><span>Тег</span><span>Дата</span><span>Кто</span><span></span></div>
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
  { id: 'content', label: 'Контент-план', icon: '📅' },
  { id: 'scripts', label: 'Сценарии', icon: '📝' },
  { id: 'tasks', label: 'Задачи', icon: '☑' },
  { id: 'ideas', label: 'Идеи', icon: '💡' },
  { id: 'releases', label: 'Релизы', icon: '💿' },
  { id: 'concerts', label: 'Концерты', icon: '🎤' },
  { id: 'festivals', label: 'Фестивали', icon: '🎪' },
  { id: 'contacts', label: 'Контакты', icon: '🤝' },
  { id: 'epk', label: 'EPK', icon: '📋' },
  { id: 'files', label: 'Файлы', icon: '📁' },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(null); const [tab, setTab] = useState('content'); const [showLog, setShowLog] = useState(true); const [openScriptId, setOpenScriptId] = useState(null);
  const [scripts] = useFirebase('scripts'); const [files] = useFirebase('files'); const allFiles = toList(files);
  const handleOpenScript = (id) => { setOpenScriptId(id); setTab('scripts'); };
  useEffect(() => { checkYandexAuthCallback(); }, []);
  if (!currentUser) return <AuthScreen onSelect={setCurrentUser} />;
  const user = USERS[currentUser]; const ydConnected = !!getYandexToken();
  return <div style={{ background: '#fff', minHeight: '100vh' }}>
    <div className="app-header" style={{ padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', background: '#fff', position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="logo" style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}><span style={{ color: 'var(--accent-red)' }}>HANQYZY</span><span style={{ color: 'var(--text-muted)' }}> / </span><span style={{ color: 'var(--accent-blue)' }}>hub</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{ydConnected && <Badge color="var(--accent-green)">Я.Диск ✓</Badge>}<NotificationBell currentUser={currentUser} /><button className="log-toggle" onClick={() => setShowLog(!showLog)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 20, color: 'var(--text-secondary)', fontSize: 11, padding: '4px 12px', cursor: 'pointer' }}>{showLog ? '◀ Лог' : '▶ Лог'}</button><img src={user.photo} alt={user.name} style={{ width: 30, height: 30, borderRadius: '50%' }} /><span className="user-name" style={{ fontSize: 14, fontWeight: 600, color: user.color }}>{user.name}</span><button onClick={() => setCurrentUser(null)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 20, color: 'var(--text-secondary)', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Выйти</button></div>
    </div>
    <TabBar items={TABS} active={tab} onChange={setTab} />
    <div className="app-content" style={{ padding: 24, marginRight: showLog ? 230 : 0, transition: 'margin-right .2s' }}>
      {tab === 'content' && <ContentPlanTab currentUser={currentUser} scripts={scripts} allFiles={allFiles} onOpenScript={handleOpenScript} />}
      {tab === 'scripts' && <ScriptsTab currentUser={currentUser} scripts={scripts} openScriptId={openScriptId} setOpenScriptId={setOpenScriptId} />}
      {tab === 'tasks' && <TasksTab currentUser={currentUser} />}
      {tab === 'ideas' && <IdeasTab currentUser={currentUser} />}
      {tab === 'releases' && <ReleasesTab currentUser={currentUser} allFiles={allFiles} />}
      {tab === 'concerts' && <ConcertsTab currentUser={currentUser} />}
      {tab === 'festivals' && <FestivalsTab currentUser={currentUser} />}
      {tab === 'contacts' && <ContactsTab currentUser={currentUser} />}
      {tab === 'epk' && <EPKTab currentUser={currentUser} />}
      {tab === 'files' && <FilesTab currentUser={currentUser} allFiles={allFiles} />}
    </div>
    {showLog && <ActivityLog />}
  </div>;
}
