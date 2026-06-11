import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedLayout from './components/ProtectedLayout';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const BoardPage = lazy(() => import('./pages/BoardPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const TagsPage = lazy(() => import('./pages/TagsPage'));
const ArchivePage = lazy(() => import('./pages/ArchivePage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
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
            <Route path="/archive"             element={<ArchivePage />} />
            <Route path="/members"             element={<MembersPage />} />
            <Route path="/admin"               element={<AdminPage />} />
            <Route path="/notifications"       element={<NotificationsPage />} />
            <Route path="/settings"            element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
