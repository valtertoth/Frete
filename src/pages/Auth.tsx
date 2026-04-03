import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function Auth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      navigate("/", { replace: true });
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-medium tracking-tight text-zinc-900">
            Toth Frete
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Entre com sua conta para continuar
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-zinc-600">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="h-9 text-sm transition-colors duration-150"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-zinc-600">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                className="h-9 text-sm transition-colors duration-150"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full gap-2 transition-colors duration-150"
              disabled={loading}
              size="sm"
            >
              <LogIn className="size-4" strokeWidth={1.5} />
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">
          Acesso restrito. Contate o administrador.
        </p>
      </div>
    </div>
  );
}
