import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { LOGIN_SCOPES } from '../lib/msal-config';

/** Microsoft 365 login button using MSAL popup flow. Must be inside MsalProvider. */
export default function MsalAuthButton({ onSuccess, onError }) {
  const { instance } = useMsal();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await instance.loginPopup({ scopes: LOGIN_SCOPES });
      const email = result.account.username.toLowerCase();
      onSuccess({
        email,
        name: result.account.name || email.split('@')[0],
        account: result.account,
        accessToken: result.accessToken,
      });
    } catch (err) {
      if (err.errorCode !== 'user_cancelled') {
        onError(err.message || 'Đăng nhập Microsoft thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-3 md:py-2.5 rounded-lg transition-colors border border-slate-300 flex items-center justify-center gap-2 text-base md:text-sm disabled:opacity-60"
    >
      {/* Microsoft logo squares */}
      <svg width="18" height="18" viewBox="0 0 21 21" fill="none" className="flex-shrink-0">
        <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
        <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
        <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
        <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
      </svg>
      {loading ? 'Đang xác thực...' : 'Đăng nhập bằng Microsoft 365'}
    </button>
  );
}
