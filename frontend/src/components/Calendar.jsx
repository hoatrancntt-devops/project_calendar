import React, { useState } from 'react';
import { Calendar as CalendarIcon, Clock, Plus, Users, Video, RefreshCw, ChevronLeft, ChevronRight, MapPin, ChevronDown, CheckCircle2 } from 'lucide-react';

export default function Calendar({
  events,
  onSelectEvent,
  onOpenBookingModal,
  currentUser,
  syncMailboxes,
  currentDate: propCurrentDate,
  setCurrentDate: propSetCurrentDate,
  selectedUserFilter: propSelectedUserFilter,
  setSelectedUserFilter: propSetSelectedUserFilter,
  companyColors = {},
  showCompanyBadge = false,
  companies = [],
}) {
  // Local fallback states if not passed as props
  const [localViewMode, setLocalViewMode] = useState('day'); // day | week | month
  const [localCurrentDate, setLocalCurrentDate] = useState(new Date());
  const [localSelectedUserFilter, setLocalSelectedUserFilter] = useState(syncMailboxes?.[0] || 'tonggiamdoc@company.com');

  const viewMode = localViewMode;
  const setViewMode = setLocalViewMode;
  
  const currentDate = propCurrentDate || localCurrentDate;
  const setCurrentDate = propSetCurrentDate || setLocalCurrentDate;

  const selectedUserFilter = propSelectedUserFilter || localSelectedUserFilter;
  const setSelectedUserFilter = propSetSelectedUserFilter || setLocalSelectedUserFilter;

  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  // Navigate calendar
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Helper: Get days in month
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    
    // Offset standard Monday start index
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthTotalDays - i),
        isCurrentMonth: false
      });
    }
    
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    
    return days;
  };

  const days = getDaysInMonth(currentDate);

  // Dynamic filter for multi-user calendar
  const filteredEvents = events.filter(ev => {
    const matchEmail = selectedUserFilter.toLowerCase();
    const attendeesList = ev.attendees || '';
    const organizerEmail = ev.organizer || '';
    return (
      organizerEmail.toLowerCase().includes(matchEmail) || 
      attendeesList.toLowerCase().includes(matchEmail)
    );
  });

  const getEventsForDate = (dateStr) => {
    return filteredEvents.filter(e => {
      const eDate = e.date || e.start_time.split('T')[0];
      return eDate === dateStr;
    });
  };

  const formatHeaderDate = () => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getDate()).padStart(2, '0');
    
    if (viewMode === 'day') {
      const dayName = dayNames[currentDate.getDay()];
      return `${dayName}, ${d}/${m}`;
    } else if (viewMode === 'week') {
      // Find start and end of week (Monday to Sunday)
      const dayIndex = currentDate.getDay();
      const offset = dayIndex === 0 ? -6 : 1 - dayIndex; // offset to Monday
      
      const mon = new Date(currentDate);
      mon.setDate(currentDate.getDate() + offset);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      
      const monD = String(mon.getDate()).padStart(2, '0');
      const monM = String(mon.getMonth() + 1).padStart(2, '0');
      const sunD = String(sun.getDate()).padStart(2, '0');
      const sunM = String(sun.getMonth() + 1).padStart(2, '0');
      
      return `Tuần ${monD}/${monM} - ${sunD}/${sunM}`;
    } else {
      return `Tháng ${currentDate.getMonth() + 1}, ${y}`;
    }
  };

  const isTodayDate = (dateStr) => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return dateStr === `${y}-${m}-${d}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[600px] fadeIn" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
      
      {/* Calendar Header with Title and Mode selectors */}
      <div className="border-b border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:justify-between items-center bg-slate-50/50 gap-4" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card-hover)' }}>
        
        {/* Left Side Active Date Label */}
        <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <CalendarIcon size={18} style={{ color: 'var(--primary)' }} />
          <span>{formatHeaderDate()}</span>
        </h2>

        {/* View Mode Pill selectors */}
        <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
          
          {/* Navigation Controls */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200" style={{ background: 'var(--bg-card-hover)', borderColor: 'var(--border-color)' }}>
            <button className="p-1 hover:bg-white rounded text-slate-600 transition-colors" style={{ color: 'var(--text-secondary)' }} onClick={handlePrev}>
              <ChevronLeft size={14} />
            </button>
            <button className="px-2.5 py-1 text-xs font-bold hover:bg-white rounded text-slate-700 transition-colors" style={{ color: 'var(--text-primary)' }} onClick={handleToday}>
              Hôm nay
            </button>
            <button className="p-1 hover:bg-white rounded text-slate-600 transition-colors" style={{ color: 'var(--text-secondary)' }} onClick={handleNext}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Quick month jump (shown only in month view) */}
          {viewMode === 'month' && (
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold" style={{ background: 'var(--bg-card-hover)', borderColor: 'var(--border-color)' }}>
              {[-1, 0, 1].map(offset => {
                const d = new Date(); d.setMonth(d.getMonth() + offset);
                const label = offset === -1 ? '← Trước' : offset === 0 ? 'Tháng này' : 'Tiếp →';
                const isActive = currentDate.getFullYear() === d.getFullYear() && currentDate.getMonth() === d.getMonth();
                return (
                  <button key={offset}
                    onClick={() => setCurrentDate(d)}
                    className="px-2.5 py-1.5 rounded-md transition-all"
                    style={{
                      background: isActive ? 'var(--bg-card)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Mode Tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200" style={{ background: 'var(--bg-card-hover)', borderColor: 'var(--border-color)' }}>
            {['day', 'week', 'month'].map((mode) => (
              <button 
                key={mode}
                onClick={() => setViewMode(mode)} 
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all
                  ${viewMode === mode ? 'bg-white shadow' : 'text-slate-600 hover:text-slate-900'}
                `}
                style={{
                  background: viewMode === mode ? 'var(--bg-card)' : 'transparent',
                  color: viewMode === mode ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                {mode === 'day' ? 'Ngày' : mode === 'week' ? 'Tuần' : 'Tháng'}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Main Agenda Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50/20" style={{ background: 'transparent' }}>
        
        {/* --- DAY VIEW (Vertical Timeline Axis Layout) --- */}
        {viewMode === 'day' && (
          <div className="p-4 sm:p-6" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(() => {
              const y = currentDate.getFullYear();
              const m = String(currentDate.getMonth() + 1).padStart(2, '0');
              const d = String(currentDate.getDate()).padStart(2, '0');
              const activeDayStr = `${y}-${m}-${d}`;
              const dayEvents = getEventsForDate(activeDayStr);

              if (dayEvents.length === 0) {
                return (
                  <div className="text-center py-24 text-slate-400 italic" style={{ color: 'var(--text-muted)' }}>
                    Trống lịch họp trong ngày.
                  </div>
                );
              }

              return dayEvents.map((event) => {
                const isTeams = event.type === 'teams' || event.location?.toLowerCase().includes('teams') || event.location?.toLowerCase().includes('online');
                const eventColor = companyColors[event.companyId] || 'var(--primary)';
                const eventCompany = showCompanyBadge ? companies.find(c => c.id === event.companyId) : null;

                // Parse Time
                const startTimeStr = event.time?.split(' - ')[0] || event.start_time?.split('T')[1]?.substring(0, 5) || '08:00';
                const endTimeStr = event.time?.split(' - ')[1] || event.end_time?.split('T')[1]?.substring(0, 5) || '09:00';

                return (
                  <div
                    key={event.id}
                    className="flex gap-4 p-2 sm:p-4 hover:bg-slate-50/60 rounded-xl transition-all group cursor-pointer"
                    onClick={() => onSelectEvent(event)}
                    style={{ position: 'relative' }}
                  >
                    {/* 1. Time Column on the Left */}
                    <div className="w-16 sm:w-20 flex-shrink-0 text-right pt-2">
                      <div className="font-extrabold text-slate-700 text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>
                        {startTimeStr}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                        {endTimeStr}
                      </div>
                    </div>

                    {/* 2. Central Timeline axis & nodes — colored by company */}
                    <div className="relative flex flex-col items-center">
                      <div
                        className="w-3.5 h-3.5 rounded-full mt-3 bg-white border-[3px] border-solid"
                        style={{
                          borderColor: eventColor,
                          boxShadow: `0 0 0 4px ${eventColor}22`,
                        }}
                      ></div>
                      <div
                        className="absolute top-6 bottom-[-24px] w-0.5 group-last:hidden"
                        style={{ background: 'var(--border-color)' }}
                      ></div>
                    </div>

                    {/* 3. Event glass card — left accent border colored by company */}
                    <div
                      className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm transition-all duration-200"
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderLeft: `3px solid ${eventColor}`,
                        boxShadow: 'var(--fluent-shadow)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'var(--fluent-shadow)';
                      }}
                    >
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-sm sm:text-base text-slate-800 leading-tight" style={{ color: 'var(--text-primary)' }}>
                            {event.title || event.subject}
                          </h4>
                          {/* Company badge — shown in "All" view */}
                          {eventCompany && (
                            <span
                              className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ background: `${eventColor}18`, color: eventColor }}
                            >
                              {eventCompany.companyName}
                            </span>
                          )}
                        </div>

                        {/* Event type badge */}
                        <span className={`badge ${isTeams ? 'badge-success' : 'badge-warning'} flex items-center gap-1 flex-shrink-0`}>
                          {isTeams ? <Video size={10} /> : <MapPin size={10} />}
                          {isTeams ? 'Teams' : 'Offline'}
                        </span>
                      </div>
                      
                      {/* Meta information row */}
                      <div className="space-y-1.5 text-xs sm:text-sm text-slate-600 mt-3" style={{ color: 'var(--text-secondary)' }}>
                        {isTeams ? (
                          <div 
                            className="flex items-center gap-1.5 font-bold" 
                            style={{ color: 'var(--primary)' }}
                          >
                            <Video size={14} />
                            <span>Tham gia họp Teams</span>
                          </div>
                        ) : (
                          event.location && (
                            <div className="flex items-center gap-1.5 truncate">
                              <MapPin size={14} className="text-slate-400 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )
                        )}
                        
                        {event.attendees && (
                          <div className="flex items-center gap-1.5">
                            <Users size={14} className="text-slate-400 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                            <span className="truncate">{event.attendees}</span>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* --- WEEK VIEW (Vertical days stack list) --- */}
        {viewMode === 'week' && (
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            {(() => {
              // Get Monday dates range for current active week
              const dayIndex = currentDate.getDay();
              const offset = dayIndex === 0 ? -6 : 1 - dayIndex;
              const monDate = new Date(currentDate);
              monDate.setDate(currentDate.getDate() + offset);

              const weekdaysList = [];
              for (let i = 0; i < 6; i++) {
                const temp = new Date(monDate);
                temp.setDate(monDate.getDate() + i);
                weekdaysList.push(temp);
              }

              return weekdaysList.map((dayObj) => {
                const y = dayObj.getFullYear();
                const m = String(dayObj.getMonth() + 1).padStart(2, '0');
                const d = String(dateObj => dateObj.getDate()).padStart(2, '0'); // Safe fallback inside map
                const dayStr = `${y}-${m}-${String(dayObj.getDate()).padStart(2, '0')}`;
                
                const dayEvents = getEventsForDate(dayStr);
                const isToday = isTodayDate(dayStr);
                
                // Title String
                const wDaysNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                const dayLabel = `${wDaysNames[dayObj.getDay()]}, ${String(dayObj.getDate()).padStart(2, '0')}/${m}`;

                return (
                  <div 
                    key={dayStr} 
                    className="border rounded-xl overflow-hidden transition-all duration-200"
                    style={{
                      borderColor: isToday ? 'var(--primary)' : 'var(--border-color)',
                      boxShadow: isToday ? '0 4px 16px var(--primary-glow)' : 'var(--fluent-shadow)',
                      background: 'var(--bg-card)'
                    }}
                  >
                    {/* Day Header row */}
                    <div 
                      className="px-4 py-2.5 font-bold text-xs sm:text-sm border-b flex justify-between items-center"
                      style={{
                        background: isToday ? 'var(--primary-glow)' : 'rgba(0,0,0,0.01)',
                        color: isToday ? 'var(--primary)' : 'var(--text-primary)',
                        borderColor: isToday ? 'rgba(16, 124, 65, 0.2)' : 'var(--border-color)'
                      }}
                    >
                      <span>{dayLabel}</span>
                      {isToday && <span className="badge badge-success">Hôm nay</span>}
                    </div>

                    {/* Day Events stack list */}
                    <div className="p-3">
                      {dayEvents.length === 0 ? (
                        <p className="text-xs text-slate-400 italic px-2 py-3 text-center" style={{ color: 'var(--text-muted)' }}>
                          Trống lịch họp
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {dayEvents.map(evt => {
                            const isOnline = evt.type === 'teams' || evt.location?.toLowerCase().includes('teams') || evt.location?.toLowerCase().includes('online');
                            const startTime = evt.time?.split(' - ')[0] || evt.start_time?.split('T')[1]?.substring(0, 5) || '08:00';
                            const evtColor = companyColors[evt.companyId] || 'var(--primary)';
                            const evtCompany = showCompanyBadge ? companies.find(c => c.id === evt.companyId) : null;

                            return (
                              <div
                                key={evt.id}
                                onClick={() => onSelectEvent(evt)}
                                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors"
                                style={{
                                  background: 'var(--bg-card)',
                                  borderColor: 'var(--border-color)',
                                  borderLeft: `3px solid ${evtColor}`,
                                }}
                              >
                                {/* Start Time */}
                                <div className="text-xs sm:text-sm font-extrabold w-16" style={{ color: evtColor }}>
                                  {startTime}
                                </div>

                                {/* Content details */}
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-xs sm:text-sm text-slate-800 leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                                    {evt.title || evt.subject}
                                  </div>
                                  {evtCompany && (
                                    <span className="inline-block px-1.5 py-0 rounded text-[9px] font-semibold mt-0.5"
                                      style={{ background: `${evtColor}18`, color: evtColor }}>
                                      {evtCompany.companyName}
                                    </span>
                                  )}
                                  <div className="text-[10px] sm:text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
                                    <span className="flex items-center gap-1">
                                      {isOnline ? <Video size={10}/> : <MapPin size={10}/>}
                                      {isOnline ? 'Teams (Online)' : evt.location || 'Offline'}
                                    </span>
                                    {evt.attendees && (
                                      <span className="flex items-center gap-1">
                                        <Users size={10}/>
                                        <span className="truncate max-w-[200px] sm:max-w-xs">{evt.attendees}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Dynamic badge */}
                                <span className={`badge ${isOnline ? 'badge-success' : 'badge-warning'} hidden sm:inline-flex`}>
                                  {isOnline ? 'Teams' : 'Offline'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* --- MONTH VIEW (Full Calendar Month Grid) --- */}
        {viewMode === 'month' && (
          <div className="p-4 sm:p-6 h-full flex flex-col" style={{ minHeight: '500px' }}>
            
            {/* Days grid header */}
            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-t-xl overflow-hidden border border-slate-200" style={{ borderColor: 'var(--border-color)', background: 'var(--border-color)' }}>
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                <div 
                  key={d} 
                  className="bg-slate-50 py-2 text-center text-xs font-bold text-slate-600"
                  style={{ background: 'rgba(0,0,0,0.02)', color: 'var(--text-secondary)' }}
                >
                  {d}
                </div>
              ))}
            </div>
            
            {/* Grid days blocks */}
            <div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200 rounded-b-xl overflow-hidden flex-1" style={{ borderColor: 'var(--border-color)', background: 'var(--border-color)' }}>
              {days.map((item, i) => {
                const dateObj = item.date;
                const year = dateObj.getFullYear();
                const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                const d = String(dateObj.getDate()).padStart(2, '0');
                const dateStr = `${year}-${m}-${d}`;
                
                const dayEvents = getEventsForDate(dateStr);
                const isToday = isTodayDate(dateStr);
                
                return (
                  <div 
                    key={`month-cell-${i}`} 
                    className="bg-white p-2 min-h-[80px] sm:min-h-[105px] flex flex-col hover:bg-slate-50/50 relative"
                    style={{ 
                      background: isToday ? 'var(--primary-glow)' : 'var(--bg-card)', 
                      opacity: item.isCurrentMonth ? 1 : 0.4 
                    }}
                  >
                    {/* Day number — click to jump to day view */}
                    <div className="text-right text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      <button
                        onClick={() => { setCurrentDate(dateObj); setViewMode('day'); }}
                        title="Xem lịch ngày này"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {isToday ? (
                          <span style={{
                            background: 'var(--primary)',
                            color: '#ffffff',
                            borderRadius: '50%',
                            width: '22px',
                            height: '22px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(16, 124, 65, 0.25)'
                          }}>
                            {dateObj.getDate()}
                          </span>
                        ) : (
                          <span className="hover:text-blue-600 hover:underline">{dateObj.getDate()}</span>
                        )}
                      </button>
                    </div>
                    
                    {/* Events list: Desktop */}
                    <div className="hidden sm:flex flex-col gap-1 flex-1 overflow-y-auto">
                      {dayEvents.map(evt => {
                        const startTime = evt.time?.split(':')[0] || evt.start_time?.split('T')[1]?.substring(0, 2) || '08';
                        const evtColor = companyColors[evt.companyId] || 'var(--primary)';
                        return (
                          <div
                            key={evt.id}
                            onClick={(e) => { e.stopPropagation(); onSelectEvent(evt); }}
                            className="text-[9px] md:text-[10px] leading-tight truncate px-1.5 py-0.5 rounded border cursor-pointer font-bold"
                            style={{
                              background: `${evtColor}12`,
                              color: evtColor,
                              borderColor: `${evtColor}30`,
                            }}
                          >
                            {startTime}h - {evt.title || evt.subject}
                          </div>
                        );
                      })}
                    </div>

                    {/* Events list: Mobile Color dots */}
                    <div className="sm:hidden flex flex-wrap gap-1 mt-auto pb-1 justify-end">
                      {dayEvents.map(evt => {
                        const evtColor = companyColors[evt.companyId] || 'var(--primary)';
                        return (
                          <div
                            key={evt.id}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: evtColor }}
                          ></div>
                        );
                      })}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
