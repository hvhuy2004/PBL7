/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Activity,
  CalendarDays,
  Cpu,
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

const PRIORITY_COLORS = { Low: '#3fb950', Medium: '#d29922', High: '#f85149' };
const TYPE_CLASSES = { Task: 'type-task', Bug: 'type-bug', Feature: 'type-feature', Docs: 'type-docs' };
const TYPE_LABELS = { Task: 'Công việc', Bug: 'Lỗi', Feature: 'Tính năng', Docs: 'Tài liệu' };

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
  const [wipLimit, setWipLimit] = useState('');
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

function MembersModal({ projectId, members, userMap, onClose, onChanged, addToast }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [role, setRole] = useState('developer');
  const [loading, setLoading] = useState(false);

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
      await api.post(`/projects/${projectId}/members`, { user_id: userId, project_role: role });
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

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>Thành viên dự án</div>
          <button className="btn-icon" onClick={onClose}><X size={15} /></button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Mời thành viên mới</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 90px', gap: 8 }}>
            <input className="form-input" placeholder="Nhập email user..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="manager">manager</option>
              <option value="developer">developer</option>
              <option value="tester">tester</option>
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
            return (
              <div key={m.user_id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 100px', gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.full_name || `User #${m.user_id}`}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user?.email || '-'}</div>
                </div>
                <div style={{ fontSize: 12 }} className="badge badge-active">{m.project_role}</div>
                <button className="btn btn-sm btn-danger" onClick={() => removeMember(m.user_id)}><Trash2 size={13} /> Xóa</button>
              </div>
            );
          })}
          {!members.length && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Chưa có thành viên</div>}
        </div>
      </div>
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
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const assignableMembers = useMemo(() => {
    if (canManage) return members;
    if (!currentUser?.id) return [];
    return members.filter((m) => m.user_id === currentUser.id);
  }, [canManage, currentUser, members]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Tiêu đề công việc không được để trống');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        start_date: localDatetimeInputToISO(form.start_date),
        due_date: localDatetimeInputToISO(form.due_date),
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        progress_percent: Number(form.progress_percent || 0),
      };
      const { data } = await api.post(`/projects/${projectId}/tasks`, payload);
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Tạo công việc thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 650 }}>
        <div className="modal-title">Tạo công việc</div>
        {error && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Tiêu đề *</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea className="form-input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
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
                  Bạn chỉ có thể giao task cho chính mình.
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
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Đang tạo...' : 'Tạo công việc'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDetailModal({ task, projectId, members, userMap, canManage, onClose, onUpdated, onDeleted, addToast }) {
  const taskRef = useRef(task);
  const onUpdatedRef = useRef(onUpdated);

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
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      addToast(err.response?.data?.detail || 'Xóa bình luận thất bại', 'error');
    }
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
    loadAttachments();
    loadChecklist();
    loadComments();
    loadTags();
  }, [loadAttachments, loadChecklist, loadComments, loadTags]);

  const save = async () => {
    setLoading(true);
    try {
      const checklistTotal = checklistItems.length;
      const checklistCompleted = checklistItems.filter((i) => i.is_done).length;
      const payload = {
        ...form,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        start_date: localDatetimeInputToISO(form.start_date),
        due_date: localDatetimeInputToISO(form.due_date),
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        progress_percent: Number(form.progress_percent || 0),
        checklist_total: checklistTotal,
        checklist_completed: checklistCompleted,
      };
      if (!canManage) {
        delete payload.assignee_id;
      }
      const { data } = await api.put(`/projects/${projectId}/tasks/${task.id}`, payload);
      onUpdated(data);
      addToast('Cập nhật công việc thành công', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Cập nhật công việc thất bại', 'error');
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
            <button className="btn-icon" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {/* Title – always visible */}
        <div className="form-group">
          <label className="form-label">Tiêu đề</label>
          <input className="form-input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        </div>

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
              <textarea className="form-input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} style={{ minHeight: 90 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Người nhận việc</label>
                {canManage ? (
                  <select className="form-input" value={form.assignee_id} onChange={(e) => setForm((p) => ({ ...p, assignee_id: e.target.value }))}>
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
                  onChange={(e) => setChecklistInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                />
                <button className="btn btn-primary" type="button" disabled={checklistSaving} onClick={addChecklistItem}>
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
                        <input type="checkbox" checked={!!item.is_done} onChange={() => toggleChecklistItem(item)} />
                        <span style={{ textDecoration: item.is_done ? 'line-through' : 'none', color: item.is_done ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                          {item.title}
                        </span>
                      </label>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteChecklistItem(item.id)}><Trash2 size={12} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Attachments */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Paperclip size={14} /> Tệp đính kèm</div>
                <label className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }}>
                  <Upload size={13} /> {uploading ? 'Đang tải...' : 'Tải lên'}
                  <input type="file" hidden onChange={uploadFile} disabled={uploading} />
                </label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attachments.map((a) => (
                  <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '7px 10px' }}>
                    <a href={`${api.defaults.baseURL}${a.file_url}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {a.file_name}
                    </a>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{Math.round((a.file_size || 0) / 1024)} KB</span>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteAttachment(a.id)}><Trash2 size={12} /></button>
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
                        onClick={() => toggleTag(tag.id)}
                        style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${active ? tag.color_hex : 'var(--border)'}`,
                          background: active ? `${tag.color_hex}22` : 'transparent',
                          color: active ? tag.color_hex : 'var(--text-secondary)',
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  className="form-input"
                  placeholder="Viết bình luận..."
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addComment()}
                  style={{ flex: 1 }}
                />
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
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white' }}>
                            {(userMap[c.user_id]?.full_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{userMap[c.user_id]?.full_name || `User #${c.user_id}`}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', paddingLeft: 28 }}>{c.content}</div>
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteComment(c.id)}><Trash2 size={12} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="modal-footer" style={{ marginTop: 12 }}>
          {!confirmDelete ? (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Xóa công việc</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>Chắc chắn xóa?</span>
              <button className="btn btn-danger" onClick={removeTask}>Có</button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Không</button>
            </div>
          )}
          <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
        </div>
      </div>
    </div>
  );


}

export default function BoardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
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
  const [addTaskCol, setAddTaskCol] = useState(null);
  const [detailTask, setDetailTask] = useState(null);

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
    } catch (err) {
      console.error('Load members failed', err);
      setMembers([]);
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
      addToast('Không thể tải project/board', 'error');
      navigate('/projects');
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
    loadMembers();
  }, [loadProjectAndBoards, loadMembers]);

  useEffect(() => {
    loadBoardData();
  }, [loadBoardData]);

  // Load tags for filter dropdown
  useEffect(() => {
    if (!projectId) return;
    api.get(`/tags/project/${projectId}`)
      .then(r => setProjectTagsCache(r.data || []))
      .catch(() => {});
  }, [projectId]);

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

      let colTasks = tasks.filter((t) => t.column_id === newColumnId).sort((a, b) => a.order_index - b.order_index);
      
      let updatedTask = draggedTask;

      // If moving from another column, update column_id first
      if (draggedTask.column_id !== newColumnId) {
        await api.put(`/projects/${projectId}/tasks/${taskId}/move?new_column_id=${newColumnId}`);
        updatedTask = { ...draggedTask, column_id: newColumnId };
        colTasks.push(updatedTask);
        // Cập nhật tasks global state để tránh lỗi khi kéo thả nhiều lần
        setTasks((prev) => prev.map(t => t.id === taskId ? updatedTask : t));
      }

      // Reorder logic
      colTasks = colTasks.filter((t) => t.id !== taskId);

      if (targetTaskId) {
        const targetIndex = colTasks.findIndex((t) => t.id === targetTaskId);
        if (targetIndex !== -1) {
          colTasks.splice(targetIndex, 0, draggedTask);
        } else {
          colTasks.push(draggedTask);
        }
      } else {
        colTasks.push(draggedTask);
      }

      const promises = [];
      const updatedTasks = colTasks.map((t, idx) => {
        const newOrder = idx + 1;
        if (t.order_index !== newOrder) {
          t.order_index = newOrder;
          promises.push(api.put(`/projects/${projectId}/tasks/${t.id}`, { order_index: newOrder }));
        }
        return t;
      });

      setTasks((prev) => {
        const others = prev.filter((t) => t.column_id !== newColumnId);
        return [...others, ...updatedTasks];
      });

      await Promise.all(promises);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Di chuyển công việc thất bại', 'error');
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
        <div style={{ paddingRight: 24 }}>
          <button
            className={`board-tab ${viewMode === 'analytics' ? 'active' : ''}`}
            onClick={() => setViewMode('analytics')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px' }}
          >
            <Activity size={14} /> Thống kê
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
                border: `1px solid ${groupByAssignee ? 'var(--purple)' : 'var(--border)'}`,
                background: groupByAssignee ? 'rgba(167,139,250,0.1)' : 'var(--bg-card)',
                color: groupByAssignee ? 'var(--purple)' : 'var(--text-secondary)',
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
                      background: isUnassigned ? 'var(--bg-secondary)' : 'linear-gradient(135deg, var(--accent), var(--purple))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: isUnassigned ? 'var(--text-muted)' : 'white',
                      flexShrink: 0,
                    }}>{initials}</div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{userName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10 }}>
                      {group.tasks.length} task
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
                            <div className="col-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color || 'var(--accent)', display: 'inline-block' }} />
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
                                  draggable
                                  onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
                                  onClick={() => setDetailTask(task)}
                                  style={{ borderLeft: `3px solid ${PRIORITY_COLORS[task.priority] || 'var(--border)'}` }}
                                >
                                  <div className="task-title">{task.title}</div>
                                  <div className="task-meta">
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
                    <div className="col-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color || 'var(--accent)', display: 'inline-block' }} />
                      {col.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {col.wip_limit && (
                        <span style={{ fontSize: 10, color: wipExceeded ? 'var(--red)' : 'var(--text-muted)', fontWeight: 600 }}>
                          {colTasks.length}/{col.wip_limit}
                        </span>
                      )}
                      <div className="col-count">{colTasks.length}</div>
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
                          draggable
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
                          <div className="task-card-title">{task.title}</div>
                          <div className="task-card-meta" style={{ marginBottom: 6 }}>
                            <div className="priority-dot" style={{ background: PRIORITY_COLORS[task.priority] || '#8b949e' }} title={task.priority} />
                            <span className={`type-badge ${TYPE_CLASSES[task.task_type] || 'type-task'}`}>{TYPE_LABELS[task.task_type] || task.task_type}</span>
                            {task.is_ai_generated && <Cpu size={12} color="var(--purple)" />}
                            {isOverdue && <AlertCircle size={12} color="var(--red)" title="Quá hạn" />}
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
              <div className="kanban-column" style={{ minWidth: 260, maxWidth: 260, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed' }}>
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
          onClose={() => setShowMembers(false)}
          onChanged={loadMembers}
          addToast={addToast}
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
          canManage={canManage}
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
          onClose={() => setDetailTask(null)}
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
