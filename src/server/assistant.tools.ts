// Tool definitions exposed to the AI gateway via function calling.
// Mirrored handlers (server-side execution) live alongside.
import type { SupabaseClient } from "@supabase/supabase-js";

export type AiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const ASSISTANT_TOOLS: AiTool[] = [
  // ===== READ =====
  {
    type: "function",
    function: {
      name: "search_leads",
      description: "Busca leads do CRM. Filtra por texto (nome/email/telefone/destino), status e se está atribuído ao usuário atual.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto de busca" },
          status: { type: "string", description: "Status do lead (novo, em_atendimento, qualificado, ganho, perdido, etc)" },
          assigned_to_me: { type: "boolean" },
          limit: { type: "number", default: 20 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lead",
      description: "Detalhes completos de um lead pelo id ou code (ex: AB030526).",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, code: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_customers",
      description: "Busca clientes por nome, email, telefone ou code.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: "number", default: 20 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_suppliers",
      description: "Busca fornecedores por nome, cidade ou tipo de serviço.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, city: { type: "string" }, limit: { type: "number", default: 20 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_packages",
      description: "Busca pacotes turísticos por destino e status (ativo).",
      parameters: {
        type: "object",
        properties: { destination: { type: "string" }, active: { type: "boolean" }, limit: { type: "number", default: 20 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_bookings",
      description: "Lista reservas, com filtros opcionais.",
      parameters: {
        type: "object",
        properties: { status: { type: "string" }, customer_id: { type: "string" }, limit: { type: "number", default: 20 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_metrics",
      description: "Métricas agregadas: leads novos, em atendimento, ganhos/perdidos, receita aproximada nos últimos N dias.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", default: 30 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Pesquisa na internet por informações atualizadas (tendências, eventos, preços, destinos). Retorna resumo com citações.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Gera uma imagem para uso em marketing (post, banner, story). Retorna URL da imagem que será exibida na conversa.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Descrição detalhada da imagem (estilo, cores, composição)" },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },

  // ===== WRITE (PROPOSALS) =====
  {
    type: "function",
    function: {
      name: "propose_create_lead",
      description: "Propõe a criação de um novo lead. Cria um cartão de aprovação que o operador deve aprovar manualmente.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          destination: { type: "string" },
          estimated_value: { type: "number" },
          source: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_lead",
      description: "Propõe atualização de campos de um lead existente.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          fields: {
            type: "object",
            description: "Campos a atualizar (status, next_action, next_action_date, notes, destination, estimated_value, etc)",
            additionalProperties: true,
          },
        },
        required: ["id", "fields"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_interaction",
      description: "Propõe registrar uma interação (ligação, email, whatsapp, reunião) com lead ou cliente.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          customer_id: { type: "string" },
          type: { type: "string", description: "ligacao, email, whatsapp, reuniao, outro" },
          subject: { type: "string" },
          content: { type: "string" },
        },
        required: ["type", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_activity",
      description: "Propõe criar uma atividade operacional (transfer, tour, hotel check-in, etc) opcionalmente vinculada a uma reserva.",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string" },
          kind: { type: "string", description: "service, transfer, hotel, tour, outro" },
          description: { type: "string" },
          activity_date: { type: "string", description: "YYYY-MM-DD" },
          activity_time: { type: "string", description: "HH:MM" },
          city: { type: "string" },
          notes: { type: "string" },
        },
        required: ["kind", "description"],
        additionalProperties: false,
      },
    },
  },
];

// ===== Handlers =====
type Ctx = { supabase: SupabaseClient; userId: string };

export async function executeReadTool(name: string, args: any, ctx: Ctx): Promise<unknown> {
  const { supabase, userId } = ctx;
  switch (name) {
    case "search_leads": {
      let q = supabase
        .from("leads")
        .select("id, code, name, email, phone, status, destination, estimated_value, currency, assigned_to, created_at")
        .order("created_at", { ascending: false })
        .limit(args.limit ?? 20);
      if (args.query) q = q.or(`name.ilike.%${args.query}%,email.ilike.%${args.query}%,phone.ilike.%${args.query}%,destination.ilike.%${args.query}%,code.ilike.%${args.query}%`);
      if (args.status) q = q.eq("status", args.status);
      if (args.assigned_to_me) q = q.eq("assigned_to", userId);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length ?? 0, leads: data };
    }
    case "get_lead": {
      let q = supabase.from("leads").select("*").limit(1);
      if (args.id) q = q.eq("id", args.id);
      else if (args.code) q = q.eq("code", args.code);
      else throw new Error("id ou code obrigatório");
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) return { found: false };
      const { data: interactions } = await supabase
        .from("interactions")
        .select("type, subject, content, occurred_at")
        .eq("lead_id", data.id)
        .order("occurred_at", { ascending: false })
        .limit(10);
      return { lead: data, recent_interactions: interactions ?? [] };
    }
    case "search_customers": {
      let q = supabase
        .from("customers")
        .select("id, code, full_name, email, phone, type, status, tags")
        .order("created_at", { ascending: false })
        .limit(args.limit ?? 20);
      if (args.query) q = q.or(`full_name.ilike.%${args.query}%,email.ilike.%${args.query}%,phone.ilike.%${args.query}%,code.ilike.%${args.query}%`);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length ?? 0, customers: data };
    }
    case "search_suppliers": {
      let q = supabase
        .from("suppliers")
        .select("*")
        .limit(args.limit ?? 20);
      if (args.query) q = q.ilike("name", `%${args.query}%`);
      if (args.city) q = q.ilike("city", `%${args.city}%`);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length ?? 0, suppliers: data };
    }
    case "search_packages": {
      let q = supabase
        .from("packages")
        .select("id, name, destination, duration_days, base_price, base_currency, active")
        .limit(args.limit ?? 20);
      if (args.destination) q = q.ilike("destination", `%${args.destination}%`);
      if (typeof args.active === "boolean") q = q.eq("active", args.active);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length ?? 0, packages: data };
    }
    case "list_bookings": {
      let q = supabase
        .from("bookings")
        .select("id, status, total_amount, currency, departure_date, return_date, customer_id, package_id, created_at")
        .order("created_at", { ascending: false })
        .limit(args.limit ?? 20);
      if (args.status) q = q.eq("status", args.status);
      if (args.customer_id) q = q.eq("customer_id", args.customer_id);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length ?? 0, bookings: data };
    }
    case "get_dashboard_metrics": {
      const days = args.days ?? 30;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data: leads } = await supabase
        .from("leads")
        .select("status, estimated_value, created_at")
        .gte("created_at", since);
      const byStatus: Record<string, number> = {};
      let totalEstimated = 0;
      (leads ?? []).forEach((l: any) => {
        byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
        if (l.estimated_value) totalEstimated += Number(l.estimated_value);
      });
      const { data: bookings } = await supabase
        .from("bookings")
        .select("total_amount, status")
        .gte("created_at", since);
      const revenue = (bookings ?? []).reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);
      return {
        period_days: days,
        leads_total: leads?.length ?? 0,
        leads_by_status: byStatus,
        leads_estimated_value: totalEstimated,
        bookings_total: bookings?.length ?? 0,
        bookings_revenue: revenue,
      };
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
