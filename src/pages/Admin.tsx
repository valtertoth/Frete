import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Upload,
  Database,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  VIPEX_PARAMS,
  ORIGIN_LABELS,
  PARTIAL_ORIGINS,
  getParamsForOrigin,
  useVipexData,
} from "@/hooks/useVipexData";
import { formatCurrency, formatPercent } from "@/lib/utils";

export function Admin() {
  const { origins, tabelas } = useVipexData();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleUploadVipex = async () => {
    setUploading(true);
    setUploadResult(null);

    try {
      const [tabelasRes, cidadesRes] = await Promise.all([
        fetch("/data/vipex_tabelas_frete.json"),
        fetch("/data/vipex_cidade_praca.json"),
      ]);

      const tabelas = await tabelasRes.json();
      const cidades = await cidadesRes.json();

      let { data: vipex } = await supabase
        .from("transportadoras")
        .select("id")
        .eq("nome", "Vipex")
        .single();

      if (!vipex) {
        const { data: created, error } = await supabase
          .from("transportadoras")
          .insert({ nome: "Vipex", ativo: true, fator_cubagem: 300 })
          .select("id")
          .single();
        if (error) throw error;
        vipex = created;
      }

      const transportadoraId = vipex!.id;

      await supabase
        .from("transportadoras")
        .update({
          parametros_calculo: VIPEX_PARAMS,
          margem_seguranca: 0,
        })
        .eq("id", transportadoraId);

      await supabase
        .from("transportadora_cidade_praca")
        .delete()
        .eq("transportadora_id", transportadoraId);

      const cidadeRows = Object.entries(cidades).map(
        ([cidade, info]: [string, any]) => ({
          transportadora_id: transportadoraId,
          cidade,
          praca: info.praca,
          unidade: info.unidade,
        })
      );

      for (let i = 0; i < cidadeRows.length; i += 500) {
        const batch = cidadeRows.slice(i, i + 500);
        const { error } = await supabase
          .from("transportadora_cidade_praca")
          .insert(batch);
        if (error) throw error;
      }

      await supabase
        .from("transportadora_tabela_frete")
        .delete()
        .eq("transportadora_id", transportadoraId);

      const freteRows: any[] = [];
      for (const [origem, pracas] of Object.entries(tabelas)) {
        for (const [praca, valores] of Object.entries(
          pracas as Record<string, number[]>
        )) {
          (valores as number[]).forEach((valor, faixaIdx) => {
            freteRows.push({
              transportadora_id: transportadoraId,
              origem_codigo: origem,
              praca_destino: praca,
              faixa_idx: faixaIdx,
              valor,
              is_valor_por_m3: faixaIdx === 8,
            });
          });
        }
      }

      for (let i = 0; i < freteRows.length; i += 500) {
        const batch = freteRows.slice(i, i + 500);
        const { error } = await supabase
          .from("transportadora_tabela_frete")
          .insert(batch);
        if (error) throw error;
      }

      setUploadResult({
        type: "success",
        message: `Carregados: ${cidadeRows.length} cidades, ${freteRows.length} valores de frete.`,
      });
    } catch (err: any) {
      setUploadResult({
        type: "error",
        message: err.message,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <Settings className="size-4 text-zinc-500" strokeWidth={1.5} />
        <h1 className="text-sm font-medium tracking-tight text-zinc-900">
          Administracao
        </h1>
      </div>

      {/* Parameters overview */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-6 py-4">
          <Database className="size-4 text-zinc-400" strokeWidth={1.5} />
          <h2 className="text-sm font-medium text-zinc-900">
            Parametros Vipex
          </h2>
        </div>

        <div className="px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="text-xs text-zinc-400">Despacho</span>
              <p className="text-sm text-zinc-700">
                {formatCurrency(VIPEX_PARAMS.despacho)}
              </p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">GRIS</span>
              <p className="text-sm text-zinc-700">
                {formatPercent(VIPEX_PARAMS.gris)}
              </p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">Pedagio</span>
              <p className="text-sm text-zinc-700">
                {formatCurrency(VIPEX_PARAMS.pedagioValor)} / fracao M3
              </p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">ICMS</span>
              <p className="text-sm text-zinc-700">
                {formatPercent(VIPEX_PARAMS.icms)} (por dentro)
              </p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">Entrega</span>
              <p className="text-sm text-zinc-700">
                {formatCurrency(VIPEX_PARAMS.entregaFixa)}
              </p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">Faixas M3</span>
              <p className="text-sm text-zinc-700">
                {VIPEX_PARAMS.faixasM3.length} faixas
              </p>
            </div>
          </div>

          <Separator className="my-4 bg-zinc-100" />

          <div>
            <span className="text-xs text-zinc-400">Origens configuradas ({origins.length})</span>
            <div className="mt-2 space-y-1.5">
              {origins.map((code) => {
                const isPartial = PARTIAL_ORIGINS.has(code);
                const originParams = getParamsForOrigin(code);
                const pracaCount = tabelas
                  ? Object.keys(tabelas[code] ?? {}).length
                  : 0;
                return (
                  <div key={code} className="flex items-center gap-2">
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-600">
                      {code}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {ORIGIN_LABELS[code] ?? code}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {pracaCount} pracas
                    </span>
                    {isPartial && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        ESTIMADO
                      </span>
                    )}
                    {originParams !== VIPEX_PARAMS && (
                      <span className="text-[10px] text-zinc-400">
                        Desp={formatCurrency(originParams.despacho)} Ped={formatCurrency(originParams.pedagioValor)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Upload to Supabase */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-6 py-4">
          <Upload className="size-4 text-zinc-400" strokeWidth={1.5} />
          <h2 className="text-sm font-medium text-zinc-900">
            Sincronizar com Supabase
          </h2>
        </div>

        <div className="px-6 py-4">
          <p className="text-xs text-zinc-500">
            Envia os dados locais (656 cidades, {origins.length} origens, parametros)
            para o Supabase. Substitui dados anteriores da Vipex.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={handleUploadVipex}
              disabled={uploading}
              size="sm"
              variant="outline"
              className="gap-2 transition-colors duration-150"
            >
              <Upload className="size-4" strokeWidth={1.5} />
              {uploading ? "Enviando..." : "Enviar para Supabase"}
            </Button>

            {uploadResult && (
              <div className="flex items-center gap-1.5">
                {uploadResult.type === "success" ? (
                  <CheckCircle2
                    className="size-4 text-emerald-600"
                    strokeWidth={1.5}
                  />
                ) : (
                  <AlertCircle
                    className="size-4 text-red-500"
                    strokeWidth={1.5}
                  />
                )}
                <span
                  className={`text-xs ${
                    uploadResult.type === "success"
                      ? "text-emerald-600"
                      : "text-red-500"
                  }`}
                >
                  {uploadResult.message}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
