import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import BoardPage from './pages/BoardPage';
import TasksPage from './pages/TasksPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import MembersPage from './pages/MembersPage';
import ProtectedLayout from './components/ProtectedLayout';

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
          <Route path="/members"             element={<MembersPage />} />
          <Route path="/notifications"       element={<NotificationsPage />} />
          <Route path="/settings"            element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
