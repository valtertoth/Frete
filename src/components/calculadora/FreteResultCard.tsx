import type { FreteResult } from "@/types/frete";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface FreteResultCardProps {
  result: FreteResult;
}

export function FreteResultCard({ result }: FreteResultCardProps) {
  const lines = [
    { label: "Frete Peso", value: result.fretePeso },
    { label: "Despacho", value: result.despacho },
    {
      label: `GRIS (${formatPercent(result.detalhes.grisPct)})`,
      value: result.gris,
    },
    { label: "Pedagio", value: result.pedagio },
  ];

  if (result.advalorem > 0) {
    lines.push({ label: "Ad-Valorem", value: result.advalorem });
  }

  if (result.txDifAcesso > 0) {
    lines.push({
      label: `TxDifAcesso (${formatPercent(result.detalhes.txDifPct)})`,
      value: result.txDifAcesso,
    });
  }

  if (result.entrega > 0) {
    lines.push({ label: "Entrega", value: result.entrega });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
        <h3 className="text-sm font-medium text-zinc-900">
          Resultado do Frete
        </h3>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
            {result.detalhes.faixaLabel}
          </span>
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            {result.detalhes.praca}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-0 px-6 py-4">
        {/* Line items */}
        {lines.map((line) => (
          <div
            key={line.label}
            className="flex items-center justify-between py-1.5"
          >
            <span className="text-xs text-zinc-500">{line.label}</span>
            <span className="text-sm text-zinc-700">
              {formatCurrency(line.value)}
            </span>
          </div>
        ))}

        <Separator className="my-2 bg-zinc-100" />

        {/* Subtotal */}
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-zinc-500">Subtotal</span>
          <span className="text-sm text-zinc-700">
            {formatCurrency(result.subtotal)}
          </span>
        </div>

        {/* ICMS */}
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-zinc-500">
            ICMS ({formatPercent(result.detalhes.icmsPct)})
          </span>
          <span className="text-sm text-zinc-700">
            {formatCurrency(result.icms)}
          </span>
        </div>

        <Separator className="my-2 bg-zinc-100" />

        {/* Total */}
        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-medium text-zinc-900">Total</span>
          <span className="text-base font-medium text-zinc-900">
            {formatCurrency(result.total)}
          </span>
        </div>

        {/* Margem */}
        {result.margem > 0 && (
          <>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-zinc-500">
                Margem de Seguranca
              </span>
              <span className="text-sm text-zinc-700">
                {formatCurrency(result.margem)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2">
              <span className="text-sm font-medium text-zinc-900">
                Total com Margem
              </span>
              <span className="text-base font-medium text-zinc-900">
                {formatCurrency(result.totalComMargem)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Footer metadata */}
      <div className="border-t border-zinc-100 px-6 py-3">
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>Estado: {result.detalhes.estado}</span>
          <span>M3: {result.detalhes.m3.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
