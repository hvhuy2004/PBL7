import { useState } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { User, Lock, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast, ToastContainer } from '../hooks/useToast';

export default function SettingsPage() {
  const { user, login, token } = useAuth();
  const { toasts, addToast } = useToast();

  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);

  const [pwd, setPwd] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profile.full_name.trim()) { addToast('Tên không được để trống', 'error'); return; }
    setProfileLoading(true);
    try {
      const { data } = await api.put('/users/me', { full_name: profile.full_name.trim() });
      // Cập nhật AuthContext + localStorage
      login(data, token);
      addToast('Cập nhật thông tin thành công', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Cập nhật thất bại', 'error');
    } finally { setProfileLoading(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    if (pwd.new_password !== pwd.confirm) { setPwdError('Mật khẩu mới không khớp'); return; }
    if (pwd.new_password.length < 6) { setPwdError('Mật khẩu mới phải ít nhất 6 ký tự'); return; }
    setPwdLoading(true);
    try {
      await api.put('/users/me/password', {
        current_password: pwd.current_password,
        new_password: pwd.new_password,
      });
      setPwd({ current_password: '', new_password: '', confirm: '' });
      addToast('Đổi mật khẩu thành công', 'success');
    } catch (err) {
      setPwdError(err.response?.data?.detail || 'Đổi mật khẩu thất bại');
    } finally { setPwdLoading(false); }
  };

  const initials = user?.full_name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Cài đặt tài khoản</div>
      </div>

      <div className="page page-wide">

        {/* Avatar + info */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 20, maxWidth: 980 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#6b7ff2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: 'white', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{user?.full_name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user?.email}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              <span style={{ background: user?.role === 'admin' ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.12)', color: user?.role === 'admin' ? 'var(--red)' : 'var(--green)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                {user?.role === 'admin' ? 'Admin' : 'User'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Thông tin cá nhân ── */}
        <div className="card" style={{ marginBottom: 20, maxWidth: 980 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 15, fontWeight: 700 }}>
            <User size={16} color="var(--accent)" /> Thông tin cá nhân
          </div>
          <form onSubmit={saveProfile}>
            <div className="form-group">
              <label className="form-label">Họ và tên</label>
              <input
                className="form-input"
                value={profile.full_name}
                onChange={(e) => setProfile({ full_name: e.target.value })}
                placeholder="Nhập tên hiển thị..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={user?.email || ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Email không thể thay đổi</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={profileLoading}>
                <Save size={14} /> {profileLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Đổi mật khẩu ── */}
        <div className="card" style={{ maxWidth: 980 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 15, fontWeight: 700 }}>
            <Lock size={16} color="var(--accent)" /> Đổi mật khẩu
          </div>
          {pwdError && (
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>
              <AlertCircle size={14} /> {pwdError}
            </div>
          )}
          <form onSubmit={changePassword}>
            <div className="form-group">
              <label className="form-label">Mật khẩu hiện tại</label>
              <input
                type="password"
                className="form-input"
                value={pwd.current_password}
                onChange={(e) => setPwd((p) => ({ ...p, current_password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mật khẩu mới</label>
              <input
                type="password"
                className="form-input"
                value={pwd.new_password}
                onChange={(e) => setPwd((p) => ({ ...p, new_password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                className="form-input"
                value={pwd.confirm}
                onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                placeholder="••••••••"
              />
              {pwd.confirm && pwd.new_password && (
                <div style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, color: pwd.confirm === pwd.new_password ? 'var(--green)' : 'var(--red)' }}>
                  <CheckCircle2 size={11} />
                  {pwd.confirm === pwd.new_password ? 'Mật khẩu khớp' : 'Mật khẩu không khớp'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={pwdLoading}>
                <Lock size={14} /> {pwdLoading ? 'Đang đổi...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
