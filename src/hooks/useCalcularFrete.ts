import { useMemo } from "react";
import { calcularFrete } from "@/lib/freteCalculo";
import type { ParametrosCalculo, FreteInput, FreteResult } from "@/types/frete";

interface UseCalcularFreteParams {
  params: ParametrosCalculo | null;
  fretePesoValores: number[] | undefined;
  m3: number;
  valorMercadoria: number;
  praca: string;
  incluirEntrega: boolean;
  margemSeguranca: number;
}

export function useCalcularFrete(
  data: UseCalcularFreteParams
): FreteResult | null {
  return useMemo(() => {
    if (
      !data.params ||
      !data.fretePesoValores ||
      data.fretePesoValores.length < 9 ||
      !data.m3 ||
      !data.valorMercadoria ||
      !data.praca
    ) {
      return null;
    }

    const input: FreteInput = {
      params: data.params,
      fretePesoValores: data.fretePesoValores,
      m3: data.m3,
      valorMercadoria: data.valorMercadoria,
      praca: data.praca,
      incluirEntrega: data.incluirEntrega,
      margemSeguranca: data.margemSeguranca,
    };

    return calcularFrete(input);
  }, [
    data.params,
    data.fretePesoValores,
    data.m3,
    data.valorMercadoria,
    data.praca,
    data.incluirEntrega,
    data.margemSeguranca,
  ]);
}
