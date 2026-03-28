import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ModuleProvider } from "@/contexts/ModuleContext";
import { PreviewProvider } from "@/contexts/PreviewContext";

// Immediate imports for core pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy loaded pages - loaded on demand
const GeneralDashboardPage = lazy(() => import("./pages/GeneralDashboardPage"));
const AgentsPage = lazy(() => import("./pages/AgentsPage"));
const AgentDetailPage = lazy(() => import("./pages/AgentDetailPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const AdministratorsPage = lazy(() => import("./pages/AdministratorsPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const SuperAgentsPage = lazy(() => import("./pages/admin/SuperAgentsPage"));
const TechnicalDocsPage = lazy(() => import("./pages/admin/TechnicalDocsPage"));
const TerminalPopoutPage = lazy(() => import("./pages/TerminalPopoutPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30_000),
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ModuleProvider>
            <PreviewProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />

                  {/* Core Dashboard */}
                  <Route path="/dashboard" element={<GeneralDashboardPage />} />

                  {/* Agent Management */}
                  <Route path="/agents" element={<AgentsPage />} />
                  <Route path="/agents/:id" element={<AgentDetailPage />} />
                  <Route path="/terminal/:id" element={<TerminalPopoutPage />} />
                  <Route path="/super-agents" element={<SuperAgentsPage />} />

                  {/* Administration */}
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/administrators" element={<AdministratorsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/docs" element={<TechnicalDocsPage />} />

                  {/* Catch-all */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </PreviewProvider>
          </ModuleProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
