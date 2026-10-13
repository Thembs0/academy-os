import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireRole } from "@/features/auth/guards";
import { LoginPage, RequestAccessPage, ResetPasswordPage, SetPasswordPage } from "@/features/auth/AuthPages";
import { SyncProvider } from "@/features/auth/SyncProvider";
import AppLayout from "@/layouts/AppLayout";
import Landing from "@/features/landing/Landing";
import { Spinner } from "@/components/ui";

const lz = <T extends { default: React.ComponentType<any> }>(f: () => Promise<T>) => lazy(f);
const ExternalSigninPage = lz(() => import("@/features/registers/ExternalSigninPage"));
const Dashboard = lz(() => import("@/features/dashboard/Dashboard"));
const Projects = lz(() => import("@/features/projects/ProjectsPage"));
const ProjectDetail = lz(() => import("@/features/projects/ProjectDetail"));
const Observations = lz(() => import("@/features/observations/ObservationsPage"));
const ObservationForm = lz(() => import("@/features/observations/ObservationForm"));
const ObservationDetail = lz(() => import("@/features/observations/ObservationDetail"));
const Schools = lz(() => import("@/features/schools/SchoolsPage"));
const SchoolDetail = lz(() => import("@/features/schools/SchoolDetail"));
const Teachers = lz(() => import("@/features/teachers/TeachersPage"));
const TeacherDetail = lz(() => import("@/features/teachers/TeacherDetail"));
const Documents = lz(() => import("@/features/documents/DocumentsPage"));
const Outstanding = lz(() => import("@/features/documents/OutstandingPage"));
const Reports = lz(() => import("@/features/reports/ReportsPage"));
const Analytics = lz(() => import("@/features/analytics/AnalyticsPage"));
const Notifications = lz(() => import("@/features/notifications/NotificationsPage"));
const Audit = lz(() => import("@/features/audit/AuditPage"));
const Users = lz(() => import("@/features/users/UsersPage"));
const Roles = lz(() => import("@/features/admin/RolesPage"));
const Settings = lz(() => import("@/features/admin/SettingsPage"));
const Forms = lz(() => import("@/features/admin/FormsPage"));
const Profile = lz(() => import("@/features/users/ProfilePage"));
const Search = lz(() => import("@/features/search/SearchPage"));
const ExternalSubmit = lz(() => import("@/features/external/ExternalSubmit"));
const CheckInsPage = lz(() => import("@/features/checkins/CheckInsPage"));
const RegistersPage = lz(() => import("@/features/registers/RegistersPage"));
const RegisterDetail = lz(() => import("@/features/registers/RegisterDetail"));

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner /></div>}>
      <Routes>
        {/* ── Public routes: no auth, no app shell ─────────────────── */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/request-access" element={<RequestAccessPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/submit/:token" element={<ExternalSubmit />} />
        <Route path="/signin/:token" element={<ExternalSigninPage />} />

        {/* ── Authenticated routes: require login, wrapped in layout ── */}
        <Route element={<RequireAuth><SyncProvider><AppLayout /></SyncProvider></RequireAuth>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/observations" element={<Observations />} />
          <Route path="/observations" element={<Observations />} />
          <Route path="/observations/new" element={<ObservationForm />} />
          <Route path="/observations/:id" element={<ObservationDetail />} />
          <Route path="/observations/:id/edit" element={<ObservationForm />} />
          <Route path="/check-ins" element={<CheckInsPage />} />
          <Route path="/registers" element={<RegistersPage />} />
          <Route path="/registers/:id" element={<RegisterDetail />} />
          <Route path="/schools" element={<Schools />} />
          <Route path="/schools/:id" element={<SchoolDetail />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/teachers/:id" element={<TeacherDetail />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/outstanding" element={<Outstanding />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/analytics" element={<RequireRole perm="analytics.view"><Analytics /></RequireRole>} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/audit" element={<RequireRole roles={["super_admin", "hod", "coordinator", "me", "data_admin", "project_manager"]}><Audit /></RequireRole>} />
          <Route path="/admin/users" element={<RequireRole roles={["super_admin", "hod"]}><Users /></RequireRole>} />
          <Route path="/admin/roles" element={<RequireRole roles={["super_admin"]}><Roles /></RequireRole>} />
          <Route path="/admin/settings" element={<RequireRole roles={["super_admin"]}><Settings /></RequireRole>} />
          <Route path="/admin/forms" element={<RequireRole roles={["super_admin", "hod"]}><Forms /></RequireRole>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/search" element={<Search />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}