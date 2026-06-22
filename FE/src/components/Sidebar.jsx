/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, FolderKanban, CheckSquare,
  Bell, Settings, LogOut, Users, Layers, CalendarDays,
  BarChart3, History, Tags, Archive, MessageSquare, ShieldCheck,
  Star,
} from 'lucide-react';
import api from '../api';
import { resolveMediaUrl } from '../utils/media';

function SidebarLogo() {
  return (
    <div style={{
      width: 32, height: 32,
      background: '#4f8ef7',
      borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: 'none',
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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userNavItems = [
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
      id: 'reports',
      icon: BarChart3,
      label: 'Báo cáo',
      to: { pathname: '/reports' },
      match: (loc) => loc.pathname.startsWith('/reports'),
    },
    {
      id: 'activity',
      icon: History,
      label: 'Hoạt động',
      to: { pathname: '/activity' },
      match: (loc) => loc.pathname.startsWith('/activity'),
    },
    {
      id: 'messages',
      icon: MessageSquare,
      label: 'Trao đổi',
      to: { pathname: '/messages' },
      match: (loc) => loc.pathname.startsWith('/messages'),
    },
    {
      id: 'tags',
      icon: Tags,
      label: 'Nhãn',
      to: { pathname: '/tags' },
      match: (loc) => loc.pathname.startsWith('/tags'),
    },
    {
      id: 'members',
      icon: Users,
      label: 'Thành viên',
      to: { pathname: '/members' },
      match: (loc) => loc.pathname.startsWith('/members'),
    },
  ];

  const navItems = user?.role === 'admin'
    ? [{
      id: 'admin',
      icon: ShieldCheck,
      label: 'Quản trị',
      to: { pathname: '/admin' },
      match: (loc) => loc.pathname.startsWith('/admin'),
    }]
    : userNavItems;

  const initials = user?.full_name
    ?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const avatarUrl = resolveMediaUrl(user?.avatar_url);

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

        {user?.role !== 'admin' && (
          <>
            <div className="nav-section-label">Dữ liệu</div>

            <div
              className={`nav-item ${location.pathname.startsWith('/bookmarks') ? 'active' : ''}`}
              onClick={() => navigate('/bookmarks')}
            >
              <Star className="nav-icon" size={18} />
              <span>Đánh dấu</span>
            </div>

            <div
              className={`nav-item ${location.pathname.startsWith('/archive') ? 'active' : ''}`}
              onClick={() => navigate('/archive')}
            >
              <Archive className="nav-icon" size={18} />
              <span>Lưu trữ</span>
            </div>

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
          </>
        )}
      </nav>

      <div className="sidebar-footer" ref={menuRef}>
        {showUserMenu && (
          <div className="user-popover">
            <div className="popover-item" onClick={() => { navigate('/settings'); setShowUserMenu(false); }}>
              <Settings size={16} /> Cài đặt tài khoản
            </div>
            <div className="popover-item danger" onClick={handleLogout}>
              <LogOut size={16} /> Đăng xuất
            </div>
          </div>
        )}
        <div className="user-card" onClick={() => setShowUserMenu(!showUserMenu)}>
          {avatarUrl ? (
            <img className="avatar avatar-image" src={avatarUrl} alt={user?.full_name || 'User'} />
          ) : (
            <div className="avatar">{initials}</div>
          )}
          <div className="user-info">
            <div className="user-name">{user?.full_name || 'User'}</div>
            <div className="user-role">{user?.role || 'member'}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
