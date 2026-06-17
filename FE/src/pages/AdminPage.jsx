/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, Users, FolderKanban, CheckSquare, MessageSquare,
  RefreshCw, AlertTriangle, BriefcaseBusiness, Cpu,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('vi-VN');
}

function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  return (
    <div className="ops-metric">
      <div className={`ops-metric-icon admin-tone-${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="ops-metric-value">{value ?? 0}</div>
        <div className="ops-metric-label">{label}</div>
        {sub && <div className="ops-row-sub">{sub}</div>}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  return (
    <span className={`ops-pill ${role === 'admin' ? 'red' : 'blue'}`}>
      {role === 'admin' ? 'Admin' : 'User'}
    </span>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, aiUsageRes, usersRes, projectsRes] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/ai-usage'),
        api.get('/admin/users'),
        api.get('/admin/projects'),
      ]);
      setDashboard(dashRes.data || {});
      setAiUsage(aiUsageRes.data || {});
      setUsers(usersRes.data || []);
      setProjects(projectsRes.data || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Không tải được dữ liệu quản trị');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const changeRole = async (targetUser, role) => {
    if (!targetUser || targetUser.role === role) return;
    setUpdatingUserId(targetUser.id);
    setError('');
    try {
      await api.put(`/admin/users/${targetUser.id}/role?role=${role}`);
      setUsers((prev) => prev.map((item) => (
        item.id === targetUser.id ? { ...item, role } : item
      )));
      setDashboard((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          users_by_role: { ...(prev.users_by_role || {}) },
        };
        next.users_by_role[targetUser.role] = Math.max(0, (next.users_by_role[targetUser.role] || 0) - 1);
        next.users_by_role[role] = (next.users_by_role[role] || 0) + 1;
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Không cập nhật được quyền người dùng');
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <>
        <div className="topbar">
          <div>
            <div className="topbar-title">Quản trị hệ thống</div>
            <div className="topbar-subtitle">Chỉ tài khoản admin mới truy cập được khu vực này</div>
          </div>
        </div>
        <div className="ops-page">
          <div className="ops-empty">
            <AlertTriangle size={42} />
            <h3>Không có quyền quản trị</h3>
            <p>Tài khoản hiện tại là {user?.role || 'user'}, không phải admin hệ thống.</p>
          </div>
        </div>
      </>
    );
  }

  const roleCounts = dashboard?.users_by_role || {};
  const activeProjects = dashboard?.active_projects || 0;
  const archivedProjects = dashboard?.archived_projects || 0;
  const aiLimit = aiUsage?.daily_limit || 0;
  const aiRequestsToday = aiUsage?.requests_today || 0;
  const aiPercent = aiLimit ? Math.min(100, Math.round((aiRequestsToday / aiLimit) * 100)) : 0;
  const aiModels = (aiUsage?.providers || []).flatMap((provider) => (
    (provider.models || []).map((model) => ({ ...model, provider: provider.provider }))
  ));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Quản trị hệ thống</div>
          <div className="topbar-subtitle">Theo dõi user, project và dữ liệu vận hành toàn hệ thống</div>
        </div>
        <button className="btn btn-ghost" type="button" onClick={loadData} disabled={loading}>
          <RefreshCw size={15} /> Làm mới
        </button>
      </div>

      <div className="ops-page">
        {error && <div className="messages-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="ops-grid">
          <StatCard icon={Users} label="Người dùng" value={dashboard?.total_users} sub={`Admin ${roleCounts.admin || 0} · User ${roleCounts.user || 0}`} />
          <StatCard icon={FolderKanban} label="Dự án" value={dashboard?.total_projects} sub={`Đang dùng ${activeProjects} · Lưu trữ ${archivedProjects}`} tone="green" />
          <StatCard icon={CheckSquare} label="Công việc" value={dashboard?.total_tasks} sub={`Mở ${dashboard?.open_tasks || 0} · Xong ${dashboard?.done_tasks || 0}`} tone="orange" />
          <StatCard icon={MessageSquare} label="Tin nhắn" value={dashboard?.total_messages} sub={`Việc AI ${dashboard?.ai_tasks || 0}`} tone="purple" />
          <StatCard icon={Cpu} label="AI hôm nay" value={`${aiRequestsToday}/${aiLimit || '-'}`} sub={`Còn khoảng ${aiUsage?.remaining_today ?? 0} lượt`} tone="purple" />
        </div>

        <div className="ops-panel" style={{ marginBottom: 18 }}>
          <div className="ops-panel-header">
            <div>
              <div className="ops-panel-title">Theo dõi AI usage</div>
              <div className="ops-panel-subtitle">Giám sát số lượt gọi model, token và quota demo trong ngày</div>
            </div>
            <span className="ops-pill blue">{aiUsage?.date || '-'}</span>
          </div>
          <div className="ops-panel-body">
            <div className="ops-grid" style={{ marginBottom: 14 }}>
              <div>
                <div className="ops-row-sub">Lượt gọi GitHub Models</div>
                <div className="ops-row-title" style={{ fontSize: 22 }}>{aiRequestsToday}/{aiLimit || '-'}</div>
                <div className="ops-progress" style={{ marginTop: 8 }}>
                  <div className="ops-progress-bar" style={{ width: `${aiPercent}%` }} />
                </div>
              </div>
              <div>
                <div className="ops-row-sub">Token hôm nay</div>
                <div className="ops-row-title" style={{ fontSize: 22 }}>{aiUsage?.total_tokens_today || 0}</div>
                <div className="ops-row-sub">
                  Prompt {aiUsage?.prompt_tokens_today || 0} · Output {aiUsage?.completion_tokens_today || 0}
                </div>
              </div>
              <div>
                <div className="ops-row-sub">Trạng thái log</div>
                <div className="ops-row-title" style={{ fontSize: 22 }}>
                  {aiUsage?.tracked_file_exists ? 'Đang ghi nhận' : 'Chưa có log'}
                </div>
                <div className="ops-row-sub">Dữ liệu lấy từ backend, không gọi API ngoài</div>
              </div>
            </div>

            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Nguồn AI</th>
                    <th>Model</th>
                    <th>Lượt gọi</th>
                    <th>Prompt tokens</th>
                    <th>Output tokens</th>
                    <th>Tổng token</th>
                  </tr>
                </thead>
                <tbody>
                  {aiModels.map((item) => (
                    <tr key={`${item.provider}-${item.model}`}>
                      <td>{item.provider}</td>
                      <td><div className="ops-row-title">{item.model}</div></td>
                      <td>{item.requests || 0}</td>
                      <td>{item.prompt_tokens || 0}</td>
                      <td>{item.completion_tokens || 0}</td>
                      <td>{item.total_tokens || 0}</td>
                    </tr>
                  ))}
                  {!aiModels.length && (
                    <tr><td colSpan="6">Chưa có lượt gọi AI nào được ghi nhận hôm nay.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="ops-grid two">
          <div className="ops-panel">
            <div className="ops-panel-header">
              <div>
                <div className="ops-panel-title">Người dùng hệ thống</div>
                <div className="ops-panel-subtitle">Quản lý quyền admin/user và xem mức tham gia</div>
              </div>
              <ShieldCheck size={18} color="var(--text-secondary)" />
            </div>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Quyền</th>
                    <th>Dự án</th>
                    <th>Công việc</th>
                    <th>Đăng ký</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="ops-row-title">{item.full_name}</div>
                        <div className="ops-row-sub">{item.email}</div>
                      </td>
                      <td><RoleBadge role={item.role} /></td>
                      <td>{item.member_projects || 0}</td>
                      <td>{item.assigned_tasks || 0}</td>
                      <td>{fmtDate(item.created_at)}</td>
                      <td>
                        <select
                          className="form-input"
                          style={{ width: 110, padding: '6px 8px' }}
                          value={item.role}
                          disabled={item.id === user.id || updatingUserId === item.id}
                          onChange={(e) => changeRole(item, e.target.value)}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!users.length && !loading && (
                    <tr><td colSpan="6">Chưa có người dùng.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ops-panel">
            <div className="ops-panel-header">
              <div>
                <div className="ops-panel-title">Dự án trong hệ thống</div>
                <div className="ops-panel-subtitle">Tổng quan owner, thành viên và tiến độ task</div>
              </div>
              <BriefcaseBusiness size={18} color="var(--text-secondary)" />
            </div>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Owner</th>
                    <th>Trạng thái</th>
                    <th>Thành viên</th>
                    <th>Công việc</th>
                    <th>Tạo ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const progress = project.task_count
                      ? Math.round((project.done_count / project.task_count) * 100)
                      : 0;
                    return (
                      <tr key={project.id}>
                        <td>
                          <div className="ops-row-title">{project.name}</div>
                          <div className="ops-row-sub">{project.deleted_at ? 'Đã lưu trữ' : project.project_key || `#${project.id}`}</div>
                        </td>
                        <td>
                          <div>{project.owner_name || '-'}</div>
                          <div className="ops-row-sub">{project.owner_email || '-'}</div>
                        </td>
                        <td><span className="ops-pill">{project.status || '-'}</span></td>
                        <td>{project.member_count || 0}</td>
                        <td>
                          <div>{project.done_count || 0}/{project.task_count || 0}</div>
                          <div className="ops-progress" style={{ marginTop: 5 }}>
                            <div className="ops-progress-bar" style={{ width: `${progress}%` }} />
                          </div>
                        </td>
                        <td>{fmtDate(project.created_at)}</td>
                      </tr>
                    );
                  })}
                  {!projects.length && !loading && (
                    <tr><td colSpan="6">Chưa có project.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
