import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import type { CidadeInfo } from "@/hooks/useVipexData";

interface CidadeAutocompleteProps {
  searchCidades: (query: string) => CidadeInfo[];
  onSelect: (cidade: CidadeInfo) => void;
  disabled?: boolean;
}

export function CidadeAutocomplete({
  searchCidades,
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
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

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

  const results = debouncedSearch.length >= 2 ? searchCidades(debouncedSearch) : [];

  const handleSelect = useCallback(
    (cidade: CidadeInfo) => {
      setSelected(`${cidade.nome} (${cidade.praca})`);
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

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1">
          {results.map((c) => (
            <button
              key={c.nome}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-zinc-50"
              onClick={() => handleSelect(c)}
            >
              <MapPin className="size-3 shrink-0 text-zinc-400" strokeWidth={1.5} />
              <span className="font-medium text-zinc-800">{c.nome}</span>
              <span className="ml-auto text-xs text-zinc-400">{c.praca}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && debouncedSearch.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2">
          <p className="text-xs text-zinc-400">
            Nenhuma cidade encontrada para "{debouncedSearch}"
          </p>
        </div>
      )}
    </div>
  );
}
