import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Users, FolderOpen, Clock } from 'lucide-react';

const ROLE_COLORS = {
  manager: { bg: 'rgba(79,142,247,0.12)', color: 'var(--accent)' },
  developer: { bg: 'rgba(63,185,80,0.12)', color: 'var(--green)' },
  tester: { bg: 'rgba(167,139,250,0.12)', color: 'var(--purple)' },
};

const TEXT = {
  title: 'Th\u00e0nh vi\u00ean',
  people: 'ng\u01b0\u1eddi',
  emptyTitle: 'Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u th\u00e0nh vi\u00ean',
  emptyDesc: 'B\u1ea1n ch\u01b0a tham gia d\u1ef1 \u00e1n n\u00e0o',
  members: 'th\u00e0nh vi\u00ean',
  noMembers: 'Ch\u01b0a c\u00f3 th\u00e0nh vi\u00ean',
  you: '(b\u1ea1n)',
  canManageTasks: '\u0110i\u1ec1u ph\u1ed1i c\u00f4ng vi\u1ec7c',
  createdAt: 'T\u1ea1o ng\u00e0y',
};

function buildInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}

export default function MembersPage() {
  const { user: me } = useAuth();
  const [projects, setProjects] = useState([]);
  const [membersMap, setMembersMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/projects/me').then(async (res) => {
      const projs = res.data || [];
      setProjects(projs);

      const membershipResults = await Promise.all(
        projs.map(async (project) => {
          const memberRes = await api.get(`/projects/${project.id}/members`);
          return { projectId: project.id, members: memberRes.data || [] };
        }),
      );

      const uniqueUserIds = [...new Set(
        membershipResults.flatMap(({ members }) => members.map((member) => member.user_id)),
      )];

      const userDetails = await Promise.all(
        uniqueUserIds.map((userId) => api.get(`/users/${userId}`).then((r) => r.data).catch(() => null)),
      );

      const sharedUserMap = {};
      userDetails.filter(Boolean).forEach((member) => {
        sharedUserMap[member.id] = member;
      });

      const nextMembersMap = {};
      membershipResults.forEach(({ projectId, members }) => {
        nextMembersMap[projectId] = members.map((member) => ({ ...member, user: sharedUserMap[member.user_id] }));
      });

      setMembersMap(nextMembersMap);
    })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allUniqueUsers = (() => {
    const seen = new Set();
    const list = [];

    Object.values(membersMap).flat().forEach((member) => {
      if (member.user && !seen.has(member.user.id)) {
        seen.add(member.user.id);
        list.push(member.user);
      }
    });

    return list;
  })();

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          {TEXT.title}
          <span className="topbar-subtitle">{allUniqueUsers.length} {TEXT.people}</span>
        </div>
      </div>

      <div className="page">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
              <Users size={52} strokeWidth={1.2} />
            </div>
            <h3>{TEXT.emptyTitle}</h3>
            <p>{TEXT.emptyDesc}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {projects.map((project) => {
              const members = membersMap[project.id] || [];

              return (
                <div key={project.id} className="card" style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <FolderOpen size={16} style={{ color: 'var(--accent)' }} />
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{project.name}</div>
                    <span className={`badge ${project.status === 'Active' ? 'badge-active' : project.status === 'Completed' ? 'badge-completed' : 'badge-hold'}`}>
                      {project.status}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {members.length} {TEXT.members}
                    </span>
                  </div>

                  {members.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{TEXT.noMembers}</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                      {members.map((member) => {
                        const isMe = member.user_id === me?.id;
                        const roleStyle = ROLE_COLORS[member.project_role] || ROLE_COLORS.developer;
                        const initials = buildInitials(member.user?.full_name || 'U');

                        return (
                          <div
                            key={member.user_id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: 'var(--bg-secondary)',
                              borderRadius: 8,
                              padding: '10px 12px',
                              border: isMe ? '1px solid rgba(79,142,247,0.3)' : '1px solid transparent',
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: '#6b7ff2',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 13,
                                fontWeight: 700,
                                color: 'white',
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {member.user?.full_name || `User #${member.user_id}`}
                                {isMe && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 500 }}>{TEXT.you}</span>}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {member.user?.email}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <div style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: roleStyle.bg, color: roleStyle.color, flexShrink: 0 }}>
                                {member.project_role}
                              </div>
                              {member.can_manage_tasks && member.project_role !== 'manager' && (
                                <div style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: 'rgba(37,99,235,0.12)', color: 'var(--accent)', flexShrink: 0 }}>
                                  {TEXT.canManageTasks}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Clock size={10} /> {TEXT.createdAt} {new Date(project.created_at).toLocaleDateString('vi-VN')}
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
