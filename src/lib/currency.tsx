import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Currency = "BRL" | "USD" | "EUR";

// Static fallback rates (DB has authoritative rates; this is for UI conversion)
const RATES: Record<Currency, Record<Currency, number>> = {
  BRL: { BRL: 1, USD: 0.2, EUR: 0.18 },
  USD: { BRL: 5, USD: 1, EUR: 0.92 },
  EUR: { BRL: 5.5, USD: 1.08, EUR: 1 },
};

type Ctx = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  format: (amount: number, from?: Currency) => string;
  convert: (amount: number, from: Currency) => number;
};

const CurrencyCtx = createContext<Ctx | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("BRL");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("currency") as Currency | null) : null;
    if (saved && ["BRL", "USD", "EUR"].includes(saved)) setCurrencyState(saved);
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    if (typeof window !== "undefined") localStorage.setItem("currency", c);
  };

  const convert = (amount: number, from: Currency) => amount * (RATES[from]?.[currency] ?? 1);

  const format = (amount: number, from: Currency = "BRL") => {
    const value = convert(amount, from);
    const locale = currency === "BRL" ? "pt-BR" : currency === "EUR" ? "de-DE" : "en-US";
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  };

  return <CurrencyCtx.Provider value={{ currency, setCurrency, format, convert }}>{children}</CurrencyCtx.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyCtx);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
