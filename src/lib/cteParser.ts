// CTE (DACTE) PDF parser — Vipex format 2025/2026
// Strategy: dump pdf.js text items into joined rows, then regex over the text.
// Robust to font encoding issues (\uFFFD), char fragmentation and column bleed.

import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export interface CteParsed {
  numeroCTE: string;
  origem: string;
  destino: string;
  freteTotal: number;
  valorMercadoria: number | null;
  destinatarioCidade: string | null;
  destinatarioUF: string | null;
  m3: number | null;
  dimensoes: string | null;
  quantidade: number | null;
  icms: number | null;
}

interface Item {
  str: string;
  x: number;
  y: number;
}

function toNumber(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

async function loadItems(file: File): Promise<Item[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: Item[] = [];
  for (const it of content.items as any[]) {
    const str = (it.str || "").trim();
    if (!str) continue;
    const tr = it.transform;
    items.push({ str, x: tr[4], y: viewport.height - tr[5] });
  }
  return items;
}

// Group items by row (similar y), join with single space
function buildRows(items: Item[], tol = 2): { y: number; text: string; items: Item[] }[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; items: Item[] }[] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= tol) {
      last.items.push(it);
    } else {
      rows.push({ y: it.y, items: [it] });
    }
  }
  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    return { y: r.y, text: r.items.map((i) => i.str).join(" "), items: r.items };
  });
}

function parseDimVolumes(text: string): { m3: number; quantidade: number; dimensoes: string } | null {
  // Tira "DIM VOLUMES(NN):" do início
  let cleaned = text.replace(/DIM\s*VOLUMES?\s*\(?\d*\)?\s*:?/i, " ");
  // Remove letras "bleed" (C, F, I etc) entre dígitos: 0,75Cx1 → 0,75x1
  cleaned = cleaned.replace(/(\d)[A-Za-z](?=x)/g, "$1");
  cleaned = cleaned.replace(/x[A-Za-z](\d)/g, "x$1");
  const re = /(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)(?:x(\d+))?/gi;
  const grupos: { dims: number[]; qty: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const a = parseFloat(m[1].replace(",", "."));
    const b = parseFloat(m[2].replace(",", "."));
    const c = parseFloat(m[3].replace(",", "."));
    const q = m[4] ? parseInt(m[4], 10) : 1;
    if (a > 0 && b > 0 && c > 0 && a < 10 && b < 10 && c < 10) {
      grupos.push({ dims: [a, b, c], qty: q });
    }
  }
  if (grupos.length === 0) return null;
  let totalM3 = 0;
  let totalQty = 0;
  const labels: string[] = [];
  for (const g of grupos) {
    totalM3 += g.dims[0] * g.dims[1] * g.dims[2] * g.qty;
    totalQty += g.qty;
    labels.push(`${g.dims.join("x")}${g.qty > 1 ? "x" + g.qty : ""}`);
  }
  return {
    m3: Math.round(totalM3 * 10000) / 10000,
    quantidade: totalQty,
    dimensoes: labels.join(" + "),
  };
}

function parseDacte(rows: ReturnType<typeof buildRows>): CteParsed | null {
  // Joga tudo num blob "linha por linha" pra regex
  const fullText = rows.map((r) => r.text).join("\n");

  // 1) NÚMERO DO CTE — header tem encoding bagunçado, busca direto por 9 dígitos
  // logo após "NÚMERO" (com qualquer encoding) ou independente: o 9-digit token mais provável
  let numeroCTE = "";
  const numMatch =
    fullText.match(/N[A-Z\uFFFD]MERO[\s\S]{0,80}?(\d{6,12})/i) ||
    fullText.match(/\b(\d{9})\b/);
  if (numMatch) numeroCTE = numMatch[1].replace(/^0+/, "");

  // 2) ORIGEM / DESTINO — linha após "ORIGEM ... DESTINO"
  let origem = "";
  let destino = "";
  const origDestIdx = rows.findIndex((r) => /ORIGEM[\s\S]*DESTINO/i.test(r.text));
  if (origDestIdx >= 0 && rows[origDestIdx + 1]) {
    const valRow = rows[origDestIdx + 1];
    // Origem: tokens com x<120, destino: 120<=x<220
    const oTokens = valRow.items.filter((i) => i.x < 120).map((i) => i.str);
    const dTokens = valRow.items.filter((i) => i.x >= 120 && i.x < 220).map((i) => i.str);
    origem = oTokens.join(" ").trim();
    destino = dTokens.join(" ").trim();
  }
  // Fallback: regex de "CITY/UF"
  if (!origem) {
    const m = fullText.match(/([A-Z\u00C0-\u00DC ]+\/[A-Z]{2})\s+([A-Z\u00C0-\u00DC ]+\/[A-Z]{2})/);
    if (m) {
      origem = m[1].trim();
      destino = m[2].trim();
    }
  }

  // 3) FRETE TOTAL — busca linha com "FRETE TOTAL" e pega último número BR
  let freteTotal = 0;
  const fretIdx = rows.findIndex((r) => /FRETE\s*TOTAL/i.test(r.text));
  if (fretIdx >= 0) {
    // pode estar na mesma linha ou na próxima
    const candidates = [rows[fretIdx], rows[fretIdx + 1]].filter(Boolean);
    for (const r of candidates) {
      const matches = r.text.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
      if (matches && matches.length > 0) {
        freteTotal = toNumber(matches[0]);
        break;
      }
    }
  }

  // 4) DIM VOLUMES — pega linha com "DIM" + "VOLUMES" + concatena próximas linhas até virar texto não-dim
  let dimensoes: string | null = null;
  let m3: number | null = null;
  let quantidade: number | null = null;
  const dimIdx = rows.findIndex((r) => /DIM\s*VOLUMES/i.test(r.text));
  if (dimIdx >= 0) {
    // Pega a linha do DIM e quebra em "antes do ICMS/ISS:" → preserva orfão final
    const dimRowText = rows[dimIdx].text;
    const cutAt = dimRowText.search(/ICMS\/?ISS|CST:|Apolice|Seguradora|TABELA:|TIPO\s*MERCAD/i);
    const dimPart = cutAt > 0 ? dimRowText.slice(0, cutAt).trimEnd() : dimRowText;
    // Junta com próxima linha (continuação que começa com dígito ou vírgula)
    const next = rows[dimIdx + 1];
    let blob = dimPart;
    if (next && /^[\s,.\d]/.test(next.text)) {
      // Cola sem espaço se dimPart termina em dígito e next começa com vírgula/dígito
      const sep = /\d$/.test(dimPart) && /^[,.\d]/.test(next.text) ? "" : " ";
      blob = dimPart + sep + next.text;
    }
    // Agora corta novamente para remover trailing junk
    blob = blob.replace(/(CST:|Apolice|ICMS\/?ISS|Seguradora|TABELA:|TIPO\s*MERCAD).*$/i, "");
    const dim = parseDimVolumes(blob);
    if (dim) {
      m3 = dim.m3;
      quantidade = dim.quantidade;
      dimensoes = dim.dimensoes;
    }
  }

  // 5) VALOR MERCADORIA — texto geralmente vertical na coluna direita.
  // Estratégia A: regex em qualquer lugar do texto para "VALOR MERCADORIA" + número.
  // Estratégia B: ler vertical column nos items.
  let valorMercadoria: number | null = null;
  // A: procura sequência depois de "VALOR MERCADORIA"
  const vmMatch = fullText.match(/VALOR\s*MERCADORIA[\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (vmMatch) valorMercadoria = toNumber(vmMatch[1]);

  // 6) ICMS — busca "ICMS/ISS:" com valor
  let icms: number | null = null;
  const icmsMatch = fullText.match(/ICMS\/?(?:ISS)?:?\s*[A-Z]?(\d+(?:\.\d{3})*,\d{2})/i);
  if (icmsMatch) icms = toNumber(icmsMatch[1]);

  // 7) DESTINATARIO MUN — primeira linha "MUN ... - UF" após "DESTINATARIO"
  let destinatarioCidade: string | null = null;
  let destinatarioUF: string | null = null;
  const destIdx = rows.findIndex((r) => /DESTINATARIO/i.test(r.text));
  if (destIdx >= 0) {
    for (let k = 1; k <= 4; k++) {
      const r = rows[destIdx + k];
      if (!r) break;
      const m = r.text.match(/MUN\s+(.+?)\s*-\s*([A-Z]{2})\s+CEP/i);
      if (m) {
        destinatarioCidade = m[1].trim();
        destinatarioUF = m[2].trim();
        break;
      }
    }
  }

  if (!numeroCTE && !freteTotal && !origem) return null;

  return {
    numeroCTE,
    origem,
    destino,
    freteTotal,
    valorMercadoria,
    destinatarioCidade,
    destinatarioUF,
    m3,
    dimensoes,
    quantidade,
    icms,
  };
}

export async function parseCtePdf(file: File): Promise<CteParsed[]> {
  const items = await loadItems(file);
  const rows = buildRows(items);

  // Expor pra debug
  if (typeof window !== "undefined") {
    (window as any).__cteDebug = { items, rows };
  }

  // PDF DACTE Vipex tem 2 vias idênticas — só precisamos da primeira metade.
  // Limita rows à metade superior da página (y < 410 aprox).
  const half = rows.filter((r) => r.y < 410);
  const parsed = parseDacte(half);
  return parsed ? [parsed] : [];
}
