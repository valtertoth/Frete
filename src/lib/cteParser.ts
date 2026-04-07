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

  // DIM VOLUMES: e.g. "1,02x0,73x0,57x2"
  let dimensoes: string | null = null;
  let m3: number | null = null;
  let quantidade: number | null = null;
  const dimRow = findRow(rows, ["DIM", "VOLUMES"], startIdx);
  if (dimRow) {
    const dimItem = dimRow.row.find((it) => /\d+[,.]?\d*x\d+[,.]?\d*x\d+[,.]?\d*/.test(it.str));
    if (dimItem) {
      dimensoes = dimItem.str;
      // Parse: "1,02x0,73x0,57x2" → 1.02 * 0.73 * 0.57 * 2
      const parts = dimItem.str.split("x").map((p) => parseFloat(p.replace(",", ".")));
      if (parts.length >= 3 && parts.every((n) => !isNaN(n))) {
        const qty = parts.length === 4 ? parts[3] : 1;
        quantidade = qty;
        m3 = parts[0] * parts[1] * parts[2] * qty;
      }
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
    valorMercadoria: null,
    m3,
    dimensoes,
    quantidade,
    icms,
  };
}

export async function parseCtePdf(file: File): Promise<CteParsed[]> {
  const { items } = await loadItems(file);
  const rows = groupRows(items);
  const results: CteParsed[] = [];

  // Find each "FRETE TOTAL" occurrence — there are typically 2 per page (2 DACTE copies)
  let cursor = 0;
  while (cursor < rows.length) {
    const found = findRow(rows, ["FRETE", "TOTAL"], cursor);
    if (!found) break;
    // Find the start of THIS dacte (search backwards for "NÚMERO" header)
    let startIdx = 0;
    for (let i = found.idx; i >= cursor; i--) {
      const t = rows[i].map((x) => x.str).join(" ").toUpperCase();
      if (t.includes("NUMERO") || t.includes("\uFFFDMERO") || t.includes("N\uFFFDMERO")) {
        startIdx = i;
        break;
      }
    }
    const parsed = parseDacte(rows, startIdx);
    if (parsed) results.push(parsed);
    cursor = found.idx + 1;
  }

  // Deduplicate by numeroCTE
  const seen = new Set<string>();
  return results.filter((r) => {
    if (!r.numeroCTE) return true;
    if (seen.has(r.numeroCTE)) return false;
    seen.add(r.numeroCTE);
    return true;
  });
}
