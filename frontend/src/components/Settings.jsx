import React, { useState, useEffect } from 'react';
import { Save, Mail, Plus, X, RefreshCw, Users, Building2, Upload, Image, Trash2, ShieldCheck, Calendar, AlertTriangle } from 'lucide-react';
// graphFetch removed — SMTP via backend
import { daysUntilExpiry, expiryStatus } from '../lib/expiry-utils';

// Resize an uploaded image to a max dimension and return a compressed PNG data URL.
// Keeps logos small so they fit the backend payload limit and localStorage quota.
function resizeImageFile(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        else if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Settings({
  companies, onSaveCompanies,
  adminSettings, onSaveAdminSettings,
  appUsers, onSaveAppUsers,
  currentUser,
  t
}) {
  const [activeTab, setActiveTab] = useState('group');

  const [localGlobal, setLocalGlobal]       = useState({ ...adminSettings });
  const [localCompanies, setLocalCompanies] = useState([...companies]);
  const [localUsers, setLocalUsers]         = useState([...appUsers]);
  const [activeCompanyId, setActiveCompanyId] = useState(companies?.[0]?.id || null);

  const [currentAdminPass, setCurrentAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass]         = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [confirmDeleteId, setConfirmDeleteId]   = useState(null); // company id pending delete confirm

  const [message, setMessage]         = useState(null);
  const [testMailStatus, setTestMailStatus] = useState(null); // null | 'sending' | 'success' | 'error'
  const [testMailError, setTestMailError]   = useState('');

  // Sync local editing state ONLY when external props change (not on local activeCompanyId).
  // Including activeCompanyId here caused add/delete to be reverted (effect re-ran and reset localCompanies).
  useEffect(() => {
    setLocalGlobal({ ...adminSettings });
    setLocalCompanies(JSON.parse(JSON.stringify(companies)));
    setLocalUsers(JSON.parse(JSON.stringify(appUsers)));
  }, [adminSettings, companies, appUsers]);

  // Pick a default active company when none selected or current one no longer exists
  useEffect(() => {
    if ((!activeCompanyId || !localCompanies.find(c => c.id === activeCompanyId)) && localCompanies.length > 0) {
      setActiveCompanyId(localCompanies[0].id);
    }
  }, [localCompanies, activeCompanyId]);

  const activeCompany = localCompanies.find(c => c.id === activeCompanyId);

  const handleUpdateCompanyField = (field, value) => {
    if (!activeCompany) return;
    setLocalCompanies(prev => prev.map(c => c.id === activeCompanyId ? { ...c, [field]: value } : c));
  };

  const handleAddCompany = () => {
    const newId = `c-${Date.now()}`;
    setLocalCompanies([...localCompanies, {
      id: newId, companyName: 'Công ty Mới',
      tenantId: '', clientId: '', clientSecret: '',
      apiExpirationDate: '2026-12-31', apiWarningEmail: '',
      notifyEmails: [], expiryAlertEmails: [], syncMailboxes: []
    }]);
    setActiveCompanyId(newId);
  };

  const handleDeleteCompany = (id) => {
    if (localCompanies.length <= 1) { setMessage({ type: 'error', text: 'Phải có ít nhất 1 công ty!' }); return; }
    setConfirmDeleteId(id); // show inline confirm instead of window.confirm
  };

  const handleConfirmDelete = () => {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    const updated = localCompanies.filter(c => c.id !== id);
    setLocalCompanies(updated);
    if (activeCompanyId === id) setActiveCompanyId(updated[0]?.id || null);
  };

  const handleSaveAll = () => {
    onSaveAdminSettings(localGlobal);
    onSaveCompanies(localCompanies);
    onSaveAppUsers(localUsers);

    // Persist adminSettings to backend DB (survives reboot/device change)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localGlobal),
    }).catch(() => {});

    // Persist appUsers to backend DB
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localUsers),
    }).catch(() => {});

    // Sync company credentials to backend so calendar sync can use them
    fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localCompanies.map(c => ({
        id:                c.id,
        companyName:       c.companyName,
        tenantId:          c.tenantId          || '',
        clientId:          c.clientId          || '',
        clientSecret:      c.clientSecret      || '',
        syncMailboxes:     c.syncMailboxes      || [],
        expiryAlertEmails: c.expiryAlertEmails  || [],
        notifyEmails:      c.notifyEmails       || [],
        apiExpirationDate: c.apiExpirationDate  || '',
        color:             c.color              || '',
        logo:              c.logo               || '',
      }))),
    }).catch(() => {}); // fire-and-forget — UI not blocked

    setMessage({ type: 'success', text: t ? t('msg_saved') : 'Đã cập nhật cấu hình thành công!' });
    setTimeout(() => setMessage(null), 3000);
  };

  // ── Mailbox handlers ───────────────────────────────────────────────────────
  const handleAddMailbox = (e) => {
    e.preventDefault();
    const email = e.target.elements.mailbox.value.trim().toLowerCase();
    if (!email || activeCompany.syncMailboxes.includes(email)) return;
    handleUpdateCompanyField('syncMailboxes', [...activeCompany.syncMailboxes, email]);
    e.target.reset();
  };
  const handleRemoveMailbox = (email) =>
    handleUpdateCompanyField('syncMailboxes', activeCompany.syncMailboxes.filter(e => e !== email));

  // ── Notify email handlers ──────────────────────────────────────────────────
  const handleAddNotifyEmail = (e) => {
    e.preventDefault();
    const email = e.target.elements.notifyEmail.value.trim().toLowerCase();
    if (!email) return;
    const current = activeCompany.notifyEmails || [];
    if (current.includes(email)) return;
    handleUpdateCompanyField('notifyEmails', [...current, email]);
    e.target.reset();
  };
  const handleRemoveNotifyEmail = (email) =>
    handleUpdateCompanyField('notifyEmails', (activeCompany.notifyEmails || []).filter(e => e !== email));

  // Send a sample notification to verify delivery without waiting for a new event.
  // Backend resolves recipients from the SAVED DB record — so the user must Save first.
  const handleTestNotify = async () => {
    if (!(activeCompany.notifyEmails || []).length) {
      setMessage({ type: 'error', text: 'Chưa có email nhận thông báo. Thêm email rồi bấm Lưu trước.' });
      setTimeout(() => setMessage(null), 4000);
      return;
    }
    setMessage({ type: 'success', text: 'Đang gửi thử thông báo...' });
    try {
      const res = await fetch('/api/mail/test-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: activeCompany.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gửi thất bại');
      setMessage({ type: 'success', text: `Đã gửi thử tới ${data.recipients} người nhận. Kiểm tra hộp thư (cả Spam).` });
    } catch (err) {
      setMessage({ type: 'error', text: `Lỗi gửi thông báo: ${err.message}` });
    }
    setTimeout(() => setMessage(null), 5000);
  };

  // ── Expiry alert email handlers ────────────────────────────────────────────
  const handleAddExpiryEmail = (e) => {
    e.preventDefault();
    const email = e.target.elements.expiryEmail.value.trim().toLowerCase();
    if (!email) return;
    const current = activeCompany.expiryAlertEmails || [];
    if (current.includes(email)) return;
    handleUpdateCompanyField('expiryAlertEmails', [...current, email]);
    e.target.reset();
  };
  const handleRemoveExpiryEmail = (email) =>
    handleUpdateCompanyField('expiryAlertEmails', (activeCompany.expiryAlertEmails || []).filter(e => e !== email));

  // ── User permission handlers ───────────────────────────────────────────────
  const handleAddUser = (e) => {
    e.preventDefault();
    const email    = e.target.elements.email.value.trim().toLowerCase();
    const password = e.target.elements.password.value;
    const name     = e.target.elements.displayName?.value.trim() || email.split('@')[0];
    if (!email || !password) return;
    if (password.length < 6) { setMessage({ type: 'error', text: 'Mật khẩu tối thiểu 6 ký tự.' }); return; }
    if (localUsers.find(u => u.email === email)) {
      setMessage({ type: 'warning', text: 'Email đã tồn tại trong danh sách!' }); return;
    }
    // Read which company checkboxes were checked
    const allowedCompanyIds = localCompanies
      .filter(c => e.target.elements[`co-${c.id}`]?.checked)
      .map(c => c.id);
    setLocalUsers([...localUsers, { id: `u-${Date.now()}`, email, name, password, allowedCompanyIds, allowedMailboxes: {} }]);
    e.target.reset();
  };
  const handleRemoveUser = (userId) => setLocalUsers(localUsers.filter(u => u.id !== userId));
  const handleToggleUserCompany = (userId, compId) => {
    setLocalUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const has = u.allowedCompanyIds.includes(compId);
      return { ...u, allowedCompanyIds: has ? u.allowedCompanyIds.filter(id => id !== compId) : [...u.allowedCompanyIds, compId] };
    }));
  };

  /** Toggle a specific mailbox in allowedMailboxes[compId] for a user. Empty list = access to all. */
  const handleToggleUserMailbox = (userId, compId, mailbox) => {
    setLocalUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const current = (u.allowedMailboxes?.[compId] || []);
      const updated  = current.includes(mailbox)
        ? current.filter(m => m !== mailbox)
        : [...current, mailbox];
      return { ...u, allowedMailboxes: { ...(u.allowedMailboxes || {}), [compId]: updated } };
    }));
  };

  // ── Password change ────────────────────────────────────────────────────────
  const handleUpdatePassword = (e) => {
    e.preventDefault();
    if (currentAdminPass !== localGlobal.adminPassword) {
      setMessage({ type: 'error', text: t ? t('error_admin_pass') : 'Mật khẩu cũ sai!' }); return;
    }
    if (newAdminPass !== confirmAdminPass) {
      setMessage({ type: 'error', text: 'Xác nhận mật khẩu không khớp!' }); return;
    }
    setLocalGlobal({ ...localGlobal, adminPassword: newAdminPass });
    setMessage({ type: 'success', text: 'Mật khẩu đã thay đổi!' });
    setCurrentAdminPass(''); setNewAdminPass(''); setConfirmAdminPass('');
  };

  const handleGlobalLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await resizeImageFile(file, 256);
    setLocalGlobal({ ...localGlobal, globalCompanyLogo: dataUrl });
  };

  // ── SMTP config local state ────────────────────────────────────────────────
  const [smtp, setSmtp] = useState({ host: '', port: 587, secure: false, auth_user: '', password: '', from_name: '', from_email: '' });
  const [smtpLoaded, setSmtpLoaded] = useState(false);

  useEffect(() => {
    if (activeTab === 'email' && !smtpLoaded) {
      fetch('/api/mail/config')
        .then(r => r.json())
        .then(cfg => { setSmtp(prev => ({ ...prev, ...cfg, password: '' })); setSmtpLoaded(true); })
        .catch(() => setSmtpLoaded(true));
    }
  }, [activeTab, smtpLoaded]);

  const handleSaveSmtp = async () => {
    setTestMailStatus('saving');
    try {
      await fetch('/api/mail/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(smtp) });
      setTestMailStatus('saved');
      setTimeout(() => setTestMailStatus(null), 3000);
    } catch { setTestMailStatus('error'); setTestMailError('Không thể lưu cấu hình.'); }
  };

  // ── Test mail via backend SMTP ─────────────────────────────────────────────
  const handleTestMail = async () => {
    const to = localGlobal.mailTestRecipient;
    if (!to) { alert('Vui lòng nhập email nhận test.'); return; }
    setTestMailStatus('sending');
    setTestMailError('');
    try {
      const res = await fetch('/api/mail/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi gửi mail');
      setTestMailStatus('success');
      setTimeout(() => setTestMailStatus(null), 5000);
    } catch (err) {
      setTestMailStatus('error');
      setTestMailError(err.message);
    }
  };

  // ── Expiry badge helper ────────────────────────────────────────────────────
  const ExpiryBadge = ({ dateStr }) => {
    const days   = daysUntilExpiry(dateStr);
    const status = expiryStatus(days);
    if (status === 'ok' || status === 'unknown') return null;
    return (
      <span className={`badge ${status === 'expired' || status === 'critical' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.7rem', marginLeft: '6px' }}>
        {status === 'expired' ? 'Đã hết hạn' : `Còn ${days} ngày`}
      </span>
    );
  };

  return (
    <div className="settings-container">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t ? t('set_title') : 'Quản Trị Hệ Thống'}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t ? t('set_subtitle') : 'Thiết lập Tập đoàn, Công ty thành viên và Phân quyền'}</p>
        </div>
        <button className="btn btn-primary" onClick={handleSaveAll}><Save size={16} /> {t ? t('btn_save') : 'Lưu Cấu Hình'}</button>
      </div>

      {message && (
        <div className={`badge badge-${message.type === 'success' ? 'success' : message.type === 'error' ? 'danger' : 'warning'}`} style={{ width: '100%', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', justifyContent: 'flex-start' }}>
          {message.text}
        </div>
      )}

      {/* Inline delete confirmation — replaces window.confirm */}
      {confirmDeleteId && (() => {
        const co = localCompanies.find(c => c.id === confirmDeleteId);
        return (
          <div style={{ width: '100%', padding: '14px 16px', borderRadius: '8px', marginBottom: '20px', background: '#fef2f2', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontSize: '0.9rem', color: '#b91c1c', fontWeight: 600 }}>
              ⚠️ Xóa công ty <strong>{co?.companyName}</strong>? Thao tác này không thể hoàn tác.
            </span>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button className="btn btn-danger" style={{ padding: '5px 14px', fontSize: '0.8rem' }} onClick={handleConfirmDelete}>Xác nhận xóa</button>
              <button className="btn btn-secondary" style={{ padding: '5px 14px', fontSize: '0.8rem' }} onClick={() => setConfirmDeleteId(null)}>Hủy</button>
            </div>
          </div>
        );
      })()}

      {/* TABS */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '25px', background: 'rgba(0,0,0,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        {[
          { key: 'group',     icon: <ShieldCheck size={14}/>, label: t ? t('set_tab_group') : 'Tập Đoàn' },
          { key: 'companies', icon: <Building2 size={14}/>,   label: t ? t('set_tab_companies') : 'Công ty thành viên' },
          { key: 'users',     icon: <Users size={14}/>,       label: t ? t('set_tab_users') : 'Phân Quyền' },
          { key: 'email',     icon: <Mail size={14}/>,        label: '📧 Email' },
        ].map(tab => (
          <button key={tab.key} className="btn" onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1, minWidth: '100px', background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent', border: activeTab === tab.key ? '1px solid var(--border-color)' : '1px solid transparent', color: 'var(--text-primary)', fontWeight: activeTab === tab.key ? 600 : 400 }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div style={{ minHeight: '400px' }}>

        {/* TAB 1: GROUP */}
        {activeTab === 'group' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.2s ease-out' }}>

            {/* Branding */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '15px' }}>{t ? t('brand_title') : 'Thương Hiệu Chung'}</h3>
              <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '120px', height: '120px', borderRadius: '16px', border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {localGlobal.globalCompanyLogo ? (
                      /^(data:image\/|https:\/\/)/i.test(localGlobal.globalCompanyLogo)
                        ? <img src={localGlobal.globalCompanyLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '10px' }} />
                        : null
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}><Image size={32} style={{ margin: '0 auto 6px', opacity: 0.6 }} /><span style={{ fontSize: '0.7rem' }}>{t ? t('no_logo') : 'Chưa có Logo'}</span></div>
                    )}
                  </div>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '0.8rem' }}>
                    <Upload size={12} /> {t ? t('choose_file') : 'Chọn Tệp'} <input type="file" accept="image/*" onChange={handleGlobalLogoUpload} style={{ display: 'none' }} />
                  </label>
                  {localGlobal.globalCompanyLogo && (
                    <button className="btn" style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--accent)' }} onClick={() => setLocalGlobal({...localGlobal, globalCompanyLogo: null})}>Xóa Logo</button>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label className="form-label">{t ? t('company_name') : 'Tên Tập Đoàn / Công ty mẹ'}</label>
                    <input type="text" className="form-control" value={localGlobal.globalCompanyName} onChange={e => setLocalGlobal({...localGlobal, globalCompanyName: e.target.value})} />
                  </div>
                  <div>
                    <label className="form-label">Favicon URL</label>
                    <input type="text" className="form-control" placeholder="https://example.com/favicon.ico" value={localGlobal.faviconUrl || ''} onChange={e => setLocalGlobal({...localGlobal, faviconUrl: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>

            {/* Expiry alert thresholds */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>⏰ Ngưỡng Cảnh Báo Hết Hạn API</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>Số ngày còn lại để hiển thị banner cảnh báo cho từng mức độ.</p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <label className="form-label">Cảnh báo (warning) — ngày</label>
                  <input type="number" min="1" max="365" className="form-control" style={{ width: '120px' }}
                    value={localGlobal.expiryWarningDays ?? 30}
                    onChange={e => setLocalGlobal({ ...localGlobal, expiryWarningDays: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="form-label">Nghiêm trọng (critical) — ngày</label>
                  <input type="number" min="1" max="30" className="form-control" style={{ width: '120px' }}
                    value={localGlobal.expiryCriticalDays ?? 7}
                    onChange={e => setLocalGlobal({ ...localGlobal, expiryCriticalDays: Number(e.target.value) })} />
                </div>
              </div>
            </div>

            {/* Admin password */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '15px' }}>{t ? t('admin_pass_title') : 'Đổi Mật Khẩu Admin (sctsadmin)'}</h3>
              <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
                <input type="password" placeholder="Mật khẩu hiện tại" className="form-control" value={currentAdminPass} onChange={e => setCurrentAdminPass(e.target.value)} required />
                <input type="password" placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" className="form-control" value={newAdminPass} onChange={e => setNewAdminPass(e.target.value)} required />
                <input type="password" placeholder="Xác nhận mật khẩu mới" className="form-control" value={confirmAdminPass} onChange={e => setConfirmAdminPass(e.target.value)} required />
                <button type="submit" className="btn btn-primary" style={{ width: 'fit-content' }}>Cập nhật Mật khẩu Admin</button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: COMPANIES */}
        {activeTab === 'companies' && (
          <div className="settings-companies-layout">
            <div className="settings-sidebar">
              <button onClick={handleAddCompany} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}><Plus size={14} /> Thêm Công Ty</button>
              {localCompanies.map(c => {
                const days = daysUntilExpiry(c.apiExpirationDate);
                const status = expiryStatus(days);
                const hasAlert = ['expired', 'critical', 'warning'].includes(status);
                return (
                  <div key={c.id} onClick={() => setActiveCompanyId(c.id)}
                    style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', border: activeCompanyId === c.id ? '1px solid var(--primary)' : '1px solid var(--border-color)', background: activeCompanyId === c.id ? 'var(--primary-glow)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building2 size={16} style={{ color: activeCompanyId === c.id ? 'var(--primary)' : 'var(--text-muted)' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.companyName || 'Công ty mới'}</span>
                    </div>
                    {hasAlert && <AlertTriangle size={13} style={{ color: status === 'expired' || status === 'critical' ? '#b91c1c' : '#b45309', flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>

            {activeCompany && (
              <div className="settings-main-content">

                {/* Company name */}
                <div className="glass-card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Thông Tin: {activeCompany.companyName}</h3>
                    <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleDeleteCompany(activeCompany.id)}><Trash2 size={14} /> Xóa</button>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {/* Logo upload */}
                    <div className="form-group" style={{ flexShrink: 0 }}>
                      <label className="form-label">Logo</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '8px', border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: activeCompany.color || '#f1f5f9', flexShrink: 0 }}>
                          {activeCompany.logo
                            ? <img src={activeCompany.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            : <Building2 size={20} style={{ color: 'white', opacity: 0.8 }} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label className="btn btn-secondary" style={{ cursor: 'pointer', padding: '4px 10px', fontSize: '0.75rem' }}>
                            <Upload size={12} /> Tải lên
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                              const file = e.target.files[0];
                              if (!file) return;
                              const dataUrl = await resizeImageFile(file, 256);
                              handleUpdateCompanyField('logo', dataUrl);
                            }} />
                          </label>
                          {activeCompany.logo && (
                            <button className="btn" style={{ padding: '2px 8px', fontSize: '0.7rem', color: 'var(--accent)' }}
                              onClick={() => handleUpdateCompanyField('logo', '')}>Xóa logo</button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
                      <label className="form-label">Tên Công Ty</label>
                      <input type="text" className="form-control" value={activeCompany.companyName} onChange={e => handleUpdateCompanyField('companyName', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flexShrink: 0 }}>
                      <label className="form-label">Màu sắc</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="color"
                          value={activeCompany.color || '#3b82f6'}
                          onChange={e => handleUpdateCompanyField('color', e.target.value)}
                          style={{ width: '44px', height: '36px', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
                          title="Chọn màu đại diện công ty"
                        />
                        {activeCompany.color && (
                          <button className="btn" style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}
                            onClick={() => handleUpdateCompanyField('color', '')}>
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* M365 API credentials */}
                <div className="glass-card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>M365 API Credentials</h3>
                    <ExpiryBadge dateStr={activeCompany.apiExpirationDate} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input type="text" className="form-control" placeholder="Tenant ID" value={activeCompany.tenantId} onChange={e => handleUpdateCompanyField('tenantId', e.target.value)} />
                    <input type="text" className="form-control" placeholder="Client ID" value={activeCompany.clientId} onChange={e => handleUpdateCompanyField('clientId', e.target.value)} />
                    <input type="password" className="form-control" placeholder="Client Secret" value={activeCompany.clientSecret} onChange={e => handleUpdateCompanyField('clientSecret', e.target.value)} />
                    <div>
                      <label className="form-label">Ngày hết hạn API</label>
                      <input type="date" className="form-control" value={activeCompany.apiExpirationDate || ''} onChange={e => handleUpdateCompanyField('apiExpirationDate', e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Expiry alert recipients — NEW */}
                <div className="glass-card" style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🔔 Người nhận cảnh báo hết hạn API
                    <ExpiryBadge dateStr={activeCompany.apiExpirationDate} />
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Nhận email cảnh báo khi API Microsoft 365 sắp hết hạn (yêu cầu đăng nhập Microsoft để gửi).
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    {(activeCompany.expiryAlertEmails || []).map(email => (
                      <li key={email} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-card-hover)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={13} style={{ color: 'var(--warning)' }} /> {email}</div>
                        <button className="btn" style={{ color: '#ef4444', background: 'none', border: 'none', padding: '4px' }} onClick={() => handleRemoveExpiryEmail(email)}><X size={14} /></button>
                      </li>
                    ))}
                    {!(activeCompany.expiryAlertEmails?.length) && (
                      <li style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>Chưa có người nhận. Thêm email để nhận cảnh báo.</li>
                    )}
                  </ul>
                  <form onSubmit={handleAddExpiryEmail} style={{ display: 'flex', gap: '8px' }}>
                    <input type="email" name="expiryEmail" className="form-control" placeholder="email@company.vn..." required style={{ flex: 1 }} />
                    <button type="submit" className="btn btn-secondary"><Plus size={16} /> Thêm</button>
                  </form>
                </div>

                {/* Notification emails */}
                <div className="glass-card" style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '15px' }}>Email Nhận Thông Báo Lịch ({(activeCompany.notifyEmails || []).length})</h3>
                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(activeCompany.notifyEmails || []).map(email => (
                      <li key={email} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-card-hover)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={14} style={{ color: 'var(--secondary)' }} /> {email}</div>
                        <button className="btn" style={{ color: '#ef4444', background: 'none', border: 'none', padding: '4px' }} onClick={() => handleRemoveNotifyEmail(email)}><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                  <form onSubmit={handleAddNotifyEmail} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <input type="email" name="notifyEmail" className="form-control" placeholder="email@company.com..." required style={{ flex: 1 }} />
                    <button type="submit" className="btn btn-secondary"><Plus size={16} /> Thêm</button>
                  </form>
                  {/* Verify delivery without waiting for a real new event (reads SAVED recipients) */}
                  <button type="button" className="btn btn-secondary" onClick={handleTestNotify}
                    style={{ marginTop: '10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Mail size={15} /> Gửi thử thông báo
                  </button>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                    Lưu ý: thông báo chỉ tự gửi khi có <strong>sự kiện mới</strong> được đồng bộ từ M365. Bấm <strong>Lưu</strong> sau khi thêm email, rồi "Gửi thử" để kiểm tra.
                  </p>
                  {/* Last automatic-notification result (from backend cron) */}
                  {activeCompany.lastNotifyError ? (
                    <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '0.75rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={13} /> Lỗi gửi tự động gần nhất: {activeCompany.lastNotifyError}
                    </div>
                  ) : activeCompany.lastNotifyAt ? (
                    <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--secondary)' }}>
                      ✓ Tự động gửi gần nhất: {new Date(activeCompany.lastNotifyAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </div>
                  ) : null}
                </div>

                {/* Sync mailboxes */}
                <div className="glass-card" style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '15px' }}>Hòm Thư Lấy Lịch ({activeCompany.syncMailboxes.length})</h3>
                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeCompany.syncMailboxes.map(email => (
                      <li key={email} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-card-hover)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={14} style={{ color: 'var(--primary)' }} /> {email}</div>
                        <button className="btn" style={{ color: '#ef4444', background: 'none', border: 'none', padding: '4px' }} onClick={() => handleRemoveMailbox(email)}><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                  <form onSubmit={handleAddMailbox} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <input type="email" name="mailbox" className="form-control" placeholder="email@company.com..." required style={{ flex: 1 }} />
                    <button type="submit" className="btn btn-secondary"><Plus size={16} /> Thêm</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: USERS */}
        {activeTab === 'users' && (
          <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px' }}>Danh sách ủy quyền ({localUsers.length})</h3>
                {/* Add user form */}
                <form onSubmit={handleAddUser} style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label className="form-label">Tên hiển thị</label>
                      <input type="text" name="displayName" className="form-control" placeholder="Nguyễn Văn A" />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                      <label className="form-label">Email *</label>
                      <input type="email" name="email" className="form-control" placeholder="user@company.vn" required />
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                      <label className="form-label">Mật khẩu * (tối thiểu 6 ký tự)</label>
                      <input type="password" name="password" className="form-control" placeholder="••••••" required minLength={6} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Phân quyền công ty (có thể thêm sau)</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {localCompanies.map(c => {
                        const cbId = `new-user-co-${c.id}`;
                        return (
                          <label key={c.id} htmlFor={cbId} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                            <input id={cbId} type="checkbox" name={`co-${c.id}`} style={{ accentColor: 'var(--primary)' }} />
                            {c.companyName}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <button type="submit" className="btn btn-primary" style={{ width: 'fit-content' }}><Plus size={14} /> Tạo tài khoản</button>
                  </div>
                </form>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tài Khoản (Email)</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Công Ty & Hòm Thư</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-secondary)', width: '180px' }}>Reset Mật Khẩu</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', width: '60px' }}>Xóa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localUsers.map(user => (
                      <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '16px 12px', fontWeight: 600, fontSize: '0.9rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={14} style={{ color: 'var(--primary)' }} />{user.email}</div>
                        </td>
                        <td style={{ padding: '16px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Company access checkboxes */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {localCompanies.map(c => {
                                const isAllowed = user.allowedCompanyIds.includes(c.id);
                                return (
                                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', background: isAllowed ? 'var(--primary-glow)' : 'transparent', padding: '4px 8px', borderRadius: '4px', border: isAllowed ? '1px solid var(--primary)' : '1px solid var(--border-color)' }}>
                                    <input type="checkbox" checked={isAllowed} onChange={() => handleToggleUserCompany(user.id, c.id)} style={{ accentColor: 'var(--primary)' }} />
                                    {c.companyName}
                                  </label>
                                );
                              })}
                            </div>
                            {/* Per-company mailbox permissions (only for allowed companies with syncMailboxes) */}
                            {user.allowedCompanyIds.map(cid => {
                              const co = localCompanies.find(c => c.id === cid);
                              if (!co?.syncMailboxes?.length) return null;
                              const allowed = user.allowedMailboxes?.[cid] || [];
                              return (
                                <div key={cid} style={{ paddingLeft: '8px', borderLeft: '2px solid var(--border-color)' }}>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                                    {co.companyName} — Hòm thư được xem {!allowed.length && <span style={{ color: 'var(--primary)' }}>(tất cả)</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {co.syncMailboxes.map(mb => {
                                      const isChecked = allowed.includes(mb);
                                      return (
                                        <label key={mb} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 7px', borderRadius: '4px', background: isChecked ? 'var(--primary-glow)' : 'var(--bg-card-hover)', border: `1px solid ${isChecked ? 'var(--primary)' : 'var(--border-color)'}` }}>
                                          <input type="checkbox" checked={isChecked} onChange={() => handleToggleUserMailbox(user.id, cid, mb)} style={{ accentColor: 'var(--primary)' }} />
                                          {mb.split('@')[0]}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                                        <td style={{ padding: '16px 12px', minWidth: '160px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <input type="password" placeholder="Đặt mật khẩu mới..." className="form-control"
                              style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && e.target.value.length >= 6) {
                                  setLocalUsers(prev => prev.map(u => u.id === user.id ? { ...u, password: e.target.value } : u));
                                  e.target.value = '';
                                }
                              }} />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>↵ Enter để lưu (tối thiểu 6 ký tự)</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                          <button onClick={() => handleRemoveUser(user.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {localUsers.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa có nhân sự nào được cấp quyền.</div>}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EMAIL / SMTP CONFIG */}
        {activeTab === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.2s ease-out' }}>

            {/* SMTP server config */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>📧 Cấu hình SMTP</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Dùng để gửi email cảnh báo hết hạn API. Hỗ trợ Gmail, Outlook, SMTP công ty.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', maxWidth: '640px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">SMTP Host *</label>
                  <input type="text" className="form-control" placeholder="smtp.gmail.com" value={smtp.host} onChange={e => setSmtp({...smtp, host: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Port</label>
                  <input type="number" className="form-control" placeholder="587" value={smtp.port} onChange={e => setSmtp({...smtp, port: Number(e.target.value)})} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '22px' }}>
                  <input type="checkbox" id="smtp-secure" checked={!!smtp.secure} onChange={e => setSmtp({...smtp, secure: e.target.checked})} style={{ accentColor: 'var(--primary)' }} />
                  <label htmlFor="smtp-secure" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>SSL/TLS (port 465)</label>
                </div>
                <div>
                  <label className="form-label">Tài khoản SMTP</label>
                  <input type="email" className="form-control" placeholder="your@gmail.com" value={smtp.auth_user} onChange={e => setSmtp({...smtp, auth_user: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Mật khẩu / App Password</label>
                  <input type="password" className="form-control" placeholder="••••••••" value={smtp.password} onChange={e => setSmtp({...smtp, password: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Tên người gửi</label>
                  <input type="text" className="form-control" placeholder="Hệ thống Lịch Trình HLV" value={smtp.from_name} onChange={e => setSmtp({...smtp, from_name: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Email gửi đi (From)</label>
                  <input type="email" className="form-control" placeholder="noreply@company.vn" value={smtp.from_email} onChange={e => setSmtp({...smtp, from_email: e.target.value})} />
                </div>
              </div>
              <div style={{ marginTop: '18px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={handleSaveSmtp} disabled={testMailStatus === 'saving'}>
                  <Save size={14} /> {testMailStatus === 'saving' ? 'Đang lưu...' : 'Lưu cấu hình SMTP'}
                </button>
                {testMailStatus === 'saved' && <span className="badge badge-success">✅ Đã lưu</span>}
              </div>
            </div>

            {/* Test email */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>🔌 Test Gửi Email</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', maxWidth: '480px' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Email nhận test</label>
                  <input type="email" className="form-control" placeholder="it@hoanlocviet.vn" value={localGlobal.mailTestRecipient || ''} onChange={e => setLocalGlobal({...localGlobal, mailTestRecipient: e.target.value})} />
                </div>
                <button className="btn btn-primary" onClick={handleTestMail} disabled={testMailStatus === 'sending'} style={{ flexShrink: 0 }}>
                  <RefreshCw size={14} className={testMailStatus === 'sending' ? 'animate-spin' : ''} />
                  {testMailStatus === 'sending' ? 'Đang gửi...' : '📤 Gửi Test'}
                </button>
              </div>
              <div style={{ marginTop: '10px' }}>
                {testMailStatus === 'success' && <span className="badge badge-success">✅ Gửi thành công!</span>}
                {testMailStatus === 'error'   && <span style={{ color: '#c5221f', fontSize: '0.85rem' }}>❌ {testMailError}</span>}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
