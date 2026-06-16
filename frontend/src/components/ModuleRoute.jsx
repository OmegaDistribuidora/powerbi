import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { hasModuleAccess } from "../modules";

export default function ModuleRoute({ moduleKey, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="screen-center">Carregando...</div>;
  }

  if (!hasModuleAccess(user, moduleKey)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
