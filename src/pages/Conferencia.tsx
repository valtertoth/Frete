import { useState, useCallback } from "react";
import {
  FileCheck,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  useTransportadoras,
  useTransportadoraOrigens,
  resolveOriginParams,
} from "@/hooks/useTransportadoras";
import { parseCtePdf, type CteParsed } from "@/lib/cteParser";
import { calcularFrete } from "@/lib/freteCalculo";
import { formatCurrency } from "@/lib/utils";

interface ConferenciaRow {
  id: string;
  arquivo: string;
  parsed: CteParsed;
  valorMercadoria: number;
  pracaResolvida: string | null;
  origemResolvida: string | null;
  freteCalculado: number | null;
  diferenca: number | null;
  status: "ok" | "divergente" | "sem_calculo";
  erro?: string;
}

const TOLERANCIA = 1.0; // R$ 1,00 de tolerância

export function Conferencia() {
  const { data: transportadoras } = useTransportadoras();
  const [transportadoraId, setTransportadoraId] = useState("");
  const { data: origens } = useTransportadoraOrigens(
    transportadoraId || undefined
  );

  const [rows, setRows] = useState<ConferenciaRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const transportadora = transportadoras?.find((t) => t.id === transportadoraId);

  const recalcular = useCallback(
    async (row: ConferenciaRow): Promise<ConferenciaRow> => {
      if (!transportadora || !origens) return row;
      if (!row.valorMercadoria || !row.parsed.m3) {
        return { ...row, status: "sem_calculo", freteCalculado: null, diferenca: null };
      }

      // Match destino → praça
      const destCity = row.parsed.destino.split("/")[0].trim();
      const { data: cidades } = await supabase
        .from("transportadora_cidade_praca")
        .select("praca")
        .eq("transportadora_id", transportadora.id)
        .ilike("cidade", destCity)
        .limit(1);
      const pracaResolvida = cidades?.[0]?.praca ?? null;

      // Match origem → código (heurística por cidade/UF)
      const origemUF = row.parsed.origem.split("/")[1]?.trim().toUpperCase();
      let origemResolvida: string | null = null;
      if (origemUF) {
        const candidate = origens.find((o) =>
          o.codigo.startsWith(origemUF) ||
          (o.nome || "").toUpperCase().includes(origemUF)
        );
        origemResolvida = candidate?.codigo ?? null;
      }

      if (!pracaResolvida || !origemResolvida) {
        return {
          ...row,
          pracaResolvida,
          origemResolvida,
          status: "sem_calculo",
          freteCalculado: null,
          diferenca: null,
          erro: !pracaResolvida ? "Cidade não encontrada" : "Origem não identificada",
        };
      }

      // Buscar valores da praça
      const { data: tabela } = await supabase
        .from("transportadora_tabela_frete")
        .select("faixa_idx, valor")
        .eq("transportadora_id", transportadora.id)
        .eq("origem_codigo", origemResolvida)
        .eq("praca_destino", pracaResolvida)
        .order("faixa_idx");

      if (!tabela || tabela.length === 0) {
        return {
          ...row,
          pracaResolvida,
          origemResolvida,
          status: "sem_calculo",
          freteCalculado: null,
          diferenca: null,
          erro: "Sem tabela para esta praça/origem",
        };
      }

      const valores = new Array(9).fill(0);
      for (const t of tabela) valores[t.faixa_idx] = Number(t.valor);

      const origemObj = origens.find((o) => o.codigo === origemResolvida)!;
      const params = resolveOriginParams(transportadora, origemObj);
      if (!params) {
        return { ...row, status: "sem_calculo", erro: "Sem parâmetros", freteCalculado: null, diferenca: null };
      }

      const result = calcularFrete({
        params,
        fretePesoValores: valores,
        m3: row.parsed.m3,
        valorMercadoria: row.valorMercadoria,
        praca: pracaResolvida,
        incluirEntrega: true,
        margemSeguranca: 0,
      });

      const freteCalculado = result.total;
      const diferenca = row.parsed.freteTotal - freteCalculado;
      const status: ConferenciaRow["status"] =
        Math.abs(diferenca) <= TOLERANCIA ? "ok" : "divergente";

      return {
        ...row,
        pracaResolvida,
        origemResolvida,
        freteCalculado,
        diferenca,
        status,
        erro: undefined,
      };
    },
    [transportadora, origens]
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    try {
      const newRows: ConferenciaRow[] = [];
      for (const file of Array.from(files)) {
        try {
          const parsedList = await parseCtePdf(file);
          for (const parsed of parsedList) {
            newRows.push({
              id: crypto.randomUUID(),
              arquivo: file.name,
              parsed,
              valorMercadoria: 0,
              pracaResolvida: null,
              origemResolvida: null,
              freteCalculado: null,
              diferenca: null,
              status: "sem_calculo",
            });
          }
        } catch (err: any) {
          newRows.push({
            id: crypto.randomUUID(),
            arquivo: file.name,
            parsed: { numeroCTE: "", origem: "", destino: "", freteTotal: 0, valorMercadoria: null, m3: null, dimensoes: null, quantidade: null, icms: null },
            valorMercadoria: 0,
            pracaResolvida: null,
            origemResolvida: null,
            freteCalculado: null,
            diferenca: null,
            status: "sem_calculo",
            erro: `Erro ao ler PDF: ${err.message}`,
          });
        }
      }
      setRows((prev) => [...prev, ...newRows]);
    } finally {
      setParsing(false);
    }
  };

  const handleValorChange = async (id: string, valor: number) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const updated = { ...row, valorMercadoria: valor };
    const recalced = await recalcular(updated);
    setRows((prev) => prev.map((r) => (r.id === id ? recalced : r)));
  };

  const handleRemove = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSaveAll = async () => {
    if (!transportadora) return;
    setSavingAll(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const toSave = rows
        .filter((r) => r.status !== "sem_calculo")
        .map((r) => ({
          user_id: user?.id ?? null,
          transportadora_id: transportadora.id,
          numero_cte: r.parsed.numeroCTE || null,
          origem: r.parsed.origem || null,
          destino: r.parsed.destino || null,
          praca_destino: r.pracaResolvida,
          m3: r.parsed.m3,
          valor_mercadoria: r.valorMercadoria,
          frete_cobrado: r.parsed.freteTotal,
          frete_calculado: r.freteCalculado,
          diferenca: r.diferenca,
          status: r.status,
          detalhes: { dimensoes: r.parsed.dimensoes, icms: r.parsed.icms },
          arquivo_nome: r.arquivo,
        }));
      if (toSave.length > 0) {
        await supabase.from("conferencias_cte").insert(toSave);
      }
      setRows([]);
    } finally {
      setSavingAll(false);
    }
  };

  const totalDiv = rows.filter((r) => r.status === "divergente").length;
  const totalOk = rows.filter((r) => r.status === "ok").length;
  const somaDiferencas = rows.reduce((acc, r) => acc + (r.diferenca ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileCheck className="size-4 text-zinc-500" strokeWidth={1.5} />
        <h1 className="text-sm font-medium tracking-tight text-zinc-900">
          Conferência de CTEs
        </h1>
      </div>

      {/* Setup */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-zinc-600">Transportadora</label>
            <Select value={transportadoraId} onValueChange={setTransportadoraId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {transportadoras?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Drop zone */}
        {transportadoraId && (
          <label
            htmlFor="cte-upload"
            className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-10 transition-colors duration-150 hover:border-zinc-300 hover:bg-zinc-50"
          >
            <Upload className="size-6 text-zinc-400" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-medium text-zinc-700">
              Arraste PDFs de CTE aqui
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              ou clique para selecionar (vários arquivos)
            </p>
            <input
              id="cte-upload"
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        )}

        {parsing && (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
            Lendo PDFs...
          </div>
        )}
      </div>

      {/* Results */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white">
          {/* Summary bar */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-zinc-500">{rows.length} CTEs</span>
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
                {totalOk} ok
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="size-3.5" strokeWidth={1.5} />
                {totalDiv} divergentes
              </span>
              <span
                className={`font-medium ${
                  somaDiferencas > 0 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                Soma diferenças: {formatCurrency(somaDiferencas)}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveAll}
              disabled={savingAll}
              className="gap-2"
            >
              <Save className="size-3.5" strokeWidth={1.5} />
              {savingAll ? "Salvando..." : "Salvar conferência"}
            </Button>
          </div>

          {/* Rows */}
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <div key={r.id} className="px-6 py-3">
                <div className="flex items-start gap-4">
                  {/* Status icon */}
                  <div className="mt-0.5">
                    {r.status === "ok" && (
                      <CheckCircle2
                        className="size-4 text-emerald-600"
                        strokeWidth={1.5}
                      />
                    )}
                    {r.status === "divergente" && (
                      <AlertTriangle
                        className="size-4 text-red-600"
                        strokeWidth={1.5}
                      />
                    )}
                    {r.status === "sem_calculo" && (
                      <div className="size-4 rounded-full border border-zinc-300" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-zinc-900">
                        CTE {r.parsed.numeroCTE || "?"}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {r.parsed.origem} → {r.parsed.destino}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                      <span>M³: {r.parsed.m3?.toFixed(4) ?? "?"}</span>
                      <span>{r.parsed.dimensoes}</span>
                      {r.pracaResolvida && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px]">
                          {r.pracaResolvida}
                        </span>
                      )}
                      {r.origemResolvida && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px]">
                          {r.origemResolvida}
                        </span>
                      )}
                    </div>
                    {r.erro && (
                      <p className="mt-1 text-[11px] text-amber-600">{r.erro}</p>
                    )}
                  </div>

                  {/* Valor mercadoria input */}
                  <div className="w-32">
                    <label className="text-[10px] text-zinc-400">
                      Valor merc.
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={r.valorMercadoria || ""}
                      onChange={(e) =>
                        handleValorChange(r.id, parseFloat(e.target.value) || 0)
                      }
                      placeholder="0,00"
                      className="h-7 text-xs"
                    />
                  </div>

                  {/* Cobrado */}
                  <div className="w-24 text-right">
                    <div className="text-[10px] text-zinc-400">Cobrado</div>
                    <div className="text-sm font-medium text-zinc-900">
                      {formatCurrency(r.parsed.freteTotal)}
                    </div>
                  </div>

                  {/* Calculado */}
                  <div className="w-24 text-right">
                    <div className="text-[10px] text-zinc-400">Calculado</div>
                    <div className="text-sm font-medium text-zinc-700">
                      {r.freteCalculado != null
                        ? formatCurrency(r.freteCalculado)
                        : "—"}
                    </div>
                  </div>

                  {/* Diferença */}
                  <div className="w-24 text-right">
                    <div className="text-[10px] text-zinc-400">Diferença</div>
                    <div
                      className={`text-sm font-medium ${
                        r.diferenca == null
                          ? "text-zinc-400"
                          : r.status === "ok"
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {r.diferenca != null ? formatCurrency(r.diferenca) : "—"}
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => handleRemove(r.id)}
                    className="text-zinc-300 transition-colors duration-150 hover:text-zinc-600"
                  >
                    <X className="size-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
