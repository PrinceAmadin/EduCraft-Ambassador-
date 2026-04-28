// src/App.tsx
import AdminDashboard from "./AdminDashboard";
import RegisterPage   from "./RegisterPage";

export default function App() {
  const path = window.location.pathname;

  // Public ambassador registration page
  if (path === "/register" || path.startsWith("/register/")) {
    return <RegisterPage />;
  }

  // Default: admin dashboard
  return <AdminDashboard />;
}
