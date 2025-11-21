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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      tasks: {
        Row: {
          id: number
          organizations_id: string
          created_by: string
          assigned_to: string | null
          title: string
          description: string | null
          priority: string
          type: string
          status: string
          sprint: string | null
          due_date: string | null
          time_tracked: number
          labels: string[]
          dependencies: number[]
          visibility: string
          visible_to_members: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          organizations_id: string
          created_by: string
          assigned_to?: string | null
          title: string
          description?: string | null
          priority?: string
          type?: string
          status?: string
          sprint?: string | null
          due_date?: string | null
          time_tracked?: number
          labels?: string[]
          dependencies?: number[]
          visibility?: string
          visible_to_members?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          organizations_id?: string
          created_by?: string
          assigned_to?: string | null
          title?: string
          description?: string | null
          priority?: string
          type?: string
          status?: string
          sprint?: string | null
          due_date?: string | null
          time_tracked?: number
          labels?: string[]
          dependencies?: number[]
          visibility?: string
          visible_to_members?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_organizations_id_fkey"
            columns: ["organizations_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      },
      ads: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          margin_percentage: number | null
          marketplace: string
          marketplace_id: string
          price: number
          product_id: string | null
          promo_price: number | null
          quality_score: number | null
          questions: number | null
          sales: number | null
          shipping_options: string[] | null
          sku: string
          status: string
          stock: number | null
          title: string
          updated_at: string | null
          user_id: string | null
          visits: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          margin_percentage?: number | null
          marketplace: string
          marketplace_id: string
          price: number
          product_id?: string | null
          promo_price?: number | null
          quality_score?: number | null
          questions?: number | null
          sales?: number | null
          shipping_options?: string[] | null
          sku: string
          status: string
          stock?: number | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          visits?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          margin_percentage?: number | null
          marketplace?: string
          marketplace_id?: string
          price?: number
          product_id?: string | null
          promo_price?: number | null
          quality_score?: number | null
          questions?: number | null
          sales?: number | null
          shipping_options?: string[] | null
          sku?: string
          status?: string
          stock?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          visits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      apps: {
        Row: {
          auth_url: string | null
          category: string
          client_id: string | null
          client_secret: string | null
          config: Json | null
          created_at: string | null
          description: string
          id: string
          installs: number | null
          is_connected: boolean | null
          logo_url: string | null
          name: string
          price_type: string
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          auth_url?: string | null
          category: string
          client_id?: string | null
          client_secret?: string | null
          config?: Json | null
          created_at?: string | null
          description: string
          id: string
          installs?: number | null
          is_connected?: boolean | null
          logo_url?: string | null
          name: string
          price_type: string
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          auth_url?: string | null
          category?: string
          client_id?: string | null
          client_secret?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string
          id?: string
          installs?: number | null
          is_connected?: boolean | null
          logo_url?: string | null
          name?: string
          price_type?: string
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          bairro: string
          cep: string
          certificado_a1_url: string | null
          certificado_senha: string | null
          certificado_validade: string | null
          cidade: string
          cnpj: string
          created_at: string
          email: string
          endereco: string
          estado: string
          id: string
          inscricao_estadual: string | null
          is_active: boolean
          lojas_associadas: Json | null
          numero: string
          numero_serie: string | null
          organization_id: string
          proxima_nfe: number | null
          razao_social: string
          tipo_empresa: string
          tributacao: string
          updated_at: string
        }
        Insert: {
          bairro: string
          cep: string
          certificado_a1_url?: string | null
          certificado_senha?: string | null
          certificado_validade?: string | null
          cidade: string
          cnpj: string
          created_at?: string
          email: string
          endereco: string
          estado: string
          id?: string
          inscricao_estadual?: string | null
          is_active?: boolean
          lojas_associadas?: Json | null
          numero: string
          numero_serie?: string | null
          organization_id: string
          proxima_nfe?: number | null
          razao_social: string
          tipo_empresa: string
          tributacao: string
          updated_at?: string
        }
        Update: {
          bairro?: string
          cep?: string
          certificado_a1_url?: string | null
          certificado_senha?: string | null
          certificado_validade?: string | null
          cidade?: string
          cnpj?: string
          created_at?: string
          email?: string
          endereco?: string
          estado?: string
          id?: string
          inscricao_estadual?: string | null
          is_active?: boolean
          lojas_associadas?: Json | null
          numero?: string
          numero_serie?: string | null
          organization_id?: string
          proxima_nfe?: number | null
          razao_social?: string
          tipo_empresa?: string
          tributacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_integrations: {
        Row: {
          access_token: string | null
          company_id: string
          config: Json | null
          expires_in: string | null
          id: string
          marketplace_name: string | null
          meli_user_id: number | null
          organizations_id: string | null
          refresh_token: string | null
        }
        Insert: {
          access_token?: string | null
          company_id?: string
          config?: Json | null
          expires_in?: string | null
          id?: string
          marketplace_name?: string | null
          meli_user_id?: number | null
          organizations_id?: string | null
          refresh_token?: string | null
        }
        Update: {
          access_token?: string | null
          company_id?: string
          config?: Json | null
          expires_in?: string | null
          id?: string
          marketplace_name?: string | null
          meli_user_id?: number | null
          organizations_id?: string | null
          refresh_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_integrations_organizations_id_fkey"
            columns: ["organizations_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      module_actions: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          module_id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          module_id: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          module_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_actions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "system_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          company_id: string | null
          created_at: string
          emission_date: string | null
          error_details: string | null
          id: string
          nfe_key: string | null
          nfe_number: number | null
          nfe_xml: string | null
          order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          emission_date?: string | null
          error_details?: string | null
          id?: string
          nfe_key?: string | null
          nfe_number?: number | null
          nfe_xml?: string | null
          order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          emission_date?: string | null
          error_details?: string | null
          id?: string
          nfe_key?: string | null
          nfe_number?: number | null
          nfe_xml?: string | null
          order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          company_id: string | null
          cost_per_unit: number
          created_at: string
          id: string
          order_id: string
          price_per_unit: number
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          cost_per_unit?: number
          created_at?: string
          id?: string
          order_id: string
          price_per_unit: number
          product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          cost_per_unit?: number
          created_at?: string
          id?: string
          order_id?: string
          price_per_unit?: number
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          marketplace: string | null
          marketplace_order_id: string | null
          order_cost: number
          order_total: number
          platform_id: string | null
          shipping_address: string
          shipping_city: string
          shipping_state: string
          shipping_type: string | null
          shipping_zip_code: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          marketplace?: string | null
          marketplace_order_id?: string | null
          order_cost?: number
          order_total: number
          platform_id?: string | null
          shipping_address: string
          shipping_city: string
          shipping_state: string
          shipping_type?: string | null
          shipping_zip_code: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          marketplace?: string | null
          marketplace_order_id?: string | null
          order_cost?: number
          order_total?: number
          platform_id?: string | null
          shipping_address?: string
          shipping_city?: string
          shipping_state?: string
          shipping_type?: string | null
          shipping_zip_code?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          permissions: Json | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          permissions?: Json | null
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          permissions?: Json | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          id: string
          name: string | null
          owner_user_id: string | null
        }
        Insert: {
          id?: string
          name?: string | null
          owner_user_id?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          owner_user_id?: string | null
        }
        Relationships: []
      }
      product_group_members: {
        Row: {
          created_at: string
          id: string
          product_group_id: string | null
          product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_group_id?: string | null
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_group_id?: string | null
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_variant_group_id_fkey"
            columns: ["product_group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      product_groups: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_kit_items: {
        Row: {
          created_at: string
          id: string
          kit_id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kit_id: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kit_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_kit_items_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "product_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_kit_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_kits: {
        Row: {
          created_at: string
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_kits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant: {
        Row: {
          id: string
          nome_opcao: string | null
          product_id: string
          valor_opcao: string | null
        }
        Insert: {
          id?: string
          nome_opcao?: string | null
          product_id?: string
          valor_opcao?: string | null
        }
        Update: {
          id?: string
          nome_opcao?: string | null
          product_id?: string
          valor_opcao?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: number
          brand_id: string | null
          category_id: string | null
          cest: number | null
          color: string | null
          company_id: string | null
          cost_price: number
          created_at: string
          custom_attributes: Json | null
          description: string | null
          id: string
          image_urls: string[]
          name: string
          ncm: number
          package_height: number
          package_length: number
          package_width: number
          parent_id: string | null
          sell_price: number | null
          size: string | null
          sku: string
          stock_qnt: number | null
          tax_origin_code: number
          type: string
          updated_at: string
          user_id: string | null
          weight: number | null
          weight_type: string | null
        }
        Insert: {
          barcode: number
          brand_id?: string | null
          category_id?: string | null
          cest?: number | null
          color?: string | null
          company_id?: string | null
          cost_price: number
          created_at?: string
          custom_attributes?: Json | null
          description?: string | null
          id?: string
          image_urls: string[]
          name: string
          ncm: number
          package_height: number
          package_length: number
          package_width: number
          parent_id?: string | null
          sell_price?: number | null
          size?: string | null
          sku: string
          stock_qnt?: number | null
          tax_origin_code: number
          type: string
          updated_at?: string
          user_id?: string | null
          weight?: number | null
          weight_type?: string | null
        }
        Update: {
          barcode?: number
          brand_id?: string | null
          category_id?: string | null
          cest?: number | null
          color?: string | null
          company_id?: string | null
          cost_price?: number
          created_at?: string
          custom_attributes?: Json | null
          description?: string | null
          id?: string
          image_urls?: string[]
          name?: string
          ncm?: number
          package_height?: number
          package_length?: number
          package_width?: number
          parent_id?: string | null
          sell_price?: number | null
          size?: string | null
          sku?: string
          stock_qnt?: number | null
          tax_origin_code?: number
          type?: string
          updated_at?: string
          user_id?: string | null
          weight?: number | null
          weight_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      products_stock: {
        Row: {
          apps: string | null
          company_id: string | null
          created_at: string
          current: number
          id: number
          in_transit: number | null
          product_id: string
          reserved: number | null
          storage_id: string
          updated_at: string
        }
        Insert: {
          apps?: string | null
          company_id?: string | null
          created_at?: string
          current: number
          id?: number
          in_transit?: number | null
          product_id: string
          reserved?: number | null
          storage_id: string
          updated_at?: string
        }
        Update: {
          apps?: string | null
          company_id?: string | null
          created_at?: string
          current?: number
          id?: number
          in_transit?: number | null
          product_id?: string
          reserved?: number | null
          storage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_stock_apps_fkey"
            columns: ["apps"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_stock_apps_fkey"
            columns: ["apps"]
            isOneToOne: false
            referencedRelation: "apps_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_stock_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_stock_storage_id_fkey"
            columns: ["storage_id"]
            isOneToOne: false
            referencedRelation: "storage"
            referencedColumns: ["id"]
          },
        ]
      }
      storage: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          id: string
          marketplace_id: string | null
          name: string
          organizations_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          marketplace_id?: string | null
          name: string
          organizations_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          marketplace_id?: string | null
          name?: string
          organizations_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "apps_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_organizations_id_fkey"
            columns: ["organizations_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_modules: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string | null
          id: string
          invited_by_user_id: string
          nome: string | null
          organization_id: string | null
          permissions: Json
          role: string | null
          role_to_assign: string | null
          status: string
          telefone: string | null
          token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by_user_id: string
          nome?: string | null
          organization_id?: string | null
          permissions?: Json
          role?: string | null
          role_to_assign?: string | null
          status?: string
          telefone?: string | null
          token: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by_user_id?: string
          nome?: string | null
          organization_id?: string | null
          permissions?: Json
          role?: string | null
          role_to_assign?: string | null
          status?: string
          telefone?: string | null
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organization_settings: {
        Row: {
          created_at: string
          dashboard_layout: Json | null
          default_company_id: string | null
          default_storage_id: string | null
          id: string
          organization_id: string
          quick_actions: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dashboard_layout?: Json | null
          default_company_id?: string | null
          default_storage_id?: string | null
          id?: string
          organization_id: string
          quick_actions?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dashboard_layout?: Json | null
          default_company_id?: string | null
          default_storage_id?: string | null
          id?: string
          organization_id?: string
          quick_actions?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_printing_settings: {
        Row: {
          created_at: string
          id: string
          label_format: string
          print_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label_format?: string
          print_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label_format?: string
          print_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_printing_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email_notifications: boolean | null
          id: string
          language: string | null
          notifications_enabled: boolean | null
          phone: string | null
          theme: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email_notifications?: boolean | null
          id: string
          language?: string | null
          notifications_enabled?: boolean | null
          phone?: string | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email_notifications?: boolean | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          phone?: string | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          id: string
          last_login: string | null
          name: string | null
          organization_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login?: string | null
          name?: string | null
          organization_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login?: string | null
          name?: string | null
          organization_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      apps_public_view: {
        Row: {
          auth_url: string | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          price_type: string | null
          updated_at: string | null
        }
        Insert: {
          auth_url?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          price_type?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_url?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          price_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_user_invitation: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      calculate_kit_stock: {
        Args: { kit_product_id: string }
        Returns: number
      }
      create_order_with_items: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_items: Json[]
          p_marketplace_order_id: string
          p_order_cost: number
          p_order_total: number
          p_shipping_address: string
          p_shipping_city: string
          p_shipping_state: string
          p_shipping_zip_code: string
          p_status: string
        }
        Returns: string
      }
      create_product: {
        Args:
          | {
              p_barcode: number
              p_brand_id: string
              p_category_id: string
              p_cest: number
              p_color: string
              p_cost_price: number
              p_custom_attributes: Json
              p_description: string
              p_image_urls: string[]
              p_initial_stock_quantity: number
              p_name: string
              p_ncm: number
              p_package_height: number
              p_package_length: number
              p_package_width: number
              p_sell_price: number
              p_size: string
              p_sku: string
              p_storage_id: string
              p_tax_origin_code: number
              p_weight: number
              p_weight_type: string
            }
          | {
              p_barcode: number
              p_brand_id: string
              p_category_id: string
              p_cest: number
              p_color: string
              p_cost_price: number
              p_custom_attributes: Json
              p_description: string
              p_image_urls: string[]
              p_name: string
              p_ncm: number
              p_package_height: number
              p_package_length: number
              p_package_width: number
              p_sell_price: number
              p_size: string
              p_sku: string
              p_tax_origin_code: number
              p_weight: number
              p_weight_type: string
            }
        Returns: string
      }
      create_product_variant_group: {
        Args: {
          p_brand_id: string
          p_category_id: string
          p_custom_attributes: Json
          p_description: string
          p_image_urls: string[]
          p_name: string
          p_sku_base: string
        }
        Returns: string
      }
      create_product_variant_item: {
        Args: {
          p_barcode: number
          p_cest: number
          p_color: string
          p_cost_price: number
          p_custom_attributes: Json
          p_description: string
          p_image_urls: string[]
          p_initial_stock_quantity: number
          p_name: string
          p_ncm: number
          p_package_height: number
          p_package_length: number
          p_package_width: number
          p_parent_product_id: string
          p_sell_price: number
          p_size: string
          p_sku: string
          p_storage_id: string
          p_tax_origin_code: number
          p_weight: number
          p_weight_type: string
        }
        Returns: string
      }
      create_product_with_stock: {
        Args: {
          p_barcode: number
          p_brand_id: string
          p_category_id: string
          p_cest: number
          p_color: string
          p_cost_price: number
          p_custom_attributes: Json
          p_description: string
          p_image_urls: string[]
          p_name: string
          p_ncm: number
          p_package_height: number
          p_package_length: number
          p_package_width: number
          p_sell_price: number
          p_size: string
          p_sku: string
          p_stock_current: number
          p_storage_id: string
          p_tax_origin_code: number
          p_type: string
          p_weight: number
          p_weight_type: string
        }
        Returns: string
      }
      create_user_invitation: {
        Args: {
          p_email: string
          p_nome: string
          p_permissions: Json
          p_telefone: string
        }
        Returns: string
      }
      current_user_has_module_access: {
        Args: { p_module_name: string }
        Returns: boolean
      }
      current_user_has_permission: {
        Args: { p_action_name: string; p_module_name: string }
        Returns: boolean
      }
      duplicate_product: {
        Args: { original_product_id: string }
        Returns: string
      }
      get_current_user_organization_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_my_org_members: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          invitation_id: string
          invited_by_user_id: string
          organization_id: string
          role: string
          status: string
          user_id: string
        }[]
      }
      get_my_organizations: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          name: string
          owner_user_id: string
        }[]
      }
      get_orders_for_nfe: {
        Args: { p_limit?: number; p_offset?: number; p_user_id?: string }
        Returns: {
          created_at: string
          customer_name: string
          id: string
          marketplace: string
          marketplace_order_id: string
          order_items: Json
          order_total: number
          platform_id: string
          shipping_type: string
          status: string
        }[]
      }
      get_orders_for_printing: {
        Args: { p_limit?: number; p_offset?: number; p_user_id?: string }
        Returns: {
          created_at: string
          customer_name: string
          id: string
          marketplace: string
          marketplace_order_id: string
          nfe_data: Json
          order_items: Json
          order_total: number
          platform_id: string
          shipping_type: string
          status: string
        }[]
      }
      get_user_organization_id: {
        Args: { p_user_id?: string }
        Returns: string
      }
      get_user_permissions: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: Json
      }
      get_user_printing_settings: {
        Args: { p_user_id?: string }
        Returns: {
          label_format: string
          print_type: string
        }[]
      }
      has_module_access: {
        Args: {
          p_module_name: string
          p_organization_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      has_module_permission: {
        Args: {
          p_action_name: string
          p_module_name: string
          p_organization_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      has_org_role: {
        Args: { p_org_id: string; p_roles: string[]; p_user_id: string }
        Returns: boolean
      }
      is_admin_or_master: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      link_order_stock: {
        Args: { p_order_id: string; p_storage_id_for_reservation: string }
        Returns: undefined
      }
      mark_order_as_printed: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      reserve_stock_for_order_item: {
        Args: {
          p_product_id: string
          p_quantity_to_reserve: number
          p_storage_id: string
        }
        Returns: undefined
      }
      reserve_stock_by_pack_id: {
        Args: { p_pack_id: number; p_storage_id: string }
        Returns: undefined
      }
      consume_reserved_stock_by_pack_id: {
        Args: { p_pack_id: number; p_storage_id: string }
        Returns: undefined
      }
      refund_reserved_stock_by_pack_id: {
        Args: { p_pack_id: number; p_storage_id: string }
        Returns: undefined
      }
      set_master_org_claims: {
        Args: { event: Json }
        Returns: Json
      }
      set_user_permissions: {
        Args: {
          p_organization_id: string
          p_permissions: Json
          p_user_id: string
        }
        Returns: undefined
      }
      update_order_items_and_link_stock: {
        Args: {
          p_linked_items: Json[]
          p_order_id: string
          p_storage_id_for_reservation: string
        }
        Returns: undefined
      }
      upsert_product_stock: {
        Args: {
          p_in_transit?: number
          p_product_id: string
          p_quantity: number
          p_reserved?: number
          p_storage_id: string
        }
        Returns: undefined
      }
      upsert_user_printing_settings: {
        Args: { p_label_format: string; p_print_type: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const