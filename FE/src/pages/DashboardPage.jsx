import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, Tooltip, CartesianGrid
} from 'recharts';
import {
  Plus, ArrowRight, Clock, FolderOpen,
  Activity, CheckCircle2, PauseCircle, Layers,
  ChevronRight, AlertTriangle, ListChecks, TrendingUp,
} from 'lucide-react';

const PROJECT_COLORS = ['#4f8ef7', '#a78bfa', '#3fb950', '#f0883e', '#f85149', '#d29922'];
const PROJECT_BG_ICON_COMPONENTS = [Layers, Activity, FolderOpen, CheckCircle2, Layers, Activity];

function getColor(id) { return PROJECT_COLORS[id % PROJECT_COLORS.length]; }
function getProjectIcon(id) {
  const Icon = PROJECT_BG_ICON_COMPONENTS[id % PROJECT_BG_ICON_COMPONENTS.length];
  return <Icon size={18} />;
}

function displayDemoText(value = '') {
  return String(value || '').replace(/\b[Tt]ask\b/g, (word) => (word[0] === 'T' ? 'Công việc' : 'công việc'));
}

function StatCard({ value, label, color, icon: Icon, sub }) {
  return (
    <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={22} color={color} strokeWidth={2} />
      </div>
      <div>
        <div className="stat-value" style={{ color, fontSize: 26, fontWeight: 800 }}>{value}</div>
        <div className="stat-label" style={{ fontSize: 12 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ── Recharts Donut Chart ─────────────────────────────────────────────── */
function DashboardDonutChart({ slices, size = 120 }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chưa có data</span>
    </div>
  );
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            cx="50%" cy="50%"
            innerRadius={size * 0.35}
            outerRadius={size * 0.45}
            paddingAngle={5}
            dataKey="value"
            stroke="none"
          >
            {slices.map((s, i) => (
              <Cell key={`cell-${i}`} fill={s.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: 'var(--text-primary)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <span style={{ fontSize: size === 120 ? 18 : 14, fontWeight: 800, color: 'var(--text-primary)' }}>{total}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>công việc</span>
      </div>
    </div>
  );
}

/* ── Recharts Bar Chart (7 days) ─────────────────────────────────────── */
function DashboardBarChart({ data, height = 120 }) {
  if (!data?.length) return null;
  // Make sure data is in ascending order
  const chartData = [...data];
  
  return (
    <div style={{ width: '100%', height: height + 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
          <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} dy={5} />
          <Tooltip 
            cursor={{ fill: 'rgba(79,142,247,0.1)' }}
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }}
          />
          <Bar dataKey="count" name="Hoàn thành" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [myTasks, setMyTasks]   = useState([]);
  const [statsMap, setStatsMap] = useState({});  // projectId → stats
  const [loading, setLoading]   = useState(true);
  const [activeStatProject, setActiveStatProject] = useState(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const r = await api.get('/projects/me');
      const projs = r.data || [];
      setProjects(projs);
      if (!projs.length) return;

      const [taskResults, statsResults] = await Promise.all([
        Promise.all(
          projs.map(p =>
            api.get(`/projects/${p.id}/tasks?assignee_id=${user.id}`)
               .then(t => t.data.map(task => ({ ...task, projectName: p.name })))
               .catch(() => [])
          )
        ),
        Promise.all(
          projs.map(p =>
            api.get(`/projects/${p.id}/stats`)
               .then(s => ({ id: p.id, stats: s.data }))
               .catch(() => ({ id: p.id, stats: null }))
          )
        ),
      ]);

      setMyTasks(taskResults.flat());
      const sm = {};
      statsResults.forEach(({ id, stats }) => { sm[id] = stats; });
      setStatsMap(sm);
      if (projs.length > 0) setActiveStatProject(projs[0].id);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const active    = projects.filter(p => p.status === 'Active').length;
  const completed = projects.filter(p => p.status === 'Completed').length;
  const onHold    = projects.filter(p => p.status === 'On Hold').length;
  const totalMyTasks = myTasks.length;
  const overdueMyTasks = myTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.progress_percent < 100).length;

  const initials = user?.full_name
    ?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';

  // Stats for selected project
  const currentStats = activeStatProject ? statsMap[activeStatProject] : null;
  const donutSlices = currentStats ? [
    { label: 'Cao', value: currentStats.by_priority?.High || 0, color: '#f85149' },
    { label: 'Trung bình', value: currentStats.by_priority?.Medium || 0, color: '#d29922' },
    { label: 'Thấp', value: currentStats.by_priority?.Low || 0, color: '#3fb950' },
  ] : [];

  // Upcoming tasks (due within 3 days)
  const soon = myTasks.filter(t => {
    if (!t.due_date || t.progress_percent === 100) return false;
    const diff = (new Date(t.due_date) - new Date()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 3;
  });

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-title">Tổng quan</div>
        <button id="btn-new-project-dash" className="btn btn-primary" onClick={() => navigate('/projects')}>
          <Plus size={15} /> Tạo dự án
        </button>
      </div>

      <div className="page">
        {/* ── Greeting banner ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          marginBottom: 24,
        }}>
          <div className="avatar" style={{ width: 52, height: 52, fontSize: 20, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>
              Xin chào, {user?.full_name || 'bạn'} 👋
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {active > 0
                ? `Bạn có ${active} dự án đang hoạt động • ${totalMyTasks} công việc được giao`
                : 'Hôm nay là một ngày tuyệt vời để bắt đầu!'}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0 }}
            onClick={() => navigate('/projects')}
          >
            Tất cả dự án <ChevronRight size={13} />
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="stats-grid" style={{ marginBottom: 28 }}>
          <StatCard value={projects.length} label="Tổng dự án"    color="var(--accent)"  icon={Layers}      sub={`${active} đang hoạt động`} />
          <StatCard value={totalMyTasks}    label="Việc của tôi"     color="var(--purple)"  icon={ListChecks}  sub={overdueMyTasks > 0 ? `${overdueMyTasks} quá hạn` : 'Không có quá hạn'} />
          <StatCard value={completed}       label="Dự án hoàn thành" color="var(--green)" icon={CheckCircle2} />
          <StatCard value={onHold}          label="Tạm dừng"         color="var(--orange)"  icon={PauseCircle} />
        </div>

        {/* ── Charts section ── */}
        {projects.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
            {/* Donut */}
            <div className="card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Phân bổ theo Độ ưu tiên</div>
                <select
                  value={activeStatProject || ''}
                  onChange={e => setActiveStatProject(Number(e.target.value))}
                  style={{ fontSize: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <DashboardDonutChart slices={donutSlices} size={130} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Cao', color: '#f85149', key: 'High' },
                    { label: 'Trung bình', color: '#d29922', key: 'Medium' },
                    { label: 'Thấp', color: '#3fb950', key: 'Low' },
                  ].map(s => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto' }}>
                        {currentStats?.by_priority?.[s.key] || 0}
                      </span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hoàn thành</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{currentStats?.done || 0}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quá hạn</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>{currentStats?.overdue || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bar chart 7 days */}
            <div className="card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <TrendingUp size={15} color="var(--accent)" />
                <div style={{ fontSize: 14, fontWeight: 700 }}>Công việc hoàn thành (7 ngày)</div>
              </div>
              {currentStats?.trend_7days ? (
                <div style={{ height: 130 }}>
                  <DashboardBarChart data={currentStats.trend_7days} />
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Không có dữ liệu</div>
              )}
            </div>
          </div>
        )}

        {/* ── Upcoming deadlines ── */}
        {soon.length > 0 && (
          <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--orange)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 14, fontWeight: 700 }}>
              <AlertTriangle size={15} color="var(--orange)" /> Đến hạn trong 3 ngày tới
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {soon.map(t => {
                const diff = Math.ceil((new Date(t.due_date) - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={t.id}
                    style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 10, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' }}
                    onClick={() => navigate(`/projects/${t.project_id}`)}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.priority === 'High' ? 'var(--red)' : t.priority === 'Medium' ? 'var(--yellow)' : 'var(--green)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.projectName}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: diff === 0 ? 'var(--red)' : 'var(--orange)', whiteSpace: 'nowrap' }}>
                      {diff === 0 ? 'Hôm nay' : `Còn ${diff} ngày`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── My Tasks widget ── */}
        {myTasks.length > 0 && (() => {
          const overdue  = myTasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.progress_percent < 100).length;
          const upcoming = myTasks.filter((t) => t.progress_percent < 100).slice(0, 5);
          return (
            <div className="card" style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ListChecks size={16} color="var(--accent)" /> Việc của tôi
                  {overdue > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--red)', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>
                      <AlertTriangle size={10} /> {overdue} quá hạn
                    </span>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/tasks')}>
                  Xem tất cả <ArrowRight size={13} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcoming.map((t) => {
                  const od = t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 10, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' }} onClick={() => navigate(`/projects/${t.project_id}`)}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.priority === 'High' ? 'var(--red)' : t.priority === 'Medium' ? 'var(--yellow)' : 'var(--green)' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.projectName}</div>
                      </div>
                      <div style={{ fontSize: 11, color: od ? 'var(--red)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        {od ? <AlertTriangle size={10} /> : <Clock size={10} />}
                        {t.due_date ? new Date(t.due_date).toLocaleDateString('vi-VN') : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Recent projects ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Dự án gần đây</div>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => navigate('/projects')}>
            Xem tất cả <ArrowRight size={13} />
          </button>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div style={{ marginBottom: 12, color: 'var(--text-muted)' }}>
              <FolderOpen size={48} strokeWidth={1.2} />
            </div>
            <h3>Chưa có dự án nào</h3>
            <p>Tạo dự án đầu tiên để bắt đầu quản lý công việc</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/projects')}>
              <Plus size={15} /> Tạo dự án mới
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.slice(0, 6).map(p => {
              const stats = statsMap[p.id];
              return (
                <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: getColor(p.id),
                    borderRadius: '12px 12px 0 0',
                  }} />

                  <div className="project-header">
                    <div className="project-icon" style={{ background: `${getColor(p.id)}18`, color: getColor(p.id) }}>
                      {getProjectIcon(p.id)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="project-name">{p.name}</div>
                      <div className="project-desc">{displayDemoText(p.description) || 'Chưa có mô tả'}</div>
                    </div>
                  </div>

                  {/* Mini stats inside card */}
                  {stats && (
                    <div style={{ display: 'flex', gap: 12, margin: '10px 0', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)' }}>📋 {stats.total} công việc</span>
                      <span style={{ color: 'var(--green)' }}>✓ {stats.done}</span>
                      {stats.overdue > 0 && <span style={{ color: 'var(--red)' }}>⚠ {stats.overdue}</span>}
                    </div>
                  )}

                  {/* Progress bar */}
                  {stats && stats.total > 0 && (
                    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 10 }}>
                      <div style={{
                        width: `${Math.round((stats.done / stats.total) * 100)}%`,
                        height: '100%',
                        background: getColor(p.id),
                        borderRadius: 2,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  )}

                  <div className="project-meta">
                    <span className={`badge ${p.status === 'Active' ? 'badge-active' : p.status === 'Completed' ? 'badge-completed' : 'badge-hold'}`}>
                      {p.status === 'Active' ? 'Đang chạy' : p.status === 'Completed' ? 'Hoàn thành' : 'Tạm dừng'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={10} />
                      {new Date(p.created_at).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
