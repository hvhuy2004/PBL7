/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import api from '../api';
import { BellOff, CheckCheck, Clock, ExternalLink, Info, UserCheck, MessageSquare, AtSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function getNotifIcon(title = '') {
  if (title.includes('bình luận') || title.includes('Bình luận')) return <MessageSquare size={16} color="var(--accent)" />;
  if (title.includes('nhắc') || title.includes('@')) return <AtSign size={16} color="var(--purple)" />;
  if (title.includes('giao')) return <UserCheck size={16} color="var(--green)" />;
  return <Info size={16} color="var(--text-muted)" />;
}

function groupByDate(notifications) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const groups = { today: [], yesterday: [], older: [] };
  notifications.forEach(n => {
    const d = new Date(n.created_at);
    d.setHours(0, 0, 0, 0);
    if (d >= today) groups.today.push(n);
    else if (d >= yesterday) groups.yesterday.push(n);
    else groups.older.push(n);
  });
  return groups;
}

function NotifGroup({ label, items, onRead, onNavigate }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(n => (
          <div
            key={n.id}
            onClick={() => onNavigate(n)}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '13px 16px',
              background: n.is_read ? 'var(--bg-card)' : 'rgba(79,142,247,0.06)',
              border: `1px solid ${n.is_read ? 'var(--border)' : 'rgba(79,142,247,0.25)'}`,
              borderRadius: 10,
              cursor: n.link_url || !n.is_read ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--bg-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {getNotifIcon(n.title)}
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: n.is_read ? 500 : 700, marginBottom: 3 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.4 }}>{n.content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                <Clock size={10} />
                {new Date(n.created_at).toLocaleString('vi-VN')}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              )}
              {!n.is_read && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); onRead(n.id); }}
                  title="Đánh dấu đã đọc"
                >
                  <CheckCheck size={12} />
                </button>
              )}
              {n.link_url && (
                <ExternalLink size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/notifications/')
      .then((r) => setNotifications(r.data || []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markAllRead = async () => {
    await api.put('/notifications/mark_all_read');
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleClick = async (n) => {
    if (!n.is_read) await markRead(n.id);
    if (n.link_url) navigate(n.link_url);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const groups = groupByDate(notifications);

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          Thông báo
          {unreadCount > 0 && (
            <span style={{
              marginLeft: 8, background: 'var(--accent)', color: 'white',
              fontSize: 11, fontWeight: 700, padding: '2px 7px',
              borderRadius: 10, verticalAlign: 'middle',
            }}>
              {unreadCount} mới
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
            <CheckCheck size={14} /> Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      <div className="page">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : notifications.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
              <BellOff size={52} strokeWidth={1.2} />
            </div>
            <h3>Không có thông báo</h3>
            <p>Bạn chưa có thông báo nào</p>
          </div>
        ) : (
          <div style={{ maxWidth: 720 }}>
            <NotifGroup label="Hôm nay"    items={groups.today}     onRead={markRead} onNavigate={handleClick} />
            <NotifGroup label="Hôm qua"    items={groups.yesterday} onRead={markRead} onNavigate={handleClick} />
            <NotifGroup label="Cũ hơn"     items={groups.older}     onRead={markRead} onNavigate={handleClick} />
          </div>
        )}
      </div>
    </>
  );
}
