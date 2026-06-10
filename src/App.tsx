import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicLayout } from "./components/PublicLayout";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  DashboardPage,
  QueuePage,
  ModerationLogPage,
  RulesPage,
  MessagesPage,
  LandingPage,
  LoginPage,
  SettingsPage,
  ListsPage,
} from "./pages";
import ImageRecognitionPage from "./pages/ImageRecognitionPage";
import ModerateByIdPage from "./pages/ModerateByIdPage";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable>
        <Toaster />
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              {/* Signup disabled — invite-only via Users section */}
              <Route path="/signup" element={<Navigate to="/login" replace />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/queue" element={<QueuePage />} />
              <Route path="/moderation-log" element={<ModerationLogPage />} />
              <Route path="/rules" element={<RulesPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/users" element={<Navigate to="/settings?tab=team" replace />} />
              <Route path="/image-recognition" element={<ImageRecognitionPage />} />
              <Route path="/moderate-by-id" element={<ModerateByIdPage />} />
              {/* HIDDEN: Lab route — Automated Remediation hidden per Timur (2026-03-17) */}
              {/* <Route path="/lab" element={<LabPage />} /> */}
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
