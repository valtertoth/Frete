/**
 * Motor de Cálculo de Frete — Função Pura
 *
 * Fórmula real decifrada da auditoria de 60 CTEs da Vipex.
 * Zero dependências externas. Testável em isolamento.
 *
 * Prova real — DACTE21490:
 *   SP-INT3 → Itupeva/SP (SP-GDSP), M³=1.5785, Valor=R$5.193,92
 *   Resultado: R$614,24 ✅ (match centavo a centavo)
 */

import type { ParametrosCalculo, FreteInput, FreteResult, FaixaM3 } from "@/types/frete";

// Labels das faixas padrão Vipex
const FAIXA_LABELS = [
  "0 a 0,30 M³",
  "0,31 a 0,50 M³",
  "0,51 a 0,70 M³",
  "0,71 a 1,00 M³",
  "1,01 a 1,50 M³",
  "1,51 a 2,00 M³",
  "2,01 a 2,50 M³",
  "2,51 a 3,00 M³",
  "Acima de 3 M³",
];

/**
 * Encontra o índice da faixa de M³ para um volume dado.
 */
export function findFaixaIdx(faixasM3: FaixaM3[], m3: number): number {
  for (let i = 0; i < faixasM3.length; i++) {
    if (m3 <= faixasM3[i].maxM3) {
      return i;
    }
  }
  // Se excedeu todas as faixas, retorna a última (gatilho)
  return faixasM3.length - 1;
}

/**
 * Extrai o estado (UF) a partir do código da praça.
 * "SP-CAP" → "SP", "RS-INT1" → "RS", "BA-NOR" → "BA"
 */
export function getEstadoFromPraca(praca: string): string {
  return praca.split("-")[0];
}

/**
 * Calcula o pedágio baseado no tipo e m³.
 */
export function calcPedagio(
  tipo: "por_fracao_m3" | "fixo",
  valor: number,
  m3: number
): number {
  if (tipo === "por_fracao_m3") {
    return valor * Math.ceil(m3);
  }
  return valor;
}

/**
 * Calcula o frete completo com a fórmula real.
 *
 * Esta é a função principal — pura, sem side effects, sem IO.
 */
export function calcularFrete(input: FreteInput): FreteResult {
  const { params, fretePesoValores, m3, valorMercadoria, praca, incluirEntrega, margemSeguranca } =
    input;

  // 1. Faixa de M³
  const faixaIdx = findFaixaIdx(params.faixasM3, m3);

  // 2. Frete Peso (lookup na tabela)
  // Última faixa (gatilho): valor é por m³
  const isGatilho = faixaIdx === params.faixasM3.length - 1 && m3 > 3;
  const fretePeso = isGatilho
    ? fretePesoValores[faixaIdx] * m3
    : fretePesoValores[faixaIdx];

  // 3. Despacho (fixo por CTe)
  const despacho = params.despacho;

  // 4. GRIS (% sobre valor mercadoria, com override por estado)
  const estado = getEstadoFromPraca(praca);
  const grisPct = params.grisPorEstado?.[estado] ?? params.gris;
  const gris = roundCentavo(grisPct * valorMercadoria);

  // 5. Pedágio
  const pedagio = calcPedagio(params.pedagioTipo, params.pedagioValor, m3);

  // 6. Ad-Valorem
  const advalorem = roundCentavo(params.advalorem * valorMercadoria);

  // 7. TxDifAcesso (% sobre frete peso, por praça específica)
  const txDifPct = params.txDifAcessoPorPraca?.[praca] ?? 0;
  const txDifAcesso = roundCentavo(fretePeso * txDifPct);

  // 8. Entrega
  const entrega =
    incluirEntrega && params.entregaAtiva ? params.entregaFixa : 0;

  // 9. Subtotal
  const subtotal = roundCentavo(
    fretePeso + despacho + gris + pedagio + advalorem + txDifAcesso + entrega
  );

  // 10. ICMS (por dentro ou por fora)
  const icmsPct = params.icmsPorEstado?.[estado] ?? params.icms;
  let total: number;
  if (params.icmsTipo === "por_dentro") {
    total = roundCentavo(subtotal / (1 - icmsPct));
  } else {
    total = roundCentavo(subtotal * (1 + icmsPct));
  }
  const icmsValor = roundCentavo(total - subtotal);

  // 11. Margem de segurança
  const margem = roundCentavo(total * margemSeguranca);
  const totalComMargem = roundCentavo(total + margem);

  return {
    fretePeso: roundCentavo(fretePeso),
    despacho,
    gris,
    pedagio,
    advalorem,
    txDifAcesso,
    entrega,
    subtotal,
    icms: icmsValor,
    total,
    margem,
    totalComMargem,
    detalhes: {
      praca,
      estado,
      faixaIdx,
      faixaLabel: FAIXA_LABELS[faixaIdx] ?? `Faixa ${faixaIdx}`,
      m3,
      grisPct,
      icmsPct,
      txDifPct,
    },
  };
}

/**
 * Arredonda para centavo (2 casas decimais).
 */
function roundCentavo(value: number): number {
  return Math.round(value * 100) / 100;
}
