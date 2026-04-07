// CTE (DACTE) PDF parser — Vipex format 2025/2026
// Strategy: anchor-based extraction using x/y positions from pdf.js getTextContent

import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore - vite worker import
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export interface CteParsed {
  numeroCTE: string;
  origem: string;
  destino: string;
  freteTotal: number;
  valorMercadoria: number | null;
  m3: number | null;
  dimensoes: string | null;
  quantidade: number | null;
  icms: number | null;
}

interface Item {
  str: string;
  x: number;
  y: number; // top-down (page top = 0)
}

const BR_NUM = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;

function toNumber(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

async function loadItems(file: File): Promise<{ items: Item[]; height: number }> {
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
    const x = tr[4];
    const y = viewport.height - tr[5]; // top-down
    items.push({ str, x, y });
  }
  return { items, height: viewport.height };
}

// Group items into rows by y proximity
function groupRows(items: Item[], tol = 2): Item[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= tol) {
      last.push(it);
    } else {
      rows.push([it]);
    }
  }
  rows.forEach((r) => r.sort((a, b) => a.x - b.x));
  return rows;
}

// Find first row containing any of given keywords (case-insensitive substring on joined text)
function findRow(rows: Item[][], keywords: string[], startIdx = 0): { row: Item[]; idx: number } | null {
  for (let i = startIdx; i < rows.length; i++) {
    const text = rows[i].map((x) => x.str).join(" ").toUpperCase();
    if (keywords.every((k) => text.includes(k.toUpperCase()))) {
      return { row: rows[i], idx: i };
    }
  }
  return null;
}

function parseDacte(rows: Item[][], startIdx: number): CteParsed | null {
  // CTE NUMBER: row containing "NÚMERO" header → next row, find 9-digit token
  const numHeader = findRow(rows, ["NUMERO"], startIdx) || findRow(rows, ["N\uFFFDMERO"], startIdx);
  let numeroCTE = "";
  if (numHeader) {
    const valRow = rows[numHeader.idx + 1];
    if (valRow) {
      const tok = valRow.find((it) => /^\d{6,}$/.test(it.str));
      if (tok) numeroCTE = tok.str.replace(/^0+/, "");
    }
  }

  // ORIGEM/DESTINO: row containing "ORIGEM" "PRESTA" → next row has "CITY/UF" tokens
  const origDest = findRow(rows, ["ORIGEM", "DESTINO"], startIdx);
  let origem = "";
  let destino = "";
  if (origDest) {
    const valRow = rows[origDest.idx + 1];
    if (valRow) {
      // Group consecutive items into segments by x columns: origem (x<120), destino (120<=x<220)
      const oTokens = valRow.filter((it) => it.x < 120).map((it) => it.str);
      const dTokens = valRow.filter((it) => it.x >= 120 && it.x < 220).map((it) => it.str);
      origem = oTokens.join(" ").trim();
      destino = dTokens.join(" ").trim();
    }
  }

  // FRETE TOTAL: row with "FRETE" "TOTAL"
  let freteTotal = 0;
  const fretRow = findRow(rows, ["FRETE", "TOTAL"], startIdx);
  if (fretRow) {
    const val = fretRow.row.find((it) => BR_NUM.test(it.str) && it.x > 350 && it.x < 470);
    if (val) freteTotal = toNumber(val.str);
  }

  // DIM VOLUMES: pode haver MÚLTIPLOS grupos separados por espaço/vírgula
  // Ex: "1x0,75x0,57x3 0,85x0,95x0,75x1 0,75x0,95x0,55x1 1x1,9x0,12x1"
  // Pode estender para a próxima linha (continuação após "DIM VOLUMES(NN):")
  let dimensoes: string | null = null;
  let m3: number | null = null;
  let quantidade: number | null = null;
  const dimRow = findRow(rows, ["DIM", "VOLUMES"], startIdx);
  if (dimRow) {
    // Coleta tokens de dimensão na linha do DIM VOLUMES E na linha seguinte (até x<260)
    const dimRegex = /^,?\d+[,.]?\d*x\d+[,.]?\d*x\d+[,.]?\d*x?\d*$/;
    // Limpeza: remove letras "bleed" como C, F, I que vazam da coluna ao lado
    const cleanToken = (s: string) => s.replace(/[A-Za-z]/g, "").replace(/^,/, "");
    const collected: string[] = [];
    // Linha do DIM VOLUMES
    for (const it of dimRow.row) {
      if (it.x > 260) break;
      const cleaned = cleanToken(it.str);
      if (/^\d+[,.]?\d*x\d+[,.]?\d*x\d+[,.]?\d*x?\d*$/.test(cleaned)) {
        collected.push(cleaned);
      }
    }
    // Linha seguinte (continuação)
    const nextRow = rows[dimRow.idx + 1];
    if (nextRow) {
      for (const it of nextRow.row) {
        if (it.x > 260) break;
        const cleaned = cleanToken(it.str);
        if (/^\d+[,.]?\d*x\d+[,.]?\d*x\d+[,.]?\d*x?\d*$/.test(cleaned)) {
          collected.push(cleaned);
        } else if (dimRegex.test(it.str)) {
          collected.push(cleanToken(it.str));
        }
      }
    }
    if (collected.length > 0) {
      dimensoes = collected.join(" ");
      let totalM3 = 0;
      let totalQty = 0;
      for (const grupo of collected) {
        const parts = grupo.split("x").map((p) => parseFloat(p.replace(",", ".")));
        if (parts.length >= 3 && parts.slice(0, 3).every((n) => !isNaN(n))) {
          const qty = parts.length === 4 && !isNaN(parts[3]) ? parts[3] : 1;
          totalQty += qty;
          totalM3 += parts[0] * parts[1] * parts[2] * qty;
        }
      }
      if (totalM3 > 0) {
        m3 = Math.round(totalM3 * 10000) / 10000;
        quantidade = totalQty;
      }
    }
  }

  // VALOR MERCADORIA: texto vertical na coluna MERCADORIA (x≈520-560)
  // Estratégia: localiza header "MERCADORIA" (y≈115) e coleta dígitos/vírgulas/pontos
  // na coluna lateral direita ordenados por (x, y) — leitura vertical
  let valorMercadoria: number | null = null;
  const mercHeader = findRow(rows, ["MERCADORIA"], startIdx);
  if (mercHeader) {
    const headerY = mercHeader.row[0].y;
    // Coleta caracteres na zona de valor (x>515, y entre header+5 e header+30)
    const charItems: Item[] = [];
    for (const r of rows) {
      if (r[0].y < headerY || r[0].y > headerY + 25) continue;
      for (const it of r) {
        if (it.x >= 515 && it.x <= 565 && /^[\d,.]$/.test(it.str)) {
          charItems.push(it);
        }
      }
    }
    // Ordena por coluna (x) crescente, depois y — lê vertical → cada coluna tem 1 caractere
    charItems.sort((a, b) => a.x - b.x || a.y - b.y);
    // Agrupa por coluna x (tolerância 2)
    const byCol: Record<string, Item[]> = {};
    for (const ch of charItems) {
      const k = Math.round(ch.x);
      // Tenta achar coluna existente próxima
      let key = String(k);
      for (const existing of Object.keys(byCol)) {
        if (Math.abs(Number(existing) - k) <= 2) {
          key = existing;
          break;
        }
      }
      (byCol[key] ||= []).push(ch);
    }
    // Cada coluna deve ter 1 caractere; pega o primeiro de cada coluna ordenado por x
    const cols = Object.keys(byCol)
      .map(Number)
      .sort((a, b) => a - b);
    const str = cols.map((c) => byCol[String(c)][0]?.str ?? "").join("");
    // Aceita formato BR: 15.510,96 ou 5193,92
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(str) || /^\d+,\d{2}$/.test(str)) {
      valorMercadoria = toNumber(str);
    }
  }

  // ICMS: look for "ICMS/ISS:" or similar followed by number in observações row
  let icms: number | null = null;
  const icmsRow = findRow(rows, ["ICMS"], startIdx);
  if (icmsRow) {
    const txt = icmsRow.row.map((it) => it.str).join("");
    const match = txt.match(/(\d+,\d{2})/);
    if (match) icms = toNumber(match[1]);
  }

  if (!numeroCTE && !freteTotal) return null;

  return {
    numeroCTE,
    origem,
    destino,
    freteTotal,
    valorMercadoria,
    m3,
    dimensoes,
    quantidade,
    icms,
  };
}

export async function parseCtePdf(file: File): Promise<CteParsed[]> {
  const { items } = await loadItems(file);
  const rows = groupRows(items);
  // PDF DACTE da Vipex tem 2 vias idênticas na mesma página.
  // Parseia apenas a primeira (top-half).
  const parsed = parseDacte(rows, 0);
  return parsed ? [parsed] : [];
}
