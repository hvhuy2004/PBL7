import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedLayout from './components/ProtectedLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import BoardPage from './pages/BoardPage';
import TasksPage from './pages/TasksPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import MembersPage from './pages/MembersPage';
import ReportsPage from './pages/ReportsPage';
import ActivityPage from './pages/ActivityPage';
import TagsPage from './pages/TagsPage';
import ArchivePage from './pages/ArchivePage';
import MessagesPage from './pages/MessagesPage';
import AdminPage from './pages/AdminPage';
import BookmarksPage from './pages/BookmarksPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected */}
        <Route element={<ProtectedLayout />}>
          <Route path="/"                    element={<DashboardPage />} />
          <Route path="/projects"            element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<BoardPage />} />
          <Route path="/tasks"               element={<TasksPage />} />
          <Route path="/reports"             element={<ReportsPage />} />
          <Route path="/activity"            element={<ActivityPage />} />
          <Route path="/messages"            element={<MessagesPage />} />
          <Route path="/tags"                element={<TagsPage />} />
          <Route path="/bookmarks"           element={<BookmarksPage />} />
          <Route path="/archive"             element={<ArchivePage />} />
          <Route path="/members"             element={<MembersPage />} />
          <Route path="/admin"               element={<AdminPage />} />
          <Route path="/notifications"       element={<NotificationsPage />} />
          <Route path="/settings"            element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
