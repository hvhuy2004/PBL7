/* eslint-disable react-hooks/set-state-in-effect */
import React, { useCallback, useState } from 'react';
import { Archive, X, Check, Clock } from 'lucide-react';
import api from '../api';
import { useToast } from '../hooks/useToast';

export default function ArchiveModal({ projectId, boardId, onClose, onRestored }) {
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);
  const { addToast } = useToast();

  const loadArchived = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/projects/${projectId}/archived`);
      setTasks(res.data.tasks || []);
      setColumns(res.data.columns || []);
    } catch {
      addToast('Không thể tải danh sách lưu trữ', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, projectId]);

  React.useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  const handleRestoreTask = async (id) => {
    setRestoringId(`task-${id}`);
    try {
      await api.put(`/projects/${projectId}/tasks/${id}/restore`);
      setTasks(tasks.filter(t => t.id !== id));
      addToast('Khôi phục công việc thành công', 'success');
      onRestored(); // Trigger reload in parent
    } catch (err) {
      addToast(err.response?.data?.detail || 'Khôi phục thất bại', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handleRestoreColumn = async (id) => {
    setRestoringId(`col-${id}`);
    try {
      await api.put(`/boards/project/${projectId}/${boardId}/columns/${id}/restore`);
      setColumns(columns.filter(c => c.id !== id));
      addToast('Khôi phục cột thành công', 'success');
      onRestored();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Khôi phục thất bại', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 999 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, padding: 0 }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'var(--bg-secondary)', padding: 8, borderRadius: 8, color: 'var(--accent)' }}>
              <Archive size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Kho lưu trữ</h2>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Khôi phục các cột và công việc đã xóa</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          <button 
            style={{ padding: '12px 16px', background: 'none', border: 'none', borderBottom: activeTab === 'tasks' ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === 'tasks' ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setActiveTab('tasks')}
          >
            Công việc ({tasks.length})
          </button>
          <button 
            style={{ padding: '12px 16px', background: 'none', border: 'none', borderBottom: activeTab === 'columns' ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === 'columns' ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setActiveTab('columns')}
          >
            Cột ({columns.length})
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24, maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Đang tải...</div>
          ) : (
            <>
              {activeTab === 'tasks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {tasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Thùng rác công việc trống.</div>
                  ) : (
                    tasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} /> Đã xóa lúc {new Date(t.deleted_at).toLocaleString('vi-VN')}
                          </div>
                        </div>
                        <button 
                          className="btn btn-primary" 
                          onClick={() => handleRestoreTask(t.id)}
                          disabled={restoringId === `task-${t.id}`}
                        >
                          {restoringId === `task-${t.id}` ? 'Đang khôi phục...' : <><Check size={14} /> Khôi phục</>}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'columns' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {columns.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Thùng rác cột trống.</div>
                  ) : (
                    columns.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color || 'var(--accent)' }} />
                            {c.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} /> Đã xóa lúc {new Date(c.deleted_at).toLocaleString('vi-VN')}
                          </div>
                        </div>
                        <button 
                          className="btn btn-primary" 
                          onClick={() => handleRestoreColumn(c.id)}
                          disabled={restoringId === `col-${c.id}`}
                        >
                          {restoringId === `col-${c.id}` ? 'Đang khôi phục...' : <><Check size={14} /> Khôi phục</>}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
