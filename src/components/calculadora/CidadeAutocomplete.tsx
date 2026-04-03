import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import type { CidadePraca } from "@/types/frete";
import { useCidadeSearch } from "@/hooks/useCidadeSearch";

interface CidadeAutocompleteProps {
  transportadoraId: string | undefined;
  onSelect: (cidade: CidadePraca) => void;
  disabled?: boolean;
}

export function CidadeAutocomplete({
  transportadoraId,
  onSelect,
  disabled,
}: CidadeAutocompleteProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset when transportadora changes
  useEffect(() => {
    setSelected("");
    setSearch("");
    setDebouncedSearch("");
  }, [transportadoraId]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: results = [], isLoading } = useCidadeSearch(
    transportadoraId,
    debouncedSearch
  );

  const handleSelect = useCallback(
    (cidade: CidadePraca) => {
      setSelected(`${cidade.cidade} (${cidade.praca})`);
      setSearch("");
      setDebouncedSearch("");
      setIsOpen(false);
      onSelect(cidade);
    },
    [onSelect]
  );

  const handleClear = () => {
    setSelected("");
    setSearch("");
    setDebouncedSearch("");
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          type="text"
          placeholder="Digite a cidade destino..."
          value={selected || search}
          disabled={disabled}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected("");
            setIsOpen(true);
          }}
          onFocus={() => {
            if (search.length >= 2) setIsOpen(true);
          }}
          className="h-9 pr-8 text-sm transition-colors duration-150"
        />
        {selected && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors duration-150 hover:text-zinc-600"
          >
            <span className="text-xs">x</span>
          </button>
        )}
      </div>

      {isOpen && isLoading && debouncedSearch.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
            Buscando...
          </div>
        </div>
      )}

      {isOpen && !isLoading && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-zinc-50"
              onClick={() => handleSelect(c)}
            >
              <MapPin
                className="size-3 shrink-0 text-zinc-400"
                strokeWidth={1.5}
              />
              <span className="font-medium text-zinc-800">{c.cidade}</span>
              {c.estado && (
                <span className="text-xs text-zinc-400">{c.estado}</span>
              )}
              <span className="ml-auto text-xs text-zinc-400">{c.praca}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen &&
        !isLoading &&
        debouncedSearch.length >= 2 &&
        results.length === 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2">
            <p className="text-xs text-zinc-400">
              Nenhuma cidade encontrada para "{debouncedSearch}"
            </p>
          </div>
        )}
    </div>
  );
}
