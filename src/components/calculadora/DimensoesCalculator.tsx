import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Ruler } from "lucide-react";
import { calcularM3, type DimensoesInput } from "@/types/frete";

interface DimensoesCalculatorProps {
  onCalculate: (m3: number) => void;
}

export function DimensoesCalculator({ onCalculate }: DimensoesCalculatorProps) {
  const [dims, setDims] = useState<DimensoesInput>({
    comprimento: 0,
    largura: 0,
    altura: 0,
    quantidade: 1,
  });

  const m3 = calcularM3(dims);

  const handleChange = (field: keyof DimensoesInput, value: string) => {
    const num = parseFloat(value) || 0;
    setDims((prev) => ({ ...prev, [field]: num }));
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Ruler className="size-4 text-zinc-500" strokeWidth={1.5} />
        <span className="text-xs font-medium text-zinc-700">
          Calcular M3 por dimensoes
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-zinc-500">Comp. (cm)</Label>
          <Input
            type="number"
            min={0}
            value={dims.comprimento || ""}
            onChange={(e) => handleChange("comprimento", e.target.value)}
            placeholder="0"
            className="h-8 text-sm transition-colors duration-150"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-zinc-500">Larg. (cm)</Label>
          <Input
            type="number"
            min={0}
            value={dims.largura || ""}
            onChange={(e) => handleChange("largura", e.target.value)}
            placeholder="0"
            className="h-8 text-sm transition-colors duration-150"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-zinc-500">Alt. (cm)</Label>
          <Input
            type="number"
            min={0}
            value={dims.altura || ""}
            onChange={(e) => handleChange("altura", e.target.value)}
            placeholder="0"
            className="h-8 text-sm transition-colors duration-150"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-zinc-500">Qtd.</Label>
          <Input
            type="number"
            min={1}
            value={dims.quantidade || ""}
            onChange={(e) => handleChange("quantidade", e.target.value)}
            placeholder="1"
            className="h-8 text-sm transition-colors duration-150"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          Volume:{" "}
          <span className="font-medium text-zinc-800">
            {m3.toFixed(4)} m3
          </span>
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={m3 <= 0}
          onClick={() => onCalculate(m3)}
          className="h-7 text-xs transition-colors duration-150"
        >
          Usar este M3
        </Button>
      </div>
    </div>
  );
}
