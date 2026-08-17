import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { CustomerAssetsPage } from "./pages/customer/CustomerAssetsPage";
import { CustomerLayout } from "./pages/customer/CustomerLayout";
import { CustomerEmailsPage } from "./pages/customer/CustomerEmailsPage";
import { CustomerOpsPage } from "./pages/customer/CustomerOpsPage";
import { CustomerOverviewPage } from "./pages/customer/CustomerOverviewPage";
import { CustomerProjectsPage } from "./pages/customer/CustomerProjectsPage";
import { CustomerTasksPage } from "./pages/customer/CustomerTasksPage";
import { CustomerTimePage } from "./pages/customer/CustomerTimePage";
import { CustomerWikiPage } from "./pages/customer/CustomerWikiPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentPage } from "./pages/DocumentPage";
import { LoginPage } from "./pages/LoginPage";
import { QuickNotePage } from "./pages/QuickNotePage";
import { RemindersPage } from "./pages/RemindersPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VaultPage } from "./pages/VaultPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="boot">
        <div className="boot-card">
          <img className="brand-mark" src="/logo.png" alt="" width={32} height={32} />
          <p>Systemhaus-Ess wird geladen…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="quick-note" element={<QuickNotePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerLayout />}>
          <Route index element={<CustomerOverviewPage />} />
          <Route path="wiki" element={<CustomerWikiPage />} />
          <Route path="emails" element={<CustomerEmailsPage />} />
          <Route path="projects" element={<CustomerProjectsPage />} />
          <Route path="time" element={<CustomerTimePage />} />
          <Route path="assets" element={<CustomerAssetsPage />} />
          <Route path="tasks" element={<CustomerTasksPage />} />
          <Route path="ops" element={<CustomerOpsPage />} />
        </Route>
        <Route path="documents/:id" element={<DocumentPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
