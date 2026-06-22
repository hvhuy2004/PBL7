import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, CalendarDays, CheckCircle2, ChevronRight, Clock, FolderOpen, Search, Star } from 'lucide-react';
import api from '../api';

const PRIORITY_LABELS = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao' };
const TYPE_LABELS = { Task: 'Công việc', Bug: 'Lỗi', Feature: 'Tính năng', Docs: 'Tài liệu' };
const TYPE_CLASSES = { Task: 'type-task', Bug: 'type-bug', Feature: 'type-feature', Docs: 'type-docs' };

function formatDate(value) {
  if (!value) return 'Không có deadline';
  return new Date(value).toLocaleDateString('vi-VN');
}

export default function BookmarksPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get('/tasks/bookmarks')
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => [
      item.title,
      item.description,
      item.project_name,
      item.column_name,
      TYPE_LABELS[item.task_type],
      PRIORITY_LABELS[item.priority],
    ].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [items, query]);

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          Đánh dấu
          <span className="topbar-subtitle">{items.length} công việc đã lưu</span>
        </div>
        <div style={{ position: 'relative', minWidth: 300 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên task hoặc dự án"
            style={{ paddingLeft: 36 }}
          />
        </div>
      </div>

      <div className="page">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}><Bookmark size={52} strokeWidth={1.2} /></div>
            <h3>{items.length ? 'Không có công việc khớp tìm kiếm' : 'Chưa có công việc nào được đánh dấu'}</h3>
            <p>Mở chi tiết công việc và bấm Đánh dấu để lưu lại các task cần theo dõi sau.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                className="card"
                onClick={() => navigate(`/projects/${item.project_id}?task=${item.task_id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                  gap: 14,
                  alignItems: 'center',
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: '15px 18px',
                  borderColor: 'var(--border)',
                }}
              >
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--orange)',
                  background: 'rgba(240,136,62,0.12)',
                }}>
                  <Star size={18} fill="currentColor" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{item.title}</div>
                    <span className={`priority-badge priority-${String(item.priority || 'Medium').toLowerCase()}`}>
                      {PRIORITY_LABELS[item.priority] || item.priority || 'Trung bình'}
                    </span>
                    <span className={`type-badge ${TYPE_CLASSES[item.task_type] || 'type-task'}`}>{TYPE_LABELS[item.task_type] || item.task_type || 'Công việc'}</span>
                  </div>
                  {item.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                      {item.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><FolderOpen size={12} /> {item.project_name}</span>
                    {item.column_name && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={12} /> {item.column_name}</span>}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CalendarDays size={12} /> {formatDate(item.due_date)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={12} /> Đánh dấu {formatDate(item.created_at)}</span>
                  </div>
                </div>
                <ChevronRight size={17} style={{ color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
