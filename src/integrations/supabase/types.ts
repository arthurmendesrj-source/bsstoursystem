export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tenant_id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          model: string
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          model?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          model?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generated_images: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          prompt: string
          storage_path: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          prompt: string
          storage_path: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          prompt?: string
          storage_path?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generated_images_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          name: string | null
          role: string
          tenant_id: string
          tool_call_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          name?: string | null
          role: string
          tenant_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          name?: string | null
          role?: string
          tenant_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pending_actions: {
        Row: {
          action_type: string
          conversation_id: string
          created_at: string
          decided_at: string | null
          error: string | null
          id: string
          message_id: string | null
          payload: Json
          result: Json | null
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          action_type: string
          conversation_id: string
          created_at?: string
          decided_at?: string | null
          error?: string | null
          id?: string
          message_id?: string | null
          payload: Json
          result?: Json | null
          status?: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          action_type?: string
          conversation_id?: string
          created_at?: string
          decided_at?: string | null
          error?: string | null
          id?: string
          message_id?: string | null
          payload?: Json
          result?: Json | null
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pending_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pending_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pending_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_credit_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          kind: string
          note: string | null
          reference_id: string | null
          reference_type: string | null
          resource: string
          tenant_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resource: string
          tenant_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resource?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_credit_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_credit_wallet: {
        Row: {
          ai_credits: number
          storage_gb_extra: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_credits?: number
          storage_gb_extra?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_credits?: number
          storage_gb_extra?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_credit_wallet_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          address: Json
          created_at: string
          doc_number: string
          doc_type: string
          email: string
          id: string
          infinitepay_customer_id: string | null
          legal_name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: Json
          created_at?: string
          doc_number: string
          doc_type: string
          email: string
          id?: string
          infinitepay_customer_id?: string | null
          legal_name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: Json
          created_at?: string
          doc_number?: string
          doc_type?: string
          email?: string
          id?: string
          infinitepay_customer_id?: string | null
          legal_name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount_cents: number
          attempt_count: number
          boleto_url: string | null
          created_at: string
          currency: string
          due_date: string | null
          gateway: string | null
          gateway_invoice_id: string | null
          hosted_invoice_url: string | null
          id: string
          infinitepay_charge_id: string | null
          kind: string
          last_attempt_at: string | null
          last_error: string | null
          paid_at: string | null
          payment_method: string | null
          period_end: string | null
          period_start: string | null
          pix_copia_cola: string | null
          pix_qr: string | null
          status: Database["public"]["Enums"]["billing_invoice_status"]
          subscription_id: string | null
          tenant_id: string
        }
        Insert: {
          amount_cents: number
          attempt_count?: number
          boleto_url?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          gateway?: string | null
          gateway_invoice_id?: string | null
          hosted_invoice_url?: string | null
          id?: string
          infinitepay_charge_id?: string | null
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          pix_copia_cola?: string | null
          pix_qr?: string | null
          status?: Database["public"]["Enums"]["billing_invoice_status"]
          subscription_id?: string | null
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          attempt_count?: number
          boleto_url?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          gateway?: string | null
          gateway_invoice_id?: string | null
          hosted_invoice_url?: string | null
          id?: string
          infinitepay_charge_id?: string | null
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          pix_copia_cola?: string | null
          pix_qr?: string | null
          status?: Database["public"]["Enums"]["billing_invoice_status"]
          subscription_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          exp_month: number | null
          exp_year: number | null
          holder_name: string | null
          id: string
          infinitepay_card_token: string
          is_default: boolean
          last4: string | null
          tenant_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          holder_name?: string | null
          id?: string
          infinitepay_card_token: string
          is_default?: boolean
          last4?: string | null
          tenant_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          holder_name?: string | null
          id?: string
          infinitepay_card_token?: string
          is_default?: boolean
          last4?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_topups: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          infinitepay_charge_id: string | null
          invoice_id: string | null
          payment_method: string
          quantity: number
          resource: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          infinitepay_charge_id?: string | null
          invoice_id?: string | null
          payment_method: string
          quantity: number
          resource: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          infinitepay_charge_id?: string | null
          invoice_id?: string | null
          payment_method?: string
          quantity?: number
          resource?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_topups_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_topups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_item_confirmations: {
        Row: {
          booking_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          notes: string | null
          proof_email_id: string | null
          proof_reference: string | null
          proof_storage_path: string | null
          proof_text: string | null
          proof_type: string | null
          quote_item_id: string
          status: string
          supplier_id: string | null
          supplier_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          proof_email_id?: string | null
          proof_reference?: string | null
          proof_storage_path?: string | null
          proof_text?: string | null
          proof_type?: string | null
          quote_item_id: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          proof_email_id?: string | null
          proof_reference?: string | null
          proof_storage_path?: string | null
          proof_text?: string | null
          proof_type?: string | null
          quote_item_id?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_item_confirmations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pax: {
        Row: {
          booking_id: string
          created_at: string
          customer_id: string
          id: string
          is_primary: boolean
          tenant_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          customer_id: string
          id?: string
          is_primary?: boolean
          tenant_id?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_primary?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_pax_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pax_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pax_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_suppliers: {
        Row: {
          booking_id: string
          confirmation_code: string | null
          cost: number | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          notes: string | null
          service_type: string | null
          status: string | null
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          booking_id: string
          confirmation_code?: string | null
          cost?: number | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          notes?: string | null
          service_type?: string | null
          status?: string | null
          supplier_id: string
          tenant_id?: string
        }
        Update: {
          booking_id?: string
          confirmation_code?: string | null
          cost?: number | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          notes?: string | null
          service_type?: string | null
          status?: string | null
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_suppliers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string | null
          departure_date: string | null
          id: string
          lead_id: string | null
          notes: string | null
          package_date_id: string | null
          package_id: string | null
          quote_id: string | null
          return_date: string | null
          status: Database["public"]["Enums"]["booking_status"]
          supplier_id: string | null
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          departure_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          package_date_id?: string | null
          package_id?: string | null
          quote_id?: string | null
          return_date?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          supplier_id?: string | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          departure_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          package_date_id?: string | null
          package_id?: string | null
          quote_id?: string | null
          return_date?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          supplier_id?: string | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_date_id_fkey"
            columns: ["package_date_id"]
            isOneToOne: false
            referencedRelation: "package_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_country: string | null
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          birth_date: string | null
          code: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          document_number: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          gender: string | null
          id: string
          marital_status: string | null
          nationality: string | null
          notes: string | null
          origin: string | null
          passport_expiry: string | null
          passport_number: string | null
          phone: string | null
          preferences: string | null
          secondary_email: string | null
          status: Database["public"]["Enums"]["customer_status"]
          tags: string[] | null
          tax_id: string | null
          tenant_id: string
          trade_name: string | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          birth_date?: string | null
          code?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          gender?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string | null
          notes?: string | null
          origin?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string | null
          preferences?: string | null
          secondary_email?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          tags?: string[] | null
          tax_id?: string | null
          tenant_id?: string
          trade_name?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          birth_date?: string | null
          code?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string | null
          notes?: string | null
          origin?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string | null
          preferences?: string | null
          secondary_email?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          tags?: string[] | null
          tax_id?: string | null
          tenant_id?: string
          trade_name?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          imap_host: string
          imap_port: number
          imap_secure: boolean
          password_encrypted: string
          provider: string
          smtp_host: string
          smtp_port: number
          smtp_secure: boolean
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          imap_host: string
          imap_port: number
          imap_secure?: boolean
          password_encrypted: string
          provider: string
          smtp_host: string
          smtp_port: number
          smtp_secure?: boolean
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          imap_host?: string
          imap_port?: number
          imap_secure?: boolean
          password_encrypted?: string
          provider?: string
          smtp_host?: string
          smtp_port?: number
          smtp_secure?: boolean
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          base_currency: Database["public"]["Enums"]["currency_code"]
          created_at: string
          effective_date: string
          id: string
          rate: number
          target_currency: Database["public"]["Enums"]["currency_code"]
          tenant_id: string
        }
        Insert: {
          base_currency: Database["public"]["Enums"]["currency_code"]
          created_at?: string
          effective_date?: string
          id?: string
          rate: number
          target_currency: Database["public"]["Enums"]["currency_code"]
          tenant_id?: string
        }
        Update: {
          base_currency?: Database["public"]["Enums"]["currency_code"]
          created_at?: string
          effective_date?: string
          id?: string
          rate?: number
          target_currency?: Database["public"]["Enums"]["currency_code"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          lead_id: string | null
          occurred_at: string
          subject: string | null
          supplier_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          occurred_at?: string
          subject?: string | null
          supplier_id?: string | null
          tenant_id?: string
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          occurred_at?: string
          subject?: string | null
          supplier_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["interaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "interactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          booking_id: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string | null
          due_at: string | null
          fees: number
          id: string
          issued_at: string | null
          items: Json
          notes: string | null
          number: string | null
          paid_at: string | null
          parcels: Json
          payment_instructions: string | null
          quote_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          taxes: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          due_at?: string | null
          fees?: number
          id?: string
          issued_at?: string | null
          items?: Json
          notes?: string | null
          number?: string | null
          paid_at?: string | null
          parcels?: Json
          payment_instructions?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          taxes?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          due_at?: string | null
          fees?: number
          id?: string
          issued_at?: string | null
          items?: Json
          notes?: string | null
          number?: string | null
          paid_at?: string | null
          parcels?: Json
          payment_instructions?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          taxes?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      itineraries: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          customer_id: string | null
          destinations: string[] | null
          duration_days: number | null
          estimated_value: number | null
          extracted_text: string | null
          file_format: string
          file_size_bytes: number | null
          id: string
          language: string | null
          notes: string | null
          original_filename: string
          price_range: string | null
          processing_error: string | null
          processing_status: string
          season: string | null
          storage_path: string
          summary: string | null
          suppliers_mentioned: string[] | null
          tags: string[] | null
          tenant_id: string
          title: string
          trip_type: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          customer_id?: string | null
          destinations?: string[] | null
          duration_days?: number | null
          estimated_value?: number | null
          extracted_text?: string | null
          file_format: string
          file_size_bytes?: number | null
          id?: string
          language?: string | null
          notes?: string | null
          original_filename: string
          price_range?: string | null
          processing_error?: string | null
          processing_status?: string
          season?: string | null
          storage_path: string
          summary?: string | null
          suppliers_mentioned?: string[] | null
          tags?: string[] | null
          tenant_id?: string
          title: string
          trip_type?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          customer_id?: string | null
          destinations?: string[] | null
          duration_days?: number | null
          estimated_value?: number | null
          extracted_text?: string | null
          file_format?: string
          file_size_bytes?: number | null
          id?: string
          language?: string | null
          notes?: string | null
          original_filename?: string
          price_range?: string | null
          processing_error?: string | null
          processing_status?: string
          season?: string | null
          storage_path?: string
          summary?: string | null
          suppliers_mentioned?: string[] | null
          tags?: string[] | null
          tenant_id?: string
          title?: string
          trip_type?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itineraries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          itinerary_id: string
          tenant_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          itinerary_id: string
          tenant_id?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          itinerary_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_chunks_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_alert_snoozes: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          snoozed_until: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          snoozed_until: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          snoozed_until?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_alert_snoozes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          code: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          customer_id: string | null
          destination: string | null
          email: string | null
          estimated_value: number | null
          expected_travel_date: string | null
          id: string
          last_assigned_notified_at: string | null
          last_assigned_notified_to: string | null
          last_status_notified_at: string | null
          last_status_notified_value:
            | Database["public"]["Enums"]["lead_status"]
            | null
          name: string
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          customer_id?: string | null
          destination?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_travel_date?: string | null
          id?: string
          last_assigned_notified_at?: string | null
          last_assigned_notified_to?: string | null
          last_status_notified_at?: string | null
          last_status_notified_value?:
            | Database["public"]["Enums"]["lead_status"]
            | null
          name: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          customer_id?: string | null
          destination?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_travel_date?: string | null
          id?: string
          last_assigned_notified_at?: string | null
          last_assigned_notified_to?: string | null
          last_status_notified_at?: string | null
          last_status_notified_value?:
            | Database["public"]["Enums"]["lead_status"]
            | null
          name?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      license_codes: {
        Row: {
          code: string
          created_at: string
          duration_days: number
          id: string
          is_active: boolean
          max_uses: number
          plan_code: string
          redeemed_at: string | null
          redeemed_by_tenant_id: string | null
          redeemed_by_user_id: string | null
          updated_at: string
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          max_uses?: number
          plan_code: string
          redeemed_at?: string | null
          redeemed_by_tenant_id?: string | null
          redeemed_by_user_id?: string | null
          updated_at?: string
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          max_uses?: number
          plan_code?: string
          redeemed_at?: string | null
          redeemed_by_tenant_id?: string | null
          redeemed_by_user_id?: string | null
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "license_codes_redeemed_by_tenant_id_fkey"
            columns: ["redeemed_by_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          body: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          error_detail: string | null
          id: string
          lead_id: string | null
          metadata: Json
          sent_at: string
          status: Database["public"]["Enums"]["notification_status"]
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error_detail?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          sent_at?: string
          status: Database["public"]["Enums"]["notification_status"]
          tenant_id?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error_detail?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          sent_at?: string
          status?: Database["public"]["Enums"]["notification_status"]
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          push_enabled: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          push_enabled?: boolean
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          push_enabled?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_activities: {
        Row: {
          activity_date: string | null
          activity_time: string | null
          booking_id: string | null
          city: string | null
          created_at: string
          created_by: string
          description: string | null
          driver: string | null
          guide: string | null
          hotel: string | null
          id: string
          invoice_code: string | null
          kind: string
          notes: string | null
          pax_count: number | null
          pax_name: string | null
          quote_item_id: string | null
          source: string
          status: string
          supplier: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_date?: string | null
          activity_time?: string | null
          booking_id?: string | null
          city?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          driver?: string | null
          guide?: string | null
          hotel?: string | null
          id?: string
          invoice_code?: string | null
          kind?: string
          notes?: string | null
          pax_count?: number | null
          pax_name?: string | null
          quote_item_id?: string | null
          source?: string
          status?: string
          supplier?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          activity_date?: string | null
          activity_time?: string | null
          booking_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          driver?: string | null
          guide?: string | null
          hotel?: string | null
          id?: string
          invoice_code?: string | null
          kind?: string
          notes?: string | null
          pax_count?: number | null
          pax_name?: string | null
          quote_item_id?: string | null
          source?: string
          status?: string
          supplier?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_dates: {
        Row: {
          booked: number
          capacity: number
          created_at: string
          departure_date: string
          id: string
          package_id: string
          return_date: string
          tenant_id: string
        }
        Insert: {
          booked?: number
          capacity?: number
          created_at?: string
          departure_date: string
          id?: string
          package_id: string
          return_date: string
          tenant_id?: string
        }
        Update: {
          booked?: number
          capacity?: number
          created_at?: string
          departure_date?: string
          id?: string
          package_id?: string
          return_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_dates_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_dates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          active: boolean
          base_currency: Database["public"]["Enums"]["currency_code"]
          base_price: number
          created_at: string
          created_by: string | null
          description_en: string | null
          description_es: string | null
          description_pt: string | null
          destination: string
          duration_days: number
          excludes: string | null
          id: string
          includes: string | null
          name: string
          photo_url: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_currency?: Database["public"]["Enums"]["currency_code"]
          base_price: number
          created_at?: string
          created_by?: string | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          destination: string
          duration_days: number
          excludes?: string | null
          id?: string
          includes?: string | null
          name: string
          photo_url?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_currency?: Database["public"]["Enums"]["currency_code"]
          base_price?: number
          created_at?: string
          created_by?: string | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          destination?: string
          duration_days?: number
          excludes?: string | null
          id?: string
          includes?: string | null
          name?: string
          photo_url?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_modules: {
        Row: {
          created_at: string
          description: string | null
          key: string
          label: string
          sensitive_fields: Json
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label: string
          sensitive_fields?: Json
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string
          sensitive_fields?: Json
          sort_order?: number
        }
        Relationships: []
      }
      plan_addons: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          interval: string | null
          is_active: boolean | null
          metadata: Json | null
          name: string
          price_cents: number
          sort_order: number | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          interval?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          price_cents: number
          sort_order?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          interval?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          price_cents?: number
          sort_order?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      plan_one_time: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_quote: boolean | null
          name: string
          payment_split: Json | null
          price_cents: number | null
          price_max_cents: number | null
          price_min_cents: number | null
          sort_order: number | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_quote?: boolean | null
          name: string
          payment_split?: Json | null
          price_cents?: number | null
          price_max_cents?: number | null
          price_min_cents?: number | null
          sort_order?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_quote?: boolean | null
          name?: string
          payment_split?: Json | null
          price_cents?: number | null
          price_max_cents?: number | null
          price_min_cents?: number | null
          sort_order?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          extra_user_cents: number | null
          features: Json
          id: string
          included_users: number | null
          interval: Database["public"]["Enums"]["billing_interval"]
          is_active: boolean
          is_public: boolean
          is_quote: boolean | null
          name: string
          price_cents: number | null
          sort_order: number
          stripe_extra_user_price_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          extra_user_cents?: number | null
          features?: Json
          id?: string
          included_users?: number | null
          interval?: Database["public"]["Enums"]["billing_interval"]
          is_active?: boolean
          is_public?: boolean
          is_quote?: boolean | null
          name: string
          price_cents?: number | null
          sort_order?: number
          stripe_extra_user_price_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          extra_user_cents?: number | null
          features?: Json
          id?: string
          included_users?: number | null
          interval?: Database["public"]["Enums"]["billing_interval"]
          is_active?: boolean
          is_public?: boolean
          is_quote?: boolean | null
          name?: string
          price_cents?: number | null
          sort_order?: number
          stripe_extra_user_price_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          daily_followup_goal: number
          full_name: string | null
          id: string
          message_templates: Json
          phone: string | null
          preferred_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          preferred_language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          daily_followup_goal?: number
          full_name?: string | null
          id?: string
          message_templates?: Json
          phone?: string | null
          preferred_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          preferred_language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          daily_followup_goal?: number
          full_name?: string | null
          id?: string
          message_templates?: Json
          phone?: string | null
          preferred_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          preferred_language?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          tenant_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          tenant_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          tenant_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_documents: {
        Row: {
          created_at: string
          created_by: string | null
          format: string
          id: string
          include_itinerary: boolean
          language: string
          price_mode: string
          quote_id: string
          storage_path: string
          tenant_id: string
          title: string | null
          tone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          format?: string
          id?: string
          include_itinerary?: boolean
          language?: string
          price_mode?: string
          quote_id: string
          storage_path: string
          tenant_id?: string
          title?: string | null
          tone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          format?: string
          id?: string
          include_itinerary?: boolean
          language?: string
          price_mode?: string
          quote_id?: string
          storage_path?: string
          tenant_id?: string
          title?: string | null
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_documents_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_flights: {
        Row: {
          arrival_time: string | null
          created_at: string
          created_by: string | null
          departure_time: string
          flight_date: string
          flight_number: string
          from_code: string
          id: string
          notes: string | null
          pax: number
          quote_id: string
          tenant_id: string
          to_code: string
          total: number | null
          updated_at: string
        }
        Insert: {
          arrival_time?: string | null
          created_at?: string
          created_by?: string | null
          departure_time: string
          flight_date: string
          flight_number: string
          from_code: string
          id?: string
          notes?: string | null
          pax?: number
          quote_id: string
          tenant_id?: string
          to_code: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          arrival_time?: string | null
          created_at?: string
          created_by?: string | null
          departure_time?: string
          flight_date?: string
          flight_number?: string
          from_code?: string
          id?: string
          notes?: string | null
          pax?: number
          quote_id?: string
          tenant_id?: string
          to_code?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_flights_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_flights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_item_notes: {
        Row: {
          author_id: string
          category: Database["public"]["Enums"]["note_category"]
          created_at: string
          id: string
          note: string
          quote_id: string
          target_id: string
          target_kind: Database["public"]["Enums"]["note_target_kind"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category: Database["public"]["Enums"]["note_category"]
          created_at?: string
          id?: string
          note: string
          quote_id: string
          target_id: string
          target_kind: Database["public"]["Enums"]["note_target_kind"]
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: Database["public"]["Enums"]["note_category"]
          created_at?: string
          id?: string
          note?: string
          quote_id?: string
          target_id?: string
          target_kind?: Database["public"]["Enums"]["note_target_kind"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_item_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          category: string | null
          check_out: string | null
          city: string | null
          created_at: string
          description: string
          guide_type: string | null
          id: string
          item_date: string | null
          kind: string
          markup_pct: number
          meal_plan: string | null
          nights: number | null
          notes: string | null
          pax: number | null
          quantity: number
          quote_id: string
          room_config: string | null
          rooms: number | null
          tenant_id: string
          total: number
          unit_cost: number
          unit_price: number
          ways: number | null
        }
        Insert: {
          category?: string | null
          check_out?: string | null
          city?: string | null
          created_at?: string
          description: string
          guide_type?: string | null
          id?: string
          item_date?: string | null
          kind?: string
          markup_pct?: number
          meal_plan?: string | null
          nights?: number | null
          notes?: string | null
          pax?: number | null
          quantity?: number
          quote_id: string
          room_config?: string | null
          rooms?: number | null
          tenant_id?: string
          total?: number
          unit_cost?: number
          unit_price?: number
          ways?: number | null
        }
        Update: {
          category?: string | null
          check_out?: string | null
          city?: string | null
          created_at?: string
          description?: string
          guide_type?: string | null
          id?: string
          item_date?: string | null
          kind?: string
          markup_pct?: number
          meal_plan?: string | null
          nights?: number | null
          notes?: string | null
          pax?: number | null
          quantity?: number
          quote_id?: string
          room_config?: string | null
          rooms?: number | null
          tenant_id?: string
          total?: number
          unit_cost?: number
          unit_price?: number
          ways?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string | null
          default_markup_pct: number
          discount: number | null
          id: string
          lead_id: string | null
          notes: string | null
          package_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          default_markup_pct?: number
          discount?: number | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          package_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          default_markup_pct?: number
          discount?: number | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          package_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ref_cities: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          slug: string
          state: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          state?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          state?: string | null
        }
        Relationships: []
      }
      ref_service_categories: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      ref_services: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "ref_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ref_service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      role_field_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          field_key: string
          id: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          field_key: string
          id?: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          field_key?: string
          id?: string
          module_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_field_permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["key"]
          },
        ]
      }
      role_module_permissions: {
        Row: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          id: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_module_permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["key"]
          },
        ]
      }
      sla_escalations: {
        Row: {
          created_at: string
          hours_since_last_action: number
          id: string
          lead_id: string
          notified_admins: string[]
          overdue_hours_at_trigger: number
          reassigned_to: string | null
          resolution: string | null
          resolved_at: string | null
          stage: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          triggered_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hours_since_last_action: number
          id?: string
          lead_id: string
          notified_admins?: string[]
          overdue_hours_at_trigger: number
          reassigned_to?: string | null
          resolution?: string | null
          resolved_at?: string | null
          stage: Database["public"]["Enums"]["lead_status"]
          tenant_id?: string
          triggered_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hours_since_last_action?: number
          id?: string
          lead_id?: string
          notified_admins?: string[]
          overdue_hours_at_trigger?: number
          reassigned_to?: string | null
          resolution?: string | null
          resolved_at?: string | null
          stage?: Database["public"]["Enums"]["lead_status"]
          tenant_id?: string
          triggered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_settings: {
        Row: {
          id: string
          overdue_hours: number
          stage: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          warning_hours: number
        }
        Insert: {
          id?: string
          overdue_hours: number
          stage: Database["public"]["Enums"]["lead_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          warning_hours: number
        }
        Update: {
          id?: string
          overdue_hours?: number
          stage?: Database["public"]["Enums"]["lead_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          warning_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_access_log: {
        Row: {
          action: string
          bucket: string
          content_type: string | null
          created_at: string
          error_message: string | null
          file_size_bytes: number | null
          id: string
          object_path: string
          status: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          bucket: string
          content_type?: string | null
          created_at?: string
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          object_path: string
          status?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          bucket?: string
          content_type?: string | null
          created_at?: string
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          object_path?: string
          status?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscription_addons: {
        Row: {
          added_at: string | null
          addon_id: string | null
          id: string
          quantity: number | null
          stripe_subscription_item_id: string | null
          subscription_id: string | null
        }
        Insert: {
          added_at?: string | null
          addon_id?: string | null
          id?: string
          quantity?: number | null
          stripe_subscription_item_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          added_at?: string | null
          addon_id?: string | null
          id?: string
          quantity?: number | null
          stripe_subscription_item_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "plan_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          gateway: string | null
          gateway_customer_id: string | null
          gateway_subscription_id: string | null
          grace_until: string | null
          id: string
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          gateway?: string | null
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          grace_until?: string | null
          id?: string
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          gateway?: string | null
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          grace_until?: string | null
          id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      supplier_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          role: string | null
          supplier_id: string
          tenant_id: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          role?: string | null
          supplier_id: string
          tenant_id?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          role?: string | null
          supplier_id?: string
          tenant_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_documents: {
        Row: {
          contacts_extracted_at: string | null
          created_at: string
          file_format: string
          file_size_bytes: number | null
          id: string
          kind: string
          language: string | null
          notes: string | null
          original_filename: string
          rates_extracted_at: string | null
          storage_path: string
          supplier_id: string
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
          year: number | null
        }
        Insert: {
          contacts_extracted_at?: string | null
          created_at?: string
          file_format: string
          file_size_bytes?: number | null
          id?: string
          kind?: string
          language?: string | null
          notes?: string | null
          original_filename: string
          rates_extracted_at?: string | null
          storage_path: string
          supplier_id: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
          year?: number | null
        }
        Update: {
          contacts_extracted_at?: string | null
          created_at?: string
          file_format?: string
          file_size_bytes?: number | null
          id?: string
          kind?: string
          language?: string | null
          notes?: string | null
          original_filename?: string
          rates_extracted_at?: string | null
          storage_path?: string
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_rates: {
        Row: {
          category: string | null
          category_id: string | null
          city: string | null
          city_id: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          document_id: string | null
          id: string
          language: string | null
          pax_max: number | null
          pax_min: number | null
          raw_excerpt: string | null
          service_id: string | null
          service_name: string
          service_type: string | null
          supplier_id: string
          tenant_id: string
          unit: string | null
          unit_price: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          city?: string | null
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          document_id?: string | null
          id?: string
          language?: string | null
          pax_max?: number | null
          pax_min?: number | null
          raw_excerpt?: string | null
          service_id?: string | null
          service_name: string
          service_type?: string | null
          supplier_id: string
          tenant_id?: string
          unit?: string | null
          unit_price?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          city?: string | null
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          document_id?: string | null
          id?: string
          language?: string | null
          pax_max?: number | null
          pax_min?: number | null
          raw_excerpt?: string | null
          service_id?: string | null
          service_name?: string
          service_type?: string | null
          supplier_id?: string
          tenant_id?: string
          unit?: string | null
          unit_price?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_rates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ref_service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_rates_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "ref_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_rates_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "supplier_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_rates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "ref_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_country: string | null
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          cadastur: string | null
          category: Database["public"]["Enums"]["supplier_category"]
          code: string | null
          commission_pct: number | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          default_currency: Database["public"]["Enums"]["currency_code"]
          email: string | null
          iata_code: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          rating: number | null
          status: Database["public"]["Enums"]["supplier_status"]
          tags: string[] | null
          tax_id: string | null
          tenant_id: string
          trade_name: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          cadastur?: string | null
          category?: Database["public"]["Enums"]["supplier_category"]
          code?: string | null
          commission_pct?: number | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: Database["public"]["Enums"]["currency_code"]
          email?: string | null
          iata_code?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["supplier_status"]
          tags?: string[] | null
          tax_id?: string | null
          tenant_id?: string
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          cadastur?: string | null
          category?: Database["public"]["Enums"]["supplier_category"]
          code?: string | null
          commission_pct?: number | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: Database["public"]["Enums"]["currency_code"]
          email?: string | null
          iata_code?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["supplier_status"]
          tags?: string[] | null
          tax_id?: string | null
          tenant_id?: string
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          category: string
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          due_date: string | null
          email_id: string | null
          id: string
          lead_id: string | null
          notified_due_soon_at: string | null
          notified_overdue_at: string | null
          priority: string
          source: string
          started_at: string | null
          supplier_id: string | null
          tenant_id: string
          time_spent_minutes: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          email_id?: string | null
          id?: string
          lead_id?: string | null
          notified_due_soon_at?: string | null
          notified_overdue_at?: string | null
          priority?: string
          source?: string
          started_at?: string | null
          supplier_id?: string | null
          tenant_id?: string
          time_spent_minutes?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          email_id?: string | null
          id?: string
          lead_id?: string | null
          notified_due_soon_at?: string | null
          notified_overdue_at?: string | null
          priority?: string
          source?: string
          started_at?: string | null
          supplier_id?: string | null
          tenant_id?: string
          time_spent_minutes?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          host: string
          id: string
          is_primary: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          host: string
          id?: string
          is_primary?: boolean
          tenant_id: string
        }
        Update: {
          created_at?: string
          host?: string
          id?: string
          is_primary?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role_in_tenant: Database["public"]["Enums"]["tenant_member_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role_in_tenant?: Database["public"]["Enums"]["tenant_member_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role_in_tenant?: Database["public"]["Enums"]["tenant_member_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Relationships: []
      }
      usage_ai_events: {
        Row: {
          completion_tokens: number
          created_at: string
          credits_charged: number
          feature: string
          id: string
          metadata: Json
          model: string
          prompt_tokens: number
          tenant_id: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number
          created_at?: string
          credits_charged?: number
          feature: string
          id?: string
          metadata?: Json
          model: string
          prompt_tokens?: number
          tenant_id: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number
          created_at?: string
          credits_charged?: number
          feature?: string
          id?: string
          metadata?: Json
          model?: string
          prompt_tokens?: number
          tenant_id?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_ai_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_storage_daily: {
        Row: {
          bucket: string
          bytes: number
          created_at: string
          file_count: number
          id: string
          snapshot_date: string
          tenant_id: string
        }
        Insert: {
          bucket: string
          bytes?: number
          created_at?: string
          file_count?: number
          id?: string
          snapshot_date: string
          tenant_id: string
        }
        Update: {
          bucket?: string
          bytes?: number
          created_at?: string
          file_count?: number
          id?: string
          snapshot_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_storage_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          error_message: string | null
          id: string
          success: boolean
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          error_message?: string | null
          id?: string
          success?: boolean
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          error_message?: string | null
          id?: string
          success?: boolean
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      user_field_permissions: {
        Row: {
          can_edit: boolean | null
          can_view: boolean | null
          field_key: string
          id: string
          module_key: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean | null
          can_view?: boolean | null
          field_key: string
          id?: string
          module_key: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean | null
          can_view?: boolean | null
          field_key?: string
          id?: string
          module_key?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_field_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_permissions: {
        Row: {
          can_approve: boolean | null
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          id: string
          module_key: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_approve?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          id?: string
          module_key: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_approve?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          id?: string
          module_key?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voucher_send_log: {
        Row: {
          body_text: string | null
          created_at: string
          error_message: string | null
          gmail_message_id: string | null
          id: string
          sent_by: string | null
          sent_cc: string | null
          sent_to: string
          status: string
          subject: string | null
          tenant_id: string
          voucher_id: string
        }
        Insert: {
          body_text?: string | null
          created_at?: string
          error_message?: string | null
          gmail_message_id?: string | null
          id?: string
          sent_by?: string | null
          sent_cc?: string | null
          sent_to: string
          status: string
          subject?: string | null
          tenant_id?: string
          voucher_id: string
        }
        Update: {
          body_text?: string | null
          created_at?: string
          error_message?: string | null
          gmail_message_id?: string | null
          id?: string
          sent_by?: string | null
          sent_cc?: string | null
          sent_to?: string
          status?: string
          subject?: string | null
          tenant_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_send_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_send_log_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          booking_id: string
          code: string
          created_by: string | null
          customer_instructions: string | null
          emergency_contact: string | null
          id: string
          issued_at: string
          itinerary: string | null
          meeting_point: string | null
          meeting_time: string | null
          notes: string | null
          quote_item_id: string | null
          service_date: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          booking_id: string
          code: string
          created_by?: string | null
          customer_instructions?: string | null
          emergency_contact?: string | null
          id?: string
          issued_at?: string
          itinerary?: string | null
          meeting_point?: string | null
          meeting_time?: string | null
          notes?: string | null
          quote_item_id?: string | null
          service_date?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          booking_id?: string
          code?: string
          created_by?: string | null
          customer_instructions?: string | null
          emergency_contact?: string | null
          id?: string
          issued_at?: string
          itinerary?: string | null
          meeting_point?: string | null
          meeting_time?: string | null
          notes?: string | null
          quote_item_id?: string | null
          service_date?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          access_token_encrypted: string
          app_secret_encrypted: string | null
          connected_at: string
          created_at: string
          display_name: string | null
          display_phone: string
          id: string
          last_error: string | null
          phone_number_id: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
          waba_id: string
          webhook_verify_token: string
        }
        Insert: {
          access_token_encrypted: string
          app_secret_encrypted?: string | null
          connected_at?: string
          created_at?: string
          display_name?: string | null
          display_phone: string
          id?: string
          last_error?: string | null
          phone_number_id: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
          waba_id: string
          webhook_verify_token: string
        }
        Update: {
          access_token_encrypted?: string
          app_secret_encrypted?: string | null
          connected_at?: string
          created_at?: string
          display_name?: string | null
          display_phone?: string
          id?: string
          last_error?: string | null
          phone_number_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          waba_id?: string
          webhook_verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          account_id: string
          contact_name: string | null
          contact_phone: string
          created_at: string
          customer_id: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          lead_id: string | null
          tenant_id: string
          unread_count: number
          updated_at: string
          window_expires_at: string | null
        }
        Insert: {
          account_id: string
          contact_name?: string | null
          contact_phone: string
          created_at?: string
          customer_id?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          tenant_id?: string
          unread_count?: number
          updated_at?: string
          window_expires_at?: string | null
        }
        Update: {
          account_id?: string
          contact_name?: string | null
          contact_phone?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          tenant_id?: string
          unread_count?: number
          updated_at?: string
          window_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          account_id: string
          body: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_message: string | null
          id: string
          media_filename: string | null
          media_mime: string | null
          media_storage_path: string | null
          media_url: string | null
          raw: Json | null
          read_at: string | null
          sent_at: string
          sent_by: string | null
          status: string
          template_name: string | null
          tenant_id: string
          type: string
          wa_message_id: string | null
        }
        Insert: {
          account_id: string
          body?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_filename?: string | null
          media_mime?: string | null
          media_storage_path?: string | null
          media_url?: string | null
          raw?: Json | null
          read_at?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          template_name?: string | null
          tenant_id?: string
          type?: string
          wa_message_id?: string | null
        }
        Update: {
          account_id?: string
          body?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_filename?: string | null
          media_mime?: string | null
          media_storage_path?: string | null
          media_url?: string | null
          raw?: Json | null
          read_at?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          template_name?: string | null
          tenant_id?: string
          type?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          account_id: string
          category: string | null
          components: Json | null
          id: string
          language: string
          name: string
          status: string | null
          synced_at: string
          tenant_id: string
        }
        Insert: {
          account_id: string
          category?: string | null
          components?: Json | null
          id?: string
          language: string
          name: string
          status?: string | null
          synced_at?: string
          tenant_id?: string
        }
        Update: {
          account_id?: string
          category?: string | null
          components?: Json | null
          id?: string
          language?: string
          name?: string
          status?: string | null
          synced_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_supplier_rates_duplicates: {
        Row: {
          category: string | null
          city: string | null
          language: string | null
          occurrences: number | null
          pax_max: number | null
          pax_min: number | null
          prices: number[] | null
          rate_ids: string[] | null
          service_name: string | null
          supplier_id: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_supplier_rates_issues: {
        Row: {
          category: string | null
          city: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          id: string | null
          issues: string[] | null
          pax_max: number | null
          pax_min: number | null
          service_name: string | null
          supplier_id: string | null
          unit_price: number | null
        }
        Insert: {
          category?: string | null
          city?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string | null
          issues?: never
          pax_max?: number | null
          pax_min?: number | null
          service_name?: string | null
          supplier_id?: string | null
          unit_price?: number | null
        }
        Update: {
          category?: string | null
          city?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string | null
          issues?: never
          pax_max?: number | null
          pax_min?: number | null
          service_name?: string | null
          supplier_id?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_supplier_rates_validation: {
        Row: {
          empty_city: number | null
          empty_service: number | null
          pax_invalid: number | null
          supplier_id: string | null
          suspicious_long_category: number | null
          suspicious_pax_min: number | null
          total: number | null
          unmapped_category: number | null
          unmapped_city: number | null
          unmapped_service: number | null
          zero_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _notify_apikey: { Args: never; Returns: string }
      _notify_endpoint_url: { Args: never; Returns: string }
      can_access_lead: {
        Args: { _lead_id: string; _user_id: string }
        Returns: boolean
      }
      current_tenant_id: { Args: never; Returns: string }
      extract_initials: { Args: { _full_name: string }; Returns: string }
      generate_entity_code: {
        Args: { _entity: string; _user_id: string }
        Returns: string
      }
      get_subordinates: { Args: { _user_id: string }; Returns: string[] }
      has_field_permission: {
        Args: {
          _action: string
          _field: string
          _module: string
          _user_id: string
        }
        Returns: boolean
      }
      has_module_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_owned: { Args: { _created_by: string }; Returns: boolean }
      is_subordinate_of: {
        Args: { _manager: string; _target: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_billing_blocked: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_owner: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      match_itineraries: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          chunk_id: string
          chunk_index: number
          content: string
          destinations: string[]
          duration_days: number
          itinerary_id: string
          similarity: number
          title: string
          trip_type: string
        }[]
      }
      max_role_rank: { Args: { _user_id: string }; Returns: number }
      role_rank: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: number
      }
      slugify: { Args: { _t: string }; Returns: string }
      slugify_text: { Args: { input: string }; Returns: string }
      storage_path_allowed_for_user: {
        Args: { object_name: string }
        Returns: boolean
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "vendedor"
        | "operacional"
        | "financeiro"
        | "diretor"
        | "gerente"
        | "supervisor"
        | "operador"
        | "coordenador"
      billing_interval: "month" | "year"
      billing_invoice_status: "open" | "paid" | "void" | "uncollectible"
      booking_status:
        | "pre_reserva"
        | "confirmada"
        | "em_viagem"
        | "concluida"
        | "cancelada"
      currency_code: "BRL" | "USD" | "EUR"
      customer_status: "ativo" | "inativo" | "bloqueado"
      customer_type: "pf" | "pj"
      interaction_type: "ligacao" | "email" | "reuniao" | "nota" | "whatsapp"
      invoice_status:
        | "draft"
        | "pending_approval"
        | "issued"
        | "paid"
        | "overdue"
        | "cancelled"
      lead_status:
        | "novo"
        | "qualificado"
        | "cotacao"
        | "proposta"
        | "fechado"
        | "perdido"
      note_category: "operacional" | "financeiro" | "comercial"
      note_target_kind: "item" | "flight"
      notification_channel: "push" | "in_app" | "email" | "whatsapp"
      notification_event_type:
        | "lead_assigned"
        | "lead_status_changed"
        | "task_due_soon"
        | "task_overdue"
        | "sla_warning"
        | "sla_overdue"
        | "lead_escalated"
      notification_status: "success" | "error" | "skipped"
      quote_status: "rascunho" | "enviada" | "aprovada" | "rejeitada"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "suspended"
      supplier_category:
        | "hotel"
        | "aerea"
        | "receptivo"
        | "transfer"
        | "seguro"
        | "operadora"
        | "passeio"
        | "aluguel_carro"
        | "outro"
      supplier_status: "ativo" | "inativo" | "homologacao"
      tenant_member_role: "owner" | "admin" | "member"
      tenant_status: "active" | "suspended" | "canceled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "vendedor",
        "operacional",
        "financeiro",
        "diretor",
        "gerente",
        "supervisor",
        "operador",
        "coordenador",
      ],
      billing_interval: ["month", "year"],
      billing_invoice_status: ["open", "paid", "void", "uncollectible"],
      booking_status: [
        "pre_reserva",
        "confirmada",
        "em_viagem",
        "concluida",
        "cancelada",
      ],
      currency_code: ["BRL", "USD", "EUR"],
      customer_status: ["ativo", "inativo", "bloqueado"],
      customer_type: ["pf", "pj"],
      interaction_type: ["ligacao", "email", "reuniao", "nota", "whatsapp"],
      invoice_status: [
        "draft",
        "pending_approval",
        "issued",
        "paid",
        "overdue",
        "cancelled",
      ],
      lead_status: [
        "novo",
        "qualificado",
        "cotacao",
        "proposta",
        "fechado",
        "perdido",
      ],
      note_category: ["operacional", "financeiro", "comercial"],
      note_target_kind: ["item", "flight"],
      notification_channel: ["push", "in_app", "email", "whatsapp"],
      notification_event_type: [
        "lead_assigned",
        "lead_status_changed",
        "task_due_soon",
        "task_overdue",
        "sla_warning",
        "sla_overdue",
        "lead_escalated",
      ],
      notification_status: ["success", "error", "skipped"],
      quote_status: ["rascunho", "enviada", "aprovada", "rejeitada"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "suspended",
      ],
      supplier_category: [
        "hotel",
        "aerea",
        "receptivo",
        "transfer",
        "seguro",
        "operadora",
        "passeio",
        "aluguel_carro",
        "outro",
      ],
      supplier_status: ["ativo", "inativo", "homologacao"],
      tenant_member_role: ["owner", "admin", "member"],
      tenant_status: ["active", "suspended", "canceled"],
    },
  },
} as const
