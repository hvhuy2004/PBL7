/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useMemo } from 'react';
import api from '../api';
import {
  Clock, ChevronRight, FolderOpen, AlertTriangle,
  CheckCircle2, Bug, Zap, FileText, Filter, CalendarDays, List,
  ChevronLeft,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const PRIORITY_COLORS = { Low: '#4f8ef7', Medium: '#d29922', High: '#f0883e' };
const STATUS_COLORS = { done: '#3fb950', overdue: '#f85149' };
const PRIORITY_LABELS = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao' };
const TYPE_CLASSES    = { Task: 'type-task', Bug: 'type-bug', Feature: 'type-feature', Docs: 'type-docs' };
const TYPE_LABELS     = { Task: 'Công việc', Bug: 'Lỗi', Feature: 'Tính năng', Docs: 'Tài liệu' };
const WEEKDAYS        = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS_VN       = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                         'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

const TYPE_ICONS = {
  Task:    <CheckCircle2 size={12} />,
  Bug:     <Bug size={12} />,
  Feature: <Zap size={12} />,
  Docs:    <FileText size={12} />,
};

function isOverdue(due_date) {
  if (!due_date) return false;
  return new Date(due_date) < new Date();
}

function getTaskStatusStyle(task) {
  const isDone = task.progress_percent >= 100;
  const overdue = isOverdue(task.due_date) && !isDone;

  if (isDone) {
    return {
      background: 'rgba(63,185,80,0.16)',
      border: STATUS_COLORS.done,
      color: 'var(--green)',
    };
  }

  if (overdue) {
    return {
      background: 'rgba(248,81,73,0.16)',
      border: STATUS_COLORS.overdue,
      color: 'var(--red)',
    };
  }

  const priorityColor = PRIORITY_COLORS[task.priority] || '#4f8ef7';
  return {
    background: `${priorityColor}18`,
    border: priorityColor,
    color: 'var(--text-primary)',
  };
}

function CalendarLegend() {
  const items = [
    { label: 'Hoàn thành', color: STATUS_COLORS.done },
    { label: 'Quá hạn', color: STATUS_COLORS.overdue },
    { label: 'Ưu tiên cao', color: PRIORITY_COLORS.High },
    { label: 'Ưu tiên TB', color: PRIORITY_COLORS.Medium },
    { label: 'Ưu tiên thấp', color: PRIORITY_COLORS.Low },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginRight: 8 }}>
      {items.map((item) => (
        <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/* ── Calendar View ────────────────────────────────────────────────── */
function CalendarView({ tasks, onTaskClick }) {
  const today = new Date();
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Build calendar grid (6 rows × 7 cols)
  const firstDay   = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const grid = [];
  let dayNum = 1 - firstDay;
  for (let row = 0; row < 6; row++) {
    const week = [];
    for (let col = 0; col < 7; col++) {
      week.push(dayNum);
      dayNum++;
    }
    grid.push(week);
    if (dayNum > daysInMonth) break;
  }

  // Map tasks to their due_date day
  const tasksByDay = {};
  tasks.forEach(t => {
    if (!t.due_date) return;
    const d = new Date(t.due_date);
    if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
      const key = d.getDate();
      if (!tasksByDay[key]) tasksByDay[key] = [];
      tasksByDay[key].push(t);
    }
  });

  const todayKey = today.getFullYear() === viewYear && today.getMonth() === viewMonth
    ? today.getDate() : null;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <button className="btn-icon" onClick={prevMonth}><ChevronLeft size={16} /></button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{MONTHS_VN[viewMonth]} {viewYear}</div>
        <button className="btn-icon" onClick={nextMonth}><ChevronRight size={16} /></button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {WEEKDAYS.map((d, i) => (
          <div key={d} style={{
            padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 600,
            color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--accent)' : 'var(--text-muted)',
          }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div>
        {grid.map((week, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: ri < grid.length - 1 ? '1px solid var(--border)' : 'none' }}>
            {week.map((day, ci) => {
              const isCurrentMonth = day >= 1 && day <= daysInMonth;
              const isToday = day === todayKey;
              const dayTasks = isCurrentMonth ? (tasksByDay[day] || []) : [];
              return (
                <div key={ci} style={{
                  minHeight: 80,
                  minWidth: 0,
                  padding: '6px 8px',
                  borderRight: ci < 6 ? '1px solid var(--border)' : 'none',
                  background: isToday ? 'rgba(79,142,247,0.05)' : 'transparent',
                }}>
                  {isCurrentMonth && (
                    <>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: isToday ? 700 : 500,
                        background: isToday ? 'var(--accent)' : 'transparent',
                        color: isToday ? 'white' : ci === 0 ? 'var(--red)' : 'var(--text-primary)',
                        marginBottom: 4,
                      }}>{day}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        {dayTasks.slice(0, 3).map(t => {
                          const statusStyle = getTaskStatusStyle(t);
                          return (
                            <div
                              key={t.id}
                              onClick={() => onTaskClick(t)}
                              title={t.title}
                              style={{
                                fontSize: 10,
                                padding: '2px 5px',
                                borderRadius: 4,
                                background: statusStyle.background,
                                borderLeft: `2px solid ${statusStyle.border}`,
                                color: statusStyle.color,
                                cursor: 'pointer',
                                display: 'block',
                                maxWidth: '100%',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontWeight: 500,
                              }}
                            >
                              {t.title}
                            </div>
                          );
                        })}
                        {dayTasks.length > 3 && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 5 }}>
                            +{dayTasks.length - 3} nữa
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterType, setFilterType]         = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'

  useEffect(() => {
    setViewMode(searchParams.get('view') === 'calendar' ? 'calendar' : 'list');
  }, [searchParams]);

  const setViewModeAndUrl = (mode) => {
    setViewMode(mode);
    if (mode === 'calendar') setSearchParams({ view: 'calendar' }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  useEffect(() => {
    if (!user?.id) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    api.get('/projects/me')
      .then(async (projRes) => {
        const allProjects = projRes.data || [];
        if (!allProjects.length) { setTasks([]); return; }
        const results = await Promise.all(
          allProjects.map((p) =>
            api.get(`/projects/${p.id}/tasks?assignee_id=${user.id}`)
               .then((t) => t.data.map((task) => ({ ...task, project: p })))
               .catch(() => [])
          )
        );
        setTasks(results.flat());
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = useMemo(() => tasks.filter((t) => {
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterType !== 'all' && t.task_type !== filterType) return false;
    return true;
  }), [tasks, filterPriority, filterType]);

  const overdue   = tasks.filter((t) => isOverdue(t.due_date) && t.progress_percent < 100).length;
  const completed = tasks.filter((t) => t.progress_percent === 100).length;

  const handleTaskClick = (task) => navigate(`/projects/${task.project_id}?task=${task.id}`);

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          Việc của tôi
          <span className="topbar-subtitle">{tasks.length} nhiệm vụ</span>
        </div>

        {/* Quick stats */}
        {!loading && tasks.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginRight: 8 }}>
            {overdue > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--red)', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 6, padding: '3px 8px' }}>
                <AlertTriangle size={12} /> {overdue} quá hạn
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--green)', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', borderRadius: 6, padding: '3px 8px' }}>
              <CheckCircle2 size={12} /> {completed} hoàn thành
            </div>
          </div>
        )}

        {viewMode === 'calendar' && <CalendarLegend />}

        {/* View mode toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginRight: 8 }}>
          <button
            type="button"
            onClick={() => setViewModeAndUrl('list')}
            style={{ padding: '5px 10px', background: viewMode === 'list' ? 'var(--accent)' : 'var(--bg-secondary)', color: viewMode === 'list' ? 'white' : 'var(--text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            <List size={13} /> Danh sách
          </button>
          <button
            type="button"
            onClick={() => setViewModeAndUrl('calendar')}
            style={{ padding: '5px 10px', background: viewMode === 'calendar' ? 'var(--accent)' : 'var(--bg-secondary)', color: viewMode === 'calendar' ? 'white' : 'var(--text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            <CalendarDays size={13} /> Lịch
          </button>
        </div>

        {/* Filters – only show in list mode */}
        {viewMode === 'list' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Filter size={13} style={{ color: 'var(--text-muted)' }} />
            {['all', 'High', 'Medium', 'Low'].map((f) => (
              <button
                key={f}
                className={`btn btn-ghost btn-sm ${filterPriority === f ? 'btn-primary' : ''}`}
                style={filterPriority === f ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}}
                onClick={() => setFilterPriority(f)}
              >
                {f === 'all' ? 'Tất cả' : PRIORITY_LABELS[f]}
              </button>
            ))}
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            {['all', 'Task', 'Bug', 'Feature', 'Docs'].map((f) => (
              <button
                key={f}
                className={`btn btn-ghost btn-sm ${filterType === f ? 'btn-primary' : ''}`}
                style={filterType === f ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}}
                onClick={() => setFilterType(f)}
              >
                {f === 'all' ? 'Loại' : TYPE_LABELS[f]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="page">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : viewMode === 'calendar' ? (
          <CalendarView tasks={tasks} onTaskClick={handleTaskClick} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}><CheckCircle2 size={52} strokeWidth={1.2} /></div>
            <h3>{tasks.length === 0 ? 'Không có công việc nào được giao' : 'Không có công việc khớp bộ lọc'}</h3>
            <p>{tasks.length === 0 ? 'Bạn chưa được giao công việc trong bất kỳ dự án nào' : 'Thử thay đổi bộ lọc để xem thêm'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((task) => {
              const od = isOverdue(task.due_date) && task.progress_percent < 100;
              return (
                <div
                  key={task.id}
                  className="card"
                  style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr) auto', alignItems: 'start', gap: 14, cursor: 'pointer', padding: '14px 18px' }}
                  onClick={() => navigate(`/projects/${task.project_id}`)}
                >
                  <span
                    className={`priority-badge priority-${String(task.priority || 'Medium').toLowerCase()}`}
                    style={{ justifySelf: 'start', alignSelf: 'start', marginTop: 2 }}
                  >
                    {PRIORITY_LABELS[task.priority] || task.priority || 'Trung bình'}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{task.title}</div>
                      <span className={`type-badge ${TYPE_CLASSES[task.task_type] || 'type-task'}`} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        {TYPE_ICONS[task.task_type]} {TYPE_LABELS[task.task_type] || task.task_type}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <FolderOpen size={11} /> {task.project?.name}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: od ? 'var(--red)' : 'var(--text-muted)' }}>
                        {od ? <AlertTriangle size={11} /> : <Clock size={11} />}
                        {task.due_date ? new Date(task.due_date).toLocaleDateString('vi-VN') : 'Không có deadline'}
                        {od && <span style={{ fontWeight: 600 }}>(Quá hạn)</span>}
                      </span>
                      {task.progress_percent > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${task.progress_percent}%`, height: '100%', background: task.progress_percent === 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 2 }} />
                          </div>
                          {task.progress_percent}%
                        </span>
                      )}
                      {task.checklist_total > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          ☑ {task.checklist_completed}/{task.checklist_total}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
