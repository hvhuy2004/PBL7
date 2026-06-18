/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Activity,
  BarChart3,
  CalendarDays,
  Sparkles,
  Edit3,
  LayoutGrid,
  Lock,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Tag,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import api from '../api';
import { ToastContainer, useToast } from '../hooks/useToast';
import ArchiveModal from '../components/ArchiveModal';
import KanbanFilterBar from '../components/KanbanFilterBar';
import ProjectAnalytics from '../components/ProjectAnalytics';
import ActivityLogPanel from '../components/ActivityLogPanel';

const PRIORITY_LABELS = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao' };
const TYPE_CLASSES = { Task: 'type-task', Bug: 'type-bug', Feature: 'type-feature', Docs: 'type-docs' };
const TYPE_LABELS = { Task: 'Công việc', Bug: 'Lỗi', Feature: 'Tính năng', Docs: 'Tài liệu' };
const PROJECT_ROLE_LABELS = { developer: 'Developer', tester: 'Tester' };
const MEMBER_ROLE_LABELS = { manager: 'Manager', ...PROJECT_ROLE_LABELS };
const TASK_SCOPE_OPTIONS = [
  { value: 'self', label: 'Chỉ việc được giao' },
  { value: 'all', label: 'Điều phối công việc' },
];

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Giá trị `<input type="datetime-local">` là local wall-time; chuyển sang ISO UTC nhất quán. */
function localDatetimeInputToISO(value) {
  if (!value || typeof value !== 'string') return null;
  const [datePart, timePart = '00:00'] = value.trim().split('T');
  if (!datePart) return null;
  const parts = datePart.split('-').map((n) => parseInt(n, 10));
  const [y, mo, d] = parts;
  if (!y || !mo || !d) return null;
  const [hhRaw, miRaw] = (timePart || '00:00').split(':');
  const hh = parseInt(hhRaw, 10);
  const mi = parseInt(miRaw, 10);
  const dt = new Date(
    y,
    mo - 1,
    d,
    Number.isFinite(hh) ? hh : 0,
    Number.isFinite(mi) ? mi : 0,
    0,
    0,
  );
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function assigneeLabel(task, userMap) {
  if (!task.assignee_id) return 'Chưa giao';
  const u = userMap[task.assignee_id];
  return u ? u.full_name : `User #${task.assignee_id}`;
}

function hexToRgb(hex) {
  const safeHex = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(safeHex)) return null;
  return {
    r: parseInt(safeHex.slice(0, 2), 16),
    g: parseInt(safeHex.slice(2, 4), 16),
    b: parseInt(safeHex.slice(4, 6), 16),
  };
}

function getReadableTextColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#172033';
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 170 ? '#172033' : '#ffffff';
}

function renderMentionText(content) {
  return String(content || '').split(/(@[A-Za-z0-9._-]+)/g).map((part, index) => (
    part.startsWith('@')
      ? <span className="comment-mention" key={`${part}-${index}`}>{part}</span>
      : part
  ));
}

function CreateBoardModal({ projectId, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    visibility: 'private',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Tên bảng không được để trống');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        project_id: Number(projectId),
        name: form.name.trim(),
        description: form.description || null,
        visibility: form.visibility,
      };
      const { data } = await api.post(`/boards/project/${projectId}`, payload);
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Tạo bảng thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 430 }}>
        <div className="modal-title">Tạo bảng mới</div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Tên bảng</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea className="form-input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Hiển thị</label>
            <select className="form-input" value={form.visibility} onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value }))}>
              <option value="private">Riêng tư</option>
              <option value="team">Nhóm</option>
              <option value="public">Công khai</option>
            </select>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Đang tạo...' : 'Tạo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
function CreateColumnModal({ projectId, boardId, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [orderIndex, setOrderIndex] = useState(1);
  const [color, setColor] = useState('#4f8ef7');
  const [wipLimit, setWipLimit] = useState('20');
  const [isDone, setIsDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Tên cột không được để trống');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        order_index: Number(orderIndex),
        color,
        wip_limit: wipLimit ? Number(wipLimit) : null,
        is_done: isDone,
      };
      const { data } = await api.post(`/boards/project/${projectId}/${boardId}/columns`, payload);
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Tạo cột thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 430 }}>
        <div className="modal-title">Tạo cột mới</div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Tên cột</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Thứ tự</label>
            <input
              type="number"
              className="form-input"
              value={orderIndex}
              onChange={(e) => setOrderIndex(Number(e.target.value) || 1)}
              min="1"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Màu cột</label>
              <input type="color" className="form-input" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: 4, height: 40 }} />
            </div>
            <div className="form-group">
              <label className="form-label">WIP limit</label>
              <input type="number" className="form-input" value={wipLimit} onChange={(e) => setWipLimit(e.target.value)} min="1" placeholder="Không giới hạn" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={isDone} onChange={(e) => setIsDone(e.target.checked)} />
            Đây là cột hoàn thành
          </label>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Đang tạo...' : 'Tạo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditColumnModal({ column, projectId, boardId, onClose, onUpdated }) {
  const [name, setName] = useState(column.name);
  const [color, setColor] = useState(column.color || '#4f8ef7');
  const [wipLimit, setWipLimit] = useState(column.wip_limit ?? '');
  const [isDone, setIsDone] = useState(column.is_done ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Tên cột không được để trống'); return; }
    setLoading(true);
    try {
      const { data } = await api.put(
        `/boards/project/${projectId}/${boardId}/columns/${column.id}`,
        { name: name.trim(), color, wip_limit: wipLimit ? Number(wipLimit) : null, is_done: isDone }
      );
      onUpdated(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Cập nhật cột thất bại');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 430 }}>
        <div className="modal-title">Sửa cột</div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Tên cột</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Màu cột</label>
              <input type="color" className="form-input" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: 4, height: 40 }} />
            </div>
            <div className="form-group">
              <label className="form-label">WIP limit</label>
              <input type="number" className="form-input" value={wipLimit} onChange={(e) => setWipLimit(e.target.value)} min="1" placeholder="Không giới hạn" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={isDone} onChange={(e) => setIsDone(e.target.checked)} />
            Đây là cột hoàn thành
          </label>
          <div className="modal-footer" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MembersModal({
  projectId,
  members,
  userMap,
  currentUserId,
  onClose,
  onChanged,
  addToast,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [role, setRole] = useState('developer');
  const [taskScope, setTaskScope] = useState('self');
  const [loading, setLoading] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState(null);
  const roleOptions = useMemo(
    () => Object.entries(PROJECT_ROLE_LABELS),
    [],
  );

  useEffect(() => {
    if (!roleOptions.some(([value]) => value === role)) {
      setRole('developer');
    }
  }, [role, roleOptions]);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/users/search?email=${encodeURIComponent(query.trim())}`);
      setResults(data);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Tìm kiếm user thất bại', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addMember = async (userId) => {
    try {
      await api.post(`/projects/${projectId}/members`, {
        user_id: userId,
        project_role: role,
        can_manage_tasks: taskScope === 'all',
      });
      addToast('Đã thêm thành viên vào project', 'success');
      onChanged();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Thêm thành viên thất bại', 'error');
    }
  };

  const removeMember = async (userId) => {
    if (!confirm('Xóa thành viên này khỏi project?')) return;
    try {
      await api.delete(`/projects/${projectId}/members/${userId}`);
      addToast('Đã xóa thành viên', 'success');
      onChanged();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Xóa thành viên thất bại', 'error');
    }
  };

  const updateMember = async (userId, nextRole, nextCanManageTasks) => {
    const current = members.find((m) => m.user_id === userId);
    if (!current) return;
    if (
      current.project_role === nextRole
      && Boolean(current.can_manage_tasks) === Boolean(nextCanManageTasks)
    ) return;
    setUpdatingRoleUserId(userId);
    try {
      await api.put(`/projects/${projectId}/members/${userId}`, {
        user_id: userId,
        project_role: nextRole,
        can_manage_tasks: nextRole === 'manager' || Boolean(nextCanManageTasks),
      });
      addToast('Đã cập nhật phân quyền thành viên', 'success');
      onChanged();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Cập nhật phân quyền thất bại', 'error');
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>Thành viên dự án</div>
          <button className="btn-icon" onClick={onClose}><X size={15} /></button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Mời thành viên mới</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 170px 90px', gap: 8, alignItems: 'center' }}>
            <input className="form-input" placeholder="Nhập email user..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
              {roleOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select className="form-input" value={taskScope} onChange={(e) => setTaskScope(e.target.value)}>
              {TASK_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? '...' : 'Tìm'}</button>
          </div>
          {!!results.length && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map((u) => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{u.email}</div>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => addMember(u.id)}><UserPlus size={13} /> Thêm</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Danh sách hiện tại</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {members.map((m) => {
            const user = userMap[m.user_id];
            const isUpdatingRole = updatingRoleUserId === m.user_id;
            const isManagerRole = m.project_role === 'manager';
            const canEditThisRole = !isManagerRole;
            const canRemoveThisMember = !isManagerRole && m.user_id !== currentUserId;
            return (
              <div key={m.user_id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 170px 100px', gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.full_name || `User #${m.user_id}`}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user?.email || '-'}</div>
                </div>
                <select
                  className="form-input"
                  value={m.project_role}
                  disabled={isUpdatingRole || !canEditThisRole}
                  onChange={(e) => updateMember(m.user_id, e.target.value, m.can_manage_tasks)}
                  title="Vai trò chuyên môn"
                  style={{ height: 34, fontSize: 12, fontWeight: 700 }}
                >
                  {(canEditThisRole ? roleOptions : [[m.project_role, MEMBER_ROLE_LABELS[m.project_role] || m.project_role]]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select
                  className="form-input"
                  value={m.project_role === 'manager' || Boolean(m.can_manage_tasks) ? 'all' : 'self'}
                  disabled={isUpdatingRole || !canEditThisRole || m.project_role === 'manager'}
                  onChange={(e) => updateMember(m.user_id, m.project_role, e.target.value === 'all')}
                  title="Phạm vi quyền công việc"
                  style={{ height: 34, fontSize: 12, fontWeight: 700 }}
                >
                  {TASK_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button className="btn btn-sm btn-danger" disabled={!canRemoveThisMember} onClick={() => removeMember(m.user_id)}><Trash2 size={13} /> Xóa</button>
              </div>
            );
          })}
          {!members.length && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Chưa có thành viên</div>}
        </div>
      </div>
    </div>
  );
}

function ProjectAISummaryModal({ projectId, onClose }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.post(`/projects/${projectId}/ai/project-summary`)
      .then((res) => {
        if (active) setSummary(res.data);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.detail || 'Chưa tổng kết được dự án');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [projectId]);

  const metrics = summary?.metrics || {};
  const riskColor = summary?.risk_level === 'Cao'
    ? 'var(--red)'
    : summary?.risk_level === 'Trung bình'
      ? 'var(--yellow)'
      : 'var(--green)';

  const renderList = (title, items, emptyText) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {items?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
          {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{emptyText}</div>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 760, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>Tổng kết dự án</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Tổng hợp tiến độ, deadline, workload và các điểm cần chú ý.</div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '26px 0', color: 'var(--text-secondary)' }}>
            <div className="spinner" /> Đang tổng hợp dữ liệu dự án...
          </div>
        ) : error ? (
          <div style={{ color: 'var(--red)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} /> {error}
          </div>
        ) : summary && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
              {[
                ['Sức khỏe', `${summary.health_score}/100`, riskColor],
                ['Rủi ro', summary.risk_level, riskColor],
                ['Đang mở', metrics.open_tasks ?? 0, 'var(--accent)'],
                ['Quá hạn', metrics.overdue_tasks ?? 0, metrics.overdue_tasks ? 'var(--red)' : 'var(--text-secondary)'],
              ].map(([label, value, color]) => (
                <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 750, color }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12, background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700 }}>
                <Activity size={15} color="var(--accent)" /> Nhận định
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{summary.summary}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {renderList('Rủi ro cần chú ý', summary.risks, 'Chưa phát hiện rủi ro rõ ràng.')}
              {renderList('Thành viên cần theo dõi', summary.overloaded_members, 'Chưa có thành viên quá tải rõ ràng.')}
              {renderList('Công việc nên ưu tiên', summary.priority_tasks, 'Chưa có công việc ưu tiên nổi bật.')}
              {renderList('Hành động đề xuất', summary.next_actions, 'Chưa có đề xuất bổ sung.')}
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              Dữ liệu gồm {metrics.total_tasks ?? 0} công việc, hoàn thành {metrics.completion_rate ?? 0}%, tiến độ trung bình {metrics.average_progress ?? 0}%.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AITaskPromptPanel({
  aiPrompt,
  setAiPrompt,
  fillFromAI,
  aiLoading,
  aiNote,
  aiModelUsed,
  aiDrafts,
  selectedDrafts,
  toggleDraft,
  updateDraft,
  createSelectedDrafts,
  bulkCreating,
  assignableMembers,
  userMap,
}) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      background: 'var(--bg-card)',
      borderRadius: 8,
      padding: 12,
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Sparkles size={14} color="var(--accent)" />
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>Trợ lý tạo công việc</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start' }}>
        <textarea
          className="form-input"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="VD: Tạo các công việc cho module đăng nhập: UI cho An, API đăng nhập cho Huy, quên mật khẩu cho Huy, kiểm thử lỗi đăng nhập cho Linh. Hạn thứ 6 tuần này."
          rows={2}
          style={{ resize: 'vertical' }}
        />
        <button type="button" className="btn btn-primary" onClick={fillFromAI} disabled={aiLoading}>
          <Plus size={14} /> {aiLoading ? 'Đang đọc...' : 'Tạo draft'}
        </button>
      </div>
      {aiNote && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{aiNote}</div>}
      {aiModelUsed && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          Model: {aiModelUsed}
        </div>
      )}
      {!!aiDrafts.length && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {aiDrafts.map((draft, index) => (
            <div
              key={`${draft.title}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '22px 1fr',
                gap: 8,
                alignItems: 'start',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
              }}
            >
              <input
                type="checkbox"
                checked={selectedDrafts.includes(index)}
                onChange={() => toggleDraft(index)}
                style={{ marginTop: 2 }}
              />
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  className="form-input"
                  value={draft.title || ''}
                  onChange={(e) => updateDraft(index, { title: e.target.value })}
                  placeholder="Tiêu đề công việc"
                  style={{ height: 34, fontWeight: 700, fontSize: 13 }}
                />
                <textarea
                  className="form-input"
                  value={draft.description || ''}
                  onChange={(e) => updateDraft(index, { description: e.target.value })}
                  placeholder="Mô tả ngắn"
                  rows={2}
                  style={{ minHeight: 58, fontSize: 12, resize: 'vertical' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1fr 0.8fr', gap: 6 }}>
                  <select
                    className="form-input"
                    value={draft.priority || 'Medium'}
                    onChange={(e) => updateDraft(index, { priority: e.target.value })}
                    style={{ height: 34, fontSize: 12 }}
                  >
                    <option value="Low">Thấp</option>
                    <option value="Medium">Trung bình</option>
                    <option value="High">Cao</option>
                  </select>
                  <select
                    className="form-input"
                    value={draft.task_type || 'Task'}
                    onChange={(e) => updateDraft(index, { task_type: e.target.value })}
                    style={{ height: 34, fontSize: 12 }}
                  >
                    <option value="Task">Công việc</option>
                    <option value="Bug">Lỗi</option>
                    <option value="Feature">Tính năng</option>
                    <option value="Docs">Tài liệu</option>
                  </select>
                  <select
                    className="form-input"
                    value={draft.assignee_id ? String(draft.assignee_id) : ''}
                    onChange={(e) => updateDraft(index, {
                      assignee_id: e.target.value ? Number(e.target.value) : null,
                      assignee_name: e.target.value ? userMap[Number(e.target.value)]?.full_name : '',
                    })}
                    style={{ height: 34, fontSize: 12 }}
                  >
                    <option value="">Chưa giao</option>
                    {assignableMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {userMap[m.user_id]?.full_name || `User #${m.user_id}`}
                      </option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={draft.due_date ? toDatetimeLocalValue(draft.due_date) : ''}
                    onChange={(e) => updateDraft(index, { due_date: localDatetimeInputToISO(e.target.value) })}
                    style={{ height: 34, fontSize: 12 }}
                  />
                  <input
                    type="number"
                    className="form-input"
                    value={draft.estimated_hours ?? ''}
                    onChange={(e) => updateDraft(index, { estimated_hours: e.target.value })}
                    placeholder="Giờ"
                    min="0"
                    step="0.5"
                    style={{ height: 34, fontSize: 12 }}
                  />
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={createSelectedDrafts} disabled={bulkCreating || !selectedDrafts.length}>
              <Plus size={14} /> {bulkCreating ? 'Đang tạo...' : `Tạo ${selectedDrafts.length} công việc đã chọn`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTaskModal({ projectId, columnId, members, userMap, canManage, currentUser, onClose, onCreated }) {
  const [form, setForm] = useState({
    project_id: Number(projectId),
    column_id: columnId,
    order_index: 0,
    title: '',
    description: '',
    priority: 'Medium',
    task_type: 'Task',
    assignee_id: '',
    start_date: '',
    due_date: '',
    estimated_hours: '',
    progress_percent: 0,
    is_ai_generated: false,
  });
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [aiModelUsed, setAiModelUsed] = useState('');
  const [aiDrafts, setAiDrafts] = useState([]);
  const [selectedDrafts, setSelectedDrafts] = useState([]);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [error, setError] = useState('');
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [duplicateCheckResult, setDuplicateCheckResult] = useState(null);
  const duplicateDebounceRef = useRef(null);

  const assignableMembers = useMemo(() => {
    if (canManage) return members;
    if (!currentUser?.id) return [];
    return members.filter((m) => m.user_id === currentUser.id);
  }, [canManage, currentUser, members]);

  const applyDraftToForm = (draft) => {
    setForm((prev) => ({
      ...prev,
      title: draft.title || prev.title,
      description: draft.description || prev.description,
      priority: draft.priority || prev.priority,
      task_type: draft.task_type || prev.task_type,
      assignee_id: draft.assignee_id ? String(draft.assignee_id) : '',
      start_date: draft.start_date ? toDatetimeLocalValue(draft.start_date) : prev.start_date,
      due_date: draft.due_date ? toDatetimeLocalValue(draft.due_date) : prev.due_date,
      estimated_hours: draft.estimated_hours ?? prev.estimated_hours,
      is_ai_generated: true,
    }));
  };

  const fillFromAI = async () => {
    const prompt = aiPrompt.trim();
    if (prompt.length < 8) {
      setError('Hãy nhập mô tả công việc rõ hơn để hệ thống phân tích');
      return;
    }
    setError('');
    setAiNote('');
    setAiModelUsed('');
    setAiDrafts([]);
    setSelectedDrafts([]);
    setAiLoading(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/parse-tasks`, {
        prompt,
        column_id: columnId,
      });
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      setAiModelUsed(data.used_model || '');
      if (tasks.length === 1) {
        applyDraftToForm(tasks[0]);
        const confidence = typeof tasks[0].confidence === 'number' ? ` - Tin cậy ${Math.round(tasks[0].confidence * 100)}%` : '';
        setAiNote(tasks[0].notes ? `${tasks[0].notes}${confidence}` : `Đã điền form từ mô tả${confidence}`);
      } else {
        setAiDrafts(tasks);
        setSelectedDrafts(tasks.map((_, index) => index));
        setAiNote(data.notes || `Đã tạo ${tasks.length} công việc nháp. Kiểm tra rồi tạo các công việc đã chọn.`);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Chưa phân tích được yêu cầu');
    } finally {
      setAiLoading(false);
    }
  };

  const toggleDraft = (index) => {
    setSelectedDrafts((prev) => (
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    ));
  };

  const updateDraft = (index, patch) => {
    setAiDrafts((prev) => prev.map((draft, i) => (
      i === index ? { ...draft, ...patch } : draft
    )));
  };

  const createPayloadFromDraft = (draft) => ({
    project_id: Number(projectId),
    column_id: columnId,
    order_index: 0,
    title: draft.title,
    description: draft.description || null,
    priority: draft.priority || 'Medium',
    task_type: draft.task_type || 'Task',
    assignee_id: draft.assignee_id ? Number(draft.assignee_id) : null,
    start_date: draft.start_date || null,
    due_date: draft.due_date || null,
    estimated_hours: draft.estimated_hours ? Number(draft.estimated_hours) : null,
    progress_percent: 0,
    is_ai_generated: true,
  });

  const duplicateKeyFor = (title, description) => `${String(title || '').trim()}\n${String(description || '').trim()}`;

  const checkDuplicate = async (payload) => {
    const { data } = await api.post(`/projects/${projectId}/tasks/check-duplicate`, {
      title: payload.title,
      description: payload.description || '',
    });
    return data;
  };

  const checkDuplicateBatch = async (payloads) => {
    const { data } = await api.post(`/projects/${projectId}/tasks/check-duplicate-batch`, {
      items: payloads.map((payload) => ({
        title: payload.title,
        description: payload.description || '',
      })),
    });
    return data.items || [];
  };

  const buildPayloadFromForm = () => ({
    ...form,
    assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
    start_date: localDatetimeInputToISO(form.start_date),
    due_date: localDatetimeInputToISO(form.due_date),
    estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
    progress_percent: Number(form.progress_percent || 0),
  });

  const buildPayloadFromValues = (values) => ({
    ...values,
    assignee_id: values.assignee_id ? Number(values.assignee_id) : null,
    start_date: localDatetimeInputToISO(values.start_date),
    due_date: localDatetimeInputToISO(values.due_date),
    estimated_hours: values.estimated_hours ? Number(values.estimated_hours) : null,
    progress_percent: Number(values.progress_percent || 0),
  });

  const checkDuplicateForForm = async ({ force = false } = {}) => {
    const title = form.title.trim();
    const description = form.description || '';
    const key = duplicateKeyFor(title, description);
    if (!title || key.length < 6) return null;
    if (!force && duplicateCheckResult?.key === key) return duplicateCheckResult.result;

    setDuplicateChecking(true);
    try {
      const result = await checkDuplicate({ title, description });
      setDuplicateCheckResult({ key, result });
      if (result.duplicate_found) {
        setDuplicateWarning({ kind: 'single', payload: buildPayloadFromForm(), duplicate: result, key });
      } else if (duplicateWarning?.kind === 'single') {
        setDuplicateWarning(null);
      }
      return result;
    } catch {
      setDuplicateCheckResult({
        key,
        result: {
          duplicate_found: false,
          threshold: 0,
          method: 'unavailable',
          candidates: [],
          note: 'Chưa kiểm tra trùng được, hệ thống sẽ kiểm tra lại khi bấm tạo.',
        },
      });
      return null;
    } finally {
      setDuplicateChecking(false);
    }
  };

  const handleTaskTextChange = (field, value) => {
    setDuplicateWarning(null);
    setDuplicateCheckResult(null);
    if (duplicateDebounceRef.current) {
      clearTimeout(duplicateDebounceRef.current);
    }
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      const title = String(next.title || '').trim();
      const description = next.description || '';
      const key = duplicateKeyFor(title, description);
      if (title && key.length >= 6) {
        duplicateDebounceRef.current = setTimeout(async () => {
          setDuplicateChecking(true);
          try {
            const result = await checkDuplicate({ title, description });
            setDuplicateCheckResult({ key, result });
            if (result.duplicate_found) {
              setDuplicateWarning({ kind: 'single', payload: buildPayloadFromValues(next), duplicate: result, key });
            }
          } catch {
            setDuplicateCheckResult({
              key,
              result: {
                duplicate_found: false,
                threshold: 0,
                method: 'unavailable',
                candidates: [],
                note: 'Chưa kiểm tra trùng được, hệ thống sẽ kiểm tra lại khi bấm tạo.',
              },
            });
          } finally {
            setDuplicateChecking(false);
          }
        }, 900);
      }
      return next;
    });
  };

  useEffect(() => () => {
    if (duplicateDebounceRef.current) {
      clearTimeout(duplicateDebounceRef.current);
    }
  }, []);

  const createTaskDirect = async (payload) => {
    const { data } = await api.post(`/projects/${projectId}/tasks`, payload);
    onCreated(data);
    return data;
  };

  const continueAfterDuplicateWarning = async () => {
    if (!duplicateWarning) return;
    setError('');
    try {
      if (duplicateWarning.kind === 'bulk') {
        setBulkCreating(true);
        const created = [];
        for (const payload of duplicateWarning.payloads) {
          created.push(await createTaskDirect(payload));
        }
        setAiNote(`Đã tạo ${created.length} công việc từ mô tả`);
        setAiDrafts([]);
        setSelectedDrafts([]);
      } else {
        setLoading(true);
        await createTaskDirect(duplicateWarning.payload);
      }
      setDuplicateWarning(null);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Tạo công việc thất bại');
    } finally {
      setLoading(false);
      setBulkCreating(false);
    }
  };

  const createSelectedDrafts = async () => {
    const drafts = selectedDrafts.map((index) => aiDrafts[index]).filter(Boolean);
    if (!drafts.length) return;
    setError('');
    setDuplicateWarning(null);
    setBulkCreating(true);
    try {
      const payloads = drafts.map(createPayloadFromDraft);
      const duplicateResults = await checkDuplicateBatch(payloads);
      const duplicates = duplicateResults
        .map((result, index) => ({ result, draft: drafts[index], payload: payloads[index] }))
        .filter((item) => item.result?.duplicate_found);
      if (duplicates.length) {
        setDuplicateWarning({ kind: 'bulk', payloads, duplicates });
        return;
      }
      const created = [];
      for (const payload of payloads) {
        created.push(await createTaskDirect(payload));
      }
      setAiNote(`Đã tạo ${created.length} công việc từ mô tả`);
      setAiDrafts([]);
      setSelectedDrafts([]);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Tạo công việc từ mô tả thất bại');
    } finally {
      setBulkCreating(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Tiêu đề công việc không được để trống');
      return;
    }
    if (form.start_date && form.due_date && new Date(form.start_date) > new Date(form.due_date)) {
      setError('Ngày bắt đầu không được sau ngày kết thúc');
      return;
    }
    setError('');
    setDuplicateWarning(null);
    setDuplicateChecking(true);
    try {
      const payload = buildPayloadFromForm();
      const key = duplicateKeyFor(payload.title, payload.description);
      const duplicate = duplicateCheckResult?.key === key
        ? duplicateCheckResult.result
        : await checkDuplicate(payload);
      setDuplicateCheckResult({ key, result: duplicate });
      if (duplicate.duplicate_found) {
        setDuplicateWarning({ kind: 'single', payload, duplicate, key });
        return;
      }
      setDuplicateChecking(false);
      setLoading(true);
      await createTaskDirect(payload);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Tạo công việc thất bại');
    } finally {
      setDuplicateChecking(false);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 760, maxHeight: '92vh', overflow: 'auto' }}>
        <AITaskPromptPanel
          aiPrompt={aiPrompt}
          setAiPrompt={setAiPrompt}
          fillFromAI={fillFromAI}
          aiLoading={aiLoading}
          aiNote={aiNote}
          aiModelUsed={aiModelUsed}
          aiDrafts={aiDrafts}
          selectedDrafts={selectedDrafts}
          toggleDraft={toggleDraft}
          updateDraft={updateDraft}
          createSelectedDrafts={createSelectedDrafts}
          bulkCreating={bulkCreating}
          assignableMembers={assignableMembers}
          userMap={userMap}
        />
        <div className="modal-title">Tạo công việc</div>
        {error && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {duplicateWarning && (
          <div style={{
            border: '1px solid rgba(210,153,34,0.35)',
            background: 'rgba(210,153,34,0.10)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#92400e', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <AlertCircle size={14} /> Có thể công việc này đã tồn tại
            </div>
            {duplicateWarning.kind === 'single' ? (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Công việc tương tự đã tồn tại: <b style={{ color: 'var(--text-primary)' }}>{duplicateWarning.duplicate.candidates?.[0]?.title}</b>
                {' '}({Math.round((duplicateWarning.duplicate.candidates?.[0]?.similarity || 0) * 100)}% tương đồng).
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {duplicateWarning.duplicates.length} công việc nháp có dấu hiệu trùng:
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {duplicateWarning.duplicates.slice(0, 4).map((item, index) => (
                    <li key={`${item.draft.title}-${index}`}>
                      <b style={{ color: 'var(--text-primary)' }}>{item.draft.title}</b>
                      {' '}gần giống <b style={{ color: 'var(--text-primary)' }}>{item.result.candidates?.[0]?.title}</b>
                      {' '}({Math.round((item.result.candidates?.[0]?.similarity || 0) * 100)}%).
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                setDuplicateWarning(null);
                setDuplicateCheckResult(null);
              }}>
                Kiểm tra lại
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={continueAfterDuplicateWarning} disabled={loading || bulkCreating}>
                Vẫn tạo công việc
              </button>
            </div>
          </div>
        )}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Tiêu đề *</label>
            <input
              className="form-input"
              value={form.title}
              onChange={(e) => handleTaskTextChange('title', e.target.value)}
              onBlur={() => checkDuplicateForForm()}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea
              className="form-input"
              value={form.description}
              onChange={(e) => handleTaskTextChange('description', e.target.value)}
              onBlur={() => checkDuplicateForForm()}
            />
            {duplicateChecking && (
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-muted)' }}>
                Đang kiểm tra trùng bằng embedding...
              </div>
            )}
            {!duplicateChecking && duplicateCheckResult?.key === duplicateKeyFor(form.title, form.description) && !duplicateCheckResult.result.duplicate_found && (
              <div style={{
                marginTop: 5,
                fontSize: 12,
                color: ['fallback_lexical_similarity', 'unavailable'].includes(duplicateCheckResult.result.method) ? 'var(--orange)' : 'var(--green)',
              }}>
                {duplicateCheckResult.result.method === 'unavailable'
                  ? (duplicateCheckResult.result.note || 'Chưa kiểm tra trùng được, hệ thống sẽ kiểm tra lại khi bấm tạo.')
                  : duplicateCheckResult.result.method === 'fallback_lexical_similarity'
                  ? (duplicateCheckResult.result.note || 'AI semantic t\u1ea1m th\u1eddi kh\u00f4ng kh\u1ea3 d\u1ee5ng, h\u1ec7 th\u1ed1ng \u0111ang d\u00f9ng so kh\u1edbp n\u1ed9i b\u1ed9.')
                  : 'Ch\u01b0a ph\u00e1t hi\u1ec7n c\u00f4ng vi\u1ec7c tr\u00f9ng.'}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Người nhận việc</label>
              <select className="form-input" value={form.assignee_id} onChange={(e) => setForm((p) => ({ ...p, assignee_id: e.target.value }))}>
                <option value="">Chưa giao</option>
                {assignableMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{userMap[m.user_id]?.full_name || `User #${m.user_id}`}</option>
                ))}
              </select>
              {!canManage && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  Bạn chỉ có thể giao công việc cho chính mình.
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Ngày bắt đầu</label>
              <input type="datetime-local" className="form-input" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Ngày kết thúc</label>
              <input type="datetime-local" className="form-input" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Mức ưu tiên</label>
              <select className="form-input" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                <option value="Low">Thấp</option>
                <option value="Medium">Trung bình</option>
                <option value="High">Cao</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Loại công việc</label>
              <select className="form-input" value={form.task_type} onChange={(e) => setForm((p) => ({ ...p, task_type: e.target.value }))}>
                <option value="Task">Công việc</option>
                <option value="Bug">Lỗi</option>
                <option value="Feature">Tính năng</option>
                <option value="Docs">Tài liệu</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Ước lượng (giờ)</label>
              <input type="number" className="form-input" value={form.estimated_hours} onChange={(e) => setForm((p) => ({ ...p, estimated_hours: e.target.value }))} min="0" step="0.5" />
            </div>
            <div className="form-group">
              <label className="form-label">Tiến độ %</label>
              <input type="number" className="form-input" value={form.progress_percent} onChange={(e) => setForm((p) => ({ ...p, progress_percent: e.target.value }))} min="0" max="100" />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={loading || duplicateChecking}>{duplicateChecking ? 'Đang kiểm tra trùng...' : loading ? 'Đang tạo...' : 'Tạo công việc'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDetailModal({ task, projectId, members, userMap, canManage, canManageTasks, currentUser, onClose, onUpdated, onDeleted, addToast }) {
  const taskRef = useRef(task);
  const onUpdatedRef = useRef(onUpdated);
  const canEditTask = canManageTasks || (currentUser?.id && task.assignee_id === currentUser.id);
  const lockedFieldStyle = !canEditTask ? { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'not-allowed' } : {};

  useEffect(() => {
    taskRef.current = task;
    onUpdatedRef.current = onUpdated;
  }, [task, onUpdated]);

  const [form, setForm] = useState({
    title: task.title,
    description: task.description || '',
    priority: task.priority,
    task_type: task.task_type,
    assignee_id: task.assignee_id || '',
    start_date: toDatetimeLocalValue(task.start_date),
    due_date: toDatetimeLocalValue(task.due_date),
    estimated_hours: task.estimated_hours || '',
    progress_percent: task.progress_percent || 0,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [checklistItems, setChecklistItems] = useState([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState(false);
  // Comments
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');
  // Tags
  const [projectTags, setProjectTags] = useState([]);
  const [taskTagIds, setTaskTagIds] = useState([]);
  // Active tab in detail modal
  const [activeTab, setActiveTab] = useState('detail'); // 'detail' | 'activity'

  const syncChecklistCounts = useCallback((items) => {
    const total = items.length;
    const completed = items.filter((i) => i.is_done).length;
    onUpdatedRef.current({
      ...taskRef.current,
      checklist_total: total,
      checklist_completed: completed,
    });
  }, []);

  const loadAttachments = useCallback(async () => {
    try {
      const { data } = await api.get(`/attachments/task/${task.id}`);
      setAttachments(data);
    } catch {
      setAttachments([]);
    }
  }, [task.id]);

  const loadChecklist = useCallback(async () => {
    setChecklistLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/tasks/${task.id}/checklist`);
      setChecklistItems(data || []);
      syncChecklistCounts(data || []);
    } catch {
      setChecklistItems([]);
      syncChecklistCounts([]);
    } finally {
      setChecklistLoading(false);
    }
  }, [task.id, projectId, syncChecklistCounts]);

  const addChecklistItem = async () => {
    const title = checklistInput.trim();
    if (!title) return;
    setChecklistSaving(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/tasks/${task.id}/checklist`, { title });
      setChecklistItems((prev) => {
        const next = [...prev, data];
        syncChecklistCounts(next);
        return next;
      });
      setChecklistInput('');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Thêm checklist thất bại', 'error');
    } finally {
      setChecklistSaving(false);
    }
  };

  const toggleChecklistItem = async (item) => {
    try {
      const { data } = await api.put(`/projects/${projectId}/tasks/${task.id}/checklist/${item.id}`, {
        is_done: !item.is_done,
      });
      setChecklistItems((prev) => {
        const next = prev.map((i) => (i.id === item.id ? data : i));
        syncChecklistCounts(next);
        return next;
      });
    } catch (err) {
      addToast(err.response?.data?.detail || 'Cập nhật checklist thất bại', 'error');
    }
  };

  const deleteChecklistItem = async (itemId) => {
    if (!confirm('Xóa mục checklist này?')) return;
    try {
      await api.delete(`/projects/${projectId}/tasks/${task.id}/checklist/${itemId}`);
      setChecklistItems((prev) => {
        const next = prev.filter((i) => i.id !== itemId);
        syncChecklistCounts(next);
        return next;
      });
    } catch (err) {
      addToast(err.response?.data?.detail || 'Xóa checklist thất bại', 'error');
    }
  };

  const loadComments = useCallback(async () => {
    try {
      const { data } = await api.get(`/comments/task/${task.id}`);
      setComments(data || []);
    } catch { setComments([]); }
  }, [task.id]);

  const addComment = async () => {
    const content = commentInput.trim();
    if (!content) return;
    setCommentSaving(true);
    try {
      await api.post('/comments/', { task_id: task.id, content });
      setCommentInput('');
      await loadComments();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Gửi bình luận thất bại', 'error');
    } finally { setCommentSaving(false); }
  };

  const deleteComment = async (commentId) => {
    if (!confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      addToast('Đã xóa bình luận', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Xóa bình luận thất bại', 'error');
    }
  };

  const startEditingComment = (comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentContent(comment.content);
  };

  const cancelEditingComment = () => {
    setEditingCommentId(null);
    setEditingCommentContent('');
  };

  const saveComment = async (commentId) => {
    const content = editingCommentContent.trim();
    if (!content) return;
    setCommentSaving(true);
    try {
      const { data } = await api.put(`/comments/${commentId}`, { content });
      setComments((prev) => prev.map((comment) => (comment.id === commentId ? data : comment)));
      cancelEditingComment();
      addToast('Đã cập nhật bình luận', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Cập nhật bình luận thất bại', 'error');
    } finally {
      setCommentSaving(false);
    }
  };

  const mentionMatch = commentInput.match(/(?:^|\s)@([A-Za-z0-9._-]*)$/);
  const mentionQuery = (mentionMatch?.[1] || '').toLowerCase();
  const mentionSuggestions = mentionOpen && mentionMatch
    ? members
      .map((member) => {
        const user = userMap[member.user_id];
        return user ? { ...user, token: user.email.split('@')[0] } : null;
      })
      .filter(Boolean)
      .filter((user) => `${user.full_name} ${user.email} ${user.token}`.toLowerCase().includes(mentionQuery))
      .slice(0, 6)
    : [];

  const insertMention = (user) => {
    setCommentInput((value) => value.replace(/@([A-Za-z0-9._-]*)$/, `@${user.token} `));
    setMentionOpen(false);
  };

  const loadTags = useCallback(async () => {
    try {
      const { data } = await api.get(`/tags/project/${task.project_id}`);
      setProjectTags(data || []);
    } catch { setProjectTags([]); }
    setTaskTagIds((task.tags || []).map((x) => x.id));
  }, [task.project_id, task.tags]);

  const toggleTag = async (tagId) => {
    const has = taskTagIds.includes(tagId);
    try {
      if (has) {
        await api.delete(`/tags/task/${task.id}/remove/${tagId}`);
        setTaskTagIds((prev) => prev.filter((id) => id !== tagId));
      } else {
        await api.post(`/tags/task/${task.id}/add/${tagId}`);
        setTaskTagIds((prev) => [...prev, tagId]);
      }
    } catch (err) {
      addToast(err.response?.data?.detail || 'Cập nhật tag thất bại', 'error');
    }
  };

  useEffect(() => {
    const loadDetailData = () => {
      loadChecklist();
      loadComments();
      loadTags();
      loadAttachments();
    };
    const frameId = window.requestAnimationFrame(loadDetailData);
    return () => window.cancelAnimationFrame(frameId);
  }, [loadAttachments, loadChecklist, loadComments, loadTags]);

  const save = async () => {
    if (!canEditTask) {
      addToast('Bạn không có quyền chỉnh sửa công việc này', 'error');
      return;
    }
    if (form.start_date && form.due_date && new Date(form.start_date) > new Date(form.due_date)) {
      addToast('Ngày bắt đầu không được sau ngày kết thúc', 'error');
      return;
    }
    setLoading(true);
    try {
      const checklistTotal = checklistItems.length;
      const checklistCompleted = checklistItems.filter((i) => i.is_done).length;
      const payload = {
        ...form,
        expected_updated_at: task.updated_at,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        start_date: localDatetimeInputToISO(form.start_date),
        due_date: localDatetimeInputToISO(form.due_date),
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        progress_percent: Number(form.progress_percent || 0),
        checklist_total: checklistTotal,
        checklist_completed: checklistCompleted,
      };
      if (!canManageTasks) {
        delete payload.assignee_id;
      }
      const { data } = await api.put(`/projects/${projectId}/tasks/${task.id}`, payload);
      onUpdated(data);
      addToast('Cập nhật công việc thành công', 'success');
    } catch (err) {
      if (err.response?.status === 409) {
        addToast('Công việc này vừa được người khác cập nhật. Hãy đóng mở lại để lấy dữ liệu mới.', 'error');
      } else {
        addToast(err.response?.data?.detail || 'Cập nhật công việc thất bại', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const removeTask = async () => {
    try {
      await api.delete(`/projects/${projectId}/tasks/${task.id}`);
      onDeleted(task.id);
      onClose();
      addToast('Đã xóa công việc', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Xóa công việc thất bại', 'error');
    }
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      await api.post(`/attachments/task/${task.id}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadAttachments();
      addToast('Upload file thành công', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Upload file thất bại', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const deleteAttachment = async (attachmentId) => {
    if (!confirm('Xóa tệp đính kèm này?')) return;
    try {
      await api.delete(`/attachments/${attachmentId}`);
      await loadAttachments();
      addToast('Đã xóa tệp đính kèm', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Xóa tệp thất bại', 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 760, maxHeight: '90vh', overflow: 'auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>Chi tiết công việc</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {[{ key: 'detail', label: 'Chi tiết' }, { key: 'activity', label: 'Lịch sử' }].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '5px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                    background: activeTab === tab.key ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: activeTab === tab.key ? 'white' : 'var(--text-secondary)',
                    fontWeight: activeTab === tab.key ? 600 : 400,
                  }}
                >{tab.label}</button>
              ))}
            </div>
            <button className="btn-icon" aria-label="Đóng" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {/* Title – always visible */}
        <div className="form-group">
          <label className="form-label">Tiêu đề</label>
          <input className="form-input" value={form.title} disabled={!canEditTask} style={lockedFieldStyle} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        </div>
        {!canEditTask && (
          <div style={{ marginBottom: 12, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(139,148,158,0.08)', color: 'var(--text-secondary)', fontSize: 12 }}>
            Bạn đang xem công việc của thành viên khác. Chỉ người được giao hoặc người có quyền điều phối công việc mới có quyền chỉnh sửa.
          </div>
        )}

        {/* ── Tab: Activity Log ── */}
        {activeTab === 'activity' && (
          <div style={{ padding: '4px 0' }}>
            <ActivityLogPanel projectId={projectId} taskId={task.id} />
          </div>
        )}

        {/* ── Tab: Detail (all fields) ── */}
        {activeTab === 'detail' && (
          <div>
            <div className="form-group">
              <label className="form-label">Mô tả</label>
              <textarea className="form-input" value={form.description} disabled={!canEditTask} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} style={{ minHeight: 90, ...lockedFieldStyle }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Người nhận việc</label>
                {canManageTasks ? (
                  <select className="form-input" value={form.assignee_id} disabled={!canEditTask} style={lockedFieldStyle} onChange={(e) => setForm((p) => ({ ...p, assignee_id: e.target.value }))}>
                    <option value="">Chưa giao</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{userMap[m.user_id]?.full_name || `User #${m.user_id}`}</option>
                    ))}
                  </select>
                ) : (
                  <div className="form-input" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'not-allowed' }}>
                    {form.assignee_id ? (userMap[Number(form.assignee_id)]?.full_name || `User #${form.assignee_id}`) : 'Chưa giao'}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Ngày bắt đầu</label>
                <input type="datetime-local" className="form-input" value={form.start_date} disabled={!canEditTask} style={lockedFieldStyle} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày kết thúc</label>
                <input type="datetime-local" className="form-input" value={form.due_date} disabled={!canEditTask} style={lockedFieldStyle} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Mức ưu tiên</label>
                <select className="form-input" value={form.priority} disabled={!canEditTask} style={lockedFieldStyle} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                  <option value="Low">Thấp</option>
                  <option value="Medium">Trung bình</option>
                  <option value="High">Cao</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Loại công việc</label>
                <select className="form-input" value={form.task_type} disabled={!canEditTask} style={lockedFieldStyle} onChange={(e) => setForm((p) => ({ ...p, task_type: e.target.value }))}>
                  <option value="Task">Công việc</option>
                  <option value="Bug">Lỗi</option>
                  <option value="Feature">Tính năng</option>
                  <option value="Docs">Tài liệu</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Ước lượng (giờ)</label>
                <input type="number" className="form-input" value={form.estimated_hours} disabled={!canEditTask} style={lockedFieldStyle} onChange={(e) => setForm((p) => ({ ...p, estimated_hours: e.target.value }))} min="0" step="0.5" />
              </div>
              <div className="form-group">
                <label className="form-label">Tiến độ %</label>
                <input type="number" className="form-input" value={form.progress_percent} disabled={!canEditTask} style={lockedFieldStyle} onChange={(e) => setForm((p) => ({ ...p, progress_percent: e.target.value }))} min="0" max="100" />
              </div>
            </div>

            {/* Checklist */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Checklist</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {checklistItems.filter((i) => i.is_done).length}/{checklistItems.length}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10 }}>
                <input
                  className="form-input"
                  placeholder="Thêm việc nhỏ..."
                  value={checklistInput}
                  disabled={!canEditTask}
                  style={lockedFieldStyle}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canEditTask && addChecklistItem()}
                />
                <button className="btn btn-primary" type="button" disabled={!canEditTask || checklistSaving} onClick={addChecklistItem}>
                  {checklistSaving ? 'Đang thêm...' : 'Thêm'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {checklistLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Đang tải checklist...</div>
                ) : checklistItems.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Chưa có mục checklist</div>
                ) : (
                  checklistItems.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '7px 10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <input type="checkbox" checked={!!item.is_done} disabled={!canEditTask} onChange={() => toggleChecklistItem(item)} />
                        <span style={{ textDecoration: item.is_done ? 'line-through' : 'none', color: item.is_done ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                          {item.title}
                        </span>
                      </label>
                      {canEditTask && <button className="btn btn-sm btn-danger" onClick={() => deleteChecklistItem(item.id)}><Trash2 size={12} /></button>}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Attachments */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Paperclip size={14} /> Tệp đính kèm</div>
                {canEditTask && (
                  <label className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }}>
                    <Upload size={13} /> {uploading ? 'Đang tải...' : 'Tải lên'}
                    <input type="file" hidden onChange={uploadFile} disabled={uploading} />
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attachments.map((a) => (
                  <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '7px 10px' }}>
                    <a href={`${api.defaults.baseURL}${a.file_url}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {a.file_name}
                    </a>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{Math.round((a.file_size || 0) / 1024)} KB</span>
                    {canEditTask && <button className="btn btn-sm btn-danger" onClick={() => deleteAttachment(a.id)}><Trash2 size={12} /></button>}
                  </div>
                ))}
                {!attachments.length && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Chưa có tệp đính kèm</div>}
              </div>
            </div>

            {/* Tags */}
            {projectTags.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Tag size={14} /> Tags
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {projectTags.map((tag) => {
                    const active = taskTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        disabled={!canEditTask}
                        onClick={() => toggleTag(tag.id)}
                        style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: canEditTask ? 'pointer' : 'not-allowed',
                          opacity: canEditTask ? 1 : 0.72,
                          border: `1px solid ${active ? tag.color_hex : 'var(--border)'}`,
                          background: active ? tag.color_hex : 'transparent',
                          color: active ? getReadableTextColor(tag.color_hex) : 'var(--text-secondary)',
                          boxShadow: active ? 'inset 0 0 0 1px rgba(255,255,255,0.18)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {active ? '✓ ' : ''}{tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Comments */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <MessageSquare size={14} /> Bình luận
                {comments.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({comments.length})</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, position: 'relative' }}>
                <input
                  className="form-input"
                  placeholder="Viết bình luận... Gõ @ để nhắc thành viên"
                  value={commentInput}
                  onChange={(e) => {
                    setCommentInput(e.target.value);
                    setMentionOpen(/(?:^|\s)@[A-Za-z0-9._-]*$/.test(e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') return setMentionOpen(false);
                    if (e.key === 'Enter' && !e.shiftKey && !mentionSuggestions.length) addComment();
                  }}
                  style={{ flex: 1 }}
                />
                {mentionSuggestions.length > 0 && (
                  <div className="mention-menu">
                    {mentionSuggestions.map((user) => (
                      <button type="button" key={user.id} className="mention-option" onClick={() => insertMention(user)}>
                        <span className="mention-avatar">{user.full_name?.charAt(0).toUpperCase()}</span>
                        <span><strong>{user.full_name}</strong><small>@{user.token} · {user.email}</small></span>
                      </button>
                    ))}
                  </div>
                )}
                <button className="btn btn-primary" type="button" disabled={commentSaving || !commentInput.trim()} onClick={addComment}>
                  <Send size={13} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {comments.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Chưa có bình luận nào</div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#6b7ff2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white' }}>
                            {(userMap[c.user_id]?.full_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{userMap[c.user_id]?.full_name || `User #${c.user_id}`}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="comment-edit" style={{ paddingLeft: 28 }}>
                            <textarea
                              className="form-input"
                              rows={2}
                              value={editingCommentContent}
                              onChange={(e) => setEditingCommentContent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') cancelEditingComment();
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveComment(c.id);
                              }}
                              autoFocus
                            />
                            <div className="comment-actions">
                              <button className="btn btn-sm btn-ghost" type="button" onClick={cancelEditingComment}>Hủy</button>
                              <button className="btn btn-sm btn-primary" type="button" disabled={commentSaving || !editingCommentContent.trim()} onClick={() => saveComment(c.id)}>Lưu</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', paddingLeft: 28, whiteSpace: 'pre-wrap' }}>
                            {renderMentionText(c.content)}
                          </div>
                        )}
                      </div>
                      {c.user_id === currentUser?.id && editingCommentId !== c.id && (
                        <div className="comment-actions">
                          <button className="btn btn-sm btn-ghost" title="Sửa bình luận" onClick={() => startEditingComment(c)}><Edit3 size={12} /></button>
                          <button className="btn btn-sm btn-danger" title="Xóa bình luận" onClick={() => deleteComment(c.id)}><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="modal-footer" style={{ marginTop: 12 }}>
          {canManage && (!confirmDelete ? (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Xóa công việc</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>Chắc chắn xóa?</span>
              <button className="btn btn-danger" onClick={removeTask}>Có</button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Không</button>
            </div>
          ))}
          <button className="btn btn-primary" onClick={save} disabled={!canEditTask || loading}>{loading ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
        </div>
      </div>
    </div>
  );


}

export default function BoardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toasts, addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [userMap, setUserMap] = useState({});

  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [showCreateColumn, setShowCreateColumn] = useState(false);
  const [editColumn, setEditColumn] = useState(null);
  const [confirmColumn, setConfirmColumn] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showAISummary, setShowAISummary] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [addTaskCol, setAddTaskCol] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const dismissedTaskParamRef = useRef(null);

  // ── Filter & View state ──
  const [filter, setFilter] = useState({ assignee: '', priority: '', tagId: '', dueSoon: false });
  const [groupByAssignee, setGroupByAssignee] = useState(false);
  const [projectTagsCache, setProjectTagsCache] = useState([]);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'analytics'

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const canManage = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (project?.owner_id === currentUser.id) return true;
    const member = members.find((m) => m.user_id === currentUser.id);
    return member?.project_role === 'manager';
  }, [currentUser, members, project?.owner_id]);

  const currentProjectMember = useMemo(
    () => members.find((m) => m.user_id === currentUser?.id),
    [currentUser?.id, members],
  );

  const canManageTasks = useMemo(() => (
    canManage || Boolean(currentProjectMember?.can_manage_tasks)
  ), [canManage, currentProjectMember?.can_manage_tasks]);

  const canEditTaskCard = useCallback((task) => (
    canManageTasks || (currentUser?.id && task.assignee_id === currentUser.id)
  ), [canManageTasks, currentUser?.id]);

  const loadMembers = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/members`);
      setMembers(data);

      const detailList = await Promise.all(
        data.map((m) => api.get(`/users/${m.user_id}`).then((r) => r.data).catch(() => null))
      );
      const map = {};
      detailList.filter(Boolean).forEach((u) => {
        map[u.id] = u;
      });
      setUserMap(map);
    } catch {
      setMembers([]);
      setUserMap({});
    }
  }, [projectId]);

  const loadProjectAndBoards = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, bRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/boards/project/${projectId}`),
      ]);
      setProject(pRes.data);
      const boardList = Array.isArray(bRes.data) ? bRes.data : [];
      setBoards(boardList);
      if (boardList.length) {
        setSelectedBoard((prev) => prev && boardList.some((b) => b.id === prev.id) ? prev : boardList[0]);
      } else {
        setSelectedBoard(null);
      }
    } catch {
        addToast('Không thể tải dự án hoặc bảng', 'error');
      setProject(null);
      setBoards([]);
      setSelectedBoard(null);
      navigate('/projects', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [projectId, navigate, addToast]);

  const loadBoardData = useCallback(async () => {
    if (!selectedBoard) { setColumns([]); setTasks([]); return; }
    try {
      const [colRes, taskRes] = await Promise.all([
        api.get(`/boards/project/${projectId}/${selectedBoard.id}/columns`),
        api.get(`/projects/${projectId}/tasks`),
      ]);
      setColumns((Array.isArray(colRes.data) ? colRes.data : []).sort((a, b) => a.order_index - b.order_index));
      setTasks(Array.isArray(taskRes.data) ? taskRes.data : []);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Không tải được cột/công việc', 'error');
    }
  }, [projectId, selectedBoard, addToast]);

  useEffect(() => {
    loadProjectAndBoards();
  }, [loadProjectAndBoards]);

  useEffect(() => {
    if (!project?.id) {
      setMembers([]);
      setUserMap({});
      return;
    }
    loadMembers();
  }, [project?.id, loadMembers]);

  useEffect(() => {
    loadBoardData();
  }, [loadBoardData]);

  useEffect(() => {
    const taskId = Number(searchParams.get('task'));
    if (!taskId) {
      dismissedTaskParamRef.current = null;
      return;
    }
    if (dismissedTaskParamRef.current === taskId || !tasks.length || detailTask?.id === taskId) return;
    const targetTask = tasks.find((task) => task.id === taskId);
    if (targetTask) setDetailTask(targetTask);
  }, [detailTask?.id, searchParams, tasks]);

  const closeDetailTask = useCallback(() => {
    const currentTaskId = Number(searchParams.get('task'));
    dismissedTaskParamRef.current = currentTaskId || null;
    if (searchParams.has('task')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('task');
      setSearchParams(nextParams, { replace: true });
    }
    setDetailTask(null);
  }, [searchParams, setSearchParams]);

  // Load tags for filter dropdown
  useEffect(() => {
    if (!project?.id) return;
    api.get(`/tags/project/${projectId}`)
      .then(r => setProjectTagsCache(r.data || []))
      .catch(() => {});
  }, [project?.id, projectId]);

  // ── Computed: filtered tasks ──
  const filteredTasks = useMemo(() => {
    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return tasks.filter(t => {
      if (filter.assignee && String(t.assignee_id) !== String(filter.assignee)) return false;
      if (filter.priority && t.priority !== filter.priority) return false;
      if (filter.tagId && !(t.tags || []).some(tag => String(tag.id) === String(filter.tagId))) return false;
      if (filter.dueSoon && t.due_date) {
        const due = new Date(t.due_date);
        if (due > threeDays || due < now) return false;
      } else if (filter.dueSoon && !t.due_date) return false;
      return true;
    });
  }, [tasks, filter]);

  // ── Computed: members list with task counts for swimlane ──
  const swimlaneGroups = useMemo(() => {
    if (!groupByAssignee) return null;
    const groups = {};
    filteredTasks.forEach(t => {
      const key = t.assignee_id ? String(t.assignee_id) : '__unassigned__';
      if (!groups[key]) groups[key] = { key, tasks: [] };
      groups[key].tasks.push(t);
    });
    // Sort: unassigned last
    return Object.values(groups).sort((a, b) => {
      if (a.key === '__unassigned__') return 1;
      if (b.key === '__unassigned__') return -1;
      return (userMap[a.key]?.full_name || '').localeCompare(userMap[b.key]?.full_name || '');
    });
  }, [filteredTasks, groupByAssignee, userMap]);
  const deleteColumn = async (colId) => {
    try {
      await api.delete(`/boards/project/${projectId}/${selectedBoard.id}/columns/${colId}`);
      setColumns((prev) => prev.filter((c) => c.id !== colId));
      setTasks((prev) => prev.filter((t) => t.column_id !== colId));
      addToast('Xóa cột thành công', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Xóa cột thất bại', 'error');
    } finally {
      setConfirmColumn(null);
    }
  };

  const moveTask = async (taskId, newColumnId, targetTaskId = null) => {
    try {
      const draggedTask = tasks.find((t) => t.id === taskId);
      if (!draggedTask) return;
      if (!canEditTaskCard(draggedTask)) {
        addToast('Bạn chỉ có thể di chuyển công việc được giao cho mình', 'error');
        return;
      }

      let colTasks = tasks.filter((t) => t.column_id === newColumnId).sort((a, b) => a.order_index - b.order_index);
      
      let updatedTask = draggedTask;

      // If moving from another column, update column_id first
      if (draggedTask.column_id !== newColumnId) {
        const optimisticTask = { ...draggedTask, column_id: newColumnId };
        setTasks((prev) => prev.map(t => t.id === taskId ? optimisticTask : t));
        const { data: movedTask } = await api.put(
          `/projects/${projectId}/tasks/${taskId}/move`,
          null,
          { params: { new_column_id: newColumnId, expected_updated_at: draggedTask.updated_at } },
        );
        updatedTask = movedTask || { ...draggedTask, column_id: newColumnId };
        colTasks.push(updatedTask);
        // Cập nhật tasks global state để tránh lỗi khi kéo thả nhiều lần
        setTasks((prev) => prev.map(t => t.id === taskId ? updatedTask : t));
      }

      // Reorder logic
      colTasks = colTasks.filter((t) => t.id !== taskId);

      if (targetTaskId) {
        const targetIndex = colTasks.findIndex((t) => t.id === targetTaskId);
        if (targetIndex !== -1) {
          colTasks.splice(targetIndex, 0, updatedTask);
        } else {
          colTasks.push(updatedTask);
        }
      } else {
        colTasks.push(updatedTask);
      }

      const promises = [];
      const updatedTasks = colTasks.map((t, idx) => {
        const newOrder = idx + 1;
        if (t.order_index !== newOrder && (canManageTasks || t.id === taskId)) {
          t.order_index = newOrder;
          const payload = { order_index: newOrder };
          if (t.id === taskId) {
            payload.expected_updated_at = t.updated_at;
          }
          promises.push(api.put(`/projects/${projectId}/tasks/${t.id}`, payload));
        }
        return t;
      });

      setTasks((prev) => {
        const others = prev.filter((t) => t.column_id !== newColumnId);
        return [...others, ...updatedTasks];
      });

      await Promise.all(promises);
      loadBoardData();
    } catch (err) {
      if (err.response?.status === 409) {
        addToast('Bảng vừa được người khác cập nhật. Hệ thống đã tải lại dữ liệu mới.', 'error');
      } else {
        addToast(err.response?.data?.detail || 'Di chuyển công việc thất bại', 'error');
      }
      loadBoardData(); // Reload to revert optimistic update
    }
  };

  if (loading) {
    return (
      <div style={{ marginLeft: 240 }}>
        <div className="loading"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <button className="btn-icon" onClick={() => navigate('/projects')}><ArrowLeft size={18} /></button>
        <div style={{ flex: 1 }}>
          <div className="topbar-title">
            {project?.name || 'Dự án'}
            <span className="topbar-subtitle">/ {selectedBoard?.name || 'Bảng'}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowMembers(true)}>
          <Users size={14} /> Thành viên
        </button>
        {canManage && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowArchiveModal(true)} style={{ color: 'var(--text-secondary)' }}>
              <Archive size={14} /> Lưu trữ
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateBoard(true)}>
              <Plus size={14} /> Bảng mới
            </button>
          </>
        )}
      </div>

      <div className="board-selector" style={{ paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {boards.map((b) => (
            <button
              key={b.id}
              className={`board-tab ${selectedBoard?.id === b.id && viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => { setSelectedBoard(b); setViewMode('kanban'); }}
            >
              <LayoutGrid size={13} style={{ marginRight: 4, display: 'inline' }} />{b.name}
            </button>
          ))}
          {/* Thêm cột / chế độ xem */}
          {selectedBoard && (
            canManage ? (
              <button
                className="board-tab"
                style={{ borderStyle: 'dashed', opacity: 0.7 }}
                onClick={() => setShowCreateBoard(true)}
              >
                <Plus size={13} style={{ marginRight: 4, display: 'inline' }} />Thêm bảng
              </button>
            ) : (
              <span
                title="Chỉ Manager/Owner mới có thể quản lý cột"
                style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
              >
                <Lock size={11} /> Chế độ xem
              </span>
            )
          )}
        </div>
        
        {/* Analytics Tab */}
        <div style={{ paddingRight: 24, display: 'flex', gap: 8 }}>
          <button
            className="board-tab"
            onClick={() => setShowAISummary(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px' }}
          >
            <Activity size={14} /> Tổng kết
          </button>
          <button
            className={`board-tab ${showAnalyticsModal ? 'active' : ''}`}
            onClick={() => setShowAnalyticsModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px' }}
          >
            <BarChart3 size={14} /> Thống kê
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      {viewMode === 'kanban' && selectedBoard && columns.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ flex: 1 }}>
            <KanbanFilterBar
              members={members}
              userMap={userMap}
              projectTags={projectTagsCache}
              value={filter}
              onChange={setFilter}
            />
          </div>
          {/* GroupBy toggle */}
          <div style={{ padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', height: '100%', display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setGroupByAssignee(g => !g)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${groupByAssignee ? 'rgba(37,99,235,0.32)' : 'var(--border)'}`,
                background: groupByAssignee ? 'rgba(37,99,235,0.10)' : 'var(--bg-card)',
                color: groupByAssignee ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: groupByAssignee ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              <Users size={12} /> {groupByAssignee ? 'Theo Assignee' : 'Theo cột'}
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {viewMode === 'analytics' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ProjectAnalytics projectId={projectId} />
          </div>
        ) : !selectedBoard ? (
          <div className="empty-state">
            <h3>Dự án chưa có bảng</h3>
            <p>Hãy tạo bảng để bắt đầu làm việc theo cấu trúc Trello.</p>
            {canManage && <button className="btn btn-primary" onClick={() => setShowCreateBoard(true)}><Plus size={14} /> Tạo bảng</button>}
          </div>
        ) : columns.length === 0 ? (
          <div className="empty-state">
            <h3>Bảng chưa có cột</h3>
            <p>Tạo cột như To Do, Đang làm, Hoàn thành để quản lý công việc.</p>
            {canManage
              ? <button className="btn btn-primary" onClick={() => setShowCreateColumn(true)}><Plus size={14} /> Tạo cột</button>
              : <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Liên hệ Manager hoặc Owner của dự án để tạo cột.</p>
            }
          </div>
        ) : groupByAssignee && swimlaneGroups ? (
          /* ── SWIMLANE VIEW (Group by Assignee) ── */
          <div style={{ overflow: 'auto', flex: 1 }}>
            {swimlaneGroups.map(group => {
              const isUnassigned = group.key === '__unassigned__';
              const userName = isUnassigned ? 'Chưa giao' : (userMap[group.key]?.full_name || `User #${group.key}`);
              const initials = isUnassigned ? '?' : (userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2));
              return (
                <div key={group.key} style={{ marginBottom: 24 }}>
                  {/* Lane header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', marginBottom: 8,
                    borderBottom: '2px solid var(--border)',
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: isUnassigned ? 'var(--bg-secondary)' : '#6b7ff2',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: isUnassigned ? 'var(--text-muted)' : 'white',
                      flexShrink: 0,
                    }}>{initials}</div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{userName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10 }}>
                      {group.tasks.length} công việc
                    </span>
                  </div>
                  {/* Columns grid for this lane */}
                  <div className="kanban-wrapper" style={{ minHeight: 60 }}>
                    {columns.map(col => {
                      const laneTasks = group.tasks
                        .filter(t => t.column_id === col.id)
                        .sort((a, b) => a.order_index - b.order_index);
                      return (
                        <div key={col.id} className="kanban-column"
                          style={{ minHeight: 50 }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => {
                            const taskId = Number(e.dataTransfer.getData('taskId'));
                            if (taskId) moveTask(taskId, col.id);
                          }}
                        >
                          <div className="kanban-column-header">
                            <div className="col-name" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color || 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
                              {col.name}
                            </div>
                            <div className="col-count">{laneTasks.length}</div>
                          </div>
                          <div className="kanban-tasks">
                            {laneTasks.map(task => {
                              const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                              return (
                                <div
                                  key={task.id}
                                  className="task-card"
                                  draggable={canEditTaskCard(task)}
                                  onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
                                  onClick={() => setDetailTask(task)}
                                  style={{ borderLeft: '3px solid var(--border)' }}
                                >
                                  <div className="task-card-title" title={task.title}>
                                    <span className="task-card-title-text">{task.title}</span>
                                  </div>
                                  <div className="task-card-meta">
                                    <span className={`type-badge ${TYPE_CLASSES[task.task_type] || 'type-task'}`}>
                                      {TYPE_LABELS[task.task_type] || task.task_type}
                                    </span>
                                    {task.due_date && (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: isOverdue ? 'var(--red)' : 'var(--text-muted)', fontSize: 10 }}>
                                        <CalendarDays size={10} />
                                        {new Date(task.due_date).toLocaleDateString('vi-VN')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="kanban-wrapper">
            {columns.map((col) => {
              const colTasks = filteredTasks
                .filter((t) => t.column_id === col.id)
                .sort((a, b) => a.order_index - b.order_index);
              const wipExceeded = col.wip_limit && colTasks.length > col.wip_limit;
              return (
                <div
                  key={col.id}
                  className="kanban-column"
                  style={wipExceeded ? { borderColor: 'rgba(248,81,73,0.4)' } : {}}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const taskId = Number(e.dataTransfer.getData('taskId'));
                    if (taskId) moveTask(taskId, col.id);
                  }}
                >
                  <div className="kanban-column-header" style={wipExceeded ? { background: 'rgba(248,81,73,0.06)' } : {}}>
                    <div className="col-name" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color || 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
                      {col.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {col.wip_limit && (
                        <span style={{ fontSize: 10, color: wipExceeded ? 'var(--red)' : 'var(--text-muted)', fontWeight: 600 }}>
                          {colTasks.length}/{col.wip_limit}
                        </span>
                      )}
                      {!col.wip_limit && <div className="col-count">{colTasks.length}</div>}
                      {canManage && (
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          {confirmColumn === col.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn-icon"
                                title="Xác nhận xóa"
                                style={{ width: 22, height: 22, fontSize: 11, color: 'var(--green)' }}
                                onClick={() => deleteColumn(col.id)}
                              >
                                ✓
                              </button>
                              <button
                                className="btn-icon"
                                title="Hủy"
                                style={{ width: 22, height: 22, fontSize: 11, color: 'var(--text-muted)' }}
                                onClick={() => setConfirmColumn(null)}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                className="btn-icon"
                                title="Sửa cột"
                                style={{ width: 22, height: 22, fontSize: 11 }}
                                onClick={() => setEditColumn(col)}
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                className="btn-icon"
                                title="Xóa cột"
                                style={{ width: 22, height: 22, fontSize: 11, color: 'var(--red)' }}
                                onClick={() => setConfirmColumn(col.id)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="kanban-cards">
                    {colTasks.map((task) => {
                      const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.progress_percent < 100;
                      return (
                        <div
                          key={task.id}
                          className="task-card"
                          draggable={canEditTaskCard(task)}
                          onDragStart={(e) => e.dataTransfer.setData('taskId', String(task.id))}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const draggedTaskId = Number(e.dataTransfer.getData('taskId'));
                            if (draggedTaskId && draggedTaskId !== task.id) {
                              moveTask(draggedTaskId, col.id, task.id);
                            }
                          }}
                          onClick={() => setDetailTask(task)}
                        >
                          <div className="task-card-title" title={task.title}>
                            <span className="task-card-title-text">{task.title}</span>
                          </div>
                          <div className="task-card-meta" style={{ marginBottom: 6 }}>
                            <span className={`priority-badge priority-${String(task.priority || 'Medium').toLowerCase()}`}>
                              {PRIORITY_LABELS[task.priority] || task.priority || 'Trung bình'}
                            </span>
                            <span className={`type-badge ${TYPE_CLASSES[task.task_type] || 'type-task'}`}>{TYPE_LABELS[task.task_type] || task.task_type}</span>
                            {task.is_ai_generated && (
                              <span className="ai-generated-mark" title="Được tạo tự động">
                                <Sparkles size={11} />
                              </span>
                            )}
                          </div>

                          {/* Progress bar — luôn hiển để giữ card đồng đều */}
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                              <span>{assigneeLabel(task, userMap)}</span>
                              <span style={{ color: task.progress_percent === 100 ? 'var(--green)' : 'inherit' }}>
                                {task.progress_percent}%
                              </span>
                            </div>
                            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                              <div style={{
                                width: `${task.progress_percent}%`,
                                height: '100%',
                                background: task.progress_percent === 100 ? 'var(--green)' : 'var(--accent)',
                                borderRadius: 2,
                                transition: 'width 0.3s ease',
                              }} />
                            </div>
                          </div>

                          {/* Footer meta row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            {task.due_date && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: isOverdue ? 'var(--red)' : 'var(--text-muted)' }}>
                                <CalendarDays size={10} />
                                {new Date(task.due_date).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                            {task.checklist_total > 0 && (
                              <span>☑ {task.checklist_completed}/{task.checklist_total}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button className="kanban-add-btn" onClick={() => setAddTaskCol(col.id)}>
                    <Plus size={14} /> Thêm công việc
                  </button>
                </div>
              );
            })}

            {canManage && (
              <div className="kanban-column" style={{ minWidth: 300, maxWidth: 300, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed' }}>
                <button className="btn btn-ghost" onClick={() => setShowCreateColumn(true)}><Plus size={14} /> Thêm cột</button>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateBoard && (
        <CreateBoardModal
          projectId={projectId}
          onClose={() => setShowCreateBoard(false)}
          onCreated={(b) => {
            setBoards((prev) => [...prev, b]);
            setSelectedBoard(b);
            addToast('Tạo bảng thành công', 'success');
          }}
        />
      )}

      {showAnalyticsModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAnalyticsModal(false)}>
          <div className="modal" style={{ width: 'min(980px, 94vw)', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 4 }}>{'Th\u1ed1ng k\u00ea d\u1ef1 \u00e1n'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {'Ph\u00e2n t\u00edch ti\u1ebfn \u0111\u1ed9, tr\u1ea1ng th\u00e1i, m\u1ee9c \u01b0u ti\u00ean v\u00e0 kh\u1ed1i l\u01b0\u1ee3ng c\u00f4ng vi\u1ec7c theo th\u00e0nh vi\u00ean.'}
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowAnalyticsModal(false)}><X size={16} /></button>
            </div>
            <ProjectAnalytics projectId={projectId} />
          </div>
        </div>
      )}

      {showCreateColumn && selectedBoard && (
        <CreateColumnModal
          projectId={projectId}
          boardId={selectedBoard.id}
          onClose={() => setShowCreateColumn(false)}
          onCreated={(c) => {
            setColumns((prev) => [...prev, c].sort((a, b) => a.order_index - b.order_index));
            addToast('Tạo cột thành công', 'success');
          }}
        />
      )}

      {showMembers && (
        <MembersModal
          projectId={projectId}
          members={members}
          userMap={userMap}
          currentUserId={currentUser?.id}
          onClose={() => setShowMembers(false)}
          onChanged={loadMembers}
          addToast={addToast}
        />
      )}

      {showAISummary && (
        <ProjectAISummaryModal
          projectId={projectId}
          onClose={() => setShowAISummary(false)}
        />
      )}

      {editColumn && selectedBoard && (
        <EditColumnModal
          column={editColumn}
          projectId={projectId}
          boardId={selectedBoard.id}
          onClose={() => setEditColumn(null)}
          onUpdated={(updated) => {
            setColumns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setEditColumn(null);
            addToast('Cập nhật cột thành công', 'success');
          }}
        />
      )}

      {addTaskCol && (
        <CreateTaskModal
          projectId={projectId}
          columnId={addTaskCol}
          members={members}
          userMap={userMap}
          canManage={canManageTasks}
          currentUser={currentUser}
          onClose={() => setAddTaskCol(null)}
          onCreated={(task) => {
            setTasks((prev) => [...prev, task]);
            addToast('Tạo công việc thành công', 'success');
          }}
        />
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projectId={projectId}
          members={members}
          userMap={userMap}
          canManage={canManage}
          canManageTasks={canManageTasks}
          currentUser={currentUser}
          onClose={closeDetailTask}
          onUpdated={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setDetailTask(updated);
          }}
          onDeleted={(deletedId) => {
            setTasks((prev) => prev.filter((t) => t.id !== deletedId));
          }}
          addToast={addToast}
        />
      )}

      {showArchiveModal && (
        <ArchiveModal
          projectId={projectId}
          boardId={selectedBoard?.id}
          onClose={() => setShowArchiveModal(false)}
          onRestored={() => {
            loadBoardData(); // Reload columns & tasks if something is restored
          }}
        />
      )}

      <ToastContainer toasts={toasts} />
    </>
  );
}
