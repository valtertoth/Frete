import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Transportadora,
  TransportadoraOrigem,
  ParametrosCalculo,
} from "@/types/frete";

export function useTransportadoras() {
  return useQuery<Transportadora[]>({
    queryKey: ["transportadoras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transportadoras")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });
}

export function useTransportadoraOrigens(
  transportadoraId: string | undefined
) {
  return useQuery<TransportadoraOrigem[]>({
    queryKey: ["transportadora-origens", transportadoraId],
    enabled: !!transportadoraId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transportadora_origens")
        .select("*")
        .eq("transportadora_id", transportadoraId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Resolve effective params for an origin:
 * transportadora.parametros_calculo merged with origem.parametros_override
 */
export function resolveOriginParams(
  transportadora: Transportadora,
  origem: TransportadoraOrigem
): ParametrosCalculo | null {
  const base = transportadora.parametros_calculo;
  if (!base) return null;
  if (!origem.parametros_override) return base;
  return { ...base, ...origem.parametros_override };
}
