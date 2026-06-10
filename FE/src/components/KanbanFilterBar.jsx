import { Check, ChevronDown, Filter, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const PRIORITY_OPTIONS = [
  { value: 'High', label: 'Cao' },
  { value: 'Medium', label: 'Trung bình' },
  { value: 'Low', label: 'Thấp' },
];

function FilterSelect({ value, placeholder, options, onChange, minWidth = 140 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((item) => String(item.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', minWidth }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: '100%',
          height: 31,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '0 10px',
          borderRadius: 6,
          border: `1px solid ${value ? 'var(--accent)' : 'var(--border)'}`,
          background: value ? 'rgba(37,99,235,0.10)' : 'var(--bg-card)',
          color: value ? 'var(--accent)' : 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: value ? 650 : 500,
          cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          size={13}
          style={{
            flexShrink: 0,
            color: 'var(--text-secondary)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--transition)',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 36,
            left: 0,
            width: '100%',
            minWidth,
            padding: 4,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 1200,
          }}
        >
          <button
            type="button"
            onClick={() => choose('')}
            style={menuItemStyle(!value)}
          >
            <span>{placeholder}</span>
            {!value && <Check size={13} />}
          </button>
          {options.map((option) => {
            const active = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => choose(option.value)}
                style={menuItemStyle(active)}
              >
                <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {option.label}
                </span>
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function menuItemStyle(active) {
  return {
    width: '100%',
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '0 10px',
    border: 'none',
    borderRadius: 6,
    background: active ? 'rgba(37,99,235,0.10)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: active ? 650 : 500,
    textAlign: 'left',
    cursor: 'pointer',
  };
}

export default function KanbanFilterBar({ members, userMap, projectTags, value, onChange }) {
  const { assignee, priority, tagId, dueSoon } = value;
  const hasFilter = assignee || priority || tagId || dueSoon;

  const set = (patch) => onChange({ ...value, ...patch });
  const clear = () => onChange({ assignee: '', priority: '', tagId: '', dueSoon: false });

  const assigneeOptions = members.map((member) => ({
    value: member.user_id,
    label: userMap[member.user_id]?.full_name || `User #${member.user_id}`,
  }));

  const tagOptions = projectTags.map((tag) => ({
    value: tag.id,
    label: tag.name,
  }));

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      padding: '8px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      fontSize: 12,
      position: 'relative',
      zIndex: 20,
    }}>
      <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>Lọc:</span>

      <FilterSelect
        value={assignee}
        placeholder="Người thực hiện"
        options={assigneeOptions}
        onChange={(nextValue) => set({ assignee: nextValue })}
        minWidth={160}
      />

      <FilterSelect
        value={priority}
        placeholder="Độ ưu tiên"
        options={PRIORITY_OPTIONS}
        onChange={(nextValue) => set({ priority: nextValue })}
        minWidth={126}
      />

      {projectTags.length > 0 && (
        <FilterSelect
          value={tagId}
          placeholder="Nhãn (Tag)"
          options={tagOptions}
          onChange={(nextValue) => set({ tagId: nextValue })}
          minWidth={126}
        />
      )}

      <button
        type="button"
        onClick={() => set({ dueSoon: !dueSoon })}
        style={{
          height: 31,
          fontSize: 12,
          padding: '0 10px',
          borderRadius: 6,
          cursor: 'pointer',
          border: `1px solid ${dueSoon ? 'var(--yellow)' : 'var(--border)'}`,
          background: dueSoon ? 'rgba(210,153,34,0.12)' : 'var(--bg-card)',
          color: dueSoon ? '#92400e' : 'var(--text-secondary)',
          fontWeight: dueSoon ? 650 : 500,
        }}
      >
        Sắp đến hạn
      </button>

      {hasFilter && (
        <button
          type="button"
          onClick={clear}
          style={{
            height: 31,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            padding: '0 9px',
            borderRadius: 6,
            cursor: 'pointer',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
          }}
        >
          <X size={12} /> Xóa lọc
        </button>
      )}

      {hasFilter && (
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          color: 'var(--accent)',
          fontWeight: 650,
        }}>
          {[assignee, priority, tagId, dueSoon].filter(Boolean).length} bộ lọc đang bật
        </span>
      )}
    </div>
  );
}
