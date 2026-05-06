import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/permissions-audit/financial")({
  component: () => (
    <AuthGate>
      <AppShell>
        <FinancialAuditPage />
      </AppShell>
    </AuthGate>
  ),
});

type FieldRef = {
  label: string;
  module: string;
  field: string;
  kind: "cost" | "markup" | "commission" | "discount" | "total" | "price";
};

type ScreenRef = {
  screen: string;
  route: string;
  fields: FieldRef[];
};

const SCREENS: ScreenRef[] = [
  {
    screen: "Workspace / Cotações",
    route: "/workspace",
    fields: [
      { label: "Total da cotação", module: "quotes", field: "total_amount", kind: "total" },
      { label: "Markup padrão", module: "quotes", field: "default_markup_pct", kind: "markup" },
      { label: "Custo unitário (item)", module: "quotes", field: "unit_cost", kind: "cost" },
      { label: "Preço unitário (item)", module: "quotes", field: "unit_price", kind: "price" },
      { label: "Desconto", module: "quotes", field: "discount", kind: "discount" },
      { label: "Comissão %", module: "quotes", field: "commission_pct", kind: "commission" },
    ],
  },
  {
    screen: "Bookings",
    route: "/bookings",
    fields: [
      { label: "Total do booking", module: "bookings", field: "total_amount", kind: "total" },
      { label: "Custo do fornecedor", module: "bookings", field: "supplier_cost", kind: "cost" },
      { label: "Markup", module: "bookings", field: "markup_pct", kind: "markup" },
      { label: "Comissão %", module: "bookings", field: "commission_pct", kind: "commission" },
    ],
  },
  {
    screen: "Suppliers / Tarifário",
    route: "/suppliers/rates-search",
    fields: [
      { label: "Preço unitário", module: "supplier_rates", field: "unit_price", kind: "price" },
      { label: "Custo líquido", module: "supplier_rates", field: "net_cost", kind: "cost" },
      { label: "Comissão %", module: "supplier_rates", field: "commission_pct", kind: "commission" },
    ],
  },
  {
    screen: "Leads",
    route: "/leads",
    fields: [
      { label: "Valor estimado", module: "leads", field: "estimated_value", kind: "total" },
      { label: "Orçamento aprovado", module: "leads", field: "budget", kind: "total" },
    ],
  },
];

const kindLabel: Record<FieldRef["kind"], string> = {
  cost: "Custo",
  markup: "Markup",
  commission: "Comissão",
  discount: "Desconto",
  total: "Total",
  price: "Preço",
};

const kindColor: Record<FieldRef["kind"], string> = {
  cost: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  markup: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  commission: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  discount: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  total: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  price: "bg-slate-500/15 text-slate-700 border-slate-500/30",
};

function StatusBadge({
  ok, yesIcon, noIcon, yes, no,
}: { ok: boolean; yesIcon: React.ReactNode; noIcon: React.ReactNode; yes: string; no: string }) {
  return ok ? (
    <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700">
      {yesIcon}{yes}
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-rose-500/40 text-rose-700">
      {noIcon}{no}
    </Badge>
  );
}

function FinancialAuditPage() {
  const { user, roles, isAdmin } = useAuth();
  const { canField, can, loading } = usePermissions();

  const totals = SCREENS.flatMap((s) => s.fields);
  const visible = totals.filter((f) => canField(f.module, f.field, "view")).length;
  const editable = totals.filter((f) => canField(f.module, f.field, "edit")).length;
  const masked = totals.length - visible;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Auditoria de Campos Financeiros</h1>
        <p className="text-muted-foreground">
          Mostra, por tela, se cada campo sensível está visível, mascarado ou bloqueado para edição conforme suas permissões.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Usuário</div>
            <div className="font-mono text-xs">{user?.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Papéis</div>
            <div className="flex flex-wrap gap-1">
              {isAdmin && <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">admin</Badge>}
              {roles.length === 0 && !isAdmin && <span className="text-muted-foreground">—</span>}
              {roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Visíveis / Mascarados</div>
            <div className="font-medium">{visible} <span className="text-muted-foreground">/</span> {masked}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Editáveis</div>
            <div className="font-medium">{editable} de {totals.length}</div>
          </div>
        </CardContent>
      </Card>

      {loading && <div className="text-sm text-muted-foreground">Carregando matriz…</div>}

      {SCREENS.map((s) => {
        const canViewModule = can(s.module ?? "", "view");
        return (
          <Card key={s.screen}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">{s.screen}</CardTitle>
                <p className="text-xs text-muted-foreground font-mono">{s.route}</p>
              </div>
              <Link to={s.route} className="text-xs text-primary hover:underline">Abrir tela →</Link>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="font-mono text-xs">module.field</TableHead>
                    <TableHead>Visualização</TableHead>
                    <TableHead>Edição</TableHead>
                    <TableHead className="text-right">Exemplo renderizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.fields.map((f) => {
                    const v = canField(f.module, f.field, "view");
                    const e = canField(f.module, f.field, "edit");
                    return (
                      <TableRow key={`${f.module}.${f.field}`}>
                        <TableCell className="font-medium">{f.label}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={kindColor[f.kind]}>{kindLabel[f.kind]}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{f.module}.{f.field}</TableCell>
                        <TableCell>
                          <StatusBadge
                            ok={v}
                            yesIcon={<Eye className="h-3 w-3" />}
                            noIcon={<EyeOff className="h-3 w-3" />}
                            yes="Visível"
                            no="Mascarado"
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            ok={e}
                            yesIcon={<Unlock className="h-3 w-3" />}
                            noIcon={<Lock className="h-3 w-3" />}
                            yes="Editável"
                            no="Bloqueado"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {v ? "R$ 1.234,56" : "•••"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Esta auditoria reflete as regras configuradas em <code>/settings/permissions</code>. Campos não catalogados são liberados por padrão. Admin sempre tem acesso total.
      </p>
    </div>
  );
}
