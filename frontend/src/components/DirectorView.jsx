import React, { useState } from 'react';
import { Calendar, Clock, MapPin, Users, RefreshCw, Check, ShieldAlert, Award } from 'lucide-react';

export default function DirectorView({ events, settings }) {
  const { companyName, companyLogo, syncMailboxes } = settings || {};
  const gdEmail = syncMailboxes?.[0] || 'tonggiamdoc@company.com';
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('Vừa xong');
  
  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setLastSync('Vừa xong');
    }, 1500);
  };

  const getUpcomingEvents = () => {
    return events
      .filter(ev => new Date(ev.start_time) >= new Date('2026-05-28T08:00:00'))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  };

  const formatEventDate = (isoString) => {
    const d = new Date(isoString);
    const day = d.getDate().toString().padStart(2, '0');
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${m}`;
  };

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    const min = d.getMinutes().toString().padStart(2, '0');
    const hr = d.getHours().toString().padStart(2, '0');
    return `${hr}:${min}`;
  };

  const upcoming = getUpcomingEvents();

  return (
    <div style={{ 
      maxWidth: '500px', 
      margin: '0 auto', 
      padding: '20px 10px',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px'
    }}>
      
      {/* Company Branding Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '5px' }}>
        {companyLogo ? (
          <img src={companyLogo} alt="Logo" style={{ height: '24px', objectFit: 'contain' }} />
        ) : (
          <Calendar size={16} style={{ color: 'var(--primary)' }} />
        )}
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          {companyName || 'M365 Personal Calendar'}
        </span>
      </div>

      {/* Top Header Card */}
      <div className="glass-card" style={{ 
        padding: '20px', 
        background: 'linear-gradient(135deg, rgba(16, 124, 65, 0.12) 0%, rgba(16, 124, 65, 0.02) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
              <Award size={12} />
              Tổng Giám Đốc
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>Lịch Biểu Cá Nhân</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {gdEmail}
            </p>
          </div>
          
          <button 
            className="btn btn-secondary animate-pulse" 
            style={{ 
              padding: '8px', 
              borderRadius: '50%', 
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)' 
            }}
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '15px', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <div>Trạng thái: <span className="badge badge-success" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>Đã đồng bộ song song</span></div>
          <div>Cập nhật: <span style={{ color: 'var(--text-secondary)' }}>{lastSync}</span></div>
        </div>
      </div>

      {/* Security alert context */}
      <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', padding: '12px', borderRadius: '10px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <ShieldAlert size={16} className="badge-warning" style={{ border: 'none', background: 'none', padding: 0 }} />
        <span>Trang này được bảo mật bằng liên kết Token nội bộ. TGĐ không cần đăng nhập Microsoft 365 trên thiết bị này.</span>
      </div>

      {/* Agenda Section */}
      <div>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', paddingLeft: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Lịch trình sắp tới ({upcoming.length})
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {upcoming.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Không có cuộc họp nào sắp diễn ra.
            </div>
          ) : (
            upcoming.map(event => {
              const isTeams = event.location?.includes('Teams') || event.location?.includes('Online') || event.body?.includes('teams.microsoft.com');
              const evDate = new Date(event.start_time);
              const isToday = evDate.getFullYear() === 2026 && evDate.getMonth() === 4 && evDate.getDate() === 28;

              return (
                <div 
                  key={event.id}
                  className="glass-card"
                  style={{ 
                    padding: '16px',
                    borderLeft: `4px solid ${isTeams ? 'var(--primary)' : 'var(--secondary)'}`,
                    background: isToday ? 'rgba(99, 102, 241, 0.03)' : 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    gap: '15px'
                  }}
                >
                  {/* Left Date bubble */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isToday ? 'var(--primary-glow)' : 'rgba(255, 255, 255, 0.04)',
                    color: isToday ? 'var(--primary)' : 'var(--text-primary)',
                    borderRadius: '10px',
                    width: '50px',
                    height: '50px',
                    fontWeight: 800,
                    fontSize: '0.9rem'
                  }}>
                    <span style={{ fontSize: '1.1rem' }}>{evDate.getDate()}</span>
                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.8 }}>T{evDate.getMonth() + 1}</span>
                  </div>

                  {/* Right Event Detail */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '5px' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {event.subject}
                      </h3>
                      {isToday && <span className="badge badge-info" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>Hôm nay</span>}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                        {formatTime(event.start_time)} - {formatTime(event.end_time)}
                      </span>
                      {event.location && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                            {event.location}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* Footer copyright */}
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '30px', paddingBottom: '20px' }}>
        M365 Calendar AutoSync Portal &copy; 2026
      </div>

    </div>
  );
}
