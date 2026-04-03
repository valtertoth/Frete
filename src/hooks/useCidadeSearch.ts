import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CidadePraca } from "@/types/frete";

export function useCidadeSearch(
  transportadoraId: string | undefined,
  search: string
) {
  return useQuery<CidadePraca[]>({
    queryKey: ["cidade-search", transportadoraId, search],
    enabled: !!transportadoraId && search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transportadora_cidade_praca")
        .select("*")
        .eq("transportadora_id", transportadoraId!)
        .ilike("cidade", `${search}%`)
        .order("cidade")
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export function usePracaValores(
  transportadoraId: string | undefined,
  origemCodigo: string | undefined,
  pracaDestino: string | undefined
) {
  return useQuery<number[]>({
    queryKey: ["praca-valores", transportadoraId, origemCodigo, pracaDestino],
    enabled: !!transportadoraId && !!origemCodigo && !!pracaDestino,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transportadora_tabela_frete")
        .select("faixa_idx, valor")
        .eq("transportadora_id", transportadoraId!)
        .eq("origem_codigo", origemCodigo!)
        .eq("praca_destino", pracaDestino!)
        .order("faixa_idx");
      if (error) throw error;

      // Montar array de 9 posições
      const valores = new Array(9).fill(0);
      for (const row of data) {
        valores[row.faixa_idx] = Number(row.valor);
      }
      return valores;
    },
  });
}
