import { useState, useEffect, useMemo, useCallback } from "react";
import type { ParametrosCalculo } from "@/types/frete";

// === Hardcoded Vipex parameters (real deciphered values) ===
// Default params: SP-INT3. Other origins override specific fields.

export const VIPEX_PARAMS: ParametrosCalculo = {
  despacho: 20.0,
  gris: 0.008,
  grisPorEstado: {
    RS: 0.009,
    SC: 0.009,
    RJ: 0.009,
    ES: 0.013,
    BA: 0.014,
    DF: 0.012,
  },
  pedagioTipo: "por_fracao_m3",
  pedagioValor: 7.83,
  icms: 0.12,
  icmsTipo: "por_dentro",
  icmsPorEstado: {},
  advalorem: 0,
  entregaFixa: 120.0,
  entregaAtiva: true,
  txDifAcessoPorPraca: { "SP-CAP": 0.28, "RJ-CAP": 0.26 },
  faixasM3: [
    { id: 0, maxM3: 0.3 },
    { id: 1, maxM3: 0.5 },
    { id: 2, maxM3: 0.7 },
    { id: 3, maxM3: 1.0 },
    { id: 4, maxM3: 1.5 },
    { id: 5, maxM3: 2.0 },
    { id: 6, maxM3: 2.5 },
    { id: 7, maxM3: 3.0 },
    { id: 8, maxM3: 99999 },
  ],
};

/**
 * Per-origin parameter overrides.
 * Only fields that DIFFER from VIPEX_PARAMS (SP-INT3 default) are specified.
 * Deciphered from CTE audit: 137 CTEs across 2024-2026.
 */
export const ORIGIN_PARAMS_OVERRIDES: Record<
  string,
  Partial<ParametrosCalculo>
> = {
  // SP-INT3: uses VIPEX_PARAMS defaults (no overrides needed)
  // SC-INT, RS-CAP, RS-INT1: use VIPEX_PARAMS defaults (same carrier params)
  "PR-LON": {
    despacho: 30.0,
    gris: 0.009,
    grisPorEstado: {}, // Uniform 0.9% (no per-state variation detected)
    pedagioTipo: "por_fracao_m3",
    pedagioValor: 15.0,
    txDifAcessoPorPraca: {}, // TxDifAcesso not confirmed for this origin
  },
};

/** Get effective parameters for a specific origin (merges overrides). */
export function getParamsForOrigin(originCode: string): ParametrosCalculo {
  const overrides = ORIGIN_PARAMS_OVERRIDES[originCode];
  if (!overrides) return VIPEX_PARAMS;
  return { ...VIPEX_PARAMS, ...overrides };
}

export const ORIGIN_LABELS: Record<string, string> = {
  "SP-INT3": "Dropshipping SP Interior 3",
  "SC-INT": "Dropshipping SC Interior",
  "RS-CAP": "Dropshipping RS Capital",
  "RS-INT1": "Dropshipping RS Interior 1",
  "PR-LON": "Dropshipping PR Londrina (estimado)",
};

/** Origins with partial/estimated tables (not all praças available). */
export const PARTIAL_ORIGINS = new Set(["PR-LON"]);

// === Types ===

export interface CidadeInfo {
  nome: string;
  praca: string;
  unidade: string;
}

type TabelasData = Record<string, Record<string, number[]>>;
type CidadesData = Record<string, { praca: string; unidade: string }>;

interface VipexData {
  tabelas: TabelasData | null;
  cidades: CidadesData | null;
  loading: boolean;
  error: string | null;
  origins: string[];
  searchCidades: (query: string) => CidadeInfo[];
  getFretePesoValores: (
    origemCodigo: string,
    praca: string
  ) => number[] | null;
}

// === Hook ===

export function useVipexData(): VipexData {
  const [tabelas, setTabelas] = useState<TabelasData | null>(null);
  const [cidades, setCidades] = useState<CidadesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [tabelasRes, cidadesRes] = await Promise.all([
          fetch("/data/vipex_tabelas_frete.json"),
          fetch("/data/vipex_cidade_praca.json"),
        ]);

        if (!tabelasRes.ok || !cidadesRes.ok) {
          throw new Error("Falha ao carregar dados locais");
        }

        const tabelasJson = await tabelasRes.json();
        const cidadesJson = await cidadesRes.json();

        if (!cancelled) {
          setTabelas(tabelasJson);
          setCidades(cidadesJson);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Erro desconhecido");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const origins = useMemo(() => {
    if (!tabelas) return [];
    return Object.keys(tabelas);
  }, [tabelas]);

  const cidadesList = useMemo(() => {
    if (!cidades) return [];
    return Object.entries(cidades).map(([nome, info]) => ({
      nome,
      praca: info.praca,
      unidade: info.unidade,
    }));
  }, [cidades]);

  const searchCidades = useCallback(
    (query: string): CidadeInfo[] => {
      if (!query || query.length < 2) return [];
      const lower = query.toLowerCase();
      return cidadesList
        .filter((c) => c.nome.toLowerCase().includes(lower))
        .slice(0, 20);
    },
    [cidadesList]
  );

  const getFretePesoValores = useCallback(
    (origemCodigo: string, praca: string): number[] | null => {
      if (!tabelas || !origemCodigo || !praca) return null;
      const origemData = tabelas[origemCodigo];
      if (!origemData) return null;
      const valores = origemData[praca];
      if (!valores || valores.length < 9) return null;
      return valores;
    },
    [tabelas]
  );

  return {
    tabelas,
    cidades,
    loading,
    error,
    origins,
    searchCidades,
    getFretePesoValores,
  };
}
