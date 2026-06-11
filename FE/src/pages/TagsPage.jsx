/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { FolderKanban, Hash, Palette, Pencil, Plus, Save, Search, Tags, Trash2, X } from 'lucide-react';
import api from '../api';

const COLOR_PRESETS = ['#2563eb', '#16a34a', '#ea580c', '#dc2626', '#7c3aed', '#0891b2', '#64748b'];

export default function TagsPage() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [tags, setTags] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', color_hex: COLOR_PRESETS[0] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', color_hex: COLOR_PRESETS[0] });
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.get('/projects/me')
      .then((r) => {
        const list = r.data || [];
        if (!mounted) return;
        setProjects(list);
        if (list.length) setSelectedProjectId(String(list[0].id));
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const loadProjectData = async (projectId) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [tagRes, taskRes] = await Promise.all([
        api.get(`/tags/project/${projectId}`).catch(() => ({ data: [] })),
        api.get(`/projects/${projectId}/tasks`).catch(() => ({ data: [] })),
      ]);
      setTags(tagRes.data || []);
      setTasks(taskRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProjectData(selectedProjectId); }, [selectedProjectId]);

  const tagUsage = useMemo(() => {
    const map = new Map();
    tags.forEach((tag) => map.set(tag.id, 0));
    tasks.forEach((task) => {
      (task.tags || []).forEach((tag) => {
        map.set(tag.id, (map.get(tag.id) || 0) + 1);
      });
    });
    return map;
  }, [tags, tasks]);

  const filteredTags = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(normalized));
  }, [tags, query]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError('Tên nhãn không được để trống');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/tags/project/${selectedProjectId}`, { name, color_hex: form.color_hex });
      setForm({ name: '', color_hex: COLOR_PRESETS[0] });
      await loadProjectData(selectedProjectId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Không tạo được nhãn');
    } finally {
      setSaving(false);
    }
  };

  const selectedProject = projects.find((project) => String(project.id) === String(selectedProjectId));

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setEditForm({ name: tag.name, color_hex: tag.color_hex || COLOR_PRESETS[0] });
    setError('');
  };

  const handleUpdate = async (tagId) => {
    const name = editForm.name.trim();
    if (!name) return setError('Tên nhãn không được để trống');
    setSaving(true);
    setError('');
    try {
      await api.put(`/tags/project/${selectedProjectId}/${tagId}`, { name, color_hex: editForm.color_hex });
      setEditingId(null);
      await loadProjectData(selectedProjectId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Không cập nhật được nhãn');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tag) => {
    const usage = tagUsage.get(tag.id) || 0;
    if (!confirm(`Xóa nhãn "${tag.name}"${usage ? ` khỏi ${usage} công việc` : ''}?`)) return;
    setSaving(true);
    setError('');
    try {
      await api.delete(`/tags/project/${selectedProjectId}/${tag.id}`);
      await loadProjectData(selectedProjectId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Không xóa được nhãn');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Nhãn</div>
          <div className="topbar-subtitle">Quản lý nhãn phân loại công việc theo từng dự án</div>
        </div>
      </div>

      <div className="ops-page">
        <div className="ops-toolbar">
          <select className="form-input" style={{ width: 280 }} value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              placeholder="Tìm nhãn..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
          <div className="ops-toolbar-spacer" />
          <span className="ops-pill blue"><Tags size={13} /> {tags.length} nhãn</span>
          <span className="ops-pill"><FolderKanban size={13} /> {selectedProject?.name || 'Chưa chọn dự án'}</span>
        </div>

        <div className="ops-grid two">
          <div className="ops-panel">
            <div className="ops-panel-header">
              <div>
                <div className="ops-panel-title">Tạo nhãn mới</div>
                <div className="ops-panel-subtitle">Dùng cho lọc, phân loại và báo cáo công việc</div>
              </div>
              <Palette size={18} color="var(--text-secondary)" />
            </div>
            <div className="ops-panel-body">
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label className="form-label">Tên nhãn</label>
                  <input
                    className="form-input"
                    placeholder="Ví dụ: Backend, UI, Sprint 1"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Màu nhãn</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={color}
                        onClick={() => setForm((prev) => ({ ...prev, color_hex: color }))}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: form.color_hex === color ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                          background: color,
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={form.color_hex}
                      onChange={(e) => setForm((prev) => ({ ...prev, color_hex: e.target.value }))}
                      style={{ width: 44, height: 30, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', padding: 2 }}
                    />
                  </div>
                </div>
                {error && <div className="ops-pill red" style={{ marginBottom: 12 }}>{error}</div>}
                <button className="btn btn-primary" disabled={saving || !selectedProjectId}>
                  <Plus size={15} /> {saving ? 'Đang tạo...' : 'Tạo nhãn'}
                </button>
              </form>
            </div>
          </div>

          <div className="ops-panel">
            <div className="ops-panel-header">
              <div>
                <div className="ops-panel-title">Danh sách nhãn</div>
                <div className="ops-panel-subtitle">Số lượng công việc đang dùng từng nhãn</div>
              </div>
              <Hash size={18} color="var(--text-secondary)" />
            </div>
            <div className="ops-panel-body">
              {loading ? (
                <div className="loading"><div className="spinner" /></div>
              ) : filteredTags.length === 0 ? (
                <div className="ops-empty">
                  <Tags size={42} />
                  <h3>Chưa có nhãn phù hợp</h3>
                  <p>Tạo nhãn để phân loại công việc khi demo.</p>
                </div>
              ) : (
                <div className="ops-list">
                  {filteredTags.map((tag) => {
                    const usage = tagUsage.get(tag.id) || 0;
                    const relatedTasks = tasks.filter((task) => (task.tags || []).some((t) => t.id === tag.id)).slice(0, 3);
                    return (
                      <div className="ops-list-row" key={tag.id} style={{ gridTemplateColumns: '34px 1fr auto' }}>
                        <div className="ops-list-icon">
                          <span className="ops-color-dot" style={{ background: tag.color_hex || '#64748b' }} />
                        </div>
                        {editingId === tag.id ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                            <input type="color" value={editForm.color_hex} onChange={(e) => setEditForm((p) => ({ ...p, color_hex: e.target.value }))} style={{ width: 42, height: 34 }} />
                          </div>
                        ) : (
                          <div>
                            <div className="ops-row-title">{tag.name}</div>
                            <div className="ops-row-sub">
                              {relatedTasks.length ? relatedTasks.map((task) => task.title).join(' · ') : 'Chưa gắn vào công việc nào'}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className="ops-pill blue">{usage} công việc</span>
                          {editingId === tag.id ? (
                            <>
                              <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => handleUpdate(tag.id)} title="Lưu"><Save size={13} /></button>
                              <button className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)} title="Hủy"><X size={13} /></button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-sm btn-ghost" onClick={() => startEdit(tag)} title="Sửa nhãn"><Pencil size={13} /></button>
                              <button className="btn btn-sm btn-danger" disabled={saving} onClick={() => handleDelete(tag)} title="Xóa nhãn"><Trash2 size={13} /></button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
