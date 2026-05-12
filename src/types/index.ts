export type UserRole = 'admin' | 'client'

export type OrgPlan = 'starter' | 'pro' | 'clinic'
export type OrgStatus = 'active' | 'inactive' | 'trial' | 'suspended'

export interface Organization {
  id: string
  name: string
  slug: string
  plan: OrgPlan
  status: OrgStatus
  whatsapp_numbers: string[]
  evolution_instance: string | null
  evolution_token: string | null
  chatwoot_account_id: number | null
  chatwoot_token: string | null
  chatwoot_inbox_id: number | null
  chatwoot_url: string | null
  asaas_key: string | null
  billing_email: string | null
  billing: 'mensal' | 'anual' | null
  asaas_customer_id: string | null
  asaas_subscription_id: string | null
  asaas_status: string | null
  subscription_period_end: string | null
  google_calendar_id: string | null
  agent_tone: 'formal' | 'friendly'
  max_conversations_month: number
  conversations_used: number
  created_at: string
  updated_at: string
}

export interface OrgUser {
  id: string
  org_id: string
  user_id: string
  role: 'owner' | 'manager'
  created_at: string
}

export interface Appointment {
  id: string
  org_id: string
  patient_name: string
  patient_phone: string
  specialty: string
  doctor_name: string | null
  scheduled_at: string
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed'
  google_event_id: string | null
  notes: string | null
  created_at: string
}

export interface Conversation {
  id: string
  org_id: string
  patient_phone: string
  patient_name: string | null
  started_at: string
  last_message_at: string
  message_count: number
  escalated_to_human: boolean
  chatwoot_conversation_id: string | null
}

export interface KnowledgeItem {
  id: string
  org_id: string
  type: 'faq' | 'pdf' | 'instruction'
  title: string
  content: string | null
  file_url: string | null
  specialty: string | null
  active: boolean
  created_at: string
}

export interface AgentSettings {
  id: string
  org_id: string
  agent_name: string
  greeting_message: string
  tone: 'formal' | 'friendly'
  specialties: string[]
  working_hours: { start: string; end: string; days: number[] } | null
  reminder_24h: boolean
  reminder_2h: boolean
  auto_send_pdf: boolean
  updated_at: string
}

export interface DashboardStats {
  total_conversations: number
  total_appointments: number
  escalations: number
  conversion_rate: number
  period: '7d' | '30d' | '90d'
}
