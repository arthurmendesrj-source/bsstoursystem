import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComboboxOption = { value: string; label: string; hint?: string };

type Props = {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  clearable?: boolean;
  className?: string;
  disabled?: boolean;
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function ComboboxAutocomplete({
  options,
  value,
  onChange,
  placeholder = "Selecione…",
  emptyMessage = "Nada encontrado.",
  searchPlaceholder = "Buscar…",
  allowCustom = false,
  clearable = true,
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options.slice(0, 100);
    return options
      .filter((o) => norm(o.label).includes(q) || norm(o.value).includes(q))
      .slice(0, 100);
  }, [query, options]);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const current = options.find((o) => o.value === value);
  const display = current?.label ?? (value || placeholder);
  const isPlaceholder = !value;

  const showCustom =
    allowCustom &&
    query.trim().length > 0 &&
    !options.some((o) => norm(o.label) === norm(query.trim()));

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", isPlaceholder && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">{display}</span>
          <span className="ml-2 flex items-center gap-1 shrink-0">
            {clearable && value && !disabled && (
              <X
                className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => { onChange(o.value); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-muted-foreground ml-2">{o.hint}</span>}
                </CommandItem>
              ))}
              {showCustom && (
                <CommandItem
                  value={`__custom_${query}`}
                  onSelect={() => { onChange(query.trim()); setOpen(false); }}
                  className="italic"
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Usar “{query.trim()}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
