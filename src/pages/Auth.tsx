import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthSwitch from "@/components/auth-switch";
import { useAuth } from "@/hooks/useAuth";

export default function Auth() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user]);

  useEffect(() => {
    if (location.pathname === '/cadastro') {
      navigate('/auth?mode=signup', { replace: true });
    }
  }, [location.pathname]);

  return <AuthSwitch />;
}
