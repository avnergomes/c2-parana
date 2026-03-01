// src/types/index.ts

export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  updated_at: string
}

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  plan: 'solo' | 'pro' | 'enterprise'
  trial_end: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export type SubscriptionPlan = 'solo' | 'pro' | 'enterprise'

export interface FeatureAccess {
  clima: boolean
  noticias: boolean
  mapa_basico: boolean
  agro: boolean
  saude: boolean
  ambiente: boolean
  alertas_push: boolean
  api_access: boolean
}

export const PLAN_FEATURES: Record<SubscriptionPlan | 'trial', FeatureAccess> = {
  trial: {
    clima: true,
    noticias: true,
    mapa_basico: true,
    agro: true,
    saude: true,
    ambiente: true,
    alertas_push: false,
    api_access: false,
  },
  solo: {
    clima: true,
    noticias: true,
    mapa_basico: true,
    agro: false,
    saude: false,
    ambiente: false,
    alertas_push: false,
    api_access: false,
  },
  pro: {
    clima: true,
    noticias: true,
    mapa_basico: true,
    agro: true,
    saude: true,
    ambiente: true,
    alertas_push: true,
    api_access: true,
  },
  enterprise: {
    clima: true,
    noticias: true,
    mapa_basico: true,
    agro: true,
    saude: true,
    ambiente: true,
    alertas_push: true,
    api_access: true,
  },
}
