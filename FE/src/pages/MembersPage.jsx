import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Users, FolderOpen, Clock } from 'lucide-react';

const ROLE_COLORS = {
  manager:   { bg: 'rgba(79,142,247,0.12)',  color: 'var(--accent)'  },
  developer: { bg: 'rgba(63,185,80,0.12)',   color: 'var(--green)'   },
  tester:    { bg: 'rgba(167,139,250,0.12)', color: 'var(--purple)'  },
};

export default function MembersPage() {
  const { user: me } = useAuth();
  const [projects, setProjects] = useState([]);
  const [membersMap, setMembersMap] = useState({}); // projectId → [member + user info]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/projects/me').then(async (res) => {
      const projs = res.data || [];
      setProjects(projs);

      const membershipResults = await Promise.all(
        projs.map(async (p) => {
          const membRes = await api.get(`/projects/${p.id}/members`);
          return { projectId: p.id, members: membRes.data || [] };
        })
      );

      const uniqueUserIds = [...new Set(
        membershipResults.flatMap(({ members }) => members.map((member) => member.user_id))
      )];

      const userDetails = await Promise.all(
        uniqueUserIds.map((userId) =>
          api.get(`/users/${userId}`).then((r) => r.data).catch(() => null)
        )
      );

      const sharedUserMap = {};
      userDetails.filter(Boolean).forEach((u) => { sharedUserMap[u.id] = u; });

      const map = {};
      membershipResults.forEach(({ projectId, members }) => {
        map[projectId] = members.map((m) => ({ ...m, user: sharedUserMap[m.user_id] }));
      });
      setMembersMap(map);
    })
    .catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  // Tổng hợp tất cả members duy nhất qua các project
  const allUniqueUsers = (() => {
    const seen = new Set();
    const list = [];
    Object.values(membersMap).flat().forEach((m) => {
      if (m.user && !seen.has(m.user.id)) {
        seen.add(m.user.id);
        list.push(m.user);
      }
    });
    return list;
  })();

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          Thành viên
          <span className="topbar-subtitle">{allUniqueUsers.length} người</span>
        </div>
      </div>

      <div className="page">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}><Users size={52} strokeWidth={1.2} /></div>
            <h3>Chưa có dữ liệu thành viên</h3>
            <p>Bạn chưa tham gia dự án nào</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {projects.map((p) => {
              const members = membersMap[p.id] || [];
              return (
                <div key={p.id} className="card" style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <FolderOpen size={16} style={{ color: 'var(--accent)' }} />
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                    <span className={`badge ${p.status === 'Active' ? 'badge-active' : p.status === 'Completed' ? 'badge-completed' : 'badge-hold'}`}>
                      {p.status}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {members.length} thành viên
                    </span>
                  </div>

                  {members.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Chưa có thành viên</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                      {members.map((m) => {
                        const isMe = m.user_id === me?.id;
                        const roleStyle = ROLE_COLORS[m.project_role] || ROLE_COLORS.developer;
                        const initials = (m.user?.full_name || 'U').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
                        return (
                          <div key={m.user_id} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px',
                            border: isMe ? '1px solid rgba(79,142,247,0.3)' : '1px solid transparent',
                          }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: '#6b7ff2',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0,
                            }}>
                              {initials}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {m.user?.full_name || `User #${m.user_id}`}
                                {isMe && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 500 }}>(bạn)</span>}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.user?.email}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <div style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: roleStyle.bg, color: roleStyle.color, flexShrink: 0 }}>
                                {m.project_role}
                              </div>
                              {m.can_manage_tasks && m.project_role !== 'manager' && (
                                <div style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: 'rgba(37,99,235,0.12)', color: 'var(--accent)', flexShrink: 0 }}>
                                  Điều phối công việc
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Clock size={10} /> Tạo ngày {new Date(p.created_at).toLocaleDateString('vi-VN')}
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
