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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          geo_location: string | null
          id: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          geo_location?: string | null
          id?: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          geo_location?: string | null
          id?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      book_covers: {
        Row: {
          book_type: string
          colegio_oficial: string | null
          created_at: string
          director_ejecucion_colegiado: string | null
          director_ejecucion_nombre: string | null
          directores_obra: Json | null
          fecha_comienzo: string | null
          id: string
          libro_numero: string | null
          project_id: string
          propietario_promotor: string | null
          updated_at: string
        }
        Insert: {
          book_type?: string
          colegio_oficial?: string | null
          created_at?: string
          director_ejecucion_colegiado?: string | null
          director_ejecucion_nombre?: string | null
          directores_obra?: Json | null
          fecha_comienzo?: string | null
          id?: string
          libro_numero?: string | null
          project_id: string
          propietario_promotor?: string | null
          updated_at?: string
        }
        Update: {
          book_type?: string
          colegio_oficial?: string | null
          created_at?: string
          director_ejecucion_colegiado?: string | null
          director_ejecucion_nombre?: string | null
          directores_obra?: Json | null
          fecha_comienzo?: string | null
          id?: string
          libro_numero?: string | null
          project_id?: string
          propietario_promotor?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_covers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_messages: {
        Row: {
          content: string
          conversation_id: string | null
          conversation_title: string | null
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          conversation_title?: string | null
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          conversation_title?: string | null
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cfo_item_files: {
        Row: {
          cfo_item_id: string
          created_at: string
          custom_title: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          project_id: string
          sort_order: number
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          cfo_item_id: string
          created_at?: string
          custom_title: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          project_id: string
          sort_order?: number
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          cfo_item_id?: string
          created_at?: string
          custom_title?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          project_id?: string
          sort_order?: number
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "cfo_item_files_cfo_item_id_fkey"
            columns: ["cfo_item_id"]
            isOneToOne: false
            referencedRelation: "cfo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfo_item_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cfo_items: {
        Row: {
          allowed_roles: string[] | null
          category: string
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by_user: string | null
          description: string | null
          file_name: string | null
          file_url: string | null
          folder_index: number
          id: string
          is_completed: boolean
          is_custom: boolean
          is_mandatory: boolean
          item_number: number | null
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          slot_type: string
          sort_order: number
          text_content: string | null
          title: string
          updated_at: string
          validated_at: string | null
          validated_by_deo: boolean | null
          volume: number
        }
        Insert: {
          allowed_roles?: string[] | null
          category: string
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by_user?: string | null
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          folder_index?: number
          id?: string
          is_completed?: boolean
          is_custom?: boolean
          is_mandatory?: boolean
          item_number?: number | null
          project_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          slot_type?: string
          sort_order?: number
          text_content?: string | null
          title: string
          updated_at?: string
          validated_at?: string | null
          validated_by_deo?: boolean | null
          volume?: number
        }
        Update: {
          allowed_roles?: string[] | null
          category?: string
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by_user?: string | null
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          folder_index?: number
          id?: string
          is_completed?: boolean
          is_custom?: boolean
          is_mandatory?: boolean
          item_number?: number | null
          project_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          slot_type?: string
          sort_order?: number
          text_content?: string | null
          title?: string
          updated_at?: string
          validated_at?: string | null
          validated_by_deo?: boolean | null
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "cfo_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cfo_lir_drafts: {
        Row: {
          category: string
          generated_at: string
          generated_by: string | null
          id: string
          inspeccion: string | null
          is_validated: boolean
          limpieza: string | null
          material_key: string
          material_label: string
          normas_uso: string | null
          project_id: string
          reparacion: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          category: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          inspeccion?: string | null
          is_validated?: boolean
          limpieza?: string | null
          material_key: string
          material_label: string
          normas_uso?: string | null
          project_id: string
          reparacion?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          category?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          inspeccion?: string | null
          is_validated?: boolean
          limpieza?: string | null
          material_key?: string
          material_label?: string
          normas_uso?: string | null
          project_id?: string
          reparacion?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfo_lir_drafts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cfo_volume1_data: {
        Row: {
          codigo_postal: string | null
          codigo_postal_ai: boolean
          created_at: string
          emplazamiento: string | null
          emplazamiento_ai: boolean
          fecha_fin_obra: string | null
          fecha_fin_obra_ai: boolean
          fecha_inicio_obra: string | null
          fecha_inicio_obra_ai: boolean
          fecha_licencia_obra: string | null
          fecha_licencia_obra_ai: boolean
          finca: string | null
          finca_ai: boolean
          folio: string | null
          folio_ai: boolean
          id: string
          last_ai_scan_at: string | null
          last_ai_scan_by: string | null
          libro: string | null
          libro_ai: boolean
          municipio: string | null
          municipio_ai: boolean
          nrc: string | null
          nrc_ai: boolean
          numero_licencia_obra: string | null
          numero_licencia_obra_ai: boolean
          numero_plantas: number | null
          numero_plantas_ai: boolean
          numero_viviendas: number | null
          numero_viviendas_ai: boolean
          poliza_decenal_compania: string | null
          poliza_decenal_compania_ai: boolean
          poliza_decenal_numero: string | null
          poliza_decenal_numero_ai: boolean
          project_id: string
          registro_numero: string | null
          registro_numero_ai: boolean
          superficie_construida: number | null
          superficie_construida_ai: boolean
          superficie_parcela: number | null
          superficie_parcela_ai: boolean
          superficie_util: number | null
          superficie_util_ai: boolean
          tomo: string | null
          tomo_ai: boolean
          updated_at: string
        }
        Insert: {
          codigo_postal?: string | null
          codigo_postal_ai?: boolean
          created_at?: string
          emplazamiento?: string | null
          emplazamiento_ai?: boolean
          fecha_fin_obra?: string | null
          fecha_fin_obra_ai?: boolean
          fecha_inicio_obra?: string | null
          fecha_inicio_obra_ai?: boolean
          fecha_licencia_obra?: string | null
          fecha_licencia_obra_ai?: boolean
          finca?: string | null
          finca_ai?: boolean
          folio?: string | null
          folio_ai?: boolean
          id?: string
          last_ai_scan_at?: string | null
          last_ai_scan_by?: string | null
          libro?: string | null
          libro_ai?: boolean
          municipio?: string | null
          municipio_ai?: boolean
          nrc?: string | null
          nrc_ai?: boolean
          numero_licencia_obra?: string | null
          numero_licencia_obra_ai?: boolean
          numero_plantas?: number | null
          numero_plantas_ai?: boolean
          numero_viviendas?: number | null
          numero_viviendas_ai?: boolean
          poliza_decenal_compania?: string | null
          poliza_decenal_compania_ai?: boolean
          poliza_decenal_numero?: string | null
          poliza_decenal_numero_ai?: boolean
          project_id: string
          registro_numero?: string | null
          registro_numero_ai?: boolean
          superficie_construida?: number | null
          superficie_construida_ai?: boolean
          superficie_parcela?: number | null
          superficie_parcela_ai?: boolean
          superficie_util?: number | null
          superficie_util_ai?: boolean
          tomo?: string | null
          tomo_ai?: boolean
          updated_at?: string
        }
        Update: {
          codigo_postal?: string | null
          codigo_postal_ai?: boolean
          created_at?: string
          emplazamiento?: string | null
          emplazamiento_ai?: boolean
          fecha_fin_obra?: string | null
          fecha_fin_obra_ai?: boolean
          fecha_inicio_obra?: string | null
          fecha_inicio_obra_ai?: boolean
          fecha_licencia_obra?: string | null
          fecha_licencia_obra_ai?: boolean
          finca?: string | null
          finca_ai?: boolean
          folio?: string | null
          folio_ai?: boolean
          id?: string
          last_ai_scan_at?: string | null
          last_ai_scan_by?: string | null
          libro?: string | null
          libro_ai?: boolean
          municipio?: string | null
          municipio_ai?: boolean
          nrc?: string | null
          nrc_ai?: boolean
          numero_licencia_obra?: string | null
          numero_licencia_obra_ai?: boolean
          numero_plantas?: number | null
          numero_plantas_ai?: boolean
          numero_viviendas?: number | null
          numero_viviendas_ai?: boolean
          poliza_decenal_compania?: string | null
          poliza_decenal_compania_ai?: boolean
          poliza_decenal_numero?: string | null
          poliza_decenal_numero_ai?: boolean
          project_id?: string
          registro_numero?: string | null
          registro_numero_ai?: boolean
          superficie_construida?: number | null
          superficie_construida_ai?: boolean
          superficie_parcela?: number | null
          superficie_parcela_ai?: boolean
          superficie_util?: number | null
          superficie_util_ai?: boolean
          tomo?: string | null
          tomo_ai?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cfo_volume1_data_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_claims: {
        Row: {
          altura: number | null
          amount: number
          anchura: number | null
          claim_number: number
          comentario: string | null
          created_at: string
          dem_signed_at: string | null
          dem_signed_by: string | null
          description: string | null
          do_signed_at: string | null
          do_signed_by: string | null
          doc_type: string | null
          file_name: string | null
          file_url: string | null
          id: string
          iva_percent: number | null
          longitud: number | null
          payment_authorized_at: string | null
          payment_authorized_by: string | null
          pem: number | null
          precio_unitario: number | null
          pro_signed_at: string | null
          pro_signed_by: string | null
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          signed_file_path: string | null
          status: string
          submitted_by: string
          technical_approved_at: string | null
          technical_approved_by: string | null
          title: string
          uds: number | null
          unidad_medida: string | null
          updated_at: string
          validation_hash: string | null
        }
        Insert: {
          altura?: number | null
          amount: number
          anchura?: number | null
          claim_number?: number
          comentario?: string | null
          created_at?: string
          dem_signed_at?: string | null
          dem_signed_by?: string | null
          description?: string | null
          do_signed_at?: string | null
          do_signed_by?: string | null
          doc_type?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          iva_percent?: number | null
          longitud?: number | null
          payment_authorized_at?: string | null
          payment_authorized_by?: string | null
          pem?: number | null
          precio_unitario?: number | null
          pro_signed_at?: string | null
          pro_signed_by?: string | null
          project_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          signed_file_path?: string | null
          status?: string
          submitted_by: string
          technical_approved_at?: string | null
          technical_approved_by?: string | null
          title: string
          uds?: number | null
          unidad_medida?: string | null
          updated_at?: string
          validation_hash?: string | null
        }
        Update: {
          altura?: number | null
          amount?: number
          anchura?: number | null
          claim_number?: number
          comentario?: string | null
          created_at?: string
          dem_signed_at?: string | null
          dem_signed_by?: string | null
          description?: string | null
          do_signed_at?: string | null
          do_signed_by?: string | null
          doc_type?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          iva_percent?: number | null
          longitud?: number | null
          payment_authorized_at?: string | null
          payment_authorized_by?: string | null
          pem?: number | null
          precio_unitario?: number | null
          pro_signed_at?: string | null
          pro_signed_by?: string | null
          project_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          signed_file_path?: string | null
          status?: string
          submitted_by?: string
          technical_approved_at?: string | null
          technical_approved_by?: string | null
          title?: string
          uds?: number | null
          unidad_medida?: string | null
          updated_at?: string
          validation_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dwg_files: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          project_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          project_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          project_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "dwg_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      gantt_milestones: {
        Row: {
          created_at: string
          end_date: string
          id: string
          project_id: string
          sort_order: number
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          project_id: string
          sort_order?: number
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          project_id?: string
          sort_order?: number
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gantt_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          asunto: string | null
          content: string
          created_at: string
          created_by: string
          dirigida_a: string | null
          escrita_por: string | null
          id: string
          incident_number: number
          is_locked: boolean | null
          photos: string[] | null
          project_id: string
          recipient_signature_geo: string | null
          recipient_signature_hash: string | null
          recipient_signature_image: string | null
          recipient_signature_type: string | null
          recipient_signed_at: string | null
          recipient_signed_by: string | null
          recipient_user_id: string | null
          remedial_actions: string | null
          resolved_at: string | null
          severity: string
          signature_geo: string | null
          signature_hash: string | null
          signature_image: string | null
          signature_type: string | null
          signed_at: string | null
          signed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asunto?: string | null
          content: string
          created_at?: string
          created_by: string
          dirigida_a?: string | null
          escrita_por?: string | null
          id?: string
          incident_number: number
          is_locked?: boolean | null
          photos?: string[] | null
          project_id: string
          recipient_signature_geo?: string | null
          recipient_signature_hash?: string | null
          recipient_signature_image?: string | null
          recipient_signature_type?: string | null
          recipient_signed_at?: string | null
          recipient_signed_by?: string | null
          recipient_user_id?: string | null
          remedial_actions?: string | null
          resolved_at?: string | null
          severity?: string
          signature_geo?: string | null
          signature_hash?: string | null
          signature_image?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asunto?: string | null
          content?: string
          created_at?: string
          created_by?: string
          dirigida_a?: string | null
          escrita_por?: string | null
          id?: string
          incident_number?: number
          is_locked?: boolean | null
          photos?: string[] | null
          project_id?: string
          recipient_signature_geo?: string | null
          recipient_signature_hash?: string | null
          recipient_signature_image?: string | null
          recipient_signature_type?: string | null
          recipient_signed_at?: string | null
          recipient_signed_by?: string | null
          recipient_user_id?: string | null
          remedial_actions?: string | null
          resolved_at?: string | null
          severity?: string
          signature_geo?: string | null
          signature_hash?: string | null
          signature_image?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      native_push_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          is_active: boolean
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          ack_geo: string | null
          acknowledged_at: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          project_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          ack_geo?: string | null
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          project_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          ack_geo?: string | null
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          project_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_steps: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          page_route: string
          role: string
          step_order: number
          target_element: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          page_route: string
          role: string
          step_order?: number
          target_element?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          page_route?: string
          role?: string
          step_order?: number
          target_element?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_validations: {
        Row: {
          geo_location: string | null
          id: string
          order_id: string
          role: string
          user_id: string
          validated_at: string
        }
        Insert: {
          geo_location?: string | null
          id?: string
          order_id: string
          role: string
          user_id: string
          validated_at?: string
        }
        Update: {
          geo_location?: string | null
          id?: string
          order_id?: string
          role?: string
          user_id?: string
          validated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_validations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          ai_flags: Json | null
          asunto: string | null
          content: string
          created_at: string
          created_by: string
          dirigida_a: string | null
          escrita_por: string | null
          id: string
          is_locked: boolean | null
          order_number: number
          photos: string[] | null
          project_id: string
          recipient_signature_geo: string | null
          recipient_signature_hash: string | null
          recipient_signature_image: string | null
          recipient_signature_type: string | null
          recipient_signed_at: string | null
          recipient_signed_by: string | null
          recipient_user_id: string | null
          requires_validation: boolean | null
          signature_geo: string | null
          signature_hash: string | null
          signature_image: string | null
          signature_type: string | null
          signed_at: string | null
          signed_by: string | null
          updated_at: string
        }
        Insert: {
          ai_flags?: Json | null
          asunto?: string | null
          content: string
          created_at?: string
          created_by: string
          dirigida_a?: string | null
          escrita_por?: string | null
          id?: string
          is_locked?: boolean | null
          order_number: number
          photos?: string[] | null
          project_id: string
          recipient_signature_geo?: string | null
          recipient_signature_hash?: string | null
          recipient_signature_image?: string | null
          recipient_signature_type?: string | null
          recipient_signed_at?: string | null
          recipient_signed_by?: string | null
          recipient_user_id?: string | null
          requires_validation?: boolean | null
          signature_geo?: string | null
          signature_hash?: string | null
          signature_image?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string
        }
        Update: {
          ai_flags?: Json | null
          asunto?: string | null
          content?: string
          created_at?: string
          created_by?: string
          dirigida_a?: string | null
          escrita_por?: string | null
          id?: string
          is_locked?: boolean | null
          order_number?: number
          photos?: string[] | null
          project_id?: string
          recipient_signature_geo?: string | null
          recipient_signature_hash?: string | null
          recipient_signature_image?: string | null
          recipient_signature_type?: string | null
          recipient_signed_at?: string | null
          recipient_signed_by?: string | null
          recipient_user_id?: string | null
          requires_validation?: boolean | null
          signature_geo?: string | null
          signature_hash?: string | null
          signature_image?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_conformities: {
        Row: {
          geo_location: string | null
          id: string
          plan_version_id: string
          role: string
          signed_at: string
          user_id: string
        }
        Insert: {
          geo_location?: string | null
          id?: string
          plan_version_id: string
          role: string
          signed_at?: string
          user_id: string
        }
        Update: {
          geo_location?: string | null
          id?: string
          plan_version_id?: string
          role?: string
          signed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_conformities_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          notes: string | null
          plan_id: string
          uploaded_by: string
          version_number: number
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          notes?: string | null
          plan_id: string
          uploaded_by: string
          version_number: number
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          notes?: string | null
          plan_id?: string
          uploaded_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          current_version: number
          description: string | null
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          current_version?: number
          description?: string | null
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          current_version?: number
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          dni_cif: string | null
          email: string | null
          fiscal_address: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"] | null
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dni_cif?: string | null
          email?: string | null
          fiscal_address?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dni_cif?: string | null
          email?: string | null
          fiscal_address?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_documents: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          project_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          project_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          project_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          accepted_at: string | null
          id: string
          invited_at: string
          invited_email: string | null
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          secondary_role: Database["public"]["Enums"]["app_role"] | null
          status: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_email?: string | null
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          secondary_role?: Database["public"]["Enums"]["app_role"] | null
          status?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_email?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          secondary_role?: Database["public"]["Enums"]["app_role"] | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          referencia_catastral: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          referencia_catastral?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          referencia_catastral?: string | null
          status?: string
          updated_at?: string
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
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      signature_document_recipients: {
        Row: {
          certificate_cn: string | null
          certificate_serial: string | null
          created_at: string
          document_id: string
          id: string
          recipient_id: string
          signature_type: string | null
          signed_at: string | null
          signed_file_path: string | null
          status: string
          validation_hash: string | null
          viewed_at: string | null
          viewed_by: string | null
        }
        Insert: {
          certificate_cn?: string | null
          certificate_serial?: string | null
          created_at?: string
          document_id: string
          id?: string
          recipient_id: string
          signature_type?: string | null
          signed_at?: string | null
          signed_file_path?: string | null
          status?: string
          validation_hash?: string | null
          viewed_at?: string | null
          viewed_by?: string | null
        }
        Update: {
          certificate_cn?: string | null
          certificate_serial?: string | null
          created_at?: string
          document_id?: string
          id?: string
          recipient_id?: string
          signature_type?: string | null
          signed_at?: string | null
          signed_file_path?: string | null
          status?: string
          validation_hash?: string | null
          viewed_at?: string | null
          viewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_document_recipients_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "signature_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_documents: {
        Row: {
          certificate_cn: string | null
          certificate_serial: string | null
          created_at: string
          file_size: number | null
          id: string
          is_info_only: boolean
          mime_type: string | null
          original_file_name: string
          original_file_path: string
          project_id: string
          recipient_id: string
          sender_id: string
          signature_type: string | null
          signed_at: string | null
          signed_file_path: string | null
          status: string
          title: string
          updated_at: string
          validation_hash: string | null
        }
        Insert: {
          certificate_cn?: string | null
          certificate_serial?: string | null
          created_at?: string
          file_size?: number | null
          id?: string
          is_info_only?: boolean
          mime_type?: string | null
          original_file_name: string
          original_file_path: string
          project_id: string
          recipient_id: string
          sender_id: string
          signature_type?: string | null
          signed_at?: string | null
          signed_file_path?: string | null
          status?: string
          title: string
          updated_at?: string
          validation_hash?: string | null
        }
        Update: {
          certificate_cn?: string | null
          certificate_serial?: string | null
          created_at?: string
          file_size?: number | null
          id?: string
          is_info_only?: boolean
          mime_type?: string | null
          original_file_name?: string
          original_file_path?: string
          project_id?: string
          recipient_id?: string
          sender_id?: string
          signature_type?: string | null
          signed_at?: string | null
          signed_file_path?: string | null
          status?: string
          title?: string
          updated_at?: string
          validation_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontracting_books: {
        Row: {
          apertura_number: string
          contractor_name: string | null
          contractor_nif: string | null
          created_at: string
          created_by: string
          css_name: string | null
          css_nif: string | null
          diligencia_generated_at: string | null
          facultative_direction_name: string | null
          facultative_direction_nif: string | null
          habilitacion_cause: string
          id: string
          is_activated: boolean
          last_annotation_number: string | null
          project_id: string
          promoter_name: string | null
          promoter_nif: string | null
          rea_number: string
          sealed_file_name: string | null
          sealed_file_path: string | null
          site_address: string | null
          site_locality: string | null
          updated_at: string
        }
        Insert: {
          apertura_number: string
          contractor_name?: string | null
          contractor_nif?: string | null
          created_at?: string
          created_by: string
          css_name?: string | null
          css_nif?: string | null
          diligencia_generated_at?: string | null
          facultative_direction_name?: string | null
          facultative_direction_nif?: string | null
          habilitacion_cause?: string
          id?: string
          is_activated?: boolean
          last_annotation_number?: string | null
          project_id: string
          promoter_name?: string | null
          promoter_nif?: string | null
          rea_number: string
          sealed_file_name?: string | null
          sealed_file_path?: string | null
          site_address?: string | null
          site_locality?: string | null
          updated_at?: string
        }
        Update: {
          apertura_number?: string
          contractor_name?: string | null
          contractor_nif?: string | null
          created_at?: string
          created_by?: string
          css_name?: string | null
          css_nif?: string | null
          diligencia_generated_at?: string | null
          facultative_direction_name?: string | null
          facultative_direction_nif?: string | null
          habilitacion_cause?: string
          id?: string
          is_activated?: boolean
          last_annotation_number?: string | null
          project_id?: string
          promoter_name?: string | null
          promoter_nif?: string | null
          rea_number?: string
          sealed_file_name?: string | null
          sealed_file_path?: string | null
          site_address?: string | null
          site_locality?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontracting_books_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontracting_entries: {
        Row: {
          book_id: string
          comitente_entry_id: string | null
          created_at: string
          created_by: string
          empresa_nif: string
          empresa_nombre: string
          entry_number: number
          fecha_comienzo: string
          fecha_plan_seguridad: string | null
          id: string
          instrucciones_seguridad: string | null
          is_locked: boolean | null
          nivel_subcontratacion: number
          objeto_contrato: string
          project_id: string
          responsable_dni: string
          responsable_nombre: string
          signature_geo: string | null
          signature_hash: string | null
          signature_image: string | null
          signature_type: string | null
          signed_at: string | null
          signed_by: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          comitente_entry_id?: string | null
          created_at?: string
          created_by: string
          empresa_nif: string
          empresa_nombre: string
          entry_number?: number
          fecha_comienzo: string
          fecha_plan_seguridad?: string | null
          id?: string
          instrucciones_seguridad?: string | null
          is_locked?: boolean | null
          nivel_subcontratacion?: number
          objeto_contrato: string
          project_id: string
          responsable_dni: string
          responsable_nombre: string
          signature_geo?: string | null
          signature_hash?: string | null
          signature_image?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          comitente_entry_id?: string | null
          created_at?: string
          created_by?: string
          empresa_nif?: string
          empresa_nombre?: string
          entry_number?: number
          fecha_comienzo?: string
          fecha_plan_seguridad?: string | null
          id?: string
          instrucciones_seguridad?: string | null
          is_locked?: boolean | null
          nivel_subcontratacion?: number
          objeto_contrato?: string
          project_id?: string
          responsable_dni?: string
          responsable_nombre?: string
          signature_geo?: string | null
          signature_hash?: string | null
          signature_image?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontracting_entries_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "subcontracting_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontracting_entries_comitente_entry_id_fkey"
            columns: ["comitente_entry_id"]
            isOneToOne: false
            referencedRelation: "subcontracting_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontracting_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_onboarding_status: {
        Row: {
          completed_at: string
          id: string
          page_route: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          page_route: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          page_route?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_auth_user: { Args: { _user_id: string }; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      extract_project_id_from_path: {
        Args: { file_path: string }
        Returns: string
      }
      get_auth_email: { Args: { _user_id: string }; Returns: string }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_admin: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_creator: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_registered_email: { Args: { _email: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "DO" | "DEM" | "CON" | "PRO" | "CSS"
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
      app_role: ["DO", "DEM", "CON", "PRO", "CSS"],
    },
  },
} as const
