import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Search, UserPlus, Users, Building2, CalendarRange, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Results = {
  leads: { id: string; name: string; email: string | null; code: string | null; destination: string | null }[];
  customers: { id: string; full_name: string; email: string | null; code: string | null; company_name: string | null }[];
  suppliers: { id: string; name: string; email: string | null; trade_name: string | null }[];
  bookings: { id: string; status: string; departure_date: string | null; notes: string | null }[];
  emails: { id: string; thread_id: string | null; subject: string | null; from_name: string | null; from_email: string | null; snippet: string | null }[];
};

const EMPTY: Results = { leads: [], customers: [], suppliers: [], bookings: [], emails: [] };

function escapeIlike(s: string) {
  return s.replace(/[\\%_,]/g, (c) => `\\${c}`);
}

export function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (term.length < 2) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const t = escapeIlike(term);
      const like = `%${t}%`;
      const [leads, customers, suppliers, bookings, emails] = await Promise.all([
        supabase.from("leads")
          .select("id,name,email,code,destination")
          .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like},code.ilike.${like},destination.ilike.${like},notes.ilike.${like}`)
          .limit(6),
        supabase.from("customers")
          .select("id,full_name,email,code,company_name")
          .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},code.ilike.${like},company_name.ilike.${like},trade_name.ilike.${like}`)
          .limit(6),
        supabase.from("suppliers")
          .select("id,name,email,trade_name")
          .or(`name.ilike.${like},trade_name.ilike.${like},email.ilike.${like},contact_name.ilike.${like}`)
          .limit(6),
        supabase.from("bookings")
          .select("id,status,departure_date,notes")
          .ilike("notes", like)
          .limit(6),
        supabase.from("emails")
          .select("id,thread_id,subject,from_name,from_email,snippet")
          .or(`subject.ilike.${like},from_name.ilike.${like},from_email.ilike.${like},snippet.ilike.${like},body_text.ilike.${like}`)
          .order("received_at", { ascending: false })
          .limit(8),
      ]);
      setResults({
        leads: (leads.data ?? []) as Results["leads"],
        customers: (customers.data ?? []) as Results["customers"],
        suppliers: (suppliers.data ?? []) as Results["suppliers"],
        bookings: (bookings.data ?? []) as Results["bookings"],
        emails: (emails.data ?? []) as Results["emails"],
      });
      setLoading(false);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  const total = useMemo(
    () => results.leads.length + results.customers.length + results.suppliers.length + results.bookings.length + results.emails.length,
    [results],
  );

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate({ to, replace: false });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="Buscar (Ctrl/Cmd + K)"
        aria-label="Buscar no sistema"
      >
        <Search className="h-5 w-5" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Buscar leads, clientes, fornecedores, reservas, e-mails..."
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          {q.trim().length < 2 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Digite pelo menos 2 caracteres para buscar.
            </div>
          ) : loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Buscando…</div>
          ) : total === 0 ? (
            <CommandEmpty>Nada encontrado para «{q}».</CommandEmpty>
          ) : null}

          {results.leads.length > 0 && (
            <CommandGroup heading="Leads">
              {results.leads.map((l) => (
                <CommandItem key={`l-${l.id}`} value={`lead-${l.id}-${l.name}`} onSelect={() => go(`/leads/${l.id}`)}>
                  <UserPlus className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{l.name}{l.code ? ` · ${l.code}` : ""}</span>
                    <span className="text-xs text-muted-foreground">{[l.email, l.destination].filter(Boolean).join(" · ")}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.customers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Clientes">
                {results.customers.map((c) => (
                  <CommandItem key={`c-${c.id}`} value={`cust-${c.id}-${c.full_name}`} onSelect={() => go(`/customers`)}>
                    <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{c.full_name}{c.code ? ` · ${c.code}` : ""}</span>
                      <span className="text-xs text-muted-foreground">{[c.email, c.company_name].filter(Boolean).join(" · ")}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results.suppliers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Fornecedores">
                {results.suppliers.map((s) => (
                  <CommandItem key={`s-${s.id}`} value={`sup-${s.id}-${s.name}`} onSelect={() => go(`/suppliers`)}>
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{s.name}{s.trade_name ? ` · ${s.trade_name}` : ""}</span>
                      {s.email && <span className="text-xs text-muted-foreground">{s.email}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results.bookings.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Reservas">
                {results.bookings.map((b) => (
                  <CommandItem key={`b-${b.id}`} value={`book-${b.id}`} onSelect={() => go(`/bookings/${b.id}`)}>
                    <CalendarRange className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>Reserva · {b.status}</span>
                      <span className="text-xs text-muted-foreground">
                        {b.departure_date ? `Saída ${b.departure_date}` : ""}{b.notes ? ` · ${b.notes.slice(0, 60)}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results.emails.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="E-mails">
                {results.emails.map((m) => (
                  <CommandItem
                    key={`e-${m.id}`}
                    value={`mail-${m.id}-${m.subject ?? ""}`}
                    onSelect={() => go(`/email?q=${encodeURIComponent(q)}${m.thread_id ? `&thread=${encodeURIComponent(m.thread_id)}` : ""}`)}
                  >
                    <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{m.subject || "(sem assunto)"}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {[m.from_name || m.from_email, m.snippet].filter(Boolean).join(" — ")}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
