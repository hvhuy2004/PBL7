import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Image as ImageIcon, Lock, Save, Trash2, Upload, User } from 'lucide-react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { ToastContainer, useToast } from '../hooks/useToast';
import { isSupportedAvatarUrl, resolveMediaUrl } from '../utils/media';

const TEXT = {
  pageTitle: '\u0043\u00e0\u0069 \u0111\u1eb7\u0074 \u0074\u00e0\u0069 \u006b\u0068\u006f\u1ea3\u006e',
  emptyName: '\u0054\u00ea\u006e \u006b\u0068\u00f4\u006e\u0067 \u0111\u01b0\u1ee3\u0063 \u0111\u1ec3 \u0074\u0072\u1ed1\u006e\u0067',
  invalidAvatarUrl: '\u0041\u0076\u0061\u0074\u0061\u0072 \u0055\u0052\u004c \u0070\u0068\u1ea3\u0069 \u0062\u1ea5\u0074 \u0111\u1ea7\u0075 \u0062\u1eb1\u006e\u0067 \u0068\u0074\u0074\u0070\u003a\u002f\u002f\u002c \u0068\u0074\u0074\u0070\u0073\u003a\u002f\u002f \u0068\u006f\u1eb7\u0063 \u002f\u0075\u0070\u006c\u006f\u0061\u0064\u0073\u002f\u002e\u002e\u002e',
  profileUpdated: '\u0043\u1ead\u0070 \u006e\u0068\u1ead\u0074 \u0074\u0068\u00f4\u006e\u0067 \u0074\u0069\u006e \u0074\u0068\u00e0\u006e\u0068 \u0063\u00f4\u006e\u0067',
  profileFailed: '\u0043\u1ead\u0070 \u006e\u0068\u1ead\u0074 \u0074\u0068\u1ea5\u0074 \u0062\u1ea1\u0069',
  imageOnly: '\u0043\u0068\u1ec9 \u0111\u01b0\u1ee3\u0063 \u0063\u0068\u1ecdn \u0066\u0069\u006c\u0065 \u1ea3\u006e\u0068',
  imageTooLarge: '\u1ea2\u006e\u0068 \u0111\u1ea1\u0069 \u0064\u0069\u1ec7\u006e \u0070\u0068\u1ea3\u0069 \u006e\u0068\u1ecf \u0068\u01a1\u006e \u0035\u004d\u0042',
  noFileSelected: '\u0042\u1ea1\u006e \u0063\u0068\u01b0\u0061 \u0063\u0068\u1ecdn \u0066\u0069\u006c\u0065 \u1ea3\u006e\u0068',
  uploadSuccess: '\u0054\u1ea3\u0069 \u0061\u0076\u0061\u0074\u0061\u0072 \u0074\u0068\u00e0\u006e\u0068 \u0063\u00f4\u006e\u0067',
  uploadFailed: '\u0054\u1ea3\u0069 \u0061\u0076\u0061\u0074\u0061\u0072 \u0074\u0068\u1ea5\u0074 \u0062\u1ea1\u0069',
  passwordMismatch: '\u004d\u1ead\u0074 \u006b\u0068\u1ea9\u0075 \u006d\u1edb\u0069 \u006b\u0068\u00f4\u006e\u0067 \u006b\u0068\u1edb\u0070',
  passwordTooShort: '\u004d\u1ead\u0074 \u006b\u0068\u1ea9\u0075 \u006d\u1edb\u0069 \u0070\u0068\u1ea3\u0069 \u00ed\u0074 \u006e\u0068\u1ea5\u0074 \u0036 \u006b\u00fd \u0074\u1ef1',
  passwordChanged: '\u0110\u1ed5\u0069 \u006d\u1ead\u0074 \u006b\u0068\u1ea9\u0075 \u0074\u0068\u00e0\u006e\u0068 \u0063\u00f4\u006e\u0067',
  passwordFailed: '\u0110\u1ed5\u0069 \u006d\u1ead\u0074 \u006b\u0068\u1ea9\u0075 \u0074\u0068\u1ea5\u0074 \u0062\u1ea1\u0069',
  personalInfo: '\u0054\u0068\u00f4\u006e\u0067 \u0074\u0069\u006e \u0063\u00e1 \u006e\u0068\u00e2\u006e',
  fullName: '\u0048\u1ecd \u0076\u00e0 \u0074\u00ea\u006e',
  fullNamePlaceholder: '\u004e\u0068\u1ead\u0070 \u0074\u00ea\u006e \u0068\u0069\u1ec3\u006e \u0074\u0068\u1ecb\u002e\u002e\u002e',
  email: 'Email',
  emailReadonly: 'Email kh\u00f4ng th\u1ec3 thay \u0111\u1ed5i',
  avatarUpload: '\u1ea2\u006e\u0068 \u0111\u1ea1\u0069 \u0064\u0069\u1ec7\u006e (Upload file)',
  uploading: '\u0110\u0061\u006e\u0067 \u0074\u1ea3\u0069\u002e\u002e\u002e',
  uploadAvatar: '\u0054\u1ea3\u0069 \u0061\u0076\u0061\u0074\u0061\u0072',
  uploadHint: '\u0048\u1ed7 \u0074\u0072\u1ee3 JPG, PNG, WEBP, GIF. K\u00edch th\u01b0\u1edbc t\u1ed1i \u0111a 5MB.',
  avatarLink: 'Ho\u1eb7c d\u00f9ng link avatar',
  avatarLinkHint: 'B\u1ea1n v\u1eabn c\u00f3 th\u1ec3 d\u00e1n m\u1ed9t link \u1ea3nh c\u00f4ng khai n\u1ebfu mu\u1ed1n.',
  previewAvatar: 'Xem tr\u01b0\u1edbc avatar',
  displayNameFallback: 'T\u00ean hi\u1ec3n th\u1ecb c\u1ee7a b\u1ea1n',
  previewUsingAvatar: 'Avatar s\u1ebd hi\u1ec7n \u1edf thanh b\u00ean, dashboard v\u00e0 tin nh\u1eafn.',
  previewAvatarError: 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c \u1ea3nh n\u00e0y, h\u1ec7 th\u1ed1ng s\u1ebd d\u00f9ng ch\u1eef c\u00e1i \u0111\u1ea1i di\u1ec7n.',
  previewNoAvatar: 'Hi\u1ec7n ch\u01b0a c\u00f3 \u1ea3nh, h\u1ec7 th\u1ed1ng \u0111ang d\u00f9ng ch\u1eef c\u00e1i \u0111\u1ea1i di\u1ec7n.',
  removeAvatar: 'X\u00f3a avatar',
  saving: '\u0110\u0061\u006e\u0067 \u006c\u01b0\u0075\u002e\u002e\u002e',
  saveChanges: 'L\u01b0u thay \u0111\u1ed5i',
  changePassword: '\u0110\u1ed5\u0069 \u006d\u1ead\u0074 \u006b\u0068\u1ea9\u0075',
  currentPassword: 'M\u1eadt kh\u1ea9u hi\u1ec7n t\u1ea1i',
  newPassword: 'M\u1eadt kh\u1ea9u m\u1edbi',
  confirmPassword: 'X\u00e1c nh\u1eadn m\u1eadt kh\u1ea9u m\u1edbi',
  currentPasswordPlaceholder: 'Nh\u1eadp m\u1eadt kh\u1ea9u hi\u1ec7n t\u1ea1i',
  newPasswordPlaceholder: 'Nh\u1eadp m\u1eadt kh\u1ea9u m\u1edbi',
  confirmPasswordPlaceholder: 'Nh\u1eadp l\u1ea1i m\u1eadt kh\u1ea9u m\u1edbi',
  passwordMatch: 'M\u1eadt kh\u1ea9u kh\u1edbp',
  passwordNoMatch: 'M\u1eadt kh\u1ea9u kh\u00f4ng kh\u1edbp',
  changing: '\u0110\u0061\u006e\u0067 \u0111\u1ed5\u0069\u002e\u002e\u002e',
  userRole: 'User',
  adminRole: 'Admin',
};

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

  useEffect(() => () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
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
      addToast(TEXT.emptyName, 'error');
      return;
    }

    if (!isSupportedAvatarUrl(avatarUrl)) {
      addToast(TEXT.invalidAvatarUrl, 'error');
      return;
    }

    setProfileLoading(true);
    try {
      const { data } = await api.put('/users/me', {
        full_name: fullName,
        avatar_url: avatarUrl || null,
      });
      login(data, token);
      addToast(TEXT.profileUpdated, 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || TEXT.profileFailed, 'error');
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
      addToast(TEXT.imageOnly, 'error');
      resetSelectedFile();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast(TEXT.imageTooLarge, 'error');
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
      addToast(TEXT.noFileSelected, 'error');
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
      addToast(TEXT.uploadSuccess, 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || TEXT.uploadFailed, 'error');
    } finally {
      setAvatarUploadLoading(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwdError('');

    if (pwd.new_password !== pwd.confirm) {
      setPwdError(TEXT.passwordMismatch);
      return;
    }
    if (pwd.new_password.length < 6) {
      setPwdError(TEXT.passwordTooShort);
      return;
    }

    setPwdLoading(true);
    try {
      await api.put('/users/me/password', {
        current_password: pwd.current_password,
        new_password: pwd.new_password,
      });
      setPwd({ current_password: '', new_password: '', confirm: '' });
      addToast(TEXT.passwordChanged, 'success');
    } catch (err) {
      setPwdError(err.response?.data?.detail || TEXT.passwordFailed);
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">{TEXT.pageTitle}</div>
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
                {user?.role === 'admin' ? TEXT.adminRole : TEXT.userRole}
              </span>
            </div>
          </div>
        </div>

        <div className="card settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 15, fontWeight: 700 }}>
            <User size={16} color="var(--accent)" /> {TEXT.personalInfo}
          </div>

          <form onSubmit={saveProfile}>
            <div className="settings-profile-grid">
              <div>
                <div className="form-group">
                  <label className="form-label">{TEXT.fullName}</label>
                  <input
                    className="form-input"
                    value={profile.full_name}
                    onChange={(e) => setProfile((prev) => ({ ...prev, full_name: e.target.value }))}
                    placeholder={TEXT.fullNamePlaceholder}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{TEXT.email}</label>
                  <input
                    className="form-input"
                    value={user?.email || ''}
                    disabled
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {TEXT.emailReadonly}
                  </div>
                </div>
              </div>

              <div>
                <div className="form-group">
                  <label className="form-label">{TEXT.avatarUpload}</label>
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
                      {avatarUploadLoading ? TEXT.uploading : TEXT.uploadAvatar}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {TEXT.uploadHint}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{TEXT.avatarLink}</label>
                  <input
                    className="form-input"
                    value={profile.avatar_url}
                    onChange={(e) => setProfile((prev) => ({ ...prev, avatar_url: e.target.value }))}
                    placeholder="https://example.com/avatar.jpg"
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {TEXT.avatarLinkHint}
                  </div>
                </div>

                <div className="settings-avatar-preview-box">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
                    <ImageIcon size={14} color="var(--accent)" />
                    {TEXT.previewAvatar}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {previewUrl && !avatarPreviewError ? (
                      <img
                        src={previewUrl}
                        alt={TEXT.previewAvatar}
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
                        {profile.full_name || TEXT.displayNameFallback}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {previewUrl && !avatarPreviewError
                          ? TEXT.previewUsingAvatar
                          : previewUrl && avatarPreviewError
                            ? TEXT.previewAvatarError
                            : TEXT.previewNoAvatar}
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
                        {TEXT.removeAvatar}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={profileLoading}>
                <Save size={14} /> {profileLoading ? TEXT.saving : TEXT.saveChanges}
              </button>
            </div>
          </form>
        </div>

        <div className="card settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 15, fontWeight: 700 }}>
            <Lock size={16} color="var(--accent)" /> {TEXT.changePassword}
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
              <label className="form-label">{TEXT.currentPassword}</label>
              <input
                type="password"
                className="form-input"
                value={pwd.current_password}
                onChange={(e) => setPwd((prev) => ({ ...prev, current_password: e.target.value }))}
                placeholder={TEXT.currentPasswordPlaceholder}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{TEXT.newPassword}</label>
              <input
                type="password"
                className="form-input"
                value={pwd.new_password}
                onChange={(e) => setPwd((prev) => ({ ...prev, new_password: e.target.value }))}
                placeholder={TEXT.newPasswordPlaceholder}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{TEXT.confirmPassword}</label>
              <input
                type="password"
                className="form-input"
                value={pwd.confirm}
                onChange={(e) => setPwd((prev) => ({ ...prev, confirm: e.target.value }))}
                placeholder={TEXT.confirmPasswordPlaceholder}
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
                  {pwd.confirm === pwd.new_password ? TEXT.passwordMatch : TEXT.passwordNoMatch}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={pwdLoading}>
                <Lock size={14} /> {pwdLoading ? TEXT.changing : TEXT.changePassword}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
