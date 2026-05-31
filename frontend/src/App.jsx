import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon, Plus, Users, Video, RefreshCw, LogOut,
  ChevronLeft, ChevronRight, Briefcase, MapPin, CheckCircle2, Menu, X,
  Settings as SettingsIcon, AlertTriangle, KeyRound, Printer, Sun, Moon, ChevronDown, Building2
} from 'lucide-react';
import SettingsComponent from './components/Settings';
import { printCalendar } from './lib/print-calendar';
import { translations } from './i18n';
import { daysUntilExpiry, expiryStatus, EXPIRY_DEFAULTS } from './lib/expiry-utils';

// ── Default data ──────────────────────────────────────────────────────────────
const DEFAULT_ADMIN_SETTINGS = {
  adminPassword: 'A@q1w2e3r4t5!',
  globalCompanyName: 'Tập đoàn Hoàn Lộc Việt',
  globalCompanyLogo: null,
  faviconUrl: '',
  msClientId: '',
  msTenantId: 'common',
  mailFromName: '',
  mailReplyTo: '',
  mailTestRecipient: '',
  expiryWarningDays: EXPIRY_DEFAULTS.warningDays,
  expiryCriticalDays: EXPIRY_DEFAULTS.criticalDays,
};

const DEFAULT_COMPANIES = [
  { id: 'c-suleco', companyName: 'SULECO',         color: '#dc2626', tenantId: '', clientId: '', clientSecret: '', apiExpirationDate: '2026-12-31', apiWarningEmail: '', notifyEmails: [], expiryAlertEmails: [], syncMailboxes: ['tonggiamdoc@suleco.vn'] },
  { id: 'c-asn',    companyName: 'ASN',             color: '#1d4ed8', tenantId: '', clientId: '', clientSecret: '', apiExpirationDate: '2026-12-31', apiWarningEmail: '', notifyEmails: [], expiryAlertEmails: [], syncMailboxes: [] },
  { id: 'c-mshlv',  companyName: 'MSHLV',           color: '#166534', tenantId: '', clientId: '', clientSecret: '', apiExpirationDate: '2026-12-31', apiWarningEmail: '', notifyEmails: [], expiryAlertEmails: [], syncMailboxes: [] },
  { id: 'c-scts',   companyName: 'SCTS',            color: '#1e3a8a', tenantId: '', clientId: '', clientSecret: '', apiExpirationDate: '2026-12-31', apiWarningEmail: '', notifyEmails: [], expiryAlertEmails: [], syncMailboxes: [] },
  { id: 'c-hlv',    companyName: 'Hoàn Lộc Việt',  shortName: 'HLV', color: '#15803d', tenantId: '', clientId: '', clientSecret: '', apiExpirationDate: '2026-12-31', apiWarningEmail: '', notifyEmails: [], expiryAlertEmails: [], syncMailboxes: [] },
];

// Short display codes for compact labels (long company names → abbreviation).
// Used as fallback so cached/backend companies without a `shortName` still abbreviate.
const COMPANY_SHORT_NAMES = { 'c-hlv': 'HLV' };
const shortCompanyName = (co) => co?.shortName || COMPANY_SHORT_NAMES[co?.id] || co?.companyName || '';

const DEFAULT_USERS = [
  { id: 'u-1', email: 'tonggiamdoc@hoanlocviet.vn', password: '123456', allowedCompanyIds: ['c-suleco', 'c-asn', 'c-mshlv', 'c-scts'], allowedMailboxes: {} },
  { id: 'u-2', email: 'truly@suleco.vn',            password: '123456', allowedCompanyIds: ['c-suleco'],                               allowedMailboxes: {} },
];

// No default events — all data comes from backend (Microsoft 365 calendar sync)
const DEFAULT_EVENTS = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

/** POST to backend API — fire and forget, never blocks UI. */
function apiSave(path, body) {
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .catch(() => {}); // silently ignore network errors
}

/** GET from backend API — returns parsed JSON or null on error. */
async function apiLoad(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/** Fetch events from backend API. Returns null if backend unreachable (graceful fallback). */
async function fetchApiEvents(companyIds, mailboxes) {
  try {
    const params = new URLSearchParams();
    if (companyIds?.length) params.set('companyIds', companyIds.join(','));
    if (mailboxes?.length)  params.set('mailboxes',  mailboxes.join(','));
    const q   = params.toString() ? `?${params}` : '';
    const res = await fetch(`/api/events${q}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default function App() {
  // Auto-detect UI language from the browser: Vietnamese if the browser prefers vi,
  // otherwise English. (Only strings wired through t() switch — see note.)
  const lang = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage) || 'vi')
    .toLowerCase().startsWith('vi') ? 'vi' : 'en';
  const t = (key) => translations[lang]?.[key] || key;

  // ── Persisted global state ─────────────────────────────────────────────────
  const [adminSettings, setAdminSettings] = useState(() => ({
    ...DEFAULT_ADMIN_SETTINGS,
    ...load('adminSettings', {}),
  }));

  const [companies, setCompanies] = useState(() => {
    const loaded = load('appCompanies', DEFAULT_COMPANIES);
    // Migrate: ensure expiryAlertEmails exists on each company
    return loaded.map(c => ({ expiryAlertEmails: [], ...c }));
  });

  const [appUsers, setAppUsers] = useState(() => {
    const loaded = load('appUsers', DEFAULT_USERS);
    return loaded.map(u => ({ allowedMailboxes: {}, password: '123456', ...u })); // migrate
  });
  // Load only manually-added events (filter out any cached mock/api events from old versions)
  const [events, setEvents]     = useState(() => load('appEvents', []).filter(e => e._source === 'manual'));

  // Persist to localStorage (fast, always)
  useEffect(() => { save('adminSettings', adminSettings); }, [adminSettings]);
  useEffect(() => { save('appCompanies', companies); }, [companies]);
  useEffect(() => { save('appUsers', appUsers); }, [appUsers]);
  useEffect(() => { save('appEvents', events); }, [events]);

  // On mount: load adminSettings + appUsers from backend (source of truth after reboot)
  useEffect(() => {
    (async () => {
      const [apiSettings, apiUsers, apiCompanies] = await Promise.all([
        apiLoad('/api/settings'),
        apiLoad('/api/users'),
        apiLoad('/api/companies'),
      ]);
      if (apiSettings && Object.keys(apiSettings).length > 0) {
        setAdminSettings(prev => ({ ...DEFAULT_ADMIN_SETTINGS, ...prev, ...apiSettings }));
        save('adminSettings', { ...load('adminSettings', {}), ...apiSettings });
      }
      if (apiUsers && apiUsers.length > 0) {
        const migrated = apiUsers.map(u => ({ allowedMailboxes: {}, password: '123456', ...u }));
        setAppUsers(migrated);
        save('appUsers', migrated);
      }
      // Merge backend companies (color, logo, name, mailboxes) — backend is source of truth
      if (apiCompanies && apiCompanies.length > 0) {
        setCompanies(prev => {
          const merged = apiCompanies.map(api => {
            const local = prev.find(c => c.id === api.id) || {};
            // Keep a non-empty local logo if backend has none (prevents wiping on reload)
            return { ...local, ...api, logo: api.logo || local.logo || '', notifyEmails: local.notifyEmails || [] };
          });
          save('appCompanies', merged);
          return merged;
        });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => load('currentUser', null));
  const isLoggedIn = !!currentUser;

  useEffect(() => {
    if (currentUser) save('currentUser', currentUser);
    else localStorage.removeItem('currentUser');
  }, [currentUser]);

  // On login: default to ALL companies checked
  useEffect(() => {
    if (currentUser?.allowedCompanyIds?.length) {
      setSelectedCompanyIds([...currentUser.allowedCompanyIds]);
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send expiry alert via backend SMTP (server renders template) ───────────
  const sendSmtpAlert = async (companyId) => {
    const res = await fetch('/api/mail/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Gửi mail thất bại');
    return d;
  };

  // ── Fixed brand colors per company (user-set color takes priority) ──────────
  const FIXED_COLORS = {
    'c-suleco': '#dc2626',
    'c-hlv':    '#15803d',
    'c-mshlv':  '#166534',
    'c-asn':    '#1d4ed8',
    'c-scts':   '#1e3a8a',
  };
  const FALLBACK_PALETTE = ['#7c3aed','#b45309','#0e7490','#9d174d','#064e3b'];
  const getCompanyColor = (companyId, idx = 0) => {
    const co = companies.find(c => c.id === companyId);
    return co?.color || FIXED_COLORS[companyId] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
  };
  const getCompanyLogo = (companyId) => companies.find(c => c.id === companyId)?.logo || '';

  /** Render a small company marker: logo if set, else a colored dot. */
  const CompanyMark = ({ companyId, size = 8 }) => {
    const logo = getCompanyLogo(companyId);
    if (logo) {
      return <img src={logo} alt="" style={{ width: size*1.6, height: size*1.6, objectFit: 'contain', borderRadius: 3, flexShrink: 0, display: 'inline-block' }} />;
    }
    return <span style={{ width: size, height: size, borderRadius: '50%', background: getCompanyColor(companyId), display: 'inline-block', flexShrink: 0 }} />;
  };

  // ── UI state ───────────────────────────────────────────────────────────────
  const [loginError, setLoginError]       = useState(null);
  const [showSettings, setShowSettings]   = useState(false);
  // Multi-select: which companies + which mailboxes to show on the calendar.
  // selectedCompanyIds: [] means "all allowed companies".
  // selectedMailboxKeys: Set of "companyId::mailbox"; if a company has none selected → show all its mailboxes.
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);   // [] = all
  const [selectedMailboxKeys, setSelectedMailboxKeys] = useState([]); // [] = all mailboxes
  // Legacy single-select (kept for backward refs, no longer primary)
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [selectedMailbox, setSelectedMailbox]     = useState('all');
  const [isSyncing, setIsSyncing]     = useState(false);
  const [viewMode, setViewMode]       = useState('week'); // default calendar view = Tuần
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calSelectedEvent, setCalSelectedEvent] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printViewMode, setPrintViewMode] = useState('day');   // day | week | month
  const [printDateStr, setPrintDateStr]   = useState('');       // YYYY-MM-DD
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [theme, setTheme] = useState(() => load('theme', 'light'));
  const [clockNow, setClockNow] = useState(new Date()); // live HCM clock

  // Tick the live clock every second
  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const [showAddModal, setShowAddModal] = useState(false);

  // Apply theme class on <html> and persist
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    save('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // Update browser tab title + favicon from admin settings (HLV branding)
  useEffect(() => {
    const name = adminSettings.globalCompanyName || 'HLV';
    document.title = `${name} - Lịch Trình`;
    const icon = adminSettings.faviconUrl || adminSettings.globalCompanyLogo;
    if (icon) {
      let link = document.querySelector("link[rel='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = icon;
    }
  }, [adminSettings.globalCompanyName, adminSettings.faviconUrl, adminSettings.globalCompanyLogo]);
  const [newEvent, setNewEvent]       = useState({ title: '', date: '', time: '', type: 'teams', location: '', attendees: '' });
  const [sendingAlert, setSendingAlert] = useState(null);
  // { companyId: 'YYYY-MM-DD' } — tracks date last alert was sent per company
  const [alertsSent, setAlertsSent]   = useState(() => load('alertsSent', {}));
  const [toast, setToast]             = useState(null); // { type: 'success'|'error', msg: string }

  useEffect(() => { save('alertsSent', alertsSent); }, [alertsSent]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Auth handlers ──────────────────────────────────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError(null);
    const input = e.target.username.value.trim();
    const pass  = e.target.password.value;
    if (!input || !pass) { setLoginError('Vui lòng nhập đầy đủ thông tin.'); return; }

    if (input.toLowerCase() === 'sctsadmin') {
      if (pass === (adminSettings.adminPassword || 'A@q1w2e3r4t5!')) {
        setCurrentUser({ id: 'admin', email: 'admin@hoanlocviet.vn', name: 'Quản trị viên', role: 'admin', allowedCompanyIds: companies.map(c => c.id) });
        return;
      }
      setLoginError('Sai mật khẩu admin.'); return;
    }

    const found = appUsers.find(u => u.email.toLowerCase() === input.toLowerCase());
    if (!found) { setLoginError('Tài khoản không có quyền truy cập.'); return; }
    if (!found.allowedCompanyIds?.length) { setLoginError('Tài khoản chưa được cấp quyền công ty.'); return; }
    if (!found.password) { setLoginError('Tài khoản chưa được cấp mật khẩu. Liên hệ admin.'); return; }
    if (pass !== found.password) { setLoginError('Sai mật khẩu.'); return; }

    const email = input.toLowerCase();
    const role  = email.includes('tonggiamdoc') || email.includes('giamdoc') ? 'director' : 'assistant';
    const name  = found.name || email.split('@')[0];
    setCurrentUser({ id: found.id, email, name, role, allowedCompanyIds: found.allowedCompanyIds, allowedMailboxes: found.allowedMailboxes || {} });
  };

  const handleLogout = () => { setCurrentUser(null); setShowSettings(false); };

  // ── Change password (self-service) ─────────────────────────────────────────
  const [showChangePass, setShowChangePass] = useState(false);
  const [cpError, setCpError]               = useState('');

  const handleChangePassword = (e) => {
    e.preventDefault();
    const { current, next, confirm } = Object.fromEntries(new FormData(e.target));
    if (currentUser.role === 'admin') {
      if (current !== (adminSettings.adminPassword || 'A@q1w2e3r4t5!')) { setCpError('Mật khẩu hiện tại sai.'); return; }
      if (next.length < 6) { setCpError('Mật khẩu mới tối thiểu 6 ký tự.'); return; }
      if (next !== confirm) { setCpError('Xác nhận không khớp.'); return; }
      setAdminSettings(prev => ({ ...prev, adminPassword: next }));
    } else {
      const found = appUsers.find(u => u.id === currentUser.id);
      if (!found || current !== found.password) { setCpError('Mật khẩu hiện tại sai.'); return; }
      if (next.length < 6) { setCpError('Mật khẩu mới tối thiểu 6 ký tự.'); return; }
      if (next !== confirm) { setCpError('Xác nhận không khớp.'); return; }
      setAppUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, password: next } : u));
    }
    setCpError('');
    setShowChangePass(false);
    showToast('success', 'Đổi mật khẩu thành công!');
    e.target.reset();
  };

  // Request browser notification permission on login
  useEffect(() => {
    if (isLoggedIn && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isLoggedIn]);

  // Merge API events and notify if new ones appear
  const mergeAndNotify = (apiEvents, prev) => {
    if (!apiEvents?.length) return prev;
    const prevIds = new Set(prev.filter(e => e._source === 'api').map(e => e.id));
    const newOnes = apiEvents.filter(e => !prevIds.has(e.id));
    // Guard: iOS Safari (non-PWA) has no Notification API — accessing it throws
    if (newOnes.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Có lịch mới!', {
          body: `${newOnes.length} sự kiện mới được đồng bộ từ M365.`,
          icon: '/favicon.svg',
        });
      } catch {}
    }
    return [...prev.filter(e => e._source === 'manual'), ...apiEvents];
  };

  // Load API events on login + poll every 30s + refetch on tab focus
  useEffect(() => {
    if (!isLoggedIn || !allowedCompanyIds.length) return;

    // Fetch cached events from backend (fast)
    const refresh = async () => {
      const apiEvents = await fetchApiEvents(allowedCompanyIds);
      if (apiEvents?.length) setEvents(prev => mergeAndNotify(apiEvents, prev));
    };

    // Trigger backend M365 sync, then refetch (heavier — every 15 min)
    const syncAndRefresh = async () => {
      try { await fetch('/api/sync', { method: 'POST' }); } catch {}
      await refresh();
    };

    syncAndRefresh(); // immediate sync + load on login / page load

    const pollInterval = setInterval(refresh, 60_000);            // refetch cached events every 1 min
    const syncInterval = setInterval(syncAndRefresh, 15 * 60_000); // full M365 sync every 15 min

    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(pollInterval);
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Date navigation helpers
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayStr = fmtDate(new Date());
  const currentDateStr = fmtDate(currentDate);

  const getWeekDays = (d) => {
    const dow = d.getDay(); // 0=Sun
    const offset = (dow + 6) % 7; // Mon-based
    const mon = new Date(d); mon.setDate(d.getDate() - offset);
    return Array.from({length: 7}, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
  };

  const calPrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day')   d.setDate(d.getDate() - 1);
    if (viewMode === 'week')  d.setDate(d.getDate() - 7);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };
  const calNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day')   d.setDate(d.getDate() + 1);
    if (viewMode === 'week')  d.setDate(d.getDate() + 7);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };
  const calToday = () => setCurrentDate(new Date());

  // Open print dialog with current view/date pre-filled
  const openPrintModal = () => {
    setPrintViewMode(viewMode);
    setPrintDateStr(currentDateStr);
    setShowPrintModal(true);
  };

  const doPrint = () => {
    const printDate = printDateStr ? new Date(printDateStr + 'T00:00:00') : new Date();
    const currentCo = effectiveCompanyId ? companies.find(c => c.id === effectiveCompanyId) : null;
    printCalendar({
      viewMode: printViewMode,
      date: printDate,
      events: visibleEvents,
      getColor: (cid) => getCompanyColor(cid),
      orgName: adminSettings.globalCompanyName || 'Lịch Trình',
      companyLabel: currentCo ? currentCo.companyName : 'Tất cả công ty',
    });
    setShowPrintModal(false);
  };

  const calHeaderLabel = () => {
    const DAY_NAMES = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
    const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
    if (viewMode === 'day') {
      return `${DAY_NAMES[currentDate.getDay()]}, ${String(currentDate.getDate()).padStart(2,'0')}/${String(currentDate.getMonth()+1).padStart(2,'0')}`;
    }
    if (viewMode === 'week') {
      const days = getWeekDays(currentDate);
      const s = days[0]; const e = days[6];
      return `Tuần ${String(s.getDate()).padStart(2,'0')}/${String(s.getMonth()+1).padStart(2,'0')} – ${String(e.getDate()).padStart(2,'0')}/${String(e.getMonth()+1).padStart(2,'0')}`;
    }
    return `${MONTH_NAMES[currentDate.getMonth()]}, ${currentDate.getFullYear()}`;
  };

  // Trigger backend sync in background (called when selection changes)
  const backgroundSync = async () => {
    try {
      await fetch('/api/sync', { method: 'POST' });
      const apiEvents = await fetchApiEvents(currentUser?.allowedCompanyIds || []);
      if (apiEvents?.length) setEvents(prev => mergeAndNotify(apiEvents, prev));
    } catch {}
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
      const apiEvents = await fetchApiEvents(allowedCompanyIds);
      if (apiEvents?.length) {
        setEvents(prev => [...prev.filter(e => e._source === 'manual'), ...apiEvents]);
        showToast('success', `Đồng bộ xong — ${apiEvents.length} sự kiện từ M365.`);
      } else {
        showToast('success', 'Đã đồng bộ (không có sự kiện mới).');
      }
    } catch {
      showToast('error', 'Không kết nối được backend. Giữ nguyên lịch hiện tại.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddEvent = (e) => {
    e.preventDefault();
    const ev = { ...newEvent, id: Date.now(), status: 'confirmed', companyId: companies[0]?.id, organizer: currentUser?.email, location: newEvent.type === 'teams' ? 'Microsoft Teams' : newEvent.location, _source: 'manual' };
    setEvents(prev => [...prev, ev].sort((a, b) => a.time.localeCompare(b.time)));
    setShowAddModal(false);
    setNewEvent({ title: '', date: '', time: '', type: 'teams', location: '', attendees: '' });
  };

  // ── Send API expiry alert email via Graph API ──────────────────────────────
  const sendExpiryAlert = async (company) => {
    setSendingAlert(company.id);
    try {
      const result = await sendSmtpAlert(company.id);
      const today = new Date().toISOString().slice(0, 10);
      setAlertsSent(prev => ({ ...prev, [company.id]: today }));
      showToast('success', `Đã gửi cảnh báo tới ${result.recipients ?? company.expiryAlertEmails?.length ?? 0} người nhận.`);
    } catch (err) {
      showToast('error', `Gửi email thất bại: ${err.message}`);
    } finally {
      setSendingAlert(null);
    }
  };

  // ── Computed ───────────────────────────────────────────────────────────────
  // Always reflect the LIVE company list so counts update dynamically when companies
  // are added/removed: admin sees every current company; other users see their granted
  // companies minus any that were deleted (stale ids from login snapshot are dropped).
  const allCompanyIds = companies.map(c => c.id);
  const allowedCompanyIds = currentUser?.role === 'admin'
    ? allCompanyIds
    : (currentUser?.allowedCompanyIds || []).filter(id => allCompanyIds.includes(id));

  /** Mailboxes a user can view for a given company. Empty = all synced mailboxes. */
  const userMailboxes = (companyId) => {
    const assigned = currentUser?.allowedMailboxes?.[companyId];
    if (assigned?.length) return assigned;
    return companies.find(c => c.id === companyId)?.syncMailboxes || [];
  };

  // Active companies = exactly the checked ones (empty = view nothing)
  const activeCompanyIds = selectedCompanyIds.filter(cid => allowedCompanyIds.includes(cid));
  const allChecked = allowedCompanyIds.length > 0 && activeCompanyIds.length === allowedCompanyIds.length;

  // Checkbox toggle — add/remove a company from the checked set
  const toggleCompany = (cid) => {
    setSelectedCompanyIds(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]);
    backgroundSync(); // refresh events in background on selection change
  };
  // Master toggle: check all ↔ uncheck all
  const toggleAllCompanies = () => {
    setSelectedCompanyIds(allChecked ? [] : [...allowedCompanyIds]);
    setSelectedMailboxKeys([]);
    backgroundSync();
  };
  const mbKey = (cid, mb) => `${cid}::${mb}`;
  const toggleMailbox = (cid, mb) => {
    const key = mbKey(cid, mb);
    setSelectedMailboxKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  // Mailboxes selected for a given company ([] = show all of that company's mailboxes)
  const companySelectedMailboxes = (cid) =>
    selectedMailboxKeys.filter(k => k.startsWith(`${cid}::`)).map(k => k.split('::')[1]);

  const visibleEvents = events.filter(ev => {
    if (!allowedCompanyIds.includes(ev.companyId)) return false;
    if (!activeCompanyIds.includes(ev.companyId)) return false;
    // Mailbox filter: only restrict if this company has specific mailboxes chosen
    const mbSel = companySelectedMailboxes(ev.companyId);
    if (mbSel.length && ev.mailbox && !mbSel.includes(ev.mailbox)) return false;
    return true;
  });

  // Events in the current week (Mon–Sun) — already company/mailbox-filtered via visibleEvents
  const weekEvents = (() => {
    const base = new Date();                 // this real week (today)
    const dow = base.getDay();
    const offset = dow === 0 ? -6 : 1 - dow; // back to Monday
    const mon = new Date(base); mon.setDate(base.getDate() + offset); mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);  sun.setDate(mon.getDate() + 6);       sun.setHours(23, 59, 59, 999);
    return visibleEvents.filter(e => {
      const d = new Date(e.date || e.start_time);
      return d >= mon && d <= sun;
    });
  })();

  // Legacy single-select compatibility for print/other refs
  const effectiveCompanyId = activeCompanyIds.length === 1 ? activeCompanyIds[0] : null;

  // Label of companies currently being viewed — "A" or "A + B" or "Tất cả công ty"
  const activeCompaniesLabel = (() => {
    const names = activeCompanyIds
      .map(cid => shortCompanyName(companies.find(c => c.id === cid)))
      .filter(Boolean);
    if (!names.length) return 'Chưa chọn công ty';
    // Only say "Tất cả" if user can genuinely see EVERY company in the system
    const seesEverySystemCompany = allowedCompanyIds.length === companies.length;
    if (allChecked && seesEverySystemCompany && allowedCompanyIds.length > 1) return 'Tất cả công ty';
    return names.join(' & ');
  })();

  const expiryThresholds = { warningDays: adminSettings.expiryWarningDays, criticalDays: adminSettings.expiryCriticalDays };

  // Companies with expiry warnings visible to this user
  const expiringCompanies = companies.filter(c =>
    allowedCompanyIds.includes(c.id) &&
    ['expired', 'critical', 'warning'].includes(expiryStatus(daysUntilExpiry(c.apiExpirationDate), expiryThresholds))
  );

  // ── SHARED FOOTER (login screen + main app) ────────────────────────────────
  const appFooter = (
    <footer className="mt-auto py-3 px-6 border-t border-slate-200 bg-white text-center text-xs text-slate-400 flex items-center justify-center gap-2 flex-wrap">
      <span>Calendar Sync For Ms365 v1.0 build {__BUILD_DATE__}</span>
      <span className="hidden sm:inline">·</span>
      <span>Thiết kế &amp; vận hành bởi MCT Hoa Tran - <a href="https://hoatranlab.io.vn" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800 transition-colors">hoatranlab.io.vn</a> — ITSM Công ty SCTS</span>
    </footer>
  );

  // ── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    const loginForm = (
      <div className="min-h-screen bg-slate-100 flex flex-col p-4">
        <div className="flex-1 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden">

          <div className="w-full md:w-1/2 bg-emerald-800 p-8 md:p-12 text-white flex-col justify-center hidden sm:flex">
            <Briefcase size={48} className="mb-6 opacity-80" />
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{adminSettings.globalCompanyName || 'HOÀN LỘC VIỆT'}</h1>
            <p className="text-emerald-100 text-base md:text-lg">Đồng bộ tự động với Microsoft 365. Dành cho BOD &amp; CBNV — Lưu Hành Nội Bộ.</p>
          </div>

          <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-12">
            <div className="sm:hidden flex items-center gap-3 mb-6 text-emerald-800">
              <Briefcase size={32} /><h1 className="text-2xl font-bold">{adminSettings.globalCompanyName || 'HOÀN LỘC VIỆT'}</h1>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-1">Đăng nhập hệ thống</h2>
            <p className="text-sm text-slate-500 mb-6">Dành cho Trợ lý / Nhân viên ủy quyền</p>

            {loginError && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{loginError}</div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản</label>
                <input name="username" type="text" placeholder="sctsadmin hoặc email@company.vn" className="w-full px-4 py-3 md:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
                <input name="password" type="password" placeholder="Nhập mật khẩu..." className="w-full px-4 py-3 md:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none" required />
              </div>
              <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-3 md:py-2.5 rounded-lg transition-colors text-sm">Đăng nhập</button>
            </form>

            <div className="relative flex items-center py-3">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">Hoặc</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

          </div>
        </div>
        </div>
        {appFooter}
      </div>
    );
    return loginForm;
  }

  // ── MAIN APP ───────────────────────────────────────────────────────────────
  const mainApp = (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <button className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-md" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="bg-emerald-700 p-1.5 sm:p-2 rounded-lg text-white flex-shrink-0">
            <Briefcase size={20} className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{adminSettings.globalCompanyName || 'Lịch Trình TGĐ'}</h1>
            <div className="hidden sm:flex items-center text-xs text-emerald-600 font-medium">
              <CheckCircle2 size={12} className="mr-1" /> Đồng bộ M365
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {currentUser.role === 'admin' && (
            <button onClick={() => setShowSettings(s => !s)}
              className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${showSettings ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'}`}>
              <SettingsIcon size={17} />
              <span className="hidden md:inline">{showSettings ? 'Xem Lịch' : 'Cài đặt'}</span>
            </button>
          )}

          <button onClick={handleSync} disabled={isSyncing}
            className={`flex items-center justify-center p-2 sm:px-3 sm:py-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors ${isSyncing ? 'opacity-70 pointer-events-none' : ''}`}>
            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
            <span className="hidden md:inline ml-2">{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
          </button>

          {/* Dark/Light theme toggle */}
          <button onClick={toggleTheme} title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
            className="flex items-center justify-center p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Book Lịch button hidden — calendar is view-only (synced from M365) */}

          <div className="hidden sm:block h-8 w-px bg-slate-200 mx-1 sm:mx-2"></div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-right hidden md:block">
              <div className="text-sm font-semibold">{currentUser.name}</div>
              <div className="text-xs text-slate-500">{currentUser.role === 'admin' ? 'Quản trị viên' : currentUser.role === 'director' ? 'Tổng Giám Đốc' : 'Nhân viên'}</div>
            </div>
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold border border-emerald-200 text-sm sm:text-base flex-shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <button onClick={() => { setShowChangePass(true); setCpError(''); }} className="text-slate-400 hover:text-emerald-600 transition-colors p-1" title="Đổi mật khẩu"><KeyRound size={18} /></button>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Đăng xuất"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      {/* ── TOAST NOTIFICATION ── */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 transition-all
          ${toast.type === 'success' ? 'bg-emerald-700 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* ── API EXPIRY BANNERS ── */}
      {!showSettings && expiringCompanies.map(c => {
        const days   = daysUntilExpiry(c.apiExpirationDate);
        const status = expiryStatus(days, expiryThresholds);
        const isExpired  = status === 'expired';
        const isCritical = status === 'critical';
        const today      = new Date().toISOString().slice(0, 10);
        const sentToday  = alertsSent[c.id] === today;
        return (
          <div key={c.id} className={`mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-lg flex items-center justify-between gap-3 text-sm border
            ${isExpired  ? 'bg-red-50 border-red-200 text-red-800' :
              isCritical ? 'bg-orange-50 border-orange-200 text-orange-800' :
                           'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
            <span className="flex items-center gap-2 font-medium">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span><strong>{c.companyName}</strong>: API Microsoft 365 {isExpired ? 'đã hết hạn!' : `sắp hết hạn trong ${days} ngày (${c.apiExpirationDate})`}</span>
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {sentToday && (
                <span className="px-2 py-0.5 bg-white border border-current rounded text-[11px] font-semibold opacity-70">Đã gửi hôm nay</span>
              )}
              {c.expiryAlertEmails?.length > 0 && (
                <button onClick={() => sendExpiryAlert(c)} disabled={sendingAlert === c.id}
                  className="px-3 py-1 bg-white border border-current rounded-md text-xs font-semibold hover:bg-opacity-80 transition-colors disabled:opacity-60">
                  {sendingAlert === c.id ? 'Đang gửi...' : sentToday ? 'Gửi lại' : 'Gửi cảnh báo'}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* ── TITLE BAR + COMPANY DROPDOWN ── */}
      {!showSettings && (
        <div className="mx-4 sm:mx-6 mt-3">
          {/* Dropdown row — right aligned */}
          {allowedCompanyIds.length > 1 && (
            <div className="flex justify-center lg:justify-start mb-2">
            <div className="relative">
              <button onClick={() => setShowCompanyDropdown(o => !o)}
                className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:border-emerald-500 transition-colors min-w-[180px] justify-between">
                <span className="flex items-center gap-2 truncate">
                  <Building2 size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{allChecked && allowedCompanyIds.length === companies.length ? 'Tất cả công ty' : `${activeCompanyIds.length} công ty`}</span>
                </span>
                <ChevronDown size={16} className={`flex-shrink-0 transition-transform ${showCompanyDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showCompanyDropdown && (
                <>
                  {/* Backdrop to close on outside click */}
                  <div className="fixed inset-0 z-30" onClick={() => setShowCompanyDropdown(false)} />
                  <div className="absolute left-0 right-auto mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 z-40 overflow-hidden">
                    <div className="max-h-80 overflow-y-auto p-1.5">
                      {/* Master "Tất cả" */}
                      <button onClick={toggleAllCompanies}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left">
                        <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${allChecked ? '#0f766e' : '#cbd5e1'}`, background: allChecked ? '#0f766e' : 'transparent' }}>
                          {allChecked && <span style={{ color: 'white', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                        </span>
                        <span className="text-sm font-bold text-slate-800">🏢 Tất cả công ty</span>
                      </button>
                      <div className="h-px bg-slate-100 my-1" />
                      {allowedCompanyIds.map(cid => {
                        const co = companies.find(c => c.id === cid);
                        if (!co) return null;
                        const checked = activeCompanyIds.includes(cid);
                        const color = getCompanyColor(cid);
                        return (
                          <button key={cid} onClick={() => toggleCompany(cid)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left">
                            <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? color : '#cbd5e1'}`, background: checked ? color : 'transparent' }}>
                              {checked && <span style={{ color: 'white', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </span>
                            {getCompanyLogo(cid)
                              ? <img src={getCompanyLogo(cid)} alt="" style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }} />
                              : <span className="rounded-full inline-block flex-shrink-0" style={{ width: 10, height: 10, background: color }} />}
                            <span className="text-sm font-semibold text-slate-700 truncate">{co.companyName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
            </div>
          )}

          {/* Live HCM clock — centered, above the title */}
          <div className="flex items-center justify-center mb-1">
            <span className="font-mono font-bold text-emerald-700 tracking-wider" style={{ fontSize: '18px' }}>
              🕐 {clockNow.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-xs text-slate-400 font-semibold ml-2">HCM-VN</span>
          </div>

          {/* Title centered: "Bạn đang xem lịch công ty: ..." (16px) */}
          <h2 className="font-bold text-slate-800 flex items-center justify-center gap-2 text-center flex-wrap" style={{ fontSize: '16px' }}>
            <span className="text-slate-500 font-medium">Bạn đang xem lịch công ty:</span>
            {activeCompanyIds.length === 1 && <CompanyMark companyId={activeCompanyIds[0]} size={10} />}
            <span style={{ color: activeCompanyIds.length === 1 ? getCompanyColor(activeCompanyIds[0]) : '#0f766e' }}>
              {activeCompaniesLabel}
            </span>
          </h2>
        </div>
      )}

      {/* ── MAILBOX SELECTOR — one row per active company that has ≥1 mailbox ── */}
      {!showSettings && activeCompanyIds.map(cid => {
        const co = companies.find(c => c.id === cid);
        const mailboxes = userMailboxes(cid);
        if (!co || mailboxes.length < 1) return null;
        const selected = companySelectedMailboxes(cid); // [] = all
        const color = getCompanyColor(cid);
        const multi = mailboxes.length > 1;
        return (
          <div key={`mb-${cid}`} className="mx-4 sm:mx-6 mt-2 flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide mr-1 flex items-center gap-1" style={{ color }}>
              <CompanyMark companyId={cid} size={9} />
              {co.companyName}:
            </span>
            {/* "Tất cả" — only when more than one mailbox to choose from */}
            {multi && (
              <button onClick={() => setSelectedMailboxKeys(prev => prev.filter(k => !k.startsWith(`${cid}::`)))}
                className="px-3 py-1 rounded-full text-xs font-semibold border-2 transition-colors"
                style={{
                  background: selected.length === 0 ? color : 'white',
                  color: selected.length === 0 ? 'white' : '#475569',
                  borderColor: selected.length === 0 ? color : '#cbd5e1',
                }}>
                Tất cả
              </button>
            )}
            {mailboxes.map(mb => {
              const on = !multi || selected.includes(mb) || selected.length === 0;
              return (
                <button key={mb} onClick={() => multi && toggleMailbox(cid, mb)}
                  className="px-3 py-1 rounded-full text-xs font-semibold border-2 transition-colors"
                  title={mb}
                  style={{
                    background: (multi ? selected.includes(mb) : true) ? color : 'white',
                    color: (multi ? selected.includes(mb) : true) ? 'white' : '#475569',
                    borderColor: color,
                    cursor: multi ? 'pointer' : 'default',
                  }}>
                  {mb}
                </button>
              );
            })}
          </div>
        );
      })}

      {/* ── SETTINGS PANEL ── */}
      {showSettings && currentUser.role === 'admin' && (
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          <SettingsComponent
            companies={companies} onSaveCompanies={setCompanies}
            adminSettings={adminSettings} onSaveAdminSettings={setAdminSettings}
            appUsers={appUsers} onSaveAppUsers={setAppUsers}
            currentUser={currentUser}
            t={t}
          />
        </main>
      )}

      {/* ── CALENDAR MAIN ── */}
      {!showSettings && (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 relative">

          {/* Sidebar */}
          <div className={`lg:col-span-4 xl:col-span-3 space-y-4 sm:space-y-6 ${mobileMenuOpen ? 'block absolute z-10 w-[280px] bg-slate-50 border-r border-slate-200 shadow-xl p-4 top-0 bottom-0 left-0 overflow-y-auto' : 'hidden lg:block'}`}>
            {/* Mini calendar — follows currentDate; click a day to view it */}
            {(() => {
              const now        = new Date();
              const year       = currentDate.getFullYear();
              const month      = currentDate.getMonth();
              const daysInMonth = new Date(year, month+1, 0).getDate();
              const firstDay    = new Date(year, month, 1).getDay(); // 0=Sun
              const offset      = (firstDay + 6) % 7; // Mon-first
              // Set of "YYYY-MM-DD" that have events (full match, not just day number)
              const eventDates  = new Set(visibleEvents.map(e => e.date).filter(Boolean));
              const monthLabel  = currentDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
              const miniPrev = () => { const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d); };
              const miniNext = () => { const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d); };
              return (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-base sm:text-lg text-slate-800 capitalize">{monthLabel}</h3>
                    <div className="flex gap-1">
                      <button onClick={miniPrev} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><ChevronLeft size={16} /></button>
                      <button onClick={miniNext} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs sm:text-sm mb-2">
                    {['T2','T3','T4','T5','T6','T7','CN'].map(d => <div key={d} className="font-medium text-slate-400">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs sm:text-sm">
                    {[...Array(offset)].map((_, i) => <div key={`e${i}`} />)}
                    {[...Array(daysInMonth)].map((_, i) => {
                      const day      = i + 1;
                      const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      const isToday  = dateStr === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
                      const isSelected = day === currentDate.getDate();
                      const hasEv    = eventDates.has(dateStr);
                      return (
                        <button key={day}
                          onClick={() => { setCurrentDate(new Date(year, month, day)); setViewMode('day'); setMobileMenuOpen(false); }}
                          className={`p-1.5 sm:p-2 rounded-lg transition-colors aspect-square flex items-center justify-center relative font-semibold
                            ${isToday ? 'bg-emerald-700 text-white shadow-md'
                              : isSelected ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-400'
                              : 'text-slate-700 hover:bg-emerald-50'}`}>
                          {day}
                          {hasEv && !isToday && <span className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-red-400 rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
              <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4 text-slate-800">Tổng quan tuần này</h3>
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm sm:text-base text-slate-600 flex items-center gap-2"><Video size={16} className="text-emerald-600"/> Họp Online</span>
                  <span className="font-bold text-slate-800">{weekEvents.filter(e => e.type==='teams').length}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm sm:text-base text-slate-600 flex items-center gap-2"><MapPin size={16} className="text-amber-500"/> Sự kiện Offline</span>
                  <span className="font-bold text-slate-800">{weekEvents.filter(e => e.type!=='teams').length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar area */}
          <div className="lg:col-span-8 xl:col-span-9 w-full">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px] sm:min-h-[600px]">

              <div className="border-b border-slate-200 p-3 sm:p-4 flex flex-wrap justify-between items-center bg-slate-50/50 gap-2">
                <div className="flex items-center gap-2">
                  {/* Prev/Today/Next navigation */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button onClick={calPrev} className="p-1.5 hover:bg-white rounded text-slate-600 transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={calToday} className="px-2.5 py-1 text-xs font-bold hover:bg-white rounded text-slate-700 transition-colors">
                      Hôm nay
                    </button>
                    <button onClick={calNext} className="p-1.5 hover:bg-white rounded text-slate-600 transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-1.5">
                      <CalendarIcon size={16} className="text-emerald-700 flex-shrink-0" />
                      <span>{calHeaderLabel()}</span>
                    </h2>
                    {activeCompaniesLabel && (
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5 ml-0.5">
                        {activeCompanyIds.length === 1 && <CompanyMark companyId={activeCompanyIds[0]} size={9} />}
                        {activeCompaniesLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Quick month shortcuts (month view only) */}
                  {viewMode === 'month' && (
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
                      {[-1, 0, 1].map(offset => {
                        const d = new Date(); d.setMonth(d.getMonth() + offset);
                        const label = offset === -1 ? '← Trước' : offset === 0 ? 'Tháng này' : 'Tiếp →';
                        const isActive = currentDate.getFullYear() === d.getFullYear() && currentDate.getMonth() === d.getMonth();
                        return (
                          <button key={offset} onClick={() => setCurrentDate(d)}
                            className="px-2 py-1.5 rounded-md transition-all"
                            style={{ background: isActive ? 'white' : 'transparent', color: isActive ? '#047857' : '#64748b', boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none' }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex bg-slate-200/80 p-0.5 rounded-lg">
                    {['day','week','month'].map(mode => (
                      <button key={mode} onClick={() => setViewMode(mode)}
                        className={`px-2.5 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${viewMode===mode?'bg-white shadow text-emerald-700':'text-slate-600 hover:text-slate-900'}`}>
                        {mode==='day'?'Ngày':mode==='week'?'Tuần':'Tháng'}
                      </button>
                    ))}
                  </div>
                  {/* Print button */}
                  <button onClick={openPrintModal} title="In lịch / Xuất PDF"
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition-colors">
                    <Printer size={15} /><span className="hidden sm:inline">In / PDF</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50/30">

                {/* DAY VIEW */}
                {viewMode === 'day' && (
                  <div className="p-2 sm:p-4">
                    {visibleEvents.filter(e => e.date===currentDateStr).length === 0 && (
                      <p className="text-center text-slate-400 italic py-20">Trống lịch họp trong ngày.</p>
                    )}
                    {visibleEvents.filter(e => e.date===currentDateStr).sort((a,b)=>(a.time||'').localeCompare(b.time||'')).map(event => {
                      const evColor = getCompanyColor(event.companyId);
                      const evCo = companies.find(c => c.id === event.companyId);
                      return (
                      <div key={event.id} onClick={() => setCalSelectedEvent(event)} className="flex gap-2 sm:gap-4 p-2 sm:p-4 hover:bg-white rounded-xl transition-colors group cursor-pointer">
                        <div className="w-14 sm:w-24 flex-shrink-0 text-right pt-1 sm:pt-2">
                          <div className="font-bold text-slate-700 text-xs sm:text-sm">{event.time?.split(' - ')[0]}</div>
                          <div className="text-[10px] sm:text-xs text-slate-400">{event.time?.split(' - ')[1]}</div>
                        </div>
                        <div className="relative flex flex-col items-center">
                          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full mt-1.5 sm:mt-2 relative z-10 bg-white border-[3px] sm:border-[4px] border-solid" style={{borderColor:evColor}}></div>
                          <div className="absolute top-4 sm:top-5 bottom-[-16px] sm:bottom-[-32px] w-0.5 bg-slate-200 group-last:hidden"></div>
                        </div>
                        <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3 sm:p-4 shadow-sm group-hover:border-slate-300 transition-colors" style={{borderLeft:`3px solid ${evColor}`}}>
                          <div className="flex flex-col sm:flex-row justify-between sm:items-start mb-2 gap-2">
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm sm:text-base text-slate-800 leading-tight">{event.title}</h4>
                              {evCo && <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{background:`${evColor}18`,color:evColor}}>{evCo.companyName}</span>}
                            </div>
                            <span className={`w-fit text-[10px] sm:text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1 flex-shrink-0 ${event.type==='teams'?'bg-emerald-50 text-emerald-800 border border-emerald-100':'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                              {event.type==='teams'?<Video size={10}/>:<MapPin size={10}/>}
                              {event.type==='teams'?'Teams':'Offline'}
                            </span>
                          </div>
                          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-slate-600 mt-2">
                            {event.type==='teams'&&<div className="flex items-center gap-1.5 text-emerald-700 font-medium"><Video size={14}/> Microsoft Teams</div>}
                            {(event.room||event.location)&&<div className="flex items-center gap-1.5 truncate"><MapPin size={14} className="text-slate-400 flex-shrink-0"/><span className="truncate">{event.room||event.location}</span></div>}
                            {(event.organizerName||event.organizer)&&<div className="flex items-center gap-1.5 truncate"><span className="text-slate-400 flex-shrink-0 font-medium">@</span><span className="truncate">{event.organizerName||event.organizer}</span></div>}
                            {(event.attendeeCount>0||event.attendees)&&<div className="flex items-center gap-1.5"><Users size={14} className="text-slate-400 flex-shrink-0"/><span>{event.attendeeCount!=null?`${event.attendeeCount} người`:event.attendees}</span></div>}
                          </div>
                        </div>
                      </div>
                    );})}
                  </div>
                )}

                {/* WEEK VIEW */}
                {viewMode === 'week' && (
                  <div className="flex flex-col gap-3 sm:gap-4 p-2 sm:p-4">
                    {getWeekDays(currentDate).map(dObj => {
                      const dStr = fmtDate(dObj);
                      const DAY_NAMES = ['CN','T2','T3','T4','T5','T6','T7'];
                      const label = `${DAY_NAMES[dObj.getDay()]}, ${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}`;
                      const dayEvents = visibleEvents.filter(e => e.date===dStr).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
                      const isToday = dStr===todayStr;
                      return (
                        <div key={dStr} className={`border rounded-lg overflow-hidden ${isToday?'border-emerald-300 ring-1 ring-emerald-300':'border-slate-200'}`}>
                          <div className={`px-3 py-2 font-semibold text-xs sm:text-sm border-b flex justify-between items-center ${isToday?'bg-emerald-50 text-emerald-800 border-emerald-200':'bg-slate-50 text-slate-700'}`}>
                            <span>{label}{isToday?' (Hôm nay)':''}</span>
                            <button onClick={() => { setCurrentDate(dObj); setViewMode('day'); }} className="text-[10px] font-normal text-emerald-600 hover:underline">Xem ngày →</button>
                          </div>
                          <div className="p-2 sm:p-3 bg-white">
                            {dayEvents.length===0 ? <p className="text-xs text-slate-400 italic px-2">Trống lịch</p> : (
                              <div className="space-y-2">
                                {dayEvents.map(evt => {
                                  const evColor = getCompanyColor(evt.companyId);
                                  const evCo = companies.find(c => c.id === evt.companyId);
                                  return (
                                  <div key={evt.id} onClick={() => setCalSelectedEvent(evt)} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-slate-50 p-2 sm:p-2.5 rounded-md border border-slate-100 cursor-pointer hover:bg-white transition-colors" style={{borderLeft:`3px solid ${evColor}`}}>
                                    <div className="text-xs font-bold w-auto sm:w-16" style={{color:evColor}}>{evt.time?.split(' - ')[0]}</div>
                                    <div className="flex-1">
                                      <div className="font-medium text-xs sm:text-sm text-slate-800 leading-tight">{evt.title}</div>
                                      {evCo && <span className="inline-block mt-0.5 text-[9px] font-semibold px-1.5 py-0 rounded" style={{background:`${evColor}18`,color:evColor}}>{evCo.companyName}</span>}
                                      <div className="text-[10px] sm:text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                        <span className="flex items-center gap-1"><MapPin size={10}/>{evt.type==='teams'?'Teams':'Offline'}</span>
                                        {evt.attendees&&<span className="flex items-center gap-1"><Users size={10}/>{evt.attendees}</span>}
                                      </div>
                                    </div>
                                  </div>
                                );})}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* MONTH VIEW */}
                {viewMode === 'month' && (() => {
                  const year = currentDate.getFullYear();
                  const month = currentDate.getMonth();
                  const daysInMonth = new Date(year, month+1, 0).getDate();
                  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
                  const blanks = (firstDow + 6) % 7; // Mon-based leading blanks
                  return (
                  <div className="p-2 sm:p-4 h-full flex flex-col">
                    <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-t-lg overflow-hidden border border-slate-200">
                      {['T2','T3','T4','T5','T6','T7','CN'].map(d => <div key={d} className="bg-slate-100 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-bold text-slate-600">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200 rounded-b-lg overflow-hidden flex-1">
                      {Array(blanks).fill(null).map((_,i) => <div key={`b-${i}`} className="bg-slate-50/50 min-h-[60px] sm:min-h-[100px]"></div>)}
                      {Array.from({length:daysInMonth},(_,i)=>i+1).map(day => {
                        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        const dayEvents = visibleEvents.filter(e => e.date===dateStr).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
                        const isToday = dateStr===todayStr;
                        return (
                          <div key={day} onClick={() => { setCurrentDate(new Date(year, month, day)); setViewMode('day'); }} className={`bg-white p-1 sm:p-2 min-h-[60px] sm:min-h-[100px] flex flex-col hover:bg-emerald-50/40 cursor-pointer relative ${isToday?'bg-emerald-50/50':''}`}>
                            <div className={`text-right text-[10px] sm:text-xs font-bold mb-1 sm:mb-1.5 ${isToday?'text-emerald-700':'text-slate-600'}`}>
                              <span className={isToday?'bg-emerald-700 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center':''}>{day}</span>
                            </div>
                            <div className="hidden sm:flex flex-col space-y-1 flex-1 overflow-y-auto">
                              {dayEvents.map(evt => {
                                const evColor = getCompanyColor(evt.companyId);
                                return (
                                <div key={evt.id} onClick={(e) => { e.stopPropagation(); setCalSelectedEvent(evt); }} className="text-[9px] md:text-[10px] leading-tight truncate px-1 py-0.5 rounded border font-semibold hover:opacity-80" style={{background:`${evColor}12`,color:evColor,borderColor:`${evColor}30`}}>
                                  {evt.time?.split(':')[0]}h - {evt.title}
                                </div>
                              );})}
                            </div>
                            <div className="sm:hidden flex flex-wrap gap-1 mt-auto pb-1 justify-end">
                              {dayEvents.map(evt => <div key={evt.id} className="w-2 h-2 rounded-full" style={{background:getCompanyColor(evt.companyId)}}></div>)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ── EVENT DETAIL MODAL ── */}
      {calSelectedEvent && (() => {
        const ev = calSelectedEvent;
        const isTeams = ev.type === 'teams';
        const co = companies.find(c => c.id === ev.companyId);
        const color = getCompanyColor(ev.companyId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setCalSelectedEvent(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 flex items-start justify-between gap-4" style={{ background: color }}>
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.25)' }}>{isTeams ? '📹 Teams' : '📍 Offline'}</span>
                    {co && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.2)' }}>{co.companyName}</span>}
                  </div>
                  <h2 className="text-lg font-bold text-white leading-snug">{ev.title}</h2>
                </div>
                <button onClick={() => setCalSelectedEvent(null)} className="text-white/80 hover:text-white flex-shrink-0 mt-1"><X size={20} /></button>
              </div>
              <div className="px-6 py-5 space-y-3 text-sm">
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
                  <CalendarIcon size={16} style={{ color, flexShrink: 0 }} />
                  <div><div className="font-semibold text-slate-800">{ev.date}</div>{ev.time && <div className="text-slate-500 text-xs mt-0.5">🕐 {ev.time}</div>}</div>
                </div>
                {isTeams ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100"><Video size={16} className="text-emerald-600 flex-shrink-0" /><span className="text-emerald-700 font-medium">Cuộc họp Microsoft Teams</span></div>
                ) : (ev.room||ev.location) ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100"><MapPin size={16} className="text-amber-600 flex-shrink-0" /><span className="text-slate-700">{ev.room||ev.location}</span></div>
                ) : null}
                {(ev.organizerName||ev.organizer) && (
                  <div className="flex items-start gap-3"><span className="text-slate-400 flex-shrink-0 mt-0.5">👤</span><div><span className="text-xs text-slate-500 block">Người tổ chức</span><span className="font-medium text-slate-800">{ev.organizerName||ev.organizer}</span></div></div>
                )}
                {ev.attendees && (
                  <div className="flex items-start gap-3"><span className="text-slate-400 flex-shrink-0 mt-0.5">👥</span><div><span className="text-xs text-slate-500 block">Người tham dự {ev.attendeeCount?`(${ev.attendeeCount})`:''}</span><div className="flex flex-wrap gap-1 mt-1">{ev.attendees.split(',').map(a=>a.trim()).filter(Boolean).map(a => <span key={a} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">{a}</span>)}</div></div></div>
                )}
              </div>
              <div className="px-6 pb-5"><button onClick={() => setCalSelectedEvent(null)} className="w-full py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: color }}>Đóng</button></div>
            </div>
          </div>
        );
      })()}

      {/* ── PRINT MODAL ── */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowPrintModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-700 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-base flex items-center gap-2"><Printer size={18}/> In lịch / Xuất PDF</h3>
              <button onClick={() => setShowPrintModal(false)} className="p-1 hover:bg-emerald-800 rounded-md"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              {/* View mode */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Kiểu in</label>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  {['day','week','month'].map(mode => (
                    <button key={mode} onClick={() => setPrintViewMode(mode)}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${printViewMode===mode?'bg-white shadow text-emerald-700':'text-slate-600'}`}>
                      {mode==='day'?'Ngày':mode==='week'?'Tuần':'Tháng'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Date picker */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {printViewMode==='day'?'Chọn ngày in':printViewMode==='week'?'Chọn ngày bất kỳ trong tuần':'Chọn tháng (ngày bất kỳ)'}
                </label>
                <input type="date" value={printDateStr} onChange={e => setPrintDateStr(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" />
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                💡 Cửa sổ in sẽ mở ra. Chọn <strong>"Save as PDF"</strong> (hoặc Lưu thành PDF) trong hộp thoại để xuất file PDF.
              </p>
              <div className="flex gap-2">
                <button onClick={doPrint} className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
                  <Printer size={16}/> In / Xem PDF
                </button>
                <button onClick={() => setShowPrintModal(false)} className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Hủy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CHANGE PASSWORD MODAL ── */}
      {showChangePass && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-emerald-700 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-base flex items-center gap-2"><KeyRound size={18}/> Đổi Mật Khẩu</h3>
              <button onClick={() => setShowChangePass(false)} className="p-1 hover:bg-emerald-800 rounded-md"><X size={20}/></button>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {cpError && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{cpError}</div>}
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu hiện tại</label>
                <input name="current" type="password" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" required /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <input name="next" type="password" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" required /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Xác nhận mật khẩu mới</label>
                <input name="confirm" type="password" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" required /></div>
              <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">Cập nhật mật khẩu</button>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-emerald-700 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center text-white flex-shrink-0">
              <h3 className="font-bold text-base sm:text-lg">Book Lịch Mới</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-emerald-800 rounded-md transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddEvent} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Tiêu đề</label>
                <input required type="text" value={newEvent.title} onChange={e=>setNewEvent({...newEvent,title:e.target.value})} className="w-full px-3 py-2.5 sm:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" placeholder="VD: Báo cáo tài chính..." />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Ngày</label>
                  <input required type="date" value={newEvent.date} onChange={e=>setNewEvent({...newEvent,date:e.target.value})} className="w-full px-3 py-2.5 sm:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Khung giờ</label>
                  <input required type="text" value={newEvent.time} onChange={e=>setNewEvent({...newEvent,time:e.target.value})} placeholder="09:00 - 10:30" className="w-full px-3 py-2.5 sm:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">Hình thức</label>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                  <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 flex-1">
                    <input type="radio" name="type" value="teams" checked={newEvent.type==='teams'} onChange={e=>setNewEvent({...newEvent,type:e.target.value})} className="text-emerald-700 w-4 h-4" />
                    <span className="text-sm">Họp Online (Teams)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 flex-1">
                    <input type="radio" name="type" value="offline" checked={newEvent.type==='offline'} onChange={e=>setNewEvent({...newEvent,type:e.target.value})} className="text-emerald-700 w-4 h-4" />
                    <span className="text-sm">Offline</span>
                  </label>
                </div>
              </div>
              {newEvent.type==='offline'&&(
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Địa điểm</label>
                  <input required type="text" value={newEvent.location} onChange={e=>setNewEvent({...newEvent,location:e.target.value})} className="w-full px-3 py-2.5 sm:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" placeholder="VD: Phòng họp VIP" />
                </div>
              )}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Thành phần tham dự</label>
                <input required type="text" value={newEvent.attendees} onChange={e=>setNewEvent({...newEvent,attendees:e.target.value})} className="w-full px-3 py-2.5 sm:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none" placeholder="Email người tham dự..." />
              </div>
              <div className="bg-emerald-50 p-2.5 sm:p-3 rounded-lg flex gap-2 sm:gap-3 text-xs sm:text-sm text-emerald-800 border border-emerald-100">
                <RefreshCw size={16} className="flex-shrink-0 mt-0.5" />
                <p>Event sẽ được <b>tự động đồng bộ</b> lên Calendar M365.</p>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100 mt-auto pb-4 sm:pb-0">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 sm:py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-medium transition-colors text-sm">Hủy</button>
                <button type="submit" className="flex-[2] py-2.5 sm:py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium transition-colors text-sm">Lưu & Đồng bộ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── FOOTER (shared with login screen) ── */}
      {appFooter}
    </div>
  );

  return mainApp;
}
