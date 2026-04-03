import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calculator, Loader2, PackageOpen, AlertTriangle } from "lucide-react";
import {
  useTransportadoras,
  useTransportadoraOrigens,
  resolveOriginParams,
} from "@/hooks/useTransportadoras";
import { usePracaValores } from "@/hooks/useCidadeSearch";
import { useCalcularFrete } from "@/hooks/useCalcularFrete";
import { CidadeAutocomplete } from "@/components/calculadora/CidadeAutocomplete";
import { DimensoesCalculator } from "@/components/calculadora/DimensoesCalculator";
import { FreteResultCard } from "@/components/calculadora/FreteResultCard";
import type { CidadePraca } from "@/types/frete";

export function Calculadora() {
  // Data from Supabase
  const { data: transportadoras, isLoading: loadingTransp } =
    useTransportadoras();

  const [transportadoraId, setTransportadoraId] = useState("");
  const [origemCodigo, setOrigemCodigo] = useState("");
  const [pracaDestino, setPracaDestino] = useState("");
  const [cidadeNome, setCidadeNome] = useState("");
  const [m3, setM3] = useState(0);
  const [valorMercadoria, setValorMercadoria] = useState(0);
  const [incluirEntrega, setIncluirEntrega] = useState(true);

  const { data: origens, isLoading: loadingOrigens } =
    useTransportadoraOrigens(transportadoraId || undefined);

  const { data: fretePesoValores, isLoading: loadingValores } = usePracaValores(
    transportadoraId || undefined,
    origemCodigo || undefined,
    pracaDestino || undefined
  );

  // Resolve params: transportadora base + origin overrides
  const transportadora = useMemo(
    () => transportadoras?.find((t) => t.id === transportadoraId) ?? null,
    [transportadoras, transportadoraId]
  );

  const origemSelecionada = useMemo(
    () => origens?.find((o) => o.codigo === origemCodigo) ?? null,
    [origens, origemCodigo]
  );

  const params = useMemo(() => {
    if (!transportadora || !origemSelecionada) return null;
    return resolveOriginParams(transportadora, origemSelecionada);
  }, [transportadora, origemSelecionada]);

  const result = useCalcularFrete({
    params,
    fretePesoValores: fretePesoValores ?? undefined,
    m3,
    valorMercadoria,
    praca: pracaDestino,
    incluirEntrega,
    margemSeguranca: transportadora?.margem_seguranca ?? 0,
  });

  const handleTransportadoraChange = (id: string) => {
    setTransportadoraId(id);
    setOrigemCodigo("");
    setPracaDestino("");
    setCidadeNome("");
  };

  const handleOrigemChange = (codigo: string) => {
    setOrigemCodigo(codigo);
    setPracaDestino("");
    setCidadeNome("");
  };

  const handleCidadeSelect = (cidade: CidadePraca) => {
    setPracaDestino(cidade.praca);
    setCidadeNome(cidade.cidade);
  };

  // Loading state
  if (loadingTransp) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
          <span className="text-sm">Carregando transportadoras...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <Calculator className="size-4 text-zinc-500" strokeWidth={1.5} />
        <h1 className="text-sm font-medium tracking-tight text-zinc-900">
          Calculadora de Frete
        </h1>
      </div>

      {/* Two column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Form */}
        <div className="space-y-4">
          {/* Main form card */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-400">
              Dados do envio
            </h2>

            <div className="space-y-4">
              {/* Transportadora */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Transportadora</Label>
                <Select
                  value={transportadoraId}
                  onValueChange={handleTransportadoraChange}
                >
                  <SelectTrigger className="h-9 text-sm transition-colors duration-150">
                    <SelectValue placeholder="Selecione a transportadora..." />
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

              {/* Origem */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Origem</Label>
                <Select
                  value={origemCodigo}
                  onValueChange={handleOrigemChange}
                  disabled={!transportadoraId || loadingOrigens}
                >
                  <SelectTrigger className="h-9 text-sm transition-colors duration-150">
                    <SelectValue
                      placeholder={
                        loadingOrigens
                          ? "Carregando origens..."
                          : "Selecione a origem..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {origens?.map((o) => (
                      <SelectItem key={o.codigo} value={o.codigo}>
                        {o.nome || o.codigo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cidade Destino */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Cidade Destino</Label>
                <CidadeAutocomplete
                  transportadoraId={transportadoraId || undefined}
                  onSelect={handleCidadeSelect}
                  disabled={!transportadoraId}
                />
              </div>

              {/* M3 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Volume (M3)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={m3 || ""}
                  onChange={(e) => setM3(parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 1.5785"
                  className="h-9 text-sm transition-colors duration-150"
                />
              </div>

              {/* Valor Mercadoria */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">
                  Valor da Mercadoria (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={valorMercadoria || ""}
                  onChange={(e) =>
                    setValorMercadoria(parseFloat(e.target.value) || 0)
                  }
                  placeholder="Ex: 5193.92"
                  className="h-9 text-sm transition-colors duration-150"
                />
              </div>

              {/* Incluir Entrega */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="entrega"
                  checked={incluirEntrega}
                  onChange={(e) => setIncluirEntrega(e.target.checked)}
                  className="size-3.5 rounded border-zinc-300 text-zinc-900 transition-colors duration-150"
                />
                <Label
                  htmlFor="entrega"
                  className="text-xs font-normal text-zinc-600"
                >
                  Incluir entrega
                  {params
                    ? ` (R$ ${params.entregaFixa.toFixed(2)})`
                    : ""}
                </Label>
              </div>
            </div>
          </div>

          {/* Warning when praça not found */}
          {origemCodigo &&
            pracaDestino &&
            !loadingValores &&
            fretePesoValores &&
            fretePesoValores.every((v) => v === 0) && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0 text-red-500"
                  strokeWidth={1.5}
                />
                <div className="text-xs text-red-700">
                  <p className="font-medium">
                    Praça sem dados para esta origem
                  </p>
                  <p className="mt-0.5 text-red-600">
                    A praça {pracaDestino} ({cidadeNome}) não possui tabela de
                    frete para a origem selecionada.
                  </p>
                </div>
              </div>
            )}

          {/* Dimensions calculator */}
          <DimensoesCalculator onCalculate={setM3} />
        </div>

        {/* Right: Result */}
        <div>
          {result ? (
            <FreteResultCard result={result} />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white">
              <div className="text-center">
                <PackageOpen
                  className="mx-auto size-8 text-zinc-300"
                  strokeWidth={1}
                />
                <p className="mt-3 text-sm text-zinc-400">
                  Preencha os campos para calcular
                </p>
                <p className="mt-1 text-xs text-zinc-300">
                  Transportadora + Origem + Cidade + M3 + Valor
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
