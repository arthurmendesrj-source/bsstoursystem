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
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
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
          updated_at?: string
        }
        Relationships: []
      }
      booking_pax: {
        Row: {
          booking_id: string
          created_at: string
          customer_id: string
          id: string
          is_primary: boolean
        }
        Insert: {
          booking_id: string
          created_at?: string
          customer_id: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          booking_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_primary?: boolean
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
          trade_name?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      emails: {
        Row: {
          ai_suggestion: Json | null
          body_html: string | null
          body_text: string | null
          created_at: string
          customer_id: string | null
          from_email: string | null
          from_name: string | null
          gmail_id: string
          has_attachments: boolean
          id: string
          is_unread: boolean
          labels: string[] | null
          lead_id: string | null
          received_at: string | null
          snippet: string | null
          subject: string | null
          supplier_id: string | null
          thread_id: string | null
          to_emails: string[] | null
          updated_at: string
        }
        Insert: {
          ai_suggestion?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          customer_id?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_id: string
          has_attachments?: boolean
          id?: string
          is_unread?: boolean
          labels?: string[] | null
          lead_id?: string | null
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          supplier_id?: string | null
          thread_id?: string | null
          to_emails?: string[] | null
          updated_at?: string
        }
        Update: {
          ai_suggestion?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          customer_id?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_id?: string
          has_attachments?: boolean
          id?: string
          is_unread?: boolean
          labels?: string[] | null
          lead_id?: string | null
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          supplier_id?: string | null
          thread_id?: string | null
          to_emails?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency: Database["public"]["Enums"]["currency_code"]
          created_at: string
          effective_date: string
          id: string
          rate: number
          target_currency: Database["public"]["Enums"]["currency_code"]
        }
        Insert: {
          base_currency: Database["public"]["Enums"]["currency_code"]
          created_at?: string
          effective_date?: string
          id?: string
          rate: number
          target_currency: Database["public"]["Enums"]["currency_code"]
        }
        Update: {
          base_currency?: Database["public"]["Enums"]["currency_code"]
          created_at?: string
          effective_date?: string
          id?: string
          rate?: number
          target_currency?: Database["public"]["Enums"]["currency_code"]
        }
        Relationships: []
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
        ]
      }
      lead_alert_snoozes: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          snoozed_until: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          snoozed_until: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          snoozed_until?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          id: string
          invoice_code: string | null
          kind: string
          notes: string | null
          pax_name: string | null
          quote_item_id: string | null
          source: string
          status: string
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
          id?: string
          invoice_code?: string | null
          kind?: string
          notes?: string | null
          pax_name?: string | null
          quote_item_id?: string | null
          source?: string
          status?: string
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
          id?: string
          invoice_code?: string | null
          kind?: string
          notes?: string | null
          pax_name?: string | null
          quote_item_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
        }
        Insert: {
          booked?: number
          capacity?: number
          created_at?: string
          departure_date: string
          id?: string
          package_id: string
          return_date: string
        }
        Update: {
          booked?: number
          capacity?: number
          created_at?: string
          departure_date?: string
          id?: string
          package_id?: string
          return_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_dates_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
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
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
        ]
      }
      quote_items: {
        Row: {
          category: string | null
          check_out: string | null
          city: string | null
          created_at: string
          description: string
          id: string
          item_date: string | null
          kind: string
          markup_pct: number
          meal_plan: string | null
          nights: number | null
          pax: number | null
          quantity: number
          quote_id: string
          rooms: number | null
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
          id?: string
          item_date?: string | null
          kind?: string
          markup_pct?: number
          meal_plan?: string | null
          nights?: number | null
          pax?: number | null
          quantity?: number
          quote_id: string
          rooms?: number | null
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
          id?: string
          item_date?: string | null
          kind?: string
          markup_pct?: number
          meal_plan?: string | null
          nights?: number | null
          pax?: number | null
          quantity?: number
          quote_id?: string
          rooms?: number | null
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
          triggered_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sla_settings: {
        Row: {
          id: string
          overdue_hours: number
          stage: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          updated_by: string | null
          warning_hours: number
        }
        Insert: {
          id?: string
          overdue_hours: number
          stage: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          updated_by?: string | null
          warning_hours: number
        }
        Update: {
          id?: string
          overdue_hours?: number
          stage?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          updated_by?: string | null
          warning_hours?: number
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
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
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
      vouchers: {
        Row: {
          booking_id: string
          code: string
          emergency_contact: string | null
          id: string
          issued_at: string
          itinerary: string | null
        }
        Insert: {
          booking_id: string
          code: string
          emergency_contact?: string | null
          id?: string
          issued_at?: string
          itinerary?: string | null
        }
        Update: {
          booking_id?: string
          code?: string
          emergency_contact?: string | null
          id?: string
          issued_at?: string
          itinerary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _notify_apikey: { Args: never; Returns: string }
      _notify_endpoint_url: { Args: never; Returns: string }
      can_access_lead: {
        Args: { _lead_id: string; _user_id: string }
        Returns: boolean
      }
      extract_initials: { Args: { _full_name: string }; Returns: string }
      generate_entity_code: {
        Args: { _entity: string; _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "operacional" | "financeiro"
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
      lead_status:
        | "novo"
        | "qualificado"
        | "cotacao"
        | "proposta"
        | "fechado"
        | "perdido"
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
      app_role: ["admin", "vendedor", "operacional", "financeiro"],
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
      lead_status: [
        "novo",
        "qualificado",
        "cotacao",
        "proposta",
        "fechado",
        "perdido",
      ],
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
    },
  },
} as const
