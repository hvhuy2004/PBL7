/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { Archive, FolderKanban, RotateCcw, TableColumnsSplit, Trash2 } from 'lucide-react';
import api from '../api';

const PRIORITY_LABELS = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao' };
const TYPE_LABELS = { Task: 'Công việc', Bug: 'Lỗi', Feature: 'Tính năng', Docs: 'Tài liệu' };

export default function ArchivePage() {
  const [projects, setProjects] = useState([]);
  const [archivedProjects, setArchivedProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [archivedItems, setArchivedItems] = useState({ tasks: [], columns: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadProjects = async () => {
    const [activeRes, archivedRes] = await Promise.all([
      api.get('/projects/me').catch(() => ({ data: [] })),
      api.get('/projects/archived/all').catch(() => ({ data: [] })),
    ]);
    const active = activeRes.data || [];
    setProjects(active);
    setArchivedProjects(archivedRes.data || []);
    if (!selectedProjectId && active.length) setSelectedProjectId(String(active[0].id));
  };

  const loadArchivedItems = async (projectId) => {
    if (!projectId) {
      setArchivedItems({ tasks: [], columns: [] });
      return;
    }
    const { data } = await api.get(`/projects/${projectId}/archived`).catch(() => ({ data: { tasks: [], columns: [] } }));
    setArchivedItems({ tasks: data?.tasks || [], columns: data?.columns || [] });
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        await loadProjects();
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => { loadArchivedItems(selectedProjectId); }, [selectedProjectId]);

  const restoreProject = async (projectId) => {
    setMessage('');
    await api.put(`/projects/${projectId}/restore`);
    setMessage('Đã khôi phục dự án.');
    await loadProjects();
  };

  const restoreTask = async (taskId) => {
    setMessage('');
    await api.put(`/projects/${selectedProjectId}/tasks/${taskId}/restore`);
    setMessage('Đã khôi phục công việc.');
    await loadArchivedItems(selectedProjectId);
  };

  const restoreColumn = async (column) => {
    setMessage('');
    await api.put(`/boards/project/${selectedProjectId}/${column.board_id}/columns/${column.id}/restore`);
    setMessage('Đã khôi phục cột.');
    await loadArchivedItems(selectedProjectId);
  };

  const selectedProject = projects.find((project) => String(project.id) === String(selectedProjectId));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Lưu trữ</div>
          <div className="topbar-subtitle">Quản lý dữ liệu đã xóa mềm và khôi phục khi cần</div>
        </div>
      </div>

      <div className="ops-page">
        <div className="ops-toolbar">
          <select className="form-input" style={{ width: 300 }} value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <div className="ops-toolbar-spacer" />
          <span className="ops-pill blue"><Archive size={13} /> {archivedProjects.length} dự án đã xóa</span>
          <span className="ops-pill"><Trash2 size={13} /> {(archivedItems.tasks || []).length + (archivedItems.columns || []).length} mục trong dự án</span>
        </div>

        {message && (
          <div className="ops-pill green" style={{ marginBottom: 14 }}>{message}</div>
        )}

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : (
          <div className="ops-grid two">
            <div className="ops-panel">
              <div className="ops-panel-header">
                <div>
                  <div className="ops-panel-title">Dự án đã xóa</div>
                  <div className="ops-panel-subtitle">Khôi phục dự án bị xóa mềm</div>
                </div>
                <FolderKanban size={18} color="var(--text-secondary)" />
              </div>
              <div className="ops-panel-body">
                {archivedProjects.length === 0 ? (
                  <div className="ops-empty">
                    <Archive size={42} />
                    <h3>Không có dự án lưu trữ</h3>
                    <p>Các dự án bị xóa mềm sẽ xuất hiện ở đây.</p>
                  </div>
                ) : (
                  <div className="ops-list">
                    {archivedProjects.map((project) => (
                      <div className="ops-list-row" key={project.id}>
                        <div className="ops-list-icon"><FolderKanban size={16} /></div>
                        <div>
                          <div className="ops-row-title">{project.name}</div>
                          <div className="ops-row-sub">{project.description || project.project_key || 'Không có mô tả'}</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => restoreProject(project.id)}>
                          <RotateCcw size={13} /> Khôi phục
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="ops-panel">
              <div className="ops-panel-header">
                <div>
                  <div className="ops-panel-title">Mục đã xóa trong dự án</div>
                  <div className="ops-panel-subtitle">{selectedProject?.name || 'Chưa chọn dự án'}</div>
                </div>
                <TableColumnsSplit size={18} color="var(--text-secondary)" />
              </div>
              <div className="ops-panel-body">
                {(archivedItems.tasks.length === 0 && archivedItems.columns.length === 0) ? (
                  <div className="ops-empty">
                    <Archive size={42} />
                    <h3>Không có công việc hoặc cột đã xóa</h3>
                    <p>Công việc/cột bị xóa mềm trong dự án sẽ xuất hiện ở đây.</p>
                  </div>
                ) : (
                  <div className="ops-list">
                    {archivedItems.tasks.map((task) => (
                      <div className="ops-list-row" key={`task-${task.id}`}>
                        <div className="ops-list-icon"><Trash2 size={16} /></div>
                        <div>
                          <div className="ops-row-title">{task.title}</div>
                          <div className="ops-row-sub">
                            Công việc · {PRIORITY_LABELS[task.priority] || task.priority || 'Trung bình'} · {TYPE_LABELS[task.task_type] || task.task_type || 'Công việc'}
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => restoreTask(task.id)}>
                          <RotateCcw size={13} /> Khôi phục
                        </button>
                      </div>
                    ))}

                    {archivedItems.columns.map((column) => (
                      <div className="ops-list-row" key={`column-${column.id}`}>
                        <div className="ops-list-icon"><TableColumnsSplit size={16} /></div>
                        <div>
                          <div className="ops-row-title">{column.name}</div>
                          <div className="ops-row-sub">Cột Kanban · WIP {column.wip_limit || 'không giới hạn'}</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => restoreColumn(column)}>
                          <RotateCcw size={13} /> Khôi phục
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
