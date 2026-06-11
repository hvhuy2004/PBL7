/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Activity, BarChart2, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
import api from '../api';

const COLORS = ['#4f8ef7', '#a78bfa', '#3fb950', '#d29922', '#f85149', '#f0883e'];
const PRIORITY_COLORS = { High: '#f85149', Medium: '#d29922', Low: '#3fb950' };

function AnalyticsCard({ title, icon: Icon, children }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 15, fontWeight: 700 }}>
        <Icon size={18} color="var(--accent)" /> {title}
      </div>
      <div style={{ width: '100%', height: 300 }}>
        {children}
      </div>
    </div>
  );
}

export default function ProjectAnalytics({ projectId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/projects/${projectId}/stats`)
      .then(r => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!stats) return <div className="empty-state">Không thể tải dữ liệu thống kê</div>;

  // Formatting Data for Recharts
  const trendData = (stats.trend_7days || []).map(d => ({
    date: d.date,
    'Công việc': d.count
  }));

  const priorityData = Object.entries(stats.by_priority || {}).map(([key, value]) => ({
    name: key,
    value: value
  }));

  const workloadData = (stats.assignee_stats || []).map(u => ({
    name: u.name,
    'Công việc': u.count
  }));

  const columnData = (stats.by_column || []).map(c => ({
    name: c.column_name,
    'Công việc': c.count
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24, padding: 8 }}>
      
      {/* 7-Day Completion Trend */}
      <AnalyticsCard title="Tiến độ hoàn thành (7 ngày qua)" icon={TrendingUp}>
        <ResponsiveContainer initialDimension={{ width: 600, height: 300 }}>
          <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dx={-10} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
              itemStyle={{ color: 'var(--text-primary)' }}
            />
            <Area type="monotone" dataKey="Công việc" name="Hoàn thành" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorTasks)" />
          </AreaChart>
        </ResponsiveContainer>
      </AnalyticsCard>

      {/* Task Distribution by Column */}
      <AnalyticsCard title="Phân bổ theo trạng thái (Cột)" icon={BarChart2}>
        <ResponsiveContainer initialDimension={{ width: 600, height: 300 }}>
          <BarChart data={columnData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dx={-10} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(79,142,247,0.1)' }}
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Bar dataKey="Công việc" radius={[6, 6, 0, 0]}>
              {columnData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </AnalyticsCard>

      {/* Workload by Assignee */}
      <AnalyticsCard title="Khối lượng công việc (Thành viên)" icon={Activity}>
        <ResponsiveContainer initialDimension={{ width: 600, height: 300 }}>
          <BarChart data={workloadData} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dx={-10} width={80} />
            <Tooltip
              cursor={{ fill: 'rgba(167,139,250,0.1)' }}
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Bar dataKey="Công việc" radius={[0, 6, 6, 0]} fill="var(--purple)" barSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </AnalyticsCard>

      {/* Priority Distribution */}
      <AnalyticsCard title="Phân bổ theo mức ưu tiên" icon={PieChartIcon}>
        <ResponsiveContainer initialDimension={{ width: 600, height: 300 }}>
          <PieChart>
            <Pie
              data={priorityData}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={0}
              dataKey="value"
            >
              {priorityData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.name] || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
              itemStyle={{ color: 'var(--text-primary)' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12, color: 'var(--text-primary)' }} />
          </PieChart>
        </ResponsiveContainer>
      </AnalyticsCard>

    </div>
  );
}

