/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, MessageSquare, RefreshCw, Trash2, FolderKanban } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api, { toWebSocketUrl } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { resolveMediaUrl } from '../utils/media';

function initials(name) {
  return (name || 'U')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}

function MessageAvatar({ message }) {
  const avatarUrl = resolveMediaUrl(message.user_avatar_url);
  if (avatarUrl) {
    return <img className="message-avatar" src={avatarUrl} alt={message.user_name} />;
  }
  return <div className="message-avatar">{initials(message.user_name)}</div>;
}

function displayMessageText(value = '') {
  return String(value || '').replace(/\b[Tt]ask\b/g, (word) => (word[0] === 'T' ? 'Công việc' : 'công việc'));
}

export default function MessagesPage() {
  const { user, token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';
  const initialProjectIdRef = useRef(initialProjectId);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => initialProjectId);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [wsStatus, setWsStatus] = useState('offline');
  const listRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(selectedProjectId)),
    [projects, selectedProjectId],
  );

  useEffect(() => {
    let mounted = true;
    api.get('/projects/me')
      .then((res) => {
        if (!mounted) return;
        const list = res.data || [];
        setProjects(list);
        const fromUrl = initialProjectIdRef.current;
        if (fromUrl && list.some((project) => String(project.id) === String(fromUrl))) {
          setSelectedProjectId(fromUrl);
        } else if (!fromUrl && list.length) {
          setSelectedProjectId(String(list[0].id));
        }
      })
      .catch(() => setError('Không tải được danh sách dự án'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setSearchParams({ projectId: String(selectedProjectId) }, { replace: true });
  }, [selectedProjectId, setSearchParams]);

  const loadMessages = useCallback(async ({ showLoading = false } = {}) => {
    if (!selectedProjectId) {
      setMessages([]);
      return;
    }
    if (showLoading) setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/projects/${selectedProjectId}/messages/?limit=120`);
      setMessages(data || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Không tải được tin nhắn dự án');
      setMessages([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadMessages({ showLoading: true });
  }, [loadMessages]);

  useEffect(() => {
    if (!selectedProjectId || !token) {
      setWsStatus('offline');
      return undefined;
    }

    let stopped = false;
    let socket = null;

    const connect = () => {
      if (stopped) return;
      setWsStatus('connecting');
      socket = new WebSocket(toWebSocketUrl(
        `/projects/${selectedProjectId}/messages/ws?token=${encodeURIComponent(token)}`,
      ));

      socket.onopen = () => {
        if (!stopped) setWsStatus('online');
      };

      socket.onmessage = (event) => {
        if (stopped) return;
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        const message = payload?.message;
        if (payload?.event === 'created' && message?.id) {
          setMessages((prev) => (
            prev.some((item) => item.id === message.id) ? prev : [...prev, message]
          ));
        }
        if (payload?.event === 'deleted' && message?.id) {
          setMessages((prev) => prev.filter((item) => item.id !== message.id));
        }
      };

      socket.onerror = () => {
        if (!stopped) setWsStatus('offline');
      };

      socket.onclose = () => {
        if (stopped) return;
        setWsStatus('offline');
        reconnectTimerRef.current = window.setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimerRef.current);
      if (socket) socket.close();
    };
  }, [selectedProjectId, token]);

  useEffect(() => {
    if (!selectedProjectId) return undefined;
    const interval = setInterval(() => loadMessages(), 12_000);
    return () => clearInterval(interval);
  }, [selectedProjectId, loadMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !selectedProjectId) return;

    setSending(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${selectedProjectId}/messages/`, { content });
      setMessages((prev) => (
        prev.some((item) => item.id === data.id) ? prev : [...prev, data]
      ));
      setDraft('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Gửi tin nhắn thất bại');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (message) => {
    if (!window.confirm('Xóa tin nhắn này?')) return;
    try {
      await api.delete(`/projects/${message.project_id}/messages/${message.id}`);
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
    } catch (err) {
      setError(err.response?.data?.detail || 'Không xóa được tin nhắn');
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Trao đổi</div>
          <div className="topbar-subtitle">Thảo luận nhanh theo từng dự án</div>
        </div>
      </div>

      <div className="ops-page messages-page">
        <div className="ops-toolbar">
          <select
            className="form-input"
            style={{ width: 320 }}
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button className="btn btn-ghost" type="button" onClick={() => loadMessages({ showLoading: true })}>
            <RefreshCw size={16} /> Làm mới
          </button>
          <div className="ops-toolbar-spacer" />
          <span className={`ops-pill ${wsStatus === 'online' ? 'green' : 'orange'}`}>
            {wsStatus === 'online' ? 'Realtime' : 'Polling'}
          </span>
          <span className="ops-pill blue">
            <MessageSquare size={13} />
            {messages.length} tin nhắn
          </span>
        </div>

        <div className="messages-shell">
          <div className="messages-header">
            <div>
              <div className="ops-panel-title">{selectedProject?.name || 'Chưa chọn dự án'}</div>
              <div className="ops-panel-subtitle">Mọi thành viên trong dự án đều có thể đọc và gửi trao đổi.</div>
            </div>
            <FolderKanban size={20} color="var(--text-secondary)" />
          </div>

          {error && <div className="messages-error">{error}</div>}

          <div className="messages-list" ref={listRef}>
            {loading ? (
              <div className="loading"><div className="spinner" /></div>
            ) : messages.length === 0 ? (
              <div className="ops-empty">
                <MessageSquare size={42} />
                <h3>Chưa có trao đổi</h3>
                <p>Gửi tin nhắn đầu tiên để lưu lại thảo luận chung của dự án.</p>
              </div>
            ) : (
              messages.map((message) => {
                const mine = message.user_id === user?.id;
                const canDelete = mine || user?.role === 'admin';
                return (
                  <div className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>
                    {!mine && <MessageAvatar message={message} />}
                    <div className="message-bubble">
                      <div className="message-meta">
                        <strong>{message.user_name}</strong>
                        <span>{new Date(message.created_at).toLocaleString('vi-VN')}</span>
                        {canDelete && (
                          <button
                            type="button"
                            className="message-delete"
                            onClick={() => deleteMessage(message)}
                            title="Xóa tin nhắn"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div className="message-content">{displayMessageText(message.content)}</div>
                    </div>
                    {mine && <MessageAvatar message={message} />}
                  </div>
                );
              })
            )}
          </div>

          <form className="message-composer" onSubmit={sendMessage}>
            <textarea
              className="form-input"
              placeholder="Nhập trao đổi, quyết định hoặc ghi chú ngắn cho dự án..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={2}
            />
            <button className="btn btn-primary" type="submit" disabled={sending || !draft.trim() || !selectedProjectId}>
              <Send size={16} /> Gửi
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
