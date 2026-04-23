export type ProposalItemKind = "hotel" | "service";

export type ProposalItem = {
  id?: string;
  kind: ProposalItemKind;
  description: string;
  // hotel: rooms × nights ; service: pax × ways
  quantity: number;
  unit_cost: number;
  markup_pct: number;
  // Derived: stored back as unit_price (cost × (1+markup)) and total (unit_price × quantity)
  unit_price?: number;
  total?: number;
};

export function lineUnitPrice(unit_cost: number, markup_pct: number): number {
  const cost = Number(unit_cost) || 0;
  const m = Number(markup_pct) || 0;
  return +(cost * (1 + m / 100)).toFixed(2);
}

export function lineSubtotal(unit_cost: number, markup_pct: number, quantity: number): number {
  const qty = Number(quantity) || 0;
  return +(lineUnitPrice(unit_cost, markup_pct) * qty).toFixed(2);
}

export function lineCostSubtotal(unit_cost: number, quantity: number): number {
  return +((Number(unit_cost) || 0) * (Number(quantity) || 0)).toFixed(2);
}

export type ProposalTotals = {
  costSubtotal: number;
  markupTotal: number;
  subtotal: number; // = costSubtotal + markupTotal (price subtotal)
  bankFee: number;
  total: number; // subtotal + bankFee
};

export function computeTotals(items: ProposalItem[], bankFee = 0): ProposalTotals {
  let costSubtotal = 0;
  let subtotal = 0;
  for (const it of items) {
    costSubtotal += lineCostSubtotal(it.unit_cost, it.quantity);
    subtotal += lineSubtotal(it.unit_cost, it.markup_pct, it.quantity);
  }
  const markupTotal = +(subtotal - costSubtotal).toFixed(2);
  const fee = Number(bankFee) || 0;
  return {
    costSubtotal: +costSubtotal.toFixed(2),
    markupTotal,
    subtotal: +subtotal.toFixed(2),
    bankFee: +fee.toFixed(2),
    total: +(subtotal + fee).toFixed(2),
  };
}
