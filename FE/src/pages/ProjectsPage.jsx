import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Plus, Search, Clock, MoreVertical, Trash2, Edit3, X,
  AlertCircle, FolderOpen, Layers, Activity, CheckCircle2, Archive,
} from 'lucide-react';
import { useToast, ToastContainer } from '../hooks/useToast';
import ArchivedProjectsModal from '../components/ArchivedProjectsModal';

const PROJECT_COLORS = ['#4f8ef7', '#a78bfa', '#3fb950', '#f0883e', '#f85149', '#d29922'];
const PROJECT_ICONS = [Layers, Activity, FolderOpen, CheckCircle2, Layers, Activity];

function getColor(id) { return PROJECT_COLORS[id % PROJECT_COLORS.length]; }
function getProjectIcon(id) {
  const Icon = PROJECT_ICONS[id % PROJECT_ICONS.length];
  return <Icon size={17} strokeWidth={2} />;
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function CreateProjectModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    project_key: '',
    color: '#4f8ef7',
    description: '',
    status: 'Active',
    start_date: '',
    end_date: '',
    is_starred: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Tên project không được để trống'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      };
      const { data } = await api.post('/projects/', payload);
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Tạo project thất bại');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div className="modal-title">Tạo Project mới</div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-subtitle">
          Project sẽ được tạo tự động với Kanban board và 3 cột mặc định
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)',
            borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--red)', marginBottom: 12,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Tên Project *</label>
            <input
              id="project-name-input"
              className="form-input"
              placeholder="Ví dụ: Hệ thống quản lý kho"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Mã project (tuỳ chọn)</label>
              <input
                className="form-input"
                placeholder="VD: PM"
                value={form.project_key}
                onChange={e => setForm(p => ({ ...p, project_key: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Màu</label>
              <input
                type="color"
                className="form-input"
                value={form.color}
                onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                style={{ padding: 4, height: 40 }}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea
              id="project-desc-input"
              className="form-input"
              placeholder="Mô tả ngắn về project..."
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Trạng thái ban đầu</label>
            <select
              id="project-status-select"
              className="form-input"
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            >
              <option value="Active">Active – Đang hoạt động</option>
              <option value="On Hold">On Hold – Tạm dừng</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Ngày bắt đầu</label>
              <input type="datetime-local" className="form-input" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Ngày kết thúc</label>
              <input type="datetime-local" className="form-input" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.is_starred} onChange={e => setForm(p => ({ ...p, is_starred: e.target.checked }))} />
            Ghim project ưu tiên
          </label>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
            <button id="btn-create-project-submit" type="submit" className="btn btn-primary" disabled={loading}>
              <Plus size={15} />
              {loading ? 'Đang tạo...' : 'Tạo Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditProjectModal({ project, onClose, onUpdated, onError }) {
  const [form, setForm] = useState({
    name: project.name,
    project_key: project.project_key || '',
    color: project.color || '#4f8ef7',
    description: project.description || '',
    status: project.status,
    start_date: project.start_date ? new Date(project.start_date).toISOString().slice(0, 16) : '',
    end_date: project.end_date ? new Date(project.end_date).toISOString().slice(0, 16) : '',
    is_starred: !!project.is_starred,
    is_archived: !!project.is_archived,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      };
      const { data } = await api.put(`/projects/${project.id}`, payload);
      onUpdated(data);
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = err.response?.status === 403
        ? 'Bạn không có quyền chỉnh sửa project này.'
        : detail || 'Cập nhật project thất bại';
      onError?.(message);
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Edit3 size={16} color="var(--accent)" />
            <div className="modal-title" style={{ marginBottom: 0 }}>Chỉnh sửa Project</div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <div className="form-group">
            <label className="form-label">Tên Project</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Mã project</label>
              <input className="form-input" value={form.project_key} onChange={e => setForm(p => ({ ...p, project_key: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Màu</label>
              <input type="color" className="form-input" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} style={{ padding: 4, height: 40 }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea className="form-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Trạng thái</label>
            <select className="form-input" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="Active">Active – Đang hoạt động</option>
              <option value="On Hold">On Hold – Tạm dừng</option>
              <option value="Completed">Completed – Hoàn thành</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Ngày bắt đầu</label>
              <input type="datetime-local" className="form-input" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Ngày kết thúc</label>
              <input type="datetime-local" className="form-input" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 4, marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.is_starred} onChange={e => setForm(p => ({ ...p, is_starred: e.target.checked }))} />
              Ghim project
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.is_archived} onChange={e => setForm(p => ({ ...p, is_archived: e.target.checked }))} />
              Lưu trữ
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [confirmProject, setConfirmProject] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const { toasts, addToast } = useToast();

  useEffect(() => {
    api.get('/projects/me')
      .then(r => setProjects(r.data || []))
      .catch(() => addToast('Không tải được danh sách project', 'error'))
      .finally(() => setLoading(false));

    const close = () => setMenuOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [addToast]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/projects/${id}`);
      setProjects(p => p.filter(x => x.id !== id));
      addToast('Đã xóa project', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Xóa thất bại', 'error');
    } finally {
      setConfirmProject(null);
      setMenuOpen(null);
    }
  };

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const statusLabel = (s) =>
    s === 'Active' ? 'Đang chạy' : s === 'Completed' ? 'Hoàn thành' : 'Tạm dừng';
  const statusClass = (s) =>
    s === 'Active' ? 'badge-active' : s === 'Completed' ? 'badge-completed' : 'badge-hold';

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          Projects
          <span className="topbar-subtitle">{projects.length} project</span>
        </div>
        <div className="search-bar">
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            id="project-search"
            placeholder="Tìm kiếm project..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-ghost" onClick={() => setShowArchiveModal(true)} style={{ color: 'var(--text-secondary)' }}>
          <Archive size={15} /> Thùng rác
        </button>
        <button id="btn-new-project" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Tạo Project
        </button>
      </div>

      <div className="page">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
              <FolderOpen size={52} strokeWidth={1.2} />
            </div>
            <h3>{search ? 'Không tìm thấy project' : 'Chưa có project nào'}</h3>
            <p>{search ? 'Thử tìm với từ khóa khác' : 'Nhấn "Tạo Project" để bắt đầu!'}</p>
            {!search && (
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
                <Plus size={15} /> Tạo Project mới
              </button>
            )}
          </div>
        ) : (
          <div className="project-grid">
            {filtered.map(p => (
              <div
                key={p.id}
                className="project-card"
                onClick={() => navigate(`/projects/${p.id}`)}
                style={{ cursor: 'pointer' }}
              >
                {/* Gradient top border */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: `linear-gradient(90deg, ${getColor(p.id)}, ${PROJECT_COLORS[(p.id + 2) % PROJECT_COLORS.length]})`,
                  borderRadius: '16px 16px 0 0',
                }} />

                <div className="project-header">
                  {/* Icon box — Lucide icons, no emoji */}
                  <div className="project-icon" style={{
                    background: `${getColor(p.id)}18`,
                    color: getColor(p.id),
                  }}>
                    {getProjectIcon(p.id)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="project-name">{p.name}</div>
                    <div className="project-desc">{p.description || 'Chưa có mô tả'}</div>
                  </div>

                  {/* Context menu */}
                  <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <button
                      className="btn-icon"
                      id={`project-menu-${p.id}`}
                      onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                    >
                      <MoreVertical size={15} />
                    </button>
                    {menuOpen === p.id && (
                      <div style={{
                        position: 'absolute', right: 0, top: '100%', marginTop: 4,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 8, minWidth: 150, boxShadow: 'var(--shadow-md)', zIndex: 50,
                        overflow: 'hidden',
                      }}>
                        <button
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); setEditProject(p); setMenuOpen(null); }}
                        >
                          <Edit3 size={13} /> Chỉnh sửa
                        </button>
                        {confirmProject === p.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Bạn chắc chắn muốn xóa?</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn btn-sm btn-danger" style={{ flex: 1 }}
                                onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                              >
                                Xóa
                              </button>
                              <button
                                className="btn btn-sm btn-ghost" style={{ flex: 1 }}
                                onClick={(e) => { e.stopPropagation(); setConfirmProject(null); }}
                              >
                                Hủy
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); setConfirmProject(p.id); }}
                          >
                            <Trash2 size={13} /> Xóa project
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="project-meta">
                  <span className={`badge ${statusClass(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={10} />
                    {new Date(p.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={p => { setProjects(prev => [p, ...prev]); addToast('Tạo project thành công!'); }}
        />
      )}
      {editProject && (
        <EditProjectModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onUpdated={p => { setProjects(prev => prev.map(x => x.id === p.id ? p : x)); addToast('Cập nhật thành công!'); }}
          onError={(message) => addToast(message, 'error')}
        />
      )}
      {showArchiveModal && (
        <ArchivedProjectsModal
          onClose={() => setShowArchiveModal(false)}
          onRestored={() => {
            // Reload projects
            api.get('/projects/me').then(r => setProjects(r.data || []));
          }}
        />
      )}
      <ToastContainer toasts={toasts} />
    </>
  );
}
