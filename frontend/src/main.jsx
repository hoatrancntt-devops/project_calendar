import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

/** Catch render/runtime errors so the app never shows a blank white screen. */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  handleReset = () => {
    // Clear potentially-corrupt local state and reload
    try { localStorage.clear(); } catch {}
    window.location.reload();
  };
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
          <div style={{ maxWidth: 420, width: '100%', background: 'white', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Đã xảy ra lỗi</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>Ứng dụng gặp sự cố. Thử tải lại hoặc xoá dữ liệu cục bộ.</p>
            <pre style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, textAlign: 'left', overflow: 'auto', maxHeight: 120, margin: '0 0 16px' }}>{String(this.state.error?.message || this.state.error)}</pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => window.location.reload()} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Tải lại</button>
              <button onClick={this.handleReset} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#0f766e', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Xoá dữ liệu & tải lại</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
