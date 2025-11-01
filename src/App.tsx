// src/App.tsx
import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";

// non-lazy (small) pages
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

// Lazy load heavier pages to improve initial bundle size
const MTNSites = lazy(() => import("./pages/sites/MTNSites"));
const AirtelSites = lazy(() => import("./pages/sites/AirtelSites"));
const GloSites = lazy(() => import("./pages/sites/GloSites"));

const Reports = lazy(() => import("./pages/reports/Reports"));
const InProgressReports = lazy(() => import("./pages/reports/InProgressReports"));
const ResolvedReports = lazy(() => import("./pages/reports/ResolvedReports"));
const CreateReport = lazy(() => import("./pages/reports/CreateReport"));
const Drafts = lazy(() => import("./pages/reports/Drafts"));

const MTNReports = lazy(() => import("./pages/sites/MTNReports"));
const AirtelReports = lazy(() => import("./pages/sites/AirtelReports"));
const GloReports = lazy(() => import("./pages/sites/GloReports"));

const Settings = lazy(() => import("./pages/Settings"));
const Analytics = lazy(() => import("./pages/Analytics"));
const DownLinks = lazy(() => import("./pages/DownLinks"));
const TechnicianMap = lazy(() => import("./pages/TechnicianMap"));
const EditEscalation = lazy(() => import("./pages/escalations/EditEscalation"));
const CloseLink = lazy(() => import("./pages/CloseLink"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const CreateReportPage = lazy(() => import("./pages/staff/CreateReportPage"));
const InProgressPage = lazy(() => import("./pages/staff/InProgressPage"));
const ResolvedPage = lazy(() => import("./pages/staff/ResolvedPage"));

const queryClient = new QueryClient();

// Simple, consistent fallback shown while lazy pages load
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-48">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

// Helper to render a page inside AppLayout (keeps routes succinct)
const withAppLayout = (Component: React.ReactNode) => <AppLayout>{Component}</AppLayout>;

const AppRoutes = () => {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            {withAppLayout(<Dashboard />)}
          </ProtectedRoute>
        }
      />

      {/* Site Data Routes */}
      <Route
        path="/sites/mtn"
        element={
          <ProtectedRoute allowedRoles={["admin", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<MTNSites />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sites/airtel"
        element={
          <ProtectedRoute allowedRoles={["admin", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<AirtelSites />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sites/glo"
        element={
          <ProtectedRoute allowedRoles={["admin", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<GloSites />)}</Suspense>
          </ProtectedRoute>
        }
      />

      {/* Report Routes */}
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<Reports />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/in-progress"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<InProgressReports />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/resolved"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<ResolvedReports />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/create"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<CreateReport />)}</Suspense>
          </ProtectedRoute>
        }
      />

      {/* Staff Workflow Pages */}
      <Route
        path="/staff/create-report"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<CreateReportPage />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/in-progress"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<InProgressPage />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/resolved"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<ResolvedPage />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/drafts"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<Drafts />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/mtn"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<MTNReports />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/airtel"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<AirtelReports />)}</Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/glo"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<GloReports />)}</Suspense>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<Settings />)}</Suspense>
          </ProtectedRoute>
        }
      />

      {/* Analytics */}
      <Route
        path="/analytics"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<Analytics />)}</Suspense>
          </ProtectedRoute>
        }
      />

      {/* Admin Dashboard */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<AdminDashboard />)}</Suspense>
          </ProtectedRoute>
        }
      />

      {/* Edit Escalation */}
      <Route
        path="/escalations/edit/:id"
        element={
          <ProtectedRoute allowedRoles={["fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<EditEscalation />)}</Suspense>
          </ProtectedRoute>
        }
      />

      {/* Close Link (uses report id from reports table) */}
      <Route
        path="/close-link"
        element={
          <ProtectedRoute allowedRoles={["fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>
              {withAppLayout(<CloseLink onClose={() => navigate("/down-links")} />)}
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/close-link/:id"
        element={
          <ProtectedRoute allowedRoles={["fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>
              {withAppLayout(<CloseLink onClose={() => navigate("/down-links")} />)}
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Down Links */}
      <Route
        path="/down-links"
        element={
          <ProtectedRoute allowedRoles={["admin", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<DownLinks />)}</Suspense>
          </ProtectedRoute>
        }
      />

      {/* Technician Map */}
      <Route
        path="/technician-map"
        element={
          <ProtectedRoute allowedRoles={["admin", "fibre_network"]}>
            <Suspense fallback={<LoadingFallback />}>{withAppLayout(<TechnicianMap />)}</Suspense>
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        {/* Toaster (UI) + Sonner (optional) */}
        <Toaster />
        <Sonner />
        <AppRoutes />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
