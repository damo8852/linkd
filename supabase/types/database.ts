
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "alert_recipients": {
                  Row: {
                    "alert_id": string,"contact_id": string | null,"delivery_error": string | null,"delivery_status": string | null,"error": string | null,"name": string,"phone_e164": string,"provider_message_id": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "alert_id": string,"contact_id"?: string | null,"delivery_error"?: string | null,"delivery_status"?: string | null,"error"?: string | null,"name": string,"phone_e164": string,"provider_message_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "alert_id"?: string,"contact_id"?: string | null,"delivery_error"?: string | null,"delivery_status"?: string | null,"error"?: string | null,"name"?: string,"phone_e164"?: string,"provider_message_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alert_recipients_alert_id_fkey"
      columns: ["alert_id"]
isOneToOne: false
      referencedRelation: "alerts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alert_recipients_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "emergency_contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"alerts": {
                  Row: {
                    "accuracy_m": number | null,"created_at": string,"id": string,"latitude": number | null,"located_at": string | null,"longitude": number | null,"trigger": string,"triggered_at": string,"user_id": string
                  }
                  Insert: {
                    "accuracy_m"?: number | null,"created_at"?: string,"id": string,"latitude"?: number | null,"located_at"?: string | null,"longitude"?: number | null,"trigger": string,"triggered_at": string,"user_id": string
                  }
                  Update: {
                    "accuracy_m"?: number | null,"created_at"?: string,"id"?: string,"latitude"?: number | null,"located_at"?: string | null,"longitude"?: number | null,"trigger"?: string,"triggered_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"emergency_contacts": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"phone_e164": string,"status": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"phone_e164": string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"phone_e164"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"dispatch_enabled": boolean,"display_name": string,"phone_e164": string,"phone_verified": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"dispatch_enabled"?: boolean,"display_name": string,"phone_e164": string,"phone_verified"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"dispatch_enabled"?: boolean,"display_name"?: string,"phone_e164"?: string,"phone_verified"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_alert_recipients":
{ Args: { "p_alert_id": string }; Returns: {
              "phone_e164": string
            }[]
                           },
"record_alert_delivery":
{ Args: { "p_error_code": string,"p_provider_message_id": string,"p_status": string }; Returns: boolean
                           },
"record_alert_recipient":
{ Args: { "p_alert_id": string,"p_error": string,"p_phone_e164": string,"p_provider_message_id": string,"p_status": string }; Returns: undefined
                           },
"start_alert":
{ Args: { "p_accuracy_m": number,"p_id": string,"p_latitude": number,"p_located_at": string,"p_longitude": number,"p_trigger": string,"p_triggered_at": string,"p_user_id": string }; Returns: {
              "display_name": string,"phone_e164": string,"recipient_count": number
            }[]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

