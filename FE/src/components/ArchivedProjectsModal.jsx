/* eslint-disable react-hooks/set-state-in-effect */
import React, { useCallback, useState } from 'react';
import { Archive, X, Check, Clock, FolderOpen } from 'lucide-react';
import api from '../api';
import { useToast } from '../hooks/useToast';

export default function ArchivedProjectsModal({ onClose, onRestored }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);
  const { addToast } = useToast();

  const loadArchived = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/projects/archived/all');
      setProjects(res.data || []);
    } catch {
      addToast('Không thể tải danh sách dự án lưu trữ', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  const handleRestoreProject = async (id) => {
    setRestoringId(id);
    try {
      await api.put(`/projects/${id}/restore`);
      setProjects(projects.filter(p => p.id !== id));
      addToast('Khôi phục dự án thành công', 'success');
      onRestored(); // Trigger reload in parent
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
              <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Dự án đã lưu trữ</h2>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Khôi phục các dự án đã bị xóa</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Content */}
        <div style={{ padding: 24, maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Đang tải...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Không có dự án nào trong thùng rác.</div>
              ) : (
                projects.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FolderOpen size={16} color="var(--accent)" />
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> Đã xóa lúc {new Date(p.deleted_at).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => handleRestoreProject(p.id)}
                      disabled={restoringId === p.id}
                    >
                      {restoringId === p.id ? 'Đang khôi phục...' : <><Check size={14} /> Khôi phục</>}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
