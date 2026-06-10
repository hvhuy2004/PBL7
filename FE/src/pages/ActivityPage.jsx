/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import {
  Activity, CheckSquare, Filter, History, MessageSquare,
  MoveRight, PlusCircle, RotateCcw, Search, Trash2,
} from 'lucide-react';
import api from '../api';

const ACTION_META = {
  CREATED_TASK: { label: 'Tạo công việc', icon: PlusCircle, cls: 'blue' },
  create_task: { label: 'Tạo công việc', icon: PlusCircle, cls: 'blue' },
  UPDATED_TASK: { label: 'Cập nhật công việc', icon: CheckSquare, cls: 'orange' },
  update_task: { label: 'Cập nhật công việc', icon: CheckSquare, cls: 'orange' },
  DELETED_TASK: { label: 'Xóa công việc', icon: Trash2, cls: 'red' },
  delete_task: { label: 'Xóa công việc', icon: Trash2, cls: 'red' },
  RESTORED_TASK: { label: 'Khôi phục công việc', icon: RotateCcw, cls: 'green' },
  restore_task: { label: 'Khôi phục công việc', icon: RotateCcw, cls: 'green' },
  MOVED_TASK: { label: 'Chuyển cột', icon: MoveRight, cls: 'blue' },
  move_task: { label: 'Chuyển cột', icon: MoveRight, cls: 'blue' },
  ADDED_COMMENT: { label: 'Bình luận', icon: MessageSquare, cls: 'blue' },
  add_comment: { label: 'Bình luận', icon: MessageSquare, cls: 'blue' },
  ADDED_CHECKLIST_ITEM: { label: 'Thêm checklist', icon: CheckSquare, cls: 'green' },
  UPDATED_CHECKLIST_ITEM: { label: 'Cập nhật checklist', icon: CheckSquare, cls: 'orange' },
  DELETED_CHECKLIST_ITEM: { label: 'Xóa checklist', icon: Trash2, cls: 'red' },
  POSTED_PROJECT_MESSAGE: { label: 'Gửi tin nhắn', icon: MessageSquare, cls: 'blue' },
  posted_project_message: { label: 'Gửi tin nhắn', icon: MessageSquare, cls: 'blue' },
  DELETED_PROJECT_MESSAGE: { label: 'Xóa tin nhắn', icon: Trash2, cls: 'red' },
  delete_project_message: { label: 'Xóa tin nhắn', icon: Trash2, cls: 'red' },
  deleted_project_message: { label: 'Xóa tin nhắn', icon: Trash2, cls: 'red' },
};

function normalizeActionType(type) {
  return String(type || '').trim().toLowerCase();
}

function actionMeta(type) {
  return ACTION_META[type] || ACTION_META[normalizeActionType(type)] || { label: 'Hoạt động', icon: Activity, cls: '' };
}

function buildDescription(log) {
  const meta = actionMeta(log.action_type);
  const actor = log.user_name || 'Thành viên';
  if (log.task_title) return `${actor} - ${meta.label.toLowerCase()} "${log.task_title}"`;
  if (log.new_value) return `${actor} - ${meta.label.toLowerCase()}: ${log.new_value}`;
  return `${actor} - ${meta.label.toLowerCase()}`;
}

function formatValue(value) {
  if (!value) return '-';
  if (value === 'None') return '-';
  return value;
}

export default function ActivityPage() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [query, setQuery] = useState('');

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

  useEffect(() => {
    if (!selectedProjectId) {
      setLogs([]);
      return;
    }
    setLoading(true);
    api.get(`/logs/project/${selectedProjectId}?limit=150`)
      .then((r) => setLogs(r.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  const actionOptions = useMemo(() => {
    const byKey = new Map();
    logs.forEach((log) => {
      const key = normalizeActionType(log.action_type);
      if (key && !byKey.has(key)) byKey.set(key, { key, label: actionMeta(log.action_type).label });
    });
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [logs]);
  const filteredLogs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== 'all' && normalizeActionType(log.action_type) !== actionFilter) return false;
      if (!normalized) return true;
      const haystack = `${log.user_name || ''} ${log.task_title || ''} ${log.new_value || ''} ${actionMeta(log.action_type).label}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [logs, actionFilter, query]);

  const counts = useMemo(() => {
    const byAction = {};
    logs.forEach((log) => {
      const label = actionMeta(log.action_type).label;
      byAction[label] = (byAction[label] || 0) + 1;
    });
    return byAction;
  }, [logs]);

  const metricLabels = ['Tạo công việc', 'Cập nhật công việc', 'Xóa công việc', 'Chuyển cột'];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Hoạt động</div>
          <div className="topbar-subtitle">Nhật ký thao tác theo từng dự án</div>
        </div>
      </div>

      <div className="ops-page">
        <div className="ops-toolbar">
          <select className="form-input" style={{ width: 280 }} value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select className="form-input" style={{ width: 210 }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">Tất cả hoạt động</option>
            {actionOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <div style={{ position: 'relative', minWidth: 280 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              placeholder="Tìm theo thành viên hoặc công việc..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
          <div className="ops-toolbar-spacer" />
          <span className="ops-pill blue"><Filter size={13} /> {filteredLogs.length} nhật ký</span>
        </div>

        <div className="ops-grid">
          <div className="ops-metric">
            <div className="ops-metric-icon" style={{ background: 'rgba(37,99,235,0.10)', color: 'var(--accent)' }}>
              <History size={20} />
            </div>
            <div>
              <div className="ops-metric-value">{logs.length}</div>
              <div className="ops-metric-label">Tổng hoạt động</div>
            </div>
          </div>
          {metricLabels.map((label) => {
            const meta = Object.values(ACTION_META).find((item) => item.label === label) || ACTION_META.CREATED_TASK;
            return (
              <div className="ops-metric" key={label}>
                <div className="ops-metric-icon" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  <meta.icon size={20} />
                </div>
                <div>
                  <div className="ops-metric-value">{counts[label] || 0}</div>
                  <div className="ops-metric-label">{label}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <div className="ops-panel-title">Timeline thao tác</div>
              <div className="ops-panel-subtitle">Dùng để truy vết ai đã tạo, sửa, chuyển hoặc khôi phục công việc</div>
            </div>
            <Activity size={18} color="var(--text-secondary)" />
          </div>
          <div className="ops-panel-body">
            {loading ? (
              <div className="loading"><div className="spinner" /></div>
            ) : filteredLogs.length === 0 ? (
              <div className="ops-empty">
                <History size={42} />
                <h3>Chưa có hoạt động phù hợp</h3>
                <p>Thử chọn dự án khác hoặc bỏ bộ lọc.</p>
              </div>
            ) : (
              <div className="ops-timeline">
                {filteredLogs.map((log) => {
                  const meta = actionMeta(log.action_type);
                  return (
                    <div className="ops-timeline-item" key={log.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className={`ops-pill ${meta.cls}`}><meta.icon size={13} /> {meta.label}</span>
                        <span className="ops-row-sub">{new Date(log.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                      <div className="ops-row-title">{buildDescription(log)}</div>
                      {(log.old_value || log.new_value) && (
                        <div className="ops-row-sub">
                          Trước: {formatValue(log.old_value)} · Sau: {formatValue(log.new_value)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
