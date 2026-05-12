import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import {
  Eye, EyeOff, Mail, Lock, User,
  Sparkles, LayoutDashboard, Users, BarChart3, AlertCircle, CheckCircle
} from 'lucide-react';

// Logo SVG đơn giản, không dùng emoji
function LogoIcon({ size = 36 }) {
  return (
    <div style={{
      width: size, height: size,
      background: 'linear-gradient(135deg, #4f8ef7, #a78bfa)',
      borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 20px rgba(79,142,247,0.35)',
      flexShrink: 0,
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" fillOpacity="0.9" />
        <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
        <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

const FEATURES = [
  {
    icon: Sparkles,
    label: 'AI tự động phân loại và gợi ý task thông minh',
    color: '#4f8ef7',
  },
  {
    icon: LayoutDashboard,
    label: 'Kanban board trực quan, dễ dàng kéo thả',
    color: '#a78bfa',
  },
  {
    icon: Users,
    label: 'Cộng tác nhóm và phân quyền linh hoạt',
    color: '#3fb950',
  },
  {
    icon: BarChart3,
    label: 'Báo cáo tiến độ và phân tích hiệu suất',
    color: '#f0883e',
  },
];

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccessMsg('');
    try {
      const fd = new FormData();
      fd.append('username', form.email);
      fd.append('password', form.password);
      const { data } = await api.post('/auth/login', fd);
      const token = data.access_token;
      const userRes = await api.get('/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      login(userRes.data, token);
      navigate('/');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        detail === 'Invalid credentials'
          ? 'Email hoặc mật khẩu không đúng'
          : detail || 'Đăng nhập thất bại, vui lòng thử lại'
      );
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccessMsg('');
    try {
      await api.post('/auth/register', {
        email: form.email,
        password: form.password,
        full_name: form.full_name,
      });
      setSuccessMsg('Đăng ký thành công! Bạn có thể đăng nhập ngay.');
      setMode('login');
      setForm(p => ({ ...p, password: '', full_name: '' }));
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        detail === 'Email already registered'
          ? 'Email này đã được đăng ký'
          : detail || 'Đăng ký thất bại'
      );
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />

      {/* ── Left hero ── */}
      <div className="auth-left">
        <div className="auth-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <LogoIcon size={44} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>AgileAI</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Work management platform</div>
            </div>
          </div>

          <h1>Quản lý dự án<br />với <span>sức mạnh AI</span></h1>
          <p>
            Hệ thống quản lý tiến độ công việc thông minh, tích hợp AI
            giúp bạn phân loại task, dự đoán ưu tiên và tối ưu quy trình làm việc.
          </p>

          <div className="auth-features">
            {FEATURES.map(({ icon: Icon, label, color }) => (
              <div className="auth-feature" key={label}>
                <div className="auth-feature-icon" style={{ borderColor: `${color}33` }}>
                  <Icon size={17} color={color} strokeWidth={2} />
                </div>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form ── */}
      <div className="auth-right">
        <div className="auth-form-box">
          {/* Logo */}
          <div className="auth-form-logo">
            <LogoIcon size={40} />
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>AgileAI</div>
          </div>

          <div className="auth-form-title">
            {mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}
          </div>
          <div className="auth-form-subtitle">
            {mode === 'login'
              ? 'Đăng nhập để tiếp tục quản lý dự án của bạn'
              : 'Bắt đầu quản lý công việc thông minh hơn'}
          </div>

          {/* Error banner */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13,
              color: 'var(--red)', marginBottom: 16,
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Success banner */}
          {successMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13,
              color: 'var(--green)', marginBottom: 16,
            }}>
              <CheckCircle size={15} style={{ flexShrink: 0 }} />
              {successMsg}
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label">Họ và tên</label>
                <div style={{ position: 'relative' }}>
                  <User size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="full_name" name="full_name" className="form-input"
                    style={{ paddingLeft: 36 }}
                    placeholder="Nguyễn Văn A"
                    value={form.full_name}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  id="email" name="email" type="email" className="form-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Mật khẩu</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  id="password" name="password"
                  type={showPass ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: 36, paddingRight: 40 }}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                    padding: 4, display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              id={mode === 'login' ? 'btn-login' : 'btn-register'}
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 14, marginTop: 4 }}
              disabled={loading}
            >
              {loading
                ? <span style={{ opacity: 0.7 }}>Đang xử lý...</span>
                : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                Chưa có tài khoản?{' '}
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
                >
                  Đăng ký ngay
                </button>
              </>
            ) : (
              <>
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                >
                  Đăng nhập
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
