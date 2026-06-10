import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, CheckCircle2, Clock,
  FolderKanban, ListChecks, TrendingUp, Users,
} from 'lucide-react';
import api from '../api';

const PRIORITY_LABELS = { High: 'Cao', Medium: 'Trung bình', Low: 'Thấp' };
const TYPE_LABELS = { Task: 'Công việc', Bug: 'Lỗi', Feature: 'Tính năng', Docs: 'Tài liệu' };
const STATUS_LABELS = { Active: 'Đang chạy', Completed: 'Hoàn thành', 'On Hold': 'Tạm dừng' };

function MetricCard({ icon: Icon, label, value, sub, color = 'var(--accent)' }) {
  return (
    <div className="ops-metric">
      <div className="ops-metric-icon" style={{ background: `${color}14`, color }}>
        <Icon size={20} />
      </div>
      <div>
        <div className="ops-metric-value">{value}</div>
        <div className="ops-metric-label">{label}</div>
        {sub && <div className="ops-row-sub">{sub}</div>}
      </div>
    </div>
  );
}

function pct(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function riskLabel(project) {
  if (project.stats?.overdue > 0) return { text: 'Có công việc quá hạn', cls: 'red' };
  if ((project.stats?.total || 0) > 0 && pct(project.stats.done || 0, project.stats.total || 0) < 35) {
    return { text: 'Cần theo dõi', cls: 'orange' };
  }
  return { text: 'Ổn định', cls: 'green' };
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/projects/me');
        const baseProjects = data || [];
        const enriched = await Promise.all(baseProjects.map(async (project) => {
          const [stats, tasks] = await Promise.all([
            api.get(`/projects/${project.id}/stats`).then((r) => r.data).catch(() => null),
            api.get(`/projects/${project.id}/tasks`).then((r) => r.data || []).catch(() => []),
          ]);
          return { ...project, stats, tasks };
        }));
        if (mounted) setProjects(enriched);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const summary = useMemo(() => {
    const totalTasks = projects.reduce((sum, p) => sum + (p.stats?.total || 0), 0);
    const doneTasks = projects.reduce((sum, p) => sum + (p.stats?.done || 0), 0);
    const overdue = projects.reduce((sum, p) => sum + (p.stats?.overdue || 0), 0);
    const high = projects.reduce((sum, p) => sum + (p.stats?.by_priority?.High || 0), 0);
    const workload = new Map();
    projects.forEach((p) => {
      (p.stats?.assignee_stats || []).forEach((a) => {
        const current = workload.get(a.name) || 0;
        workload.set(a.name, current + (a.count || 0));
      });
    });
    const workloadRows = [...workload.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    return { totalTasks, doneTasks, overdue, high, workloadRows };
  }, [projects]);

  const upcomingTasks = useMemo(() => (
    projects.flatMap((project) => (project.tasks || []).map((task) => ({ ...task, project })))
      .filter((task) => {
        if (!task.due_date || task.progress_percent >= 100) return false;
        const diff = (new Date(task.due_date) - new Date()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      })
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 10)
  ), [projects]);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Báo cáo</div>
          <div className="topbar-subtitle">Theo dõi tiến độ, rủi ro và phân bổ công việc</div>
        </div>
      </div>

      <div className="ops-page">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : (
          <>
            <div className="ops-grid">
              <MetricCard icon={FolderKanban} label="Dự án đang theo dõi" value={projects.length} sub="Bao gồm các dự án bạn tham gia" />
              <MetricCard icon={ListChecks} label="Tổng số công việc" value={summary.totalTasks} color="var(--purple)" />
              <MetricCard icon={CheckCircle2} label="Đã hoàn thành" value={summary.doneTasks} color="var(--green)" sub={`${pct(summary.doneTasks, summary.totalTasks)}% toàn hệ thống`} />
              <MetricCard icon={AlertTriangle} label="Quá hạn" value={summary.overdue} color="var(--red)" />
              <MetricCard icon={TrendingUp} label="Ưu tiên cao" value={summary.high} color="var(--orange)" />
            </div>

            <div className="ops-grid two">
              <div className="ops-panel">
                <div className="ops-panel-header">
                  <div>
                    <div className="ops-panel-title">Sức khỏe dự án</div>
                  <div className="ops-panel-subtitle">Tổng hợp theo công việc đang hoạt động</div>
                  </div>
                  <BarChart3 size={18} color="var(--text-secondary)" />
                </div>
                <div className="ops-panel-body">
                  {projects.length === 0 ? (
                    <div className="ops-empty">
                      <FolderKanban size={42} />
                      <h3>Chưa có dự án</h3>
                      <p>Tạo dự án đầu tiên để bắt đầu theo dõi báo cáo.</p>
                    </div>
                  ) : (
                    <div className="ops-table-wrap">
                      <table className="ops-table">
                        <thead>
                          <tr>
                            <th>Dự án</th>
                            <th>Tiến độ</th>
                            <th>Công việc</th>
                            <th>Quá hạn</th>
                            <th>Rủi ro</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {projects.map((project) => {
                            const total = project.stats?.total || 0;
                            const done = project.stats?.done || 0;
                            const progress = pct(done, total);
                            const risk = riskLabel(project);
                            return (
                              <tr key={project.id}>
                                <td>
                                  <div className="ops-row-title">{project.name}</div>
                                  <div className="ops-row-sub">{project.project_key || 'Không có mã'} · {STATUS_LABELS[project.status] || project.status || 'Đang chạy'}</div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className="ops-progress">
                                      <div className="ops-progress-bar" style={{ width: `${progress}%` }} />
                                    </div>
                                    <strong>{progress}%</strong>
                                  </div>
                                </td>
                                <td>{done}/{total}</td>
                                <td>{project.stats?.overdue || 0}</td>
                                <td><span className={`ops-pill ${risk.cls}`}>{risk.text}</span></td>
                                <td>
                                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/projects/${project.id}`)}>
                                    Mở board
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="ops-panel">
                <div className="ops-panel-header">
                  <div>
                    <div className="ops-panel-title">Phân bổ theo thành viên</div>
                    <div className="ops-panel-subtitle">Những thành viên đang nhận nhiều công việc nhất</div>
                  </div>
                  <Users size={18} color="var(--text-secondary)" />
                </div>
                <div className="ops-panel-body">
                  {summary.workloadRows.length === 0 ? (
                    <div className="ops-empty">
                      <Users size={42} />
                      <h3>Chưa có dữ liệu phân công</h3>
                      <p>Giao công việc cho thành viên để xem khối lượng hiện tại.</p>
                    </div>
                  ) : (
                    <div className="ops-list">
                      {summary.workloadRows.map((row) => {
                        const max = summary.workloadRows[0]?.count || 1;
                        const width = Math.max(8, Math.round((row.count / max) * 100));
                        return (
                          <div className="ops-list-row" key={row.name}>
                            <div className="ops-list-icon"><Users size={16} /></div>
                            <div>
                              <div className="ops-row-title">{row.name}</div>
                              <div className="ops-progress" style={{ marginTop: 8 }}>
                                <div className="ops-progress-bar" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                            <span className="ops-pill blue">{row.count} công việc</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="ops-panel">
              <div className="ops-panel-header">
                <div>
                  <div className="ops-panel-title">Deadline gần</div>
                  <div className="ops-panel-subtitle">Các công việc chưa hoàn thành có hạn trong 7 ngày tới</div>
                </div>
                <Clock size={18} color="var(--text-secondary)" />
              </div>
              <div className="ops-panel-body">
                <div className="ops-table-wrap">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>Công việc</th>
                        <th>Dự án</th>
                        <th>Ưu tiên</th>
                        <th>Tiến độ</th>
                        <th>Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingTasks.map((task) => (
                        <tr key={`${task.project.id}-${task.id}`}>
                          <td>
                            <div className="ops-row-title">{task.title}</div>
                            <div className="ops-row-sub">{TYPE_LABELS[task.task_type] || task.task_type || 'Công việc'}</div>
                          </td>
                          <td>{task.project.name}</td>
                          <td><span className={`ops-pill ${task.priority === 'High' ? 'red' : task.priority === 'Medium' ? 'orange' : 'blue'}`}>{PRIORITY_LABELS[task.priority] || task.priority || 'Trung bình'}</span></td>
                          <td>{task.progress_percent || 0}%</td>
                          <td>{new Date(task.due_date).toLocaleDateString('vi-VN')}</td>
                        </tr>
                      ))}
                      {upcomingTasks.length === 0 && (
                        <tr>
                          <td colSpan={5}>
                            <div className="ops-empty" style={{ padding: 24 }}>
                              <Clock size={36} />
                              <h3>Không có deadline gần</h3>
                              <p>Chưa có công việc nào cần hoàn thành trong 7 ngày tới.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
