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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          active: boolean
          address: string | null
          code: string | null
          company_id: string
          created_at: string
          id: string
          manager_id: string | null
          name: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          branch_id: string | null
          code: string | null
          company_id: string
          created_at: string
          id: string
          identifier_code: string | null
          name: string
          storage_type: string | null
        }
        Insert: {
          active?: boolean
          branch_id?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          identifier_code?: string | null
          name: string
          storage_type?: string | null
        }
        Update: {
          active?: boolean
          branch_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          identifier_code?: string | null
          name?: string
          storage_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      category_packing_items: {
        Row: {
          category_name: string
          company_id: string
          cost: number
          created_at: string
          id: string
          packing_name: string
          period_id: string
        }
        Insert: {
          category_name: string
          company_id: string
          cost?: number
          created_at?: string
          id?: string
          packing_name: string
          period_id: string
        }
        Update: {
          category_name?: string
          company_id?: string
          cost?: number
          created_at?: string
          id?: string
          packing_name?: string
          period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_packing_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_packing_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "menu_costing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      category_side_costs: {
        Row: {
          category_name: string
          company_id: string
          cost: number
          cost_name: string
          created_at: string
          id: string
          period_id: string
        }
        Insert: {
          category_name: string
          company_id: string
          cost?: number
          cost_name: string
          created_at?: string
          id?: string
          period_id: string
        }
        Update: {
          category_name?: string
          company_id?: string
          cost?: number
          cost_name?: string
          created_at?: string
          id?: string
          period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_side_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_side_costs_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "menu_costing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      cost_adjustment_items: {
        Row: {
          cost_adjustment_id: string
          id: string
          name: string
          new_cost: number
          old_cost: number
          stock_item_id: string | null
          unit: string | null
        }
        Insert: {
          cost_adjustment_id: string
          id?: string
          name: string
          new_cost?: number
          old_cost?: number
          stock_item_id?: string | null
          unit?: string | null
        }
        Update: {
          cost_adjustment_id?: string
          id?: string
          name?: string
          new_cost?: number
          old_cost?: number
          stock_item_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_adjustment_items_cost_adjustment_id_fkey"
            columns: ["cost_adjustment_id"]
            isOneToOne: false
            referencedRelation: "cost_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_adjustment_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_adjustments: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          company_id: string
          created_at: string
          date: string
          id: string
          notes: string | null
          record_number: string | null
          status: string
        }
        Insert: {
          branch_id?: string | null
          branch_name?: string | null
          company_id: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          record_number?: string | null
          status?: string
        }
        Update: {
          branch_id?: string | null
          branch_name?: string | null
          company_id?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          record_number?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_adjustments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          active: boolean
          code: string | null
          company_id: string
          created_at: string
          id: string
          manager: string | null
          name: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          manager?: string | null
          name: string
        }
        Update: {
          active?: boolean
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          manager?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          active: boolean
          code: string | null
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          identifier_code: string | null
          name: string
          storage_type: string | null
        }
        Insert: {
          active?: boolean
          code?: string | null
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          identifier_code?: string | null
          name: string
          storage_type?: string | null
        }
        Update: {
          active?: boolean
          code?: string | null
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          identifier_code?: string | null
          name?: string
          storage_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      job_roles: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_costing_periods: {
        Row: {
          avg_check: number
          bills: number
          capacity: number
          company_id: string
          created_at: string
          custom_expenses: Json
          default_consumables_pct: number
          default_packing_cost: number
          end_date: string
          expected_sales: number
          id: string
          maintenance: number
          media: number
          name: string
          other_expenses: number
          rent: number
          salaries: number
          start_date: string
          status: string
          turn_over: number
        }
        Insert: {
          avg_check?: number
          bills?: number
          capacity?: number
          company_id: string
          created_at?: string
          custom_expenses?: Json
          default_consumables_pct?: number
          default_packing_cost?: number
          end_date: string
          expected_sales?: number
          id?: string
          maintenance?: number
          media?: number
          name: string
          other_expenses?: number
          rent?: number
          salaries?: number
          start_date: string
          status?: string
          turn_over?: number
        }
        Update: {
          avg_check?: number
          bills?: number
          capacity?: number
          company_id?: string
          created_at?: string
          custom_expenses?: Json
          default_consumables_pct?: number
          default_packing_cost?: number
          end_date?: string
          expected_sales?: number
          id?: string
          maintenance?: number
          media?: number
          name?: string
          other_expenses?: number
          rent?: number
          salaries?: number
          start_date?: string
          status?: string
          turn_over?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_costing_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          admin_email: string
          code: string
          created_at: string
          expires_at: string
          id: string
          used: boolean
        }
        Insert: {
          admin_email: string
          code: string
          created_at?: string
          expires_at: string
          id?: string
          used?: boolean
        }
        Update: {
          admin_email?: string
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Relationships: []
      }
      pos_item_cost_settings: {
        Row: {
          company_id: string
          consumables_pct: number | null
          created_at: string
          id: string
          packing_cost: number
          pos_item_id: string
          side_cost: number
        }
        Insert: {
          company_id: string
          consumables_pct?: number | null
          created_at?: string
          id?: string
          packing_cost?: number
          pos_item_id: string
          side_cost?: number
        }
        Update: {
          company_id?: string
          consumables_pct?: number | null
          created_at?: string
          id?: string
          packing_cost?: number
          pos_item_id?: string
          side_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_item_cost_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_item_cost_settings_pos_item_id_fkey"
            columns: ["pos_item_id"]
            isOneToOne: false
            referencedRelation: "pos_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_items: {
        Row: {
          active: boolean
          branch_id: string | null
          category: string | null
          category_id: string | null
          code: string | null
          company_id: string
          created_at: string
          id: string
          menu_engineering_class: string | null
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          branch_id?: string | null
          category?: string | null
          category_id?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          menu_engineering_class?: string | null
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          branch_id?: string | null
          category?: string | null
          category_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          menu_engineering_class?: string | null
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_items: {
        Row: {
          id: string
          pos_item_id: string | null
          quantity: number
          sale_id: string
          total: number
          unit_price: number
        }
        Insert: {
          id?: string
          pos_item_id?: string | null
          quantity?: number
          sale_id: string
          total?: number
          unit_price?: number
        }
        Update: {
          id?: string
          pos_item_id?: string | null
          quantity?: number
          sale_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_pos_item_id_fkey"
            columns: ["pos_item_id"]
            isOneToOne: false
            referencedRelation: "pos_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          date: string
          id: string
          invoice_number: string | null
          status: string
          tax_amount: number
          tax_enabled: boolean
          tax_rate: number
          total_amount: number
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          date?: string
          id?: string
          invoice_number?: string | null
          status?: string
          tax_amount?: number
          tax_enabled?: boolean
          tax_rate?: number
          total_amount?: number
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          date?: string
          id?: string
          invoice_number?: string | null
          status?: string
          tax_amount?: number
          tax_enabled?: boolean
          tax_rate?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      production_edit_history: {
        Row: {
          changes: Json
          edited_at: string
          editor_name: string | null
          id: string
          production_record_id: string
        }
        Insert: {
          changes?: Json
          edited_at?: string
          editor_name?: string | null
          id?: string
          production_record_id: string
        }
        Update: {
          changes?: Json
          edited_at?: string
          editor_name?: string | null
          id?: string
          production_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_edit_history_production_record_id_fkey"
            columns: ["production_record_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
        ]
      }
      production_ingredients: {
        Row: {
          id: string
          name: string
          production_record_id: string
          required_qty: number
          stock_item_id: string | null
          total_cost: number
          unit: string | null
          unit_cost: number
        }
        Insert: {
          id?: string
          name: string
          production_record_id: string
          required_qty?: number
          stock_item_id?: string | null
          total_cost?: number
          unit?: string | null
          unit_cost?: number
        }
        Update: {
          id?: string
          name?: string
          production_record_id?: string
          required_qty?: number
          stock_item_id?: string | null
          total_cost?: number
          unit?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_ingredients_production_record_id_fkey"
            columns: ["production_record_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_ingredients_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_recipe_ingredients: {
        Row: {
          id: string
          qty: number
          recipe_id: string
          stock_item_id: string
        }
        Insert: {
          id?: string
          qty?: number
          recipe_id: string
          stock_item_id: string
        }
        Update: {
          id?: string
          qty?: number
          recipe_id?: string
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "production_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipe_ingredients_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_recipes: {
        Row: {
          branch_id: string | null
          company_id: string
          id: string
          last_updated: string
          stock_item_id: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          id?: string
          last_updated?: string
          stock_item_id: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          id?: string
          last_updated?: string
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_recipes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipes_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_records: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          company_id: string
          created_at: string
          creator_name: string | null
          date: string
          id: string
          is_edited: boolean
          notes: string | null
          produced_qty: number
          product_id: string | null
          product_name: string
          record_number: string | null
          status: string
          total_production_cost: number
          unit: string | null
          unit_cost: number
          warehouse_id: string | null
        }
        Insert: {
          branch_id?: string | null
          branch_name?: string | null
          company_id: string
          created_at?: string
          creator_name?: string | null
          date?: string
          id?: string
          is_edited?: boolean
          notes?: string | null
          produced_qty?: number
          product_id?: string | null
          product_name: string
          record_number?: string | null
          status?: string
          total_production_cost?: number
          unit?: string | null
          unit_cost?: number
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string | null
          branch_name?: string | null
          company_id?: string
          created_at?: string
          creator_name?: string | null
          date?: string
          id?: string
          is_edited?: boolean
          notes?: string | null
          produced_qty?: number
          product_id?: string | null
          product_name?: string
          record_number?: string | null
          status?: string
          total_production_cost?: number
          unit?: string | null
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          job_role_id: string | null
          permissions: string[]
          phone: string | null
          role: string
          status: string
          subscription_end: string | null
          subscription_minutes: number | null
          subscription_start: string | null
          subscription_type: string | null
          updated_at: string
          user_code: string | null
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          job_role_id?: string | null
          permissions?: string[]
          phone?: string | null
          role?: string
          status?: string
          subscription_end?: string | null
          subscription_minutes?: number | null
          subscription_start?: string | null
          subscription_type?: string | null
          updated_at?: string
          user_code?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          job_role_id?: string | null
          permissions?: string[]
          phone?: string | null
          role?: string
          status?: string
          subscription_end?: string | null
          subscription_minutes?: number | null
          subscription_start?: string | null
          subscription_type?: string | null
          updated_at?: string
          user_code?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          id: string
          name: string
          purchase_order_id: string
          quantity: number
          stock_item_id: string | null
          total: number
          unit: string
          unit_cost: number
        }
        Insert: {
          id?: string
          name: string
          purchase_order_id: string
          quantity?: number
          stock_item_id?: string | null
          total?: number
          unit: string
          unit_cost?: number
        }
        Update: {
          id?: string
          name?: string
          purchase_order_id?: string
          quantity?: number
          stock_item_id?: string | null
          total?: number
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          creator_name: string | null
          date: string
          id: string
          invoice_number: string | null
          is_edited: boolean | null
          notes: string | null
          status: string
          supplier_id: string | null
          supplier_name: string
          total_amount: number
          warehouse_id: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          creator_name?: string | null
          date?: string
          id?: string
          invoice_number?: string | null
          is_edited?: boolean | null
          notes?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name: string
          total_amount?: number
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          creator_name?: string | null
          date?: string
          id?: string
          invoice_number?: string | null
          is_edited?: boolean | null
          notes?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          total_amount?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          qty: number
          recipe_id: string
          stock_item_id: string
        }
        Insert: {
          id?: string
          qty?: number
          recipe_id: string
          stock_item_id: string
        }
        Update: {
          id?: string
          qty?: number
          recipe_id?: string
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          branch_id: string | null
          company_id: string
          id: string
          last_updated: string
          menu_item_id: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          id?: string
          last_updated?: string
          menu_item_id: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          id?: string
          last_updated?: string
          menu_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "pos_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_item_locations: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          id: string
          stock_item_id: string
          warehouse_id: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          stock_item_id: string
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          stock_item_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_item_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_item_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_item_locations_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_item_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          active: boolean
          avg_cost: number
          category_id: string | null
          code: string | null
          company_id: string
          conversion_factor: number | null
          created_at: string
          current_stock: number
          department_id: string | null
          id: string
          max_level: number
          menu_engineering_class: string | null
          min_level: number
          name: string
          recipe_unit: string | null
          reorder_level: number
          standard_cost: number
          stock_unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avg_cost?: number
          category_id?: string | null
          code?: string | null
          company_id: string
          conversion_factor?: number | null
          created_at?: string
          current_stock?: number
          department_id?: string | null
          id?: string
          max_level?: number
          menu_engineering_class?: string | null
          min_level?: number
          name: string
          recipe_unit?: string | null
          reorder_level?: number
          standard_cost?: number
          stock_unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avg_cost?: number
          category_id?: string | null
          code?: string | null
          company_id?: string
          conversion_factor?: number | null
          created_at?: string
          current_stock?: number
          department_id?: string | null
          id?: string
          max_level?: number
          menu_engineering_class?: string | null
          min_level?: number
          name?: string
          recipe_unit?: string | null
          reorder_level?: number
          standard_cost?: number
          stock_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_edit_history: {
        Row: {
          changes: Json
          edited_at: string
          editor_name: string | null
          id: string
          stocktake_id: string
        }
        Insert: {
          changes?: Json
          edited_at?: string
          editor_name?: string | null
          id?: string
          stocktake_id: string
        }
        Update: {
          changes?: Json
          edited_at?: string
          editor_name?: string | null
          id?: string
          stocktake_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_edit_history_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "stocktakes"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_items: {
        Row: {
          avg_cost: number
          book_qty: number
          counted_qty: number
          id: string
          stock_item_id: string | null
          stocktake_id: string
        }
        Insert: {
          avg_cost?: number
          book_qty?: number
          counted_qty?: number
          id?: string
          stock_item_id?: string | null
          stocktake_id: string
        }
        Update: {
          avg_cost?: number
          book_qty?: number
          counted_qty?: number
          id?: string
          stock_item_id?: string | null
          stocktake_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "stocktakes"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktakes: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          creator_name: string | null
          date: string
          id: string
          is_edited: boolean
          notes: string | null
          record_number: string | null
          status: string
          total_actual_value: number
          type: string
          warehouse_id: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          creator_name?: string | null
          date?: string
          id?: string
          is_edited?: boolean
          notes?: string | null
          record_number?: string | null
          status?: string
          total_actual_value?: number
          type?: string
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          creator_name?: string | null
          date?: string
          id?: string
          is_edited?: boolean
          notes?: string | null
          record_number?: string | null
          status?: string
          total_actual_value?: number
          type?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktakes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktakes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktakes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_types: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          code: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          tax_id: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_id?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_items: {
        Row: {
          avg_cost: number
          code: string | null
          current_stock: number
          id: string
          name: string
          quantity: number
          stock_item_id: string | null
          total_cost: number
          transfer_id: string
          unit: string | null
        }
        Insert: {
          avg_cost?: number
          code?: string | null
          current_stock?: number
          id?: string
          name: string
          quantity?: number
          stock_item_id?: string | null
          total_cost?: number
          transfer_id: string
          unit?: string | null
        }
        Update: {
          avg_cost?: number
          code?: string | null
          current_stock?: number
          id?: string
          name?: string
          quantity?: number
          stock_item_id?: string | null
          total_cost?: number
          transfer_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          company_id: string
          created_at: string
          creator_name: string | null
          date: string
          destination_id: string | null
          destination_name: string | null
          id: string
          notes: string | null
          record_number: string | null
          source_id: string | null
          source_name: string | null
          status: string
          total_cost: number
        }
        Insert: {
          company_id: string
          created_at?: string
          creator_name?: string | null
          date?: string
          destination_id?: string | null
          destination_name?: string | null
          id?: string
          notes?: string | null
          record_number?: string | null
          source_id?: string | null
          source_name?: string | null
          status?: string
          total_cost?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          creator_name?: string | null
          date?: string
          destination_id?: string | null
          destination_name?: string | null
          id?: string
          notes?: string | null
          record_number?: string | null
          source_id?: string | null
          source_name?: string | null
          status?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_branches: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          warehouse_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          warehouse_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_branches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          active: boolean
          branch_id: string | null
          classification: string | null
          code: string | null
          company_id: string
          created_at: string
          id: string
          manager_id: string | null
          name: string
        }
        Insert: {
          active?: boolean
          branch_id?: string | null
          classification?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
        }
        Update: {
          active?: boolean
          branch_id?: string | null
          classification?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_edit_history: {
        Row: {
          changes: Json
          edited_at: string
          editor_name: string | null
          id: string
          waste_record_id: string
        }
        Insert: {
          changes?: Json
          edited_at?: string
          editor_name?: string | null
          id?: string
          waste_record_id: string
        }
        Update: {
          changes?: Json
          edited_at?: string
          editor_name?: string | null
          id?: string
          waste_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_edit_history_waste_record_id_fkey"
            columns: ["waste_record_id"]
            isOneToOne: false
            referencedRelation: "waste_records"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_items: {
        Row: {
          cost: number
          id: string
          name: string
          quantity: number
          reason: string | null
          source_product: string | null
          stock_item_id: string | null
          unit: string | null
          waste_record_id: string
        }
        Insert: {
          cost?: number
          id?: string
          name: string
          quantity?: number
          reason?: string | null
          source_product?: string | null
          stock_item_id?: string | null
          unit?: string | null
          waste_record_id: string
        }
        Update: {
          cost?: number
          id?: string
          name?: string
          quantity?: number
          reason?: string | null
          source_product?: string | null
          stock_item_id?: string | null
          unit?: string | null
          waste_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_items_waste_record_id_fkey"
            columns: ["waste_record_id"]
            isOneToOne: false
            referencedRelation: "waste_records"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_records: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          company_id: string
          created_at: string
          creator_name: string | null
          date: string
          id: string
          is_edited: boolean
          notes: string | null
          record_number: string | null
          status: string
          total_cost: number
          warehouse_id: string | null
        }
        Insert: {
          branch_id?: string | null
          branch_name?: string | null
          company_id: string
          created_at?: string
          creator_name?: string | null
          date?: string
          id?: string
          is_edited?: boolean
          notes?: string | null
          record_number?: string | null
          status?: string
          total_cost?: number
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string | null
          branch_name?: string | null
          company_id?: string
          created_at?: string
          creator_name?: string | null
          date?: string
          id?: string
          is_edited?: boolean
          notes?: string | null
          record_number?: string | null
          status?: string
          total_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waste_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_records_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_branch_code: { Args: { p_company_id: string }; Returns: string }
      generate_category_code: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_cost_adjustment_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_department_code: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_inventory_category_code: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_invoice_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_item_code: { Args: { p_company_id: string }; Returns: string }
      generate_production_record_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_purchase_invoice_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_stock_item_code: {
        Args: { p_company_id: string; p_identifier_code: string }
        Returns: string
      }
      generate_stocktake_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_supplier_code: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_transfer_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_user_code: { Args: { p_company_id: string }; Returns: string }
      generate_warehouse_code: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_waste_record_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      get_user_company_id: { Args: never; Returns: string }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "manager"
        | "owner"
        | "accountant"
        | "support"
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
      app_role: ["admin", "user", "manager", "owner", "accountant", "support"],
    },
  },
} as const
