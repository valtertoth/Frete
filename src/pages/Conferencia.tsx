import { useState, useEffect } from "react";
import {
  FileCheck,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Save,
  Calculator,
  CircleDashed,
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
  // Editáveis pelo usuário
  m3: number;
  valorMercadoria: number;
  origemCodigo: string;
  pracaDestino: string;
  // Resultado
  freteCalculado: number | null;
  diferenca: number | null;
  status: "pendente" | "ok" | "divergente";
  erro?: string;
}

const TOLERANCIA = 1.0;

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

  // Tenta auto-detectar origem e praça quando uma linha é adicionada / origens carregam
  useEffect(() => {
    if (!origens || !transportadora) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.origemCodigo && r.pracaDestino) return r;
        const updates: Partial<ConferenciaRow> = {};
        if (!r.origemCodigo) {
          const uf = r.parsed.origem.split("/")[1]?.trim().toUpperCase();
          if (uf) {
            const cand = origens.find(
              (o) =>
                o.codigo.startsWith(uf) ||
                (o.nome || "").toUpperCase().includes(uf)
            );
            if (cand) updates.origemCodigo = cand.codigo;
          }
        }
        return { ...r, ...updates };
      })
    );
  }, [origens, transportadora]);

  const tryAutoPraca = async (row: ConferenciaRow): Promise<string> => {
    if (row.pracaDestino) return row.pracaDestino;
    if (!transportadora || !row.parsed.destino) return "";
    const destCity = row.parsed.destino.split("/")[0].trim();
    const { data } = await supabase
      .from("transportadora_cidade_praca")
      .select("praca")
      .eq("transportadora_id", transportadora.id)
      .ilike("cidade", destCity)
      .limit(1);
    return data?.[0]?.praca ?? "";
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    try {
      const newRows: ConferenciaRow[] = [];
      for (const file of Array.from(files)) {
        try {
          const parsedList = await parseCtePdf(file);
          for (const parsed of parsedList) {
            const row: ConferenciaRow = {
              id: crypto.randomUUID(),
              arquivo: file.name,
              parsed,
              m3: parsed.m3 ?? 0,
              valorMercadoria: parsed.valorMercadoria ?? 0,
              origemCodigo: "",
              pracaDestino: "",
              freteCalculado: null,
              diferenca: null,
              status: "pendente",
            };
            row.pracaDestino = await tryAutoPraca(row);
            newRows.push(row);
          }
        } catch (err: any) {
          newRows.push({
            id: crypto.randomUUID(),
            arquivo: file.name,
            parsed: {
              numeroCTE: "",
              origem: "",
              destino: "",
              freteTotal: 0,
              valorMercadoria: null,
              m3: null,
              dimensoes: null,
              quantidade: null,
              icms: null,
            },
            m3: 0,
            valorMercadoria: 0,
            origemCodigo: "",
            pracaDestino: "",
            freteCalculado: null,
            diferenca: null,
            status: "pendente",
            erro: `Erro ao ler PDF: ${err.message}`,
          });
        }
      }
      setRows((prev) => [...prev, ...newRows]);
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (id: string, patch: Partial<ConferenciaRow>) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, ...patch, status: "pendente", freteCalculado: null, diferenca: null }
          : r
      )
    );
  };

  const calcularLinha = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || !transportadora || !origens) return;

    if (!row.m3 || !row.valorMercadoria || !row.origemCodigo || !row.pracaDestino) {
      updateRow(id, { erro: "Preencha m³, valor, origem e praça" });
      return;
    }

    const { data: tabela } = await supabase
      .from("transportadora_tabela_frete")
      .select("faixa_idx, valor")
      .eq("transportadora_id", transportadora.id)
      .eq("origem_codigo", row.origemCodigo)
      .eq("praca_destino", row.pracaDestino)
      .order("faixa_idx");

    if (!tabela || tabela.length === 0) {
      updateRow(id, { erro: "Sem tabela para esta praça/origem" });
      return;
    }

    const valores = new Array(9).fill(0);
    for (const t of tabela) valores[t.faixa_idx] = Number(t.valor);

    const origemObj = origens.find((o) => o.codigo === row.origemCodigo);
    if (!origemObj) return;
    const params = resolveOriginParams(transportadora, origemObj);
    if (!params) return;

    const result = calcularFrete({
      params,
      fretePesoValores: valores,
      m3: row.m3,
      valorMercadoria: row.valorMercadoria,
      praca: row.pracaDestino,
      incluirEntrega: true,
      margemSeguranca: 0,
    });

    const freteCalculado = result.total;
    const diferenca = row.parsed.freteTotal - freteCalculado;
    const status: ConferenciaRow["status"] =
      Math.abs(diferenca) <= TOLERANCIA ? "ok" : "divergente";

    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, freteCalculado, diferenca, status, erro: undefined }
          : r
      )
    );
  };

  const calcularTodos = async () => {
    for (const r of rows) {
      if (r.status === "pendente") {
        // eslint-disable-next-line no-await-in-loop
        await calcularLinha(r.id);
      }
    }
  };

  const handleRemove = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const handleSaveAll = async () => {
    if (!transportadora) return;
    setSavingAll(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const toSave = rows
        .filter((r) => r.status === "ok" || r.status === "divergente")
        .map((r) => ({
          user_id: user?.id ?? null,
          transportadora_id: transportadora.id,
          numero_cte: r.parsed.numeroCTE || null,
          origem: r.parsed.origem || null,
          destino: r.parsed.destino || null,
          praca_destino: r.pracaDestino,
          m3: r.m3,
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
  const totalPend = rows.filter((r) => r.status === "pendente").length;
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
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-600">Transportadora</label>
          <Select value={transportadoraId} onValueChange={setTransportadoraId}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-64">
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

      {/* Rows */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-zinc-500">{rows.length} CTEs</span>
              {totalPend > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <CircleDashed className="size-3.5" strokeWidth={1.5} />
                  {totalPend} pendentes
                </span>
              )}
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
            <div className="flex items-center gap-2">
              {totalPend > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={calcularTodos}
                  className="gap-2"
                >
                  <Calculator className="size-3.5" strokeWidth={1.5} />
                  Calcular tudo
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveAll}
                disabled={savingAll || totalOk + totalDiv === 0}
                className="gap-2"
              >
                <Save className="size-3.5" strokeWidth={1.5} />
                {savingAll ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>

          <div className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <RowCard
                key={r.id}
                row={r}
                origens={origens ?? []}
                onUpdate={(patch) => updateRow(r.id, patch)}
                onCalcular={() => calcularLinha(r.id)}
                onRemove={() => handleRemove(r.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RowCard({
  row,
  origens,
  onUpdate,
  onCalcular,
  onRemove,
}: {
  row: ConferenciaRow;
  origens: { codigo: string; nome: string | null }[];
  onUpdate: (patch: Partial<ConferenciaRow>) => void;
  onCalcular: () => void;
  onRemove: () => void;
}) {
  const statusColor =
    row.status === "ok"
      ? "border-l-emerald-500"
      : row.status === "divergente"
      ? "border-l-red-500"
      : "border-l-amber-400";

  return (
    <div className={`border-l-2 px-6 py-4 ${statusColor}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-zinc-900">
              CTE {row.parsed.numeroCTE || "?"}
            </span>
            <span className="text-xs text-zinc-400">
              {row.parsed.origem} → {row.parsed.destino}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            {row.arquivo}
            {row.parsed.dimensoes ? ` · DIM: ${row.parsed.dimensoes}` : ""}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="text-zinc-300 transition-colors duration-150 hover:text-zinc-600"
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-400">
            M³ {row.parsed.m3 ? "(extraído)" : "(preencher)"}
          </label>
          <Input
            type="number"
            step="0.0001"
            value={row.m3 || ""}
            onChange={(e) => onUpdate({ m3: parseFloat(e.target.value) || 0 })}
            placeholder="0,0000"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-400">
            Valor merc. {row.parsed.valorMercadoria ? "(extraído)" : "(preencher)"}
          </label>
          <Input
            type="number"
            step="0.01"
            value={row.valorMercadoria || ""}
            onChange={(e) =>
              onUpdate({ valorMercadoria: parseFloat(e.target.value) || 0 })
            }
            placeholder="0,00"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-400">
            Origem
          </label>
          <Select
            value={row.origemCodigo}
            onValueChange={(v) => onUpdate({ origemCodigo: v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {origens.map((o) => (
                <SelectItem key={o.codigo} value={o.codigo}>
                  {o.codigo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-400">
            Praça destino
          </label>
          <Input
            value={row.pracaDestino}
            onChange={(e) => onUpdate({ pracaDestino: e.target.value.toUpperCase() })}
            placeholder="Ex: SP-CAP"
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400">
            Cobrado
          </div>
          <div className="text-sm font-medium text-zinc-900">
            {formatCurrency(row.parsed.freteTotal)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400">
            Calculado
          </div>
          <div
            className={`text-sm font-medium ${
              row.freteCalculado == null
                ? "text-zinc-400"
                : row.status === "ok"
                ? "text-emerald-600"
                : "text-red-600"
            }`}
          >
            {row.freteCalculado != null ? formatCurrency(row.freteCalculado) : "—"}
          </div>
          {row.diferenca != null && (
            <div
              className={`text-[10px] ${
                row.status === "ok" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              dif: {formatCurrency(row.diferenca)}
            </div>
          )}
        </div>
      </div>

      {row.erro && (
        <p className="mt-2 text-[11px] text-amber-600">{row.erro}</p>
      )}

      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant={row.status === "pendente" ? "default" : "outline"}
          onClick={onCalcular}
          className="h-7 gap-1.5 text-xs"
        >
          <Calculator className="size-3" strokeWidth={1.5} />
          {row.status === "pendente" ? "Calcular" : "Recalcular"}
        </Button>
      </div>
    </div>
  );
}
