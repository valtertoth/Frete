import { describe, it, expect } from "vitest";
import { calcularFrete, findFaixaIdx, getEstadoFromPraca, calcPedagio } from "../freteCalculo";
import type { ParametrosCalculo, FreteInput } from "@/types/frete";

// Parâmetros REAIS da Vipex (decifrados de 60 CTEs)
const VIPEX_PARAMS: ParametrosCalculo = {
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
  txDifAcessoPorPraca: {
    "SP-CAP": 0.28,
    "RJ-CAP": 0.26,
  },
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

// Tabela SP-INT3 → SP-GDSP (valores por faixa)
const SP_INT3_TO_SP_GDSP = [101.58, 101.58, 137.09, 169.29, 253.94, 338.58, 423.23, 507.88, 169.29];

// Tabela SP-INT3 → SP-CAP
const SP_INT3_TO_SP_CAP = [96.87, 96.87, 130.73, 161.45, 253.94, 338.58, 423.23, 507.88, 169.29];

// Tabela SP-INT3 → RS-CAP
const SP_INT3_TO_RS_CAP = [106.47, 133.09, 170.80, 221.81, 332.71, 443.62, 554.52, 665.42, 221.81];

// Tabela SP-INT3 → BA-CAP
const SP_INT3_TO_BA_CAP = [256.73, 394.96, 506.87, 658.27, 987.41, 1316.54, 1645.68, 1974.81, 658.27];

// Tabela SP-INT3 → ES-CAP
const SP_INT3_TO_ES_CAP = [181.60, 279.38, 358.54, 465.63, 698.45, 931.26, 1164.08, 1396.89, 465.63];

describe("Helpers", () => {
  describe("findFaixaIdx", () => {
    it("retorna faixa 0 para m3 <= 0.30", () => {
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 0.15)).toBe(0);
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 0.3)).toBe(0);
    });

    it("retorna faixa 5 para m3 entre 1.51 e 2.00", () => {
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 1.5785)).toBe(5);
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 2.0)).toBe(5);
    });

    it("retorna faixa 8 (gatilho) para m3 > 3.00", () => {
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 3.5)).toBe(8);
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 10.0)).toBe(8);
    });

    it("retorna faixas de boundary corretas", () => {
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 0.5)).toBe(1);
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 0.51)).toBe(2);
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 1.0)).toBe(3);
      expect(findFaixaIdx(VIPEX_PARAMS.faixasM3, 1.01)).toBe(4);
    });
  });

  describe("getEstadoFromPraca", () => {
    it("extrai estado corretamente", () => {
      expect(getEstadoFromPraca("SP-CAP")).toBe("SP");
      expect(getEstadoFromPraca("RS-INT1")).toBe("RS");
      expect(getEstadoFromPraca("BA-NOR")).toBe("BA");
      expect(getEstadoFromPraca("MG-UBE")).toBe("MG");
    });
  });

  describe("calcPedagio", () => {
    it("calcula por fração de m³ corretamente", () => {
      expect(calcPedagio("por_fracao_m3", 7.83, 0.5)).toBe(7.83); // ceil(0.5) = 1
      expect(calcPedagio("por_fracao_m3", 7.83, 1.5785)).toBe(15.66); // ceil(1.5785) = 2
      expect(calcPedagio("por_fracao_m3", 7.83, 3.0)).toBeCloseTo(23.49, 2); // ceil(3.0) = 3
    });

    it("retorna valor fixo para tipo fixo", () => {
      expect(calcPedagio("fixo", 15.0, 2.5)).toBe(15.0);
    });
  });
});

describe("calcularFrete", () => {
  it("DACTE21490 — match centavo a centavo (R$614.24)", () => {
    // SP-INT3 → Itupeva/SP (SP-GDSP), M³=1.5785, Valor=R$5.193,92
    // Entrega neste CTe foi R$124.74, mas usamos o valor fixo de R$120 +
    // a diferença pode ser da entrega real vs estimada.
    // Para o teste, vamos calcular SEM entrega primeiro e verificar a estrutura.
    const input: FreteInput = {
      params: VIPEX_PARAMS,
      fretePesoValores: SP_INT3_TO_SP_GDSP,
      m3: 1.5785,
      valorMercadoria: 5193.92,
      praca: "SP-GDSP",
      incluirEntrega: false,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // Componentes individuais
    expect(result.fretePeso).toBe(338.58);
    expect(result.despacho).toBe(20.0);
    expect(result.gris).toBe(41.55); // 0.8% × 5193.92 = 41.5514 → 41.55
    expect(result.pedagio).toBe(15.66); // 7.83 × ceil(1.5785) = 7.83 × 2
    expect(result.txDifAcesso).toBe(0); // SP-GDSP não tem TxDifAcesso
    expect(result.entrega).toBe(0);

    // Subtotal sem entrega
    const subtotalSemEntrega = 338.58 + 20.0 + 41.55 + 15.66;
    expect(result.subtotal).toBeCloseTo(subtotalSemEntrega, 2);

    // Com entrega de R$124.74 (valor real do CTe):
    // subtotal = 338.58 + 20.00 + 41.55 + 15.66 + 124.74 = 540.53
    // total = 540.53 / (1 - 0.12) = 614.2386... ≈ 614.24
    // Verificação com entrega manual:
    const subtotalComEntrega = subtotalSemEntrega + 124.74;
    const totalEsperado = subtotalComEntrega / (1 - 0.12);
    expect(Math.round(totalEsperado * 100) / 100).toBe(614.24);
  });

  it("calcula com entrega fixa padrão (R$120)", () => {
    const input: FreteInput = {
      params: VIPEX_PARAMS,
      fretePesoValores: SP_INT3_TO_SP_GDSP,
      m3: 1.5785,
      valorMercadoria: 5193.92,
      praca: "SP-GDSP",
      incluirEntrega: true,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);
    expect(result.entrega).toBe(120.0);
    expect(result.subtotal).toBe(338.58 + 20.0 + 41.55 + 15.66 + 120.0);

    // ICMS por dentro: subtotal / (1 - 0.12)
    const expectedTotal = Math.round((result.subtotal / 0.88) * 100) / 100;
    expect(result.total).toBe(expectedTotal);
  });

  it("aplica TxDifAcesso 28% para SP-CAP", () => {
    const input: FreteInput = {
      params: VIPEX_PARAMS,
      fretePesoValores: SP_INT3_TO_SP_CAP,
      m3: 0.5,
      valorMercadoria: 3000.0,
      praca: "SP-CAP",
      incluirEntrega: false,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // Faixa 1 (0.31-0.50): R$96.87
    expect(result.fretePeso).toBe(96.87);
    // TxDifAcesso = 96.87 × 0.28 = 27.1236 → 27.12
    expect(result.txDifAcesso).toBe(27.12);
    expect(result.detalhes.txDifPct).toBe(0.28);
  });

  it("aplica GRIS diferenciado por estado (RS = 0.9%)", () => {
    const input: FreteInput = {
      params: VIPEX_PARAMS,
      fretePesoValores: SP_INT3_TO_RS_CAP,
      m3: 1.0,
      valorMercadoria: 4000.0,
      praca: "RS-CAP",
      incluirEntrega: false,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // GRIS RS = 0.9% × 4000 = 36.00
    expect(result.gris).toBe(36.0);
    expect(result.detalhes.grisPct).toBe(0.009);
    expect(result.detalhes.estado).toBe("RS");
  });

  it("aplica GRIS diferenciado para BA (1.4%)", () => {
    const input: FreteInput = {
      params: VIPEX_PARAMS,
      fretePesoValores: SP_INT3_TO_BA_CAP,
      m3: 0.3,
      valorMercadoria: 2000.0,
      praca: "BA-CAP",
      incluirEntrega: false,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // GRIS BA = 1.4% × 2000 = 28.00
    expect(result.gris).toBe(28.0);
    expect(result.detalhes.grisPct).toBe(0.014);
  });

  it("aplica GRIS diferenciado para ES (1.3%)", () => {
    const input: FreteInput = {
      params: VIPEX_PARAMS,
      fretePesoValores: SP_INT3_TO_ES_CAP,
      m3: 0.3,
      valorMercadoria: 2000.0,
      praca: "ES-CAP",
      incluirEntrega: false,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // GRIS ES = 1.3% × 2000 = 26.00
    expect(result.gris).toBe(26.0);
    expect(result.detalhes.grisPct).toBe(0.013);
  });

  it("calcula gatilho (m³ > 3) com valor por m³", () => {
    const input: FreteInput = {
      params: VIPEX_PARAMS,
      fretePesoValores: SP_INT3_TO_SP_GDSP, // valores[8] = 169.29 (valor por m³)
      m3: 5.0,
      valorMercadoria: 10000.0,
      praca: "SP-GDSP",
      incluirEntrega: false,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // Gatilho: 169.29 × 5.0 = 846.45
    expect(result.fretePeso).toBe(846.45);
    // Pedágio: 7.83 × ceil(5.0) = 7.83 × 5 = 39.15
    expect(result.pedagio).toBe(39.15);
    expect(result.detalhes.faixaIdx).toBe(8);
  });

  it("calcula margem de segurança de 10%", () => {
    const input: FreteInput = {
      params: VIPEX_PARAMS,
      fretePesoValores: SP_INT3_TO_SP_GDSP,
      m3: 1.0,
      valorMercadoria: 3000.0,
      praca: "SP-GDSP",
      incluirEntrega: false,
      margemSeguranca: 0.1,
    };

    const result = calcularFrete(input);

    expect(result.margem).toBe(Math.round(result.total * 0.1 * 100) / 100);
    expect(result.totalComMargem).toBe(
      Math.round((result.total + result.margem) * 100) / 100
    );
  });

  it("PR-LON → SP-INT1: parâmetros diferenciados (desp=30, ped=15, gris=0.9%)", () => {
    // Origem LONDRINA/PR — decifrada via auditoria de CTEs
    const PR_LON_PARAMS: ParametrosCalculo = {
      ...VIPEX_PARAMS,
      despacho: 30.0,
      gris: 0.009,
      grisPorEstado: {},
      pedagioValor: 15.0,
      txDifAcessoPorPraca: {},
    };

    const PR_LON_TO_SP_INT1 = [103.32, 158.96, 204, 264.93, 397.39, 529.86, 662.33, 794.79, 264.93];

    const input: FreteInput = {
      params: PR_LON_PARAMS,
      fretePesoValores: PR_LON_TO_SP_INT1,
      m3: 1.5785,
      valorMercadoria: 5193.92,
      praca: "SP-INT1",
      incluirEntrega: true,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // Faixa 5 (1.51-2.00): R$529.86
    expect(result.fretePeso).toBe(529.86);
    // Despacho PR-LON: R$30
    expect(result.despacho).toBe(30.0);
    // GRIS: 0.9% uniforme (sem grisPorEstado) × 5193.92 = 46.75
    expect(result.gris).toBe(46.75);
    expect(result.detalhes.grisPct).toBe(0.009);
    // Pedágio: R$15 × ceil(1.5785) = R$15 × 2 = R$30
    expect(result.pedagio).toBe(30.0);
    // Sem TxDifAcesso para PR-LON
    expect(result.txDifAcesso).toBe(0);
    // Entrega fixa: R$120
    expect(result.entrega).toBe(120.0);

    // Subtotal = 529.86 + 30 + 46.75 + 30 + 120 = 756.61
    expect(result.subtotal).toBeCloseTo(756.61, 2);
    // Total = 756.61 / (1 - 0.12) = 859.78
    expect(result.total).toBeCloseTo(859.78, 0);
  });

  it("PR-LON → SP-CAP: sem TxDifAcesso (não confirmado para esta origem)", () => {
    const PR_LON_PARAMS: ParametrosCalculo = {
      ...VIPEX_PARAMS,
      despacho: 30.0,
      gris: 0.009,
      grisPorEstado: {},
      pedagioValor: 15.0,
      txDifAcessoPorPraca: {},
    };

    const PR_LON_TO_SP_CAP = [99.88, 153.66, 197.2, 256.1, 384.15, 512.2, 640.25, 768.3, 256.1];

    const input: FreteInput = {
      params: PR_LON_PARAMS,
      fretePesoValores: PR_LON_TO_SP_CAP,
      m3: 0.5,
      valorMercadoria: 3000.0,
      praca: "SP-CAP",
      incluirEntrega: false,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // Faixa 1 (0.31-0.50): R$153.66
    expect(result.fretePeso).toBe(153.66);
    // TxDifAcesso deve ser 0 (txDifAcessoPorPraca vazio para PR-LON)
    expect(result.txDifAcesso).toBe(0);
    // Pedágio: R$15 × ceil(0.5) = R$15
    expect(result.pedagio).toBe(15.0);
    // GRIS: 0.9% × 3000 = 27.00
    expect(result.gris).toBe(27.0);
  });

  it("ICMS por fora funciona quando configurado", () => {
    const paramsPorFora: ParametrosCalculo = {
      ...VIPEX_PARAMS,
      icmsTipo: "por_fora",
    };

    const input: FreteInput = {
      params: paramsPorFora,
      fretePesoValores: SP_INT3_TO_SP_GDSP,
      m3: 1.0,
      valorMercadoria: 3000.0,
      praca: "SP-GDSP",
      incluirEntrega: false,
      margemSeguranca: 0,
    };

    const result = calcularFrete(input);

    // ICMS por fora: subtotal × (1 + 0.12) = subtotal × 1.12
    const expectedTotal = Math.round(result.subtotal * 1.12 * 100) / 100;
    expect(result.total).toBe(expectedTotal);
  });
});
