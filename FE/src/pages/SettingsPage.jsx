import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Image as ImageIcon, Lock, Save, Trash2, Upload, User } from 'lucide-react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { ToastContainer, useToast } from '../hooks/useToast';
import { isSupportedAvatarUrl, resolveMediaUrl } from '../utils/media';

function buildInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}

export default function SettingsPage() {
  const { user, login, token } = useAuth();
  const { toasts, addToast } = useToast();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
    avatar_url: user?.avatar_url || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarUploadLoading, setAvatarUploadLoading] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [avatarPreviewError, setAvatarPreviewError] = useState(false);

  const [pwd, setPwd] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');

  useEffect(() => {
    setProfile({
      full_name: user?.full_name || '',
      avatar_url: user?.avatar_url || '',
    });
  }, [user?.full_name, user?.avatar_url]);

  useEffect(() => {
    setAvatarPreviewError(false);
  }, [profile.avatar_url, localPreviewUrl]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const previewUrl = useMemo(() => {
    if (localPreviewUrl) return localPreviewUrl;
    return resolveMediaUrl(profile.avatar_url);
  }, [localPreviewUrl, profile.avatar_url]);

  const initials = buildInitials(profile.full_name || user?.full_name || '');

  const resetSelectedFile = () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl('');
    setSelectedAvatarFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();

    const fullName = profile.full_name.trim();
    const avatarUrl = profile.avatar_url.trim();

    if (!fullName) {
      addToast('Ten khong duoc de trong', 'error');
      return;
    }

    if (!isSupportedAvatarUrl(avatarUrl)) {
      addToast('Avatar URL phai bat dau bang http://, https:// hoac /uploads/...', 'error');
      return;
    }

    setProfileLoading(true);
    try {
      const { data } = await api.put('/users/me', {
        full_name: fullName,
        avatar_url: avatarUrl || null,
      });
      login(data, token);
      addToast('Cap nhat thong tin thanh cong', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Cap nhat that bai', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      resetSelectedFile();
      return;
    }

    if (!file.type.startsWith('image/')) {
      addToast('Chi duoc chon file anh', 'error');
      resetSelectedFile();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast('Anh dai dien phai nho hon 5MB', 'error');
      resetSelectedFile();
      return;
    }

    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    setSelectedAvatarFile(file);
    setLocalPreviewUrl(URL.createObjectURL(file));
  };

  const uploadAvatarFile = async () => {
    if (!selectedAvatarFile) {
      addToast('Ban chua chon file anh', 'error');
      return;
    }

    setAvatarUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedAvatarFile);

      const { data } = await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      login(data, token);
      setProfile((prev) => ({ ...prev, avatar_url: data.avatar_url || '' }));
      resetSelectedFile();
      addToast('Tai avatar thanh cong', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Tai avatar that bai', 'error');
    } finally {
      setAvatarUploadLoading(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwdError('');

    if (pwd.new_password !== pwd.confirm) {
      setPwdError('Mat khau moi khong khop');
      return;
    }
    if (pwd.new_password.length < 6) {
      setPwdError('Mat khau moi phai it nhat 6 ky tu');
      return;
    }

    setPwdLoading(true);
    try {
      await api.put('/users/me/password', {
        current_password: pwd.current_password,
        new_password: pwd.new_password,
      });
      setPwd({ current_password: '', new_password: '', confirm: '' });
      addToast('Doi mat khau thanh cong', 'success');
    } catch (err) {
      setPwdError(err.response?.data?.detail || 'Doi mat khau that bai');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Cai dat tai khoan</div>
      </div>

      <div className="page page-wide">
        <div className="card settings-profile-card">
          <div className="settings-avatar-wrap">
            {previewUrl && !avatarPreviewError ? (
              <img
                src={previewUrl}
                alt={profile.full_name || user?.full_name || 'Avatar'}
                className="settings-avatar settings-avatar-image"
                onError={() => setAvatarPreviewError(true)}
              />
            ) : (
              <div className="settings-avatar settings-avatar-fallback">
                {initials}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{profile.full_name || user?.full_name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user?.email}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              <span
                style={{
                  background: user?.role === 'admin' ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.12)',
                  color: user?.role === 'admin' ? 'var(--red)' : 'var(--green)',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontWeight: 600,
                }}
              >
                {user?.role === 'admin' ? 'Admin' : 'User'}
              </span>
            </div>
          </div>
        </div>

        <div className="card settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 15, fontWeight: 700 }}>
            <User size={16} color="var(--accent)" /> Thong tin ca nhan
          </div>

          <form onSubmit={saveProfile}>
            <div className="settings-profile-grid">
              <div>
                <div className="form-group">
                  <label className="form-label">Ho va ten</label>
                  <input
                    className="form-input"
                    value={profile.full_name}
                    onChange={(e) => setProfile((prev) => ({ ...prev, full_name: e.target.value }))}
                    placeholder="Nhap ten hien thi..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    className="form-input"
                    value={user?.email || ''}
                    disabled
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Email khong the thay doi
                  </div>
                </div>
              </div>

              <div>
                <div className="form-group">
                  <label className="form-label">Anh dai dien (Upload file)</label>
                  <div className="settings-avatar-upload-row">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="form-input"
                      onChange={handleAvatarFileChange}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={uploadAvatarFile}
                      disabled={avatarUploadLoading || !selectedAvatarFile}
                    >
                      <Upload size={14} />
                      {avatarUploadLoading ? 'Dang tai...' : 'Tai avatar'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Ho tro JPG, PNG, WEBP, GIF. Kich thuoc toi da 5MB.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Hoac dung link avatar</label>
                  <input
                    className="form-input"
                    value={profile.avatar_url}
                    onChange={(e) => setProfile((prev) => ({ ...prev, avatar_url: e.target.value }))}
                    placeholder="https://example.com/avatar.jpg"
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Ban van co the dan mot link anh cong khai neu muon.
                  </div>
                </div>

                <div className="settings-avatar-preview-box">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
                    <ImageIcon size={14} color="var(--accent)" />
                    Xem truoc avatar
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {previewUrl && !avatarPreviewError ? (
                      <img
                        src={previewUrl}
                        alt="Xem truoc avatar"
                        className="settings-avatar settings-avatar-image"
                        onError={() => setAvatarPreviewError(true)}
                      />
                    ) : (
                      <div className="settings-avatar settings-avatar-fallback">
                        {initials}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                        {profile.full_name || 'Ten hien thi cua ban'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {previewUrl && !avatarPreviewError
                          ? 'Avatar se hien o thanh ben, dashboard va tin nhan.'
                          : previewUrl && avatarPreviewError
                            ? 'Khong tai duoc anh nay, he thong se dung chu cai dai dien.'
                            : 'Hien chua co anh, he thong dang dung chu cai dai dien.'}
                      </div>
                    </div>
                  </div>

                  {(profile.avatar_url || selectedAvatarFile) && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          resetSelectedFile();
                          setProfile((prev) => ({ ...prev, avatar_url: '' }));
                        }}
                      >
                        <Trash2 size={13} />
                        Xoa avatar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={profileLoading}>
                <Save size={14} /> {profileLoading ? 'Dang luu...' : 'Luu thay doi'}
              </button>
            </div>
          </form>
        </div>

        <div className="card settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 15, fontWeight: 700 }}>
            <Lock size={16} color="var(--accent)" /> Doi mat khau
          </div>
          {pwdError && (
            <div
              style={{
                display: 'flex',
                gap: 7,
                alignItems: 'center',
                background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.3)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                color: 'var(--red)',
                marginBottom: 12,
              }}
            >
              <AlertCircle size={14} /> {pwdError}
            </div>
          )}
          <form onSubmit={changePassword}>
            <div className="form-group">
              <label className="form-label">Mat khau hien tai</label>
              <input
                type="password"
                className="form-input"
                value={pwd.current_password}
                onChange={(e) => setPwd((prev) => ({ ...prev, current_password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mat khau moi</label>
              <input
                type="password"
                className="form-input"
                value={pwd.new_password}
                onChange={(e) => setPwd((prev) => ({ ...prev, new_password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Xac nhan mat khau moi</label>
              <input
                type="password"
                className="form-input"
                value={pwd.confirm}
                onChange={(e) => setPwd((prev) => ({ ...prev, confirm: e.target.value }))}
                placeholder="••••••••"
              />
              {pwd.confirm && pwd.new_password && (
                <div
                  style={{
                    fontSize: 11,
                    marginTop: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: pwd.confirm === pwd.new_password ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  <CheckCircle2 size={11} />
                  {pwd.confirm === pwd.new_password ? 'Mat khau khop' : 'Mat khau khong khop'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={pwdLoading}>
                <Lock size={14} /> {pwdLoading ? 'Dang doi...' : 'Doi mat khau'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
