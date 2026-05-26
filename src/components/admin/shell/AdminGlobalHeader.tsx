import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, LogOut, Shield } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function AdminGlobalHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayName = String(
    (user as { user_metadata?: { full_name?: string; name?: string }; email?: string })?.user_metadata
      ?.full_name ||
      (user as { user_metadata?: { name?: string } })?.user_metadata?.name ||
      (user as { email?: string })?.email?.split("@")[0] ||
      "Admin",
  );
  const email = String((user as { email?: string })?.email || "");
  const avatarUrl = String(
    (user as { user_metadata?: { avatar_url?: string; picture?: string } })?.user_metadata?.avatar_url ||
      (user as { user_metadata?: { picture?: string } })?.user_metadata?.picture ||
      "",
  );
  const initial = displayName?.[0]?.toUpperCase() || "A";

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    navigate("/auth");
  };

  return (
    <>
      <header className="fixed inset-x-0 z-[9999] h-16 bg-white shadow-sm flex items-center justify-between gap-1 px-8 top-0 rounded-t-xl">
        <div className="flex items-center gap-4">
          <Link to="/novura-admin" aria-label="Novura Admin" title="Novura Admin" className="flex items-center">
            <img
              src="/novura-erp-logo.svg"
              alt="Novura logo"
              className="h-16 w-auto cursor-pointer select-none transition-transform duration-200 ease-out hover:scale-[0.97] hover:brightness-95 active:scale-[0.90]"
              style={{ width: "calc(var(--sidebar-width) / 2)" }}
            />
          </Link>
          <Badge variant="secondary" className="hidden sm:flex items-center gap-1 bg-primary/10 text-novura-primary border-0">
            <Shield className="h-3 w-3" />
            Console Interno
          </Badge>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="rounded-full px-2 py-1 hover:bg-gray-100 flex items-center gap-2">
              <Avatar className="h-8 w-8 rounded-full">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                <AvatarFallback className="rounded-full">{initial}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-gray-700">{displayName}</span>
              <ChevronDown className="w-4 h-4 text-purple-600" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 z-[10000]">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 rounded-full">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                <AvatarFallback className="rounded-full">{initial}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="text-sm font-medium">{displayName}</div>
                <div className="text-xs text-gray-600">{email}</div>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <Button
                variant="ghost"
                className="justify-start text-red-600 hover:text-red-700"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2 text-red-600" />
                Sair
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </header>
      <div className="h-[65px]" />
    </>
  );
}
