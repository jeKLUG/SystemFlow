import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { PortalLayout } from "./pages/portal/PortalLayout";
import { CustomerAssetsPage } from "./pages/customer/CustomerAssetsPage";
import { CustomerLayout } from "./pages/customer/CustomerLayout";
import { CustomerOpsPage } from "./pages/customer/CustomerOpsPage";
import { CustomerOverviewPage } from "./pages/customer/CustomerOverviewPage";
import { CustomerProjectsPage } from "./pages/customer/CustomerProjectsPage";
import { CustomerTasksPage } from "./pages/customer/CustomerTasksPage";
import { TicketsPage } from "./pages/tickets/TicketsPage";
import { TicketDetailPage } from "./pages/tickets/TicketDetailPage";
import { CustomerTimePage } from "./pages/customer/CustomerTimePage";
import { CustomerWikiPage } from "./pages/customer/CustomerWikiPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentPage } from "./pages/DocumentPage";
import { LoginPage } from "./pages/LoginPage";
import { PortalLoginPage } from "./pages/portal/PortalLoginPage";
import { PortalHomePage } from "./pages/portal/PortalHomePage";
import { PortalTicketsPage } from "./pages/portal/PortalTicketsPage";
import { PortalTicketDetailPage } from "./pages/portal/PortalTicketDetailPage";
import { PortalContractsPage } from "./pages/portal/PortalContractsPage";
import { PortalDocumentsPage } from "./pages/portal/PortalDocumentsPage";
import { PortalDocumentPage } from "./pages/portal/PortalDocumentPage";
import { PortalAssetsPage } from "./pages/portal/PortalAssetsPage";
import { PortalAccountPage } from "./pages/portal/PortalAccountPage";
import { QuickNotePage } from "./pages/QuickNotePage";
import { RemindersPage } from "./pages/RemindersPage";
import { PricesPage } from "./pages/PricesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VaultPage } from "./pages/VaultPage";
import { VaultSharePage } from "./pages/VaultSharePage";
import { MonitoringPage } from "./pages/monitoring/MonitoringPage";
import { MonitoringAgentPage } from "./pages/monitoring/MonitoringAgentPage";
import { MonitoringCustomerPage } from "./pages/monitoring/MonitoringCustomerPage";

/** Alte URL `/customers/:id/emails` → Dokumente-Hub mit E-Mail-Ansicht. */
function CustomerEmailsRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={`/customers/${id}/wiki?view=emails`} replace />;
}

function Boot() {
  return (
    <div className="boot">
      <div className="boot-card">
        <img className="brand-mark" src="/logo.png" alt="" width={32} height={32} />
        <p>Systemhaus-Ess wird geladen…</p>
      </div>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Boot />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "customer") return <Navigate to="/portal" replace />;
  return children;
}

function PortalProtected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Boot />;
  if (!user) return <Navigate to="/portal/login" replace />;
  if (user.role !== "customer") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/portal/login" element={<PortalLoginPage />} />
      <Route path="/share/vault/:token" element={<VaultSharePage />} />
      <Route
        path="/portal"
        element={
          <PortalProtected>
            <PortalLayout />
          </PortalProtected>
        }
      >
        <Route index element={<PortalHomePage />} />
        <Route path="tickets" element={<PortalTicketsPage />} />
        <Route path="tickets/:ticketId" element={<PortalTicketDetailPage />} />
        <Route path="contracts" element={<PortalContractsPage />} />
        <Route path="documents" element={<PortalDocumentsPage />} />
        <Route path="documents/:docId" element={<PortalDocumentPage />} />
        <Route path="assets" element={<PortalAssetsPage />} />
        <Route path="account" element={<PortalAccountPage />} />
      </Route>
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="search" element={<Navigate to="/" replace />} />
        <Route path="tasks" element={<RemindersPage />} />
        <Route path="reminders" element={<Navigate to="/tasks" replace />} />
        <Route path="quick-note" element={<QuickNotePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="prices" element={<PricesPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="monitoring/setup" element={<MonitoringAgentPage />} />
        <Route path="monitoring/customers/:customerId/devices/:assetId" element={<MonitoringCustomerPage />} />
        <Route path="monitoring/customers/:customerId" element={<MonitoringCustomerPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerLayout />}>
          <Route index element={<CustomerOverviewPage />} />
          <Route path="wiki" element={<CustomerWikiPage />} />
          <Route path="emails" element={<CustomerEmailsRedirect />} />
          <Route path="projects" element={<CustomerProjectsPage />} />
          <Route path="time" element={<CustomerTimePage />} />
          <Route path="assets" element={<CustomerAssetsPage />} />
          <Route path="tasks" element={<CustomerTasksPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="ops" element={<CustomerOpsPage />} />
        </Route>
        <Route path="documents/:id" element={<DocumentPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

