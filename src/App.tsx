// src/App.tsx
import AdminDashboard from "./AdminDashboard";
import RegisterPage   from "./RegisterPage";
import ApplyPage      from "./ApplyPage";

export default function App() {
  const path = window.location.pathname;
  if (path === "/register" || path.startsWith("/register/")) return <RegisterPage/>;
  if (path === "/apply"    || path.startsWith("/apply/"))    return <ApplyPage/>;
  return <AdminDashboard/>;
}
