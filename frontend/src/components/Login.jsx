import React, { useState, useEffect } from 'react';
import { Calendar, Globe, ShieldCheck, ArrowRight } from 'lucide-react';

const REMEMBER_KEY = 'calendar_remember';

export default function Login({ adminSettings, appUsers, onLogin, companies, lang, setLang, t }) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(null);

  // Load saved credentials on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
      if (saved?.username) {
        setUsernameOrEmail(saved.username);
        setPassword(saved.password || '');
        setRememberMe(true);
      }
    } catch {}
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const input = usernameOrEmail.trim();

    if (!input || !password) {
      setError(t('error_fill_all'));
      return;
    }

    const saveCredentials = (username) => {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    };

    // Admin account check
    if (input.toLowerCase() === 'sctsadmin') {
      const correctAdminPass = adminSettings?.adminPassword || 'A@q1w2e3r4t5!';
      if (password === correctAdminPass) {
        saveCredentials('sctsadmin');
        onLogin({
          email: 'admin@hoanlocviet.vn',
          username: 'sctsadmin',
          name: t('sys_admin'),
          role: 'admin',
          allowedCompanyIds: companies.map(c => c.id)
        });
        return;
      }
      setError(t('error_admin_pass'));
      return;
    }

    // Standard authorized user check
    const trimEmail = input.toLowerCase();
    const foundUser = appUsers?.find(u => u.email.toLowerCase() === trimEmail);

    if (!foundUser) { setError(t('error_unauthorized')); return; }
    if (!foundUser.allowedCompanyIds?.length) { setError(t('error_no_company')); return; }
    if (password.length < 6) { setError(t('error_short_pass')); return; }

    let role = 'assistant';
    let name = 'Cán bộ nhân viên';
    if (trimEmail.includes('tonggiamdoc') || trimEmail.includes('director') || trimEmail.includes('giamdoc')) {
      role = 'director'; name = 'Giám Đốc';
    } else if (trimEmail.includes('phogiamdoc')) {
      role = 'phogiamdoc'; name = 'Phó Giám Đốc';
    } else if (trimEmail.includes('truly')) {
      role = 'assistant'; name = 'Trợ lý';
    }

    saveCredentials(trimEmail);
    onLogin({ email: trimEmail, username: trimEmail.split('@')[0], name, role, allowedCompanyIds: foundUser.allowedCompanyIds });
  };

  const handleQuickSelect = (email, isSystemAdmin = false) => {
    setUsernameOrEmail(email);
    setPassword(isSystemAdmin ? (adminSettings?.adminPassword || 'A@q1w2e3r4t5!') : '123456');
  };

  const companyName = adminSettings?.globalCompanyName || 'Tập đoàn Hoàn Lộc Việt';

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden">

        {/* Left: Branding panel — hidden on mobile */}
        <div className="hidden sm:flex w-full md:w-1/2 bg-blue-700 p-8 md:p-12 text-white flex-col justify-center">
          {adminSettings?.globalCompanyLogo ? (
            <img src={adminSettings.globalCompanyLogo} alt="Logo" className="h-14 object-contain mb-6 opacity-90" />
          ) : (
            <Calendar size={48} className="mb-6 opacity-80" />
          )}
          <h1 className="text-3xl md:text-4xl font-bold mb-4">{companyName}</h1>
          <p className="text-blue-100 text-base md:text-lg">{t('login_title')}</p>
        </div>

        {/* Right: Login form */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-12 relative">

          {/* Mobile logo row */}
          <div className="sm:hidden flex items-center gap-3 mb-6 text-blue-700">
            <Calendar size={32} />
            <h1 className="text-2xl font-bold truncate">{companyName}</h1>
          </div>

          {/* Language switcher */}
          <button
            onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
            className="absolute top-4 right-4 flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            <Globe size={13} /> {lang === 'vi' ? 'ENG' : 'VIE'}
          </button>

          <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-1">Đăng nhập hệ thống</h2>
          <p className="text-sm text-slate-500 mb-6">Dành cho Trợ lý / Nhân viên ủy quyền</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('login_username')}</label>
              <input
                type="text"
                placeholder="sctsadmin hoặc email@company.vn"
                className="w-full px-4 py-3 md:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                value={usernameOrEmail}
                onChange={e => setUsernameOrEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('login_password')}</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-3 md:py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember-me"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                style={{ accentColor: '#2563eb' }}
              />
              <label htmlFor="remember-me" className="text-sm text-slate-600 cursor-pointer select-none">
                Ghi nhớ tài khoản
              </label>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 md:py-2.5 rounded-lg transition-colors text-sm"
            >
              {t('login_btn')} <ArrowRight size={16} />
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center py-3">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs uppercase font-medium">{t('sandbox_title')}</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Quick-select sandbox accounts */}
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={() => handleQuickSelect('sctsadmin', true)}
              className="flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors border-l-4 border-l-blue-500"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-blue-600" />
                <span className="text-sm font-semibold text-slate-800">sctsadmin</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">{t('sys_admin')}</span>
            </button>

            <button
              onClick={() => handleQuickSelect('tonggiamdoc@hoanlocviet.vn')}
              className="flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <span className="text-xs text-slate-600">tonggiamdoc@hoanlocviet.vn</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-bold">{t('view_all')}</span>
            </button>

            <button
              onClick={() => handleQuickSelect('truly@suleco.vn')}
              className="flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <span className="text-xs text-slate-600">truly@suleco.vn</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded font-bold">{t('only_suleco')}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
