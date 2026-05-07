import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Send, Wand2, FileText, Hotel, Plane, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { applyProgramToQuote, type TourProgram } from "@/lib/applyProgramToQuote";

type Msg = { role: "user" | "assistant"; content: string };

type Props = {
  leadId: string;
  quoteId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApplied?: () => void;
  onOpenDoc?: () => void;
};

export function AiProgramAssistantDialog({
  leadId,
  quoteId,
  open,
  onOpenChange,
  onApplied,
  onOpenDoc,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [program, setProgram] = useState<TourProgram | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [includeEmails, setIncludeEmails] = useState(true);
  const [includeInteractions, setIncludeInteractions] = useState(true);
  const [clearExisting, setClearExisting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Primeira chamada: gera programa inicial
  useEffect(() => {
    if (open && messages.length === 0 && !program) {
      void callAi([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, program]);

  const callAi = async (next: Msg[]) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("propose-tour-program", {
        body: {
          lead_id: leadId,
          quote_id: quoteId,
          messages: next,
          options: {
            include_emails: includeEmails,
            include_interactions: includeInteractions,
            language: "pt-BR",
            tone: "inspiracional",
          },
        },
      });
      if (error) {
        const status = (error as any).context?.status;
        if (status === 429) toast.error("Rate limit — aguarde alguns segundos.");
        else if (status === 402) toast.error("Créditos de IA esgotados.");
        else toast.error(error.message);
        return;
      }
      if (data?.assistant_message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.assistant_message }]);
      }
      if (data?.program) setProgram(data.program as TourProgram);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    await callAi(next);
  };

  const apply = async () => {
    if (!program) return;
    setApplying(true);
    try {
      const r = await applyProgramToQuote(program, quoteId, { clearExisting });
      toast.success(
        `${r.inserted} itens adicionados — ${r.hotels} hotéis, ${r.flights} voos, ${r.services} serviços. ${r.needCost} precisam de custo.`,
      );
      onApplied?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao aplicar");
    } finally {
      setApplying(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setProgram(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Assistente IA — Programa Turístico
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid md:grid-cols-[1fr_1.2fr]">
          {/* Esquerda — Programa estruturado */}
          <div className="border-r flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center gap-3 text-xs flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="incl-emails"
                  checked={includeEmails}
                  onCheckedChange={setIncludeEmails}
                />
                <Label htmlFor="incl-emails" className="text-xs">E-mails</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="incl-inter"
                  checked={includeInteractions}
                  onCheckedChange={setIncludeInteractions}
                />
                <Label htmlFor="incl-inter" className="text-xs">Interações</Label>
              </div>
              <Button size="sm" variant="ghost" onClick={reset} disabled={loading}>
                Recomeçar
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {!program && loading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analisando lead, e-mails e interações…
                  </div>
                )}
                {program && (
                  <>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Resumo</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {program.summary}
                      </p>
                    </div>

                    {program.days?.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> Cronograma
                        </h3>
                        <div className="space-y-2">
                          {program.days.map((d, i) => (
                            <div key={i} className="rounded-md border p-2 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  Dia {d.day} — {d.city}
                                </span>
                                {d.date && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {d.date}
                                  </Badge>
                                )}
                              </div>
                              {d.morning && <p><span className="text-muted-foreground">Manhã:</span> {d.morning}</p>}
                              {d.afternoon && <p><span className="text-muted-foreground">Tarde:</span> {d.afternoon}</p>}
                              {d.evening && <p><span className="text-muted-foreground">Noite:</span> {d.evening}</p>}
                              {(d as any).schedule?.length > 0 && (
                                <div className="mt-1 border-t pt-1 space-y-0.5">
                                  {(d as any).schedule.map((s: any, j: number) => (
                                    <div key={j} className="flex gap-2">
                                      <span className="font-mono text-[10px] text-muted-foreground w-10">{s.time}</span>
                                      <span className="flex-1">{s.title}{s.description ? ` — ${s.description}` : ""}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {program.hotels?.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                          <Hotel className="h-3.5 w-3.5" /> Hotéis ({program.hotels.length})
                        </h3>
                        <div className="space-y-1">
                          {program.hotels.map((h, i) => (
                            <div key={i} className="text-xs border rounded-md p-2">
                              <div className="font-medium">{h.name || `Hotel em ${h.city}`}</div>
                              <div className="text-muted-foreground">
                                {h.city} · {h.category ?? "—"} · {h.nights} noites
                                {h.check_in && ` · Check-in ${h.check_in} ${(h as any).check_in_time || "15:00"}`}
                                {h.check_out && ` → Check-out ${h.check_out} ${(h as any).check_out_time || "11:00"}`}
                              </div>
                              {h.notes && <p className="text-muted-foreground mt-0.5">{h.notes}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {program.flights?.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                          <Plane className="h-3.5 w-3.5" /> Voos ({program.flights.length})
                        </h3>
                        <div className="space-y-1">
                          {program.flights.map((f, i) => (
                            <div key={i} className="text-xs border rounded-md p-2">
                              <span className="font-medium">{f.from} → {f.to}</span>
                              {f.date && <span className="text-muted-foreground"> · {f.date}</span>}
                              {((f as any).departure_time || (f as any).arrival_time) && (
                                <span className="text-muted-foreground"> · {(f as any).departure_time ?? "—"}→{(f as any).arrival_time ?? "—"}</span>
                              )}
                              {f.class && <Badge variant="outline" className="ml-2 text-[10px]">{f.class}</Badge>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {program.services?.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2">
                          Serviços ({program.services.length})
                        </h3>
                        <div className="space-y-1">
                          {program.services.map((s, i) => (
                            <div key={i} className="text-xs border rounded-md p-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">{s.kind}</Badge>
                                {s.day && <span className="text-muted-foreground">Dia {s.day}</span>}
                                {s.city && <span className="text-muted-foreground">· {s.city}</span>}
                              </div>
                              <p>{s.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {program.notes && (
                      <div className="text-xs text-muted-foreground border-t pt-2">
                        <strong>Observações:</strong> {program.notes}
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Direita — Chat */}
          <div className="flex flex-col overflow-hidden">
            <ScrollArea className="flex-1" ref={scrollRef as any}>
              <div className="p-4 space-y-3">
                {messages.length === 0 && !loading && (
                  <p className="text-xs text-muted-foreground">
                    Peça ajustes ao programa: trocar hotel, adicionar dia, mudar destino, traduzir, reduzir orçamento…
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`text-sm rounded-md px-3 py-2 ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground ml-8"
                        : "bg-muted mr-8"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Pensando…
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="border-t p-3 space-y-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder='Ex: "trocar hotel de Roma por 5★", "adicionar 2 dias em Florença", "traduzir programa para inglês"…'
                rows={2}
                className="resize-none text-sm"
                disabled={loading}
              />
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">⌘/Ctrl+Enter para enviar</span>
                <Button size="sm" onClick={send} disabled={loading || !input.trim()}>
                  <Send className="h-4 w-4 mr-1" /> Enviar
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Separator />
        <DialogFooter className="p-3 flex-row gap-2 sm:justify-between items-center">
          <div className="flex items-center gap-2">
            <Switch
              id="clear-existing"
              checked={clearExisting}
              onCheckedChange={setClearExisting}
            />
            <Label htmlFor="clear-existing" className="text-xs">
              Limpar itens existentes antes
            </Label>
          </div>
          <div className="flex gap-2">
            {onOpenDoc && (
              <Button variant="outline" size="sm" onClick={onOpenDoc}>
                <FileText className="h-4 w-4 mr-1" /> Gerar .docx
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button size="sm" onClick={apply} disabled={!program || applying || loading}>
              {applying ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-1" />
              )}
              Aplicar à proposta
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
