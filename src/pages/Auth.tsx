import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthSwitch from "@/components/auth-switch";
import { useAuth } from "@/hooks/useAuth";

export default function Auth() {
  const { user, loading, globalRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user || loading) return;
    navigate(globalRole === 'super_admin' ? '/novura-admin' : '/', { replace: true });
  }, [user, loading, globalRole, navigate]);

  useEffect(() => {
    if (location.pathname === '/cadastro') {
      navigate('/auth?mode=signup', { replace: true });
    }
  }, [location.pathname]);

  return <AuthSwitch />;
}
