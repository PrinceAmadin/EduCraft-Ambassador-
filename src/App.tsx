// src/App.tsx
import AdminDashboard from "./AdminDashboard";
import RegisterPage   from "./RegisterPage";

export default function App() {
  const path = window.location.pathname;
  if (path === "/register" || path.startsWith("/register/")) return <RegisterPage/>;
  return <AdminDashboard/>;
}
