/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, FolderKanban, CheckSquare,
  Bell, Settings, LogOut, Users, Layers, CalendarDays,
} from 'lucide-react';
import api from '../api';

function SidebarLogo() {
  return (
    <div style={{
      width: 32, height: 32,
      background: 'linear-gradient(135deg, #4f8ef7, #a78bfa)',
      borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 14px rgba(79,142,247,0.4)',
      flexShrink: 0,
    }}>
      <Layers size={17} color="white" strokeWidth={2} />
    </div>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll unread notification count
  useEffect(() => {
    const fetchUnread = () => {
      api.get('/notifications/')
        .then((r) => setUnreadCount((r.data || []).filter((n) => !n.is_read).length))
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000); // refresh mỗi 30 giây
    return () => clearInterval(interval);
  }, []);

  // Reset badge khi vào trang notifications
  useEffect(() => {
    if (location.pathname === '/notifications') setUnreadCount(0);
  }, [location.pathname]);

  const navItems = [
    {
      id: 'dash',
      icon: LayoutDashboard,
      label: 'Tổng quan',
      to: { pathname: '/' },
      match: (loc) => loc.pathname === '/',
    },
    {
      id: 'projects',
      icon: FolderKanban,
      label: 'Dự án',
      to: { pathname: '/projects' },
      match: (loc) => loc.pathname.startsWith('/projects'),
    },
    {
      id: 'tasks',
      icon: CheckSquare,
      label: 'Việc của tôi',
      to: { pathname: '/tasks' },
      match: (loc) =>
        loc.pathname === '/tasks' &&
        new URLSearchParams(loc.search).get('view') !== 'calendar',
    },
    {
      id: 'tasks-cal',
      icon: CalendarDays,
      label: 'Lịch',
      to: { pathname: '/tasks', search: '?view=calendar' },
      match: (loc) =>
        loc.pathname === '/tasks' &&
        new URLSearchParams(loc.search).get('view') === 'calendar',
    },
    {
      id: 'members',
      icon: Users,
      label: 'Thành viên',
      to: { pathname: '/members' },
      match: (loc) => loc.pathname.startsWith('/members'),
    },
  ];

  const initials = user?.full_name
    ?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <SidebarLogo />
        <div>
          <div className="logo-text">AgileAI</div>
          <div className="logo-sub">Work smarter</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Menu</div>
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${item.match(location) ? 'active' : ''}`}
            onClick={() => navigate(item.to)}
          >
            <item.icon className="nav-icon" size={18} />
            <span>{item.label}</span>
          </div>
        ))}

        <div className="nav-section-label">Cài đặt</div>

        <div
          className={`nav-item ${location.pathname.startsWith('/notifications') ? 'active' : ''}`}
          onClick={() => navigate('/notifications')}
        >
          <Bell className="nav-icon" size={18} />
          <span>Thông báo</span>
          {unreadCount > 0 && (
            <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </div>

        <div
          className={`nav-item ${location.pathname.startsWith('/settings') ? 'active' : ''}`}
          onClick={() => navigate('/settings')}
        >
          <Settings className="nav-icon" size={18} />
          <span>Cài đặt</span>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="user-card" onClick={handleLogout} title="Đăng xuất">
          <div className="avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{user?.full_name || 'User'}</div>
            <div className="user-role">{user?.role || 'member'}</div>
          </div>
          <LogOut size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  );
}
