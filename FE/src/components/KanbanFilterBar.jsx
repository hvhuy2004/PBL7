/**
 * KanbanFilterBar – thanh lọc task cho BoardPage.
 * Props:
 *   members:    [{user_id, ...}]
 *   userMap:    {userId: {full_name, ...}}
 *   projectTags:[{id, name, color_hex}]
 *   value:      { assignee, priority, tagId, dueSoon }
 *   onChange:   (newValue) => void
 */
import { Filter, X } from 'lucide-react';

const PRIORITY_OPTIONS = [
  { value: 'High',   label: 'Cao',       color: '#f85149' },
  { value: 'Medium', label: 'Trung bình', color: '#d29922' },
  { value: 'Low',    label: 'Thấp',      color: '#3fb950' },
];

export default function KanbanFilterBar({ members, userMap, projectTags, value, onChange }) {
  const { assignee, priority, tagId, dueSoon } = value;

  const hasFilter = assignee || priority || tagId || dueSoon;

  const set = (patch) => onChange({ ...value, ...patch });
  const clear = () => onChange({ assignee: '', priority: '', tagId: '', dueSoon: false });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '8px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      fontSize: 12,
    }}>
      <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>Lọc:</span>

      {/* Assignee */}
      <select
        value={assignee}
        onChange={e => set({ assignee: e.target.value })}
        style={{
          fontSize: 12, background: assignee ? 'rgba(79,142,247,0.1)' : 'var(--bg-card)',
          border: `1px solid ${assignee ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', cursor: 'pointer',
        }}
      >
        <option value="">Người thực hiện</option>
        {members.map(m => (
          <option key={m.user_id} value={m.user_id}>
            {userMap[m.user_id]?.full_name || `User #${m.user_id}`}
          </option>
        ))}
      </select>

      {/* Priority */}
      <select
        value={priority}
        onChange={e => set({ priority: e.target.value })}
        style={{
          fontSize: 12, background: priority ? 'rgba(79,142,247,0.1)' : 'var(--bg-card)',
          border: `1px solid ${priority ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', cursor: 'pointer',
        }}
      >
        <option value="">Độ ưu tiên</option>
        {PRIORITY_OPTIONS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {/* Tag */}
      {projectTags.length > 0 && (
        <select
          value={tagId}
          onChange={e => set({ tagId: e.target.value })}
          style={{
            fontSize: 12, background: tagId ? 'rgba(79,142,247,0.1)' : 'var(--bg-card)',
            border: `1px solid ${tagId ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', cursor: 'pointer',
          }}
        >
          <option value="">Nhãn (Tag)</option>
          {projectTags.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}

      {/* Due soon toggle */}
      <button
        onClick={() => set({ dueSoon: !dueSoon })}
        style={{
          fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${dueSoon ? '#d29922' : 'var(--border)'}`,
          background: dueSoon ? 'rgba(210,153,34,0.1)' : 'var(--bg-card)',
          color: dueSoon ? '#d29922' : 'var(--text-secondary)',
          fontWeight: dueSoon ? 600 : 400,
        }}
      >
        ⏰ Sắp đến hạn
      </button>

      {/* Clear */}
      {hasFilter && (
        <button
          onClick={clear}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-muted)',
          }}
        >
          <X size={11} /> Xóa lọc
        </button>
      )}

      {/* Active filter count badge */}
      {hasFilter && (
        <span style={{
          marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', fontWeight: 600,
        }}>
          {[assignee, priority, tagId, dueSoon].filter(Boolean).length} bộ lọc đang bật
        </span>
      )}
    </div>
  );
}
