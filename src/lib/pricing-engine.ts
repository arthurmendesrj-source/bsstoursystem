// Pricing engine: computes price, margin, validates against policy.
// Pure functions — safe to use in browser or server.

export type PricingCategory = "hotel" | "transfer" | "tour" | "service" | "package";

export const DEFAULT_MARKUP_BY_CATEGORY: Record<PricingCategory, number> = {
  hotel: 25,
  transfer: 30,
  tour: 35,
  service: 30,
  package: 20,
};

export const MIN_MARGIN_BY_CATEGORY: Record<PricingCategory, number> = {
  hotel: 0.15,
  transfer: 0.18,
  tour: 0.20,
  service: 0.15,
  package: 0.12,
};

export type PricingInput = {
  category?: PricingCategory | string | null;
  unit_cost: number;
  quantity: number;
  markup_pct?: number;
  fx_rate?: number; // 1 if same currency
  taxes?: number; // absolute
  card_fee_pct?: number;
  discount_pct?: number;
};

export type PricingBreakdown = {
  category: PricingCategory;
  costSubtotal: number;
  markupApplied: number; // %
  markupAmount: number;
  taxes: number;
  cardFee: number;
  discountAmount: number;
  unitPrice: number;
  total: number;
  margin: number; // 0..1
  marginAmount: number;
  warnings: string[];
  blocks: string[]; // hard-stop reasons
};

function asCategory(c: string | null | undefined): PricingCategory {
  const v = (c || "service").toLowerCase();
  if (v in DEFAULT_MARKUP_BY_CATEGORY) return v as PricingCategory;
  return "service";
}

export function priceItem(input: PricingInput): PricingBreakdown {
  const category = asCategory(input.category);
  const fx = input.fx_rate ?? 1;
  const qty = Math.max(0, Number(input.quantity) || 0);
  const cost = (Number(input.unit_cost) || 0) * fx;
  const markup = input.markup_pct ?? DEFAULT_MARKUP_BY_CATEGORY[category];
  const taxes = Number(input.taxes) || 0;
  const cardFeePct = Number(input.card_fee_pct) || 0;
  const discountPct = Number(input.discount_pct) || 0;

  const costSubtotal = +(cost * qty).toFixed(2);
  const markupAmount = +(costSubtotal * (markup / 100)).toFixed(2);
  const grossBeforeFee = costSubtotal + markupAmount + taxes;
  const cardFee = +(grossBeforeFee * (cardFeePct / 100)).toFixed(2);
  const discountAmount = +((grossBeforeFee + cardFee) * (discountPct / 100)).toFixed(2);
  const total = +(grossBeforeFee + cardFee - discountAmount).toFixed(2);
  const unitPrice = qty > 0 ? +(total / qty).toFixed(2) : 0;
  const marginAmount = +(total - costSubtotal - taxes).toFixed(2);
  const margin = total > 0 ? +(marginAmount / total).toFixed(4) : 0;

  const warnings: string[] = [];
  const blocks: string[] = [];
  const minMargin = MIN_MARGIN_BY_CATEGORY[category];

  if (margin < 0) blocks.push(`Margem negativa (${(margin * 100).toFixed(1)}%)`);
  else if (margin < minMargin) warnings.push(`Margem ${(margin * 100).toFixed(1)}% abaixo do piso (${(minMargin * 100).toFixed(0)}%)`);

  if (discountPct > 20) warnings.push(`Desconto ${discountPct}% requer aprovação de Diretor`);
  else if (discountPct > 10) warnings.push(`Desconto ${discountPct}% requer aprovação de Gerente`);

  if (markup === 0) warnings.push("Markup zerado");
  if (cost === 0 && qty > 0) blocks.push("Custo unitário zerado");

  return {
    category, costSubtotal, markupApplied: markup, markupAmount,
    taxes, cardFee, discountAmount, unitPrice, total,
    margin, marginAmount, warnings, blocks,
  };
}

export type ApprovalLevel = "none" | "gerente" | "diretor";

export function requiredApprovalForDiscount(discountPct: number): ApprovalLevel {
  if (discountPct > 20) return "diretor";
  if (discountPct > 10) return "gerente";
  return "none";
}

export type PricingSummary = {
  cost: number;
  markup: number;
  taxes: number;
  fees: number;
  discount: number;
  total: number;
  marginAmount: number;
  margin: number;
  blocks: string[];
  warnings: string[];
};

export function summarizePricing(items: PricingBreakdown[]): PricingSummary {
  const totals = items.reduce(
    (acc, it) => {
      acc.cost += it.costSubtotal;
      acc.markup += it.markupAmount;
      acc.taxes += it.taxes;
      acc.fees += it.cardFee;
      acc.discount += it.discountAmount;
      acc.total += it.total;
      return acc;
    },
    { cost: 0, markup: 0, taxes: 0, fees: 0, discount: 0, total: 0 },
  );
  const marginAmount = totals.total - totals.cost - totals.taxes;
  const margin = totals.total > 0 ? marginAmount / totals.total : 0;
  return {
    cost: +totals.cost.toFixed(2),
    markup: +totals.markup.toFixed(2),
    taxes: +totals.taxes.toFixed(2),
    fees: +totals.fees.toFixed(2),
    discount: +totals.discount.toFixed(2),
    total: +totals.total.toFixed(2),
    marginAmount: +marginAmount.toFixed(2),
    margin: +margin.toFixed(4),
    blocks: items.flatMap((i) => i.blocks),
    warnings: items.flatMap((i) => i.warnings),
  };
}
