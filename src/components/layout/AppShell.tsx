import { Outlet, Link, useLocation } from "react-router-dom";
import { Calculator, Settings, LogOut, FileCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function AppShell() {
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { to: "/", label: "Calculadora", icon: Calculator },
    { to: "/conferencia", label: "Conferência", icon: FileCheck },
    { to: "/admin", label: "Admin", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="text-sm font-medium tracking-tight text-zinc-900 transition-colors duration-150"
            >
              Toth Frete
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                      isActive
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                    }`}
                  >
                    <Icon className="size-4" strokeWidth={1.5} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-600"
            title="Sair"
          >
            <LogOut className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
