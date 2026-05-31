import React, { useState, useEffect } from 'react';
import {
  Calendar, Settings as SettingsIcon, LogOut, RefreshCw, Plus,
  Video, MapPin, ChevronLeft, ChevronRight, Sun, Moon,
  Building2, Globe, Menu, X, CheckCircle2
} from 'lucide-react';
import CalendarComponent from './Calendar';
import BookingModal from './BookingModal';
import SettingsComponent from './Settings';

export default function Dashboard({
  currentUser,
  companies,
  onSaveCompanies,
  adminSettings,
  onSaveAdminSettings,
  appUsers,
  onSaveAppUsers,
  events,
  setEvents,
  onLogout,
  lang,
  setLang,
  t
}) {
  const [activeMenu, setActiveMenu] = useState(currentUser?.role === 'admin' ? 'settings' : 'calendar');
  const [syncing, setSyncing] = useState(false);
  const [syncTime, setSyncTime] = useState('Vừa xong');
  const [theme, setTheme] = useState('light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedEvent, setSelectedEvent]       = useState(null); // event detail modal

  const allowedCompanies = currentUser?.role === 'admin'
    ? companies
    : companies.filter(c => currentUser?.allowedCompanyIds?.includes(c.id));

  // 'all' = show all authorized companies merged; default to 'all' when multiple companies exist
  const [viewingCompanyId, setViewingCompanyId] = useState(
    allowedCompanies.length > 1 ? 'all' : (allowedCompanies[0]?.id || 'all')
  );

  useEffect(() => {
    if (viewingCompanyId !== 'all' && !allowedCompanies.find(c => c.id === viewingCompanyId)) {
      setViewingCompanyId(allowedCompanies.length > 1 ? 'all' : (allowedCompanies[0]?.id || 'all'));
    }
  }, [allowedCompanies, viewingCompanyId]);

  // Null when 'all' mode (use first company only for booking modal context)
  const currentCompany = viewingCompanyId === 'all'
    ? allowedCompanies?.[0]
    : allowedCompanies?.find(c => c.id === viewingCompanyId) || allowedCompanies?.[0];

  // Fixed brand colors per company ID; fallback palette for unknown IDs
  const FIXED_COLORS = {
    'c-suleco': '#dc2626', // đỏ
    'c-hlv':    '#15803d', // xanh lá đậm
    'c-mshlv':  '#166534', // xanh lá đậm (đậm hơn HLV)
    'c-asn':    '#1d4ed8', // xanh lam đậm
    'c-scts':   '#1e3a8a', // xanh lam đậm (đậm hơn ASN)
  };
  const FALLBACK_PALETTE = ['#7c3aed','#b45309','#0e7490','#9d174d','#064e3b'];
  // Priority: user-chosen color → brand default → fallback palette
  const companyColors = Object.fromEntries(
    allowedCompanies.map((c, i) => [
      c.id,
      c.color || FIXED_COLORS[c.id] || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
    ])
  );

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedUserFilter, setSelectedUserFilter] = useState(currentCompany?.syncMailboxes?.[0] || '');

  useEffect(() => {
    if (currentCompany?.syncMailboxes?.length > 0) {
      if (!currentCompany.syncMailboxes.includes(selectedUserFilter)) {
        setSelectedUserFilter(currentCompany.syncMailboxes[0]);
      }
    } else {
      setSelectedUserFilter('');
    }
  }, [currentCompany, selectedUserFilter]);

  const handleManualSync = () => {
    setSyncing(true);
    setTimeout(() => { setSyncing(false); setSyncTime(t('just_now')); }, 1200);
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    if (theme === 'light') { root.classList.add('dark-theme-active'); setTheme('dark'); }
    else { root.classList.remove('dark-theme-active'); setTheme('light'); }
  };

  const filteredEvents = events.filter(ev => {
    if (viewingCompanyId === 'all') {
      // Merge all authorized companies — no mailbox filter applied
      return allowedCompanies.some(c => c.id === ev.companyId);
    }
    if (ev.companyId !== currentCompany?.id) return false;
    if (!selectedUserFilter) return true;
    const matchEmail = selectedUserFilter.toLowerCase();
    return (
      (ev.organizer || '').toLowerCase().includes(matchEmail) ||
      (ev.attendees || '').toLowerCase().includes(matchEmail)
    );
  });

  const getWeeklyStats = () => {
    const start = new Date('2026-05-25T00:00:00');
    const end = new Date('2026-05-31T23:59:59');
    const weeklyEvents = filteredEvents.filter(ev => {
      const evDate = new Date(ev.date || ev.start_time);
      return evDate >= start && evDate <= end;
    });
    return {
      online: weeklyEvents.filter(ev => ev.type === 'teams').length,
      offline: weeklyEvents.filter(ev => ev.type === 'offline').length
    };
  };

  const stats = getWeeklyStats();

  // Mini calendar helpers
  const getMiniCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const daysArray = [];
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startOffset; i++) daysArray.push(null);
    for (let d = 1; d <= totalDays; d++) daysArray.push(new Date(year, month, d));
    return daysArray;
  };

  const miniCalendarDays = getMiniCalendarDays();
  const monthNames = [
    'Tháng Một', 'Tháng Hai', 'Tháng Ba', 'Tháng Tư', 'Tháng Năm', 'Tháng Sáu',
    'Tháng Bảy', 'Tháng Tám', 'Tháng Chín', 'Tháng Mười', 'Tháng Mười Một', 'Tháng Mười Hai'
  ];

  const handleMiniPrevMonth = () => {
    const d = new Date(currentDate); d.setMonth(d.getMonth() - 1); setCurrentDate(d);
  };
  const handleMiniNextMonth = () => {
    const d = new Date(currentDate); d.setMonth(d.getMonth() + 1); setCurrentDate(d);
  };

  const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const dateHasEvents = (dateObj) => {
    if (!dateObj) return false;
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return filteredEvents.some(ev => (ev.date || ev.start_time?.split('T')[0]) === `${y}-${m}-${d}`);
  };

  const handleBookEvent = (payload) => {
    const newEvent = {
      id: Date.now(),
      companyId: currentCompany?.id,
      title: payload.subject,
      subject: payload.subject,
      date: payload.start_time.split('T')[0],
      time: `${payload.start_time.split('T')[1]?.substring(0, 5)} - ${payload.end_time.split('T')[1]?.substring(0, 5)}`,
      start_time: payload.start_time,
      end_time: payload.end_time,
      location: payload.location,
      attendees: payload.attendees,
      organizer: payload.organizer,
      type: payload.location?.toLowerCase().includes('teams') ? 'teams' : 'offline',
      status: 'confirmed'
    };
    setEvents(prev => [...prev, newEvent]);
  };

  if (!currentUser) return null;

  const gdEmail = currentCompany?.syncMailboxes?.[0] || selectedUserFilter;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">

      {/* ── STICKY HEADER ── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">

        {/* Left: hamburger + brand + company/mailbox selectors */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            className="lg:hidden p-2 -ml-1 text-slate-500 hover:bg-slate-100 rounded-md"
            onClick={() => setMobileMenuOpen(o => !o)}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {adminSettings?.globalCompanyLogo ? (
            <img src={adminSettings.globalCompanyLogo} alt="Logo" className="h-8 object-contain flex-shrink-0" />
          ) : (
            <div className="bg-blue-600 p-1.5 rounded-lg text-white flex-shrink-0">
              <Calendar size={20} />
            </div>
          )}

          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate leading-tight">
              {adminSettings?.globalCompanyName || 'Tập đoàn Hoàn Lộc Việt'}
            </h1>
            <div className="hidden sm:flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 size={11} /> {t('app_portal')}
            </div>
          </div>

          {/* Show current company in header when a specific one is selected */}
          {activeMenu === 'calendar' && allowedCompanies.length > 1 && viewingCompanyId !== 'all' && (
            <div className="hidden sm:flex items-center gap-1 ml-2">
              <Building2 size={14} className="text-slate-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-slate-600 truncate max-w-[120px]">
                {allowedCompanies.find(c => c.id === viewingCompanyId)?.companyName}
              </span>
            </div>
          )}

          {/* Mailbox selector — hidden in 'all' mode */}
          {activeMenu === 'calendar' && viewingCompanyId !== 'all' && currentCompany?.syncMailboxes?.length > 0 && (
            <div className="hidden md:block ml-1">
              <select
                value={selectedUserFilter}
                onChange={e => setSelectedUserFilter(e.target.value)}
                className="text-xs font-semibold border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-blue-400"
              >
                {currentCompany.syncMailboxes.map(email => (
                  <option key={email} value={email}>
                    {email.includes('tonggiamdoc') ? '💼 TGĐ'
                      : email.includes('phogiamdoc') ? '👔 Phó GĐ'
                      : email.includes('truly') ? '📋 Trợ lý'
                      : `👤 ${email.split('@')[0]}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: actions + user info */}
        <div className="flex items-center gap-1 sm:gap-2">
          {currentUser.role === 'admin' && (
            <button
              onClick={() => setActiveMenu(m => m === 'calendar' ? 'settings' : 'calendar')}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            >
              {activeMenu === 'calendar' ? <><SettingsIcon size={15} /><span className="hidden sm:inline">{t('btn_admin')}</span></> : <><Calendar size={15} /><span className="hidden sm:inline">{t('btn_view_cal')}</span></>}
            </button>
          )}

          {activeMenu === 'calendar' && (
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-60"
              title={t('btn_sync')}
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              <span className="hidden md:inline">{syncing ? 'Đang đồng bộ...' : t('btn_sync')}</span>
            </button>
          )}

          {activeMenu === 'calendar' && (
            <button
              onClick={() => setShowBookingModal(true)}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">{t('btn_book')}</span>
            </button>
          )}

          <div className="hidden sm:block h-6 w-px bg-slate-200 mx-1"></div>

          <button
            onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            <Globe size={13} /> {lang === 'vi' ? 'ENG' : 'VIE'}
          </button>

          <button
            onClick={toggleTheme}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="flex items-center gap-2 ml-1">
            <div className="text-right hidden md:block">
              <div className="text-xs font-semibold text-slate-800 leading-tight">{currentUser.name}</div>
              <div className="text-[10px] text-slate-400">
                {currentUser.role === 'admin' ? t('role_admin') : t('role_staff')}
              </div>
            </div>
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm border border-indigo-200 flex-shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <button
              onClick={onLogout}
              title={t('logout')}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 relative">

        {activeMenu === 'settings' && currentUser.role === 'admin' ? (
          <div className="w-full">
            <SettingsComponent
              companies={companies}
              onSaveCompanies={onSaveCompanies}
              adminSettings={adminSettings}
              onSaveAdminSettings={onSaveAdminSettings}
              appUsers={appUsers}
              onSaveAppUsers={onSaveAppUsers}
              t={t}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">

            {/* ── SIDEBAR ── */}
            {/* Mobile: absolute overlay toggled by hamburger; Desktop: grid column */}
            <aside className={`
              lg:col-span-4 xl:col-span-3 space-y-4
              ${mobileMenuOpen
                ? 'block absolute inset-y-0 left-0 z-30 w-72 bg-slate-50 border-r border-slate-200 shadow-xl p-4 overflow-y-auto top-0'
                : 'hidden lg:block'
              }
            `}>

              {/* Mini Calendar */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-sm text-slate-800">
                    {monthNames[currentDate.getMonth()]}, {currentDate.getFullYear()}
                  </h3>
                  <div className="flex gap-0.5">
                    <button onClick={handleMiniPrevMonth} className="p-1.5 hover:bg-slate-100 rounded text-slate-500">
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={handleMiniNextMonth} className="p-1.5 hover:bg-slate-100 rounded text-slate-500">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-0.5 text-center text-xs mb-1">
                  {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                    <div key={d} className="font-medium text-slate-400 py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
                  {miniCalendarDays.map((dateObj, idx) => {
                    if (!dateObj) return <div key={`empty-${idx}`} className="aspect-square" />;
                    const isSelected = isSameDay(dateObj, currentDate);
                    const hasEvents = dateHasEvents(dateObj);
                    return (
                      <button
                        key={dateObj.toISOString()}
                        onClick={() => { setCurrentDate(dateObj); setMobileMenuOpen(false); }}
                        className={`aspect-square flex items-center justify-center rounded-lg relative transition-colors font-semibold text-xs
                          ${isSelected ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-blue-50'}
                        `}
                      >
                        {dateObj.getDate()}
                        {hasEvents && !isSelected && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-400 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weekly Stats */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
                <h3 className="font-semibold text-sm text-slate-800 mb-3">
                  {t('week_overview')} {currentCompany?.companyName || ''}
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-600 flex items-center gap-2">
                      <Video size={14} className="text-blue-500" /> {t('online_meeting')}
                    </span>
                    <span className="font-bold text-blue-600">{stats.online}</span>
                  </div>
                  <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-600 flex items-center gap-2">
                      <MapPin size={14} className="text-amber-500" /> {t('offline_event')}
                    </span>
                    <span className="font-bold text-amber-600">{stats.offline}</span>
                  </div>
                </div>
              </div>

              {/* Mobile: Company selector */}
              {allowedCompanies.length > 1 && (
                <div className="lg:hidden bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Công ty</label>
                  <select
                    value={viewingCompanyId || 'all'}
                    onChange={e => { setViewingCompanyId(e.target.value); setMobileMenuOpen(false); }}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 outline-none"
                  >
                    <option value="all">🏢 Tất cả</option>
                    {allowedCompanies.map(c => (
                      <option key={c.id} value={c.id}>{c.companyName}</option>
                    ))}
                  </select>
                </div>
              )}

            </aside>

            {/* Overlay backdrop for mobile sidebar */}
            {mobileMenuOpen && (
              <div
                className="lg:hidden fixed inset-0 bg-black/30 z-20"
                onClick={() => setMobileMenuOpen(false)}
              />
            )}

            {/* ── MAIN CALENDAR AREA ── */}
            <div className="lg:col-span-8 xl:col-span-9">

              {/* Company pill selector — shown above calendar when multiple companies */}
              {allowedCompanies.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {/* All button */}
                  <button
                    onClick={() => setViewingCompanyId('all')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all"
                    style={{
                      background: viewingCompanyId === 'all' ? '#2563eb' : 'white',
                      color: viewingCompanyId === 'all' ? 'white' : '#475569',
                      borderColor: viewingCompanyId === 'all' ? '#2563eb' : '#cbd5e1',
                    }}
                  >
                    🏢 Tất cả
                  </button>

                  {/* Per-company buttons */}
                  {allowedCompanies.map((c, i) => {
                    const color = companyColors[c.id] || '#3b82f6';
                    const isActive = viewingCompanyId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setViewingCompanyId(c.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all"
                        style={{
                          background: isActive ? color : 'white',
                          color: isActive ? 'white' : '#475569',
                          borderColor: isActive ? color : '#cbd5e1',
                        }}
                      >
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: isActive ? 'white' : color }} />
                        {c.companyName}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" style={{ minHeight: '600px' }}>
                <CalendarComponent
                  events={filteredEvents}
                  onSelectEvent={(ev) => setSelectedEvent(ev)}
                  onOpenBookingModal={() => setShowBookingModal(true)}
                  currentUser={currentUser}
                  syncMailboxes={viewingCompanyId === 'all' ? [] : (currentCompany?.syncMailboxes || [])}
                  currentDate={currentDate}
                  setCurrentDate={setCurrentDate}
                  selectedUserFilter={viewingCompanyId === 'all' ? '' : selectedUserFilter}
                  setSelectedUserFilter={setSelectedUserFilter}
                  companyColors={companyColors}
                  showCompanyBadge={viewingCompanyId === 'all' && allowedCompanies.length > 1}
                  companies={allowedCompanies}
                />
              </div>
            </div>

          </div>
        )}
      </main>

      {/* ── BOOKING MODAL ── */}
      {showBookingModal && (
        <BookingModal
          date={currentDate}
          gdEmail={gdEmail}
          onClose={() => setShowBookingModal(false)}
          onBookEvent={handleBookEvent}
        />
      )}

      {/* ── EVENT DETAIL MODAL ── */}
      {selectedEvent && (() => {
        const ev = selectedEvent;
        const isTeams = ev.type === 'teams' || ev.location?.toLowerCase().includes('teams') || ev.location?.toLowerCase().includes('online');
        const company = allowedCompanies.find(c => c.id === ev.companyId);
        const color   = companyColors[ev.companyId] || '#3b82f6';
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setSelectedEvent(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header with company color */}
              <div className="px-6 py-4 flex items-start justify-between gap-4" style={{ background: color }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.25)' }}>
                      {isTeams ? '📹 Microsoft Teams' : '📍 Offline'}
                    </span>
                    {company && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.2)' }}>
                        {company.companyName}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white leading-snug">{ev.title || ev.subject}</h2>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="text-white/80 hover:text-white flex-shrink-0 mt-1">
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-3 text-sm">
                {/* Date + Time */}
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
                  <Calendar size={16} style={{ color, flexShrink: 0 }} />
                  <div>
                    <div className="font-semibold text-slate-800">{ev.date}</div>
                    {ev.time && <div className="text-slate-500 text-xs mt-0.5">🕐 {ev.time}</div>}
                  </div>
                </div>

                {/* Location / Teams link */}
                {isTeams ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <Video size={16} className="text-blue-600 flex-shrink-0" />
                    <span className="text-blue-700 font-medium">Cuộc họp Microsoft Teams</span>
                  </div>
                ) : ev.location ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <MapPin size={16} className="text-amber-600 flex-shrink-0" />
                    <span className="text-slate-700">{ev.location}</span>
                  </div>
                ) : null}

                {/* Room */}
                {ev.room && (
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 flex-shrink-0 mt-0.5">🚪</span>
                    <div><span className="text-xs text-slate-500 block">Phòng họp</span><span className="font-medium text-slate-800">{ev.room}</span></div>
                  </div>
                )}

                {/* Organizer */}
                {ev.organizer && (
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 flex-shrink-0 mt-0.5">👤</span>
                    <div><span className="text-xs text-slate-500 block">Người tổ chức</span><span className="font-medium text-slate-800">{ev.organizerName || ev.organizer}</span></div>
                  </div>
                )}

                {/* Attendees */}
                {ev.attendees && (
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 flex-shrink-0 mt-0.5">👥</span>
                    <div>
                      <span className="text-xs text-slate-500 block">Người tham dự {ev.attendeeCount ? `(${ev.attendeeCount})` : ''}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ev.attendees.split(',').map(a => a.trim()).filter(Boolean).map(a => (
                          <span key={a} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">{a}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Status */}
                {ev.status && ev.status !== 'confirmed' && (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ev.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {ev.status === 'cancelled' ? '❌ Đã hủy' : '⏳ Dự kiến'}
                    </span>
                  </div>
                )}
              </div>

              <div className="px-6 pb-5">
                <button onClick={() => setSelectedEvent(null)} className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors" style={{ background: color }}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
