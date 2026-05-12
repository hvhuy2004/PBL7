/* eslint-disable react-hooks/set-state-in-effect */
/**
 * ActivityLogPanel – Hiển thị lịch sử hoạt động của 1 task.
 * Props:
 *   projectId: number
 *   taskId: number
 */
import { useEffect, useState } from 'react';
import api from '../api';
import { User, ArrowRight, GitCommit, MessageSquare, CheckSquare, Trash2, RefreshCw } from 'lucide-react';

const ACTION_ICONS = {
  CREATED_TASK:           <GitCommit size={13} color="var(--green)" />,
  UPDATED_TASK:           <RefreshCw size={13} color="var(--accent)" />,
  MOVED_TASK:             <ArrowRight size={13} color="var(--purple)" />,
  DELETED_TASK:           <Trash2 size={13} color="var(--red)" />,
  RESTORED_TASK:          <RefreshCw size={13} color="var(--green)" />,
  ADDED_COMMENT:          <MessageSquare size={13} color="var(--accent)" />,
  ADDED_CHECKLIST_ITEM:   <CheckSquare size={13} color="var(--green)" />,
  UPDATED_CHECKLIST_ITEM: <CheckSquare size={13} color="var(--accent)" />,
  DELETED_CHECKLIST_ITEM: <Trash2 size={13} color="var(--red)" />,
};

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(isoStr).toLocaleString('vi-VN');
}

export default function ActivityLogPanel({ projectId, taskId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !taskId) return;
    setLoading(true);
    api.get(`/logs/project/${projectId}?task_id=${taskId}&limit=50`)
      .then(r => setLogs(r.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [projectId, taskId]);

  if (loading) return (
    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Đang tải lịch sử...
    </div>
  );

  if (!logs.length) return (
    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Chưa có hoạt động nào
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {logs.map((log, idx) => (
        <div key={log.id} style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr auto',
          gap: 10,
          padding: '10px 0',
          borderBottom: idx < logs.length - 1 ? '1px solid var(--border)' : 'none',
          alignItems: 'flex-start',
        }}>
          {/* Icon */}
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--bg-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 1,
          }}>
            {ACTION_ICONS[log.action_type] || <User size={13} color="var(--text-muted)" />}
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {log.description}
            </div>
            {log.action_type === 'UPDATED_TASK' && log.new_value && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Trường thay đổi: <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{log.new_value}</span>
              </div>
            )}
          </div>

          {/* Time */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginTop: 3 }}>
            {timeAgo(log.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}
