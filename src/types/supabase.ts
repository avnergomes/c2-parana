// src/types/supabase.ts
// Placeholder - será gerado pelo Supabase CLI após configurar o banco

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }
      subscriptions: {
        Row: {
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
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
          plan?: 'solo' | 'pro' | 'enterprise'
          trial_end?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
          plan?: 'solo' | 'pro' | 'enterprise'
          trial_end?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      climate_data: {
        Row: {
          id: string
          station_code: string
          station_name: string | null
          municipality: string | null
          ibge_code: string | null
          latitude: number | null
          longitude: number | null
          temperature: number | null
          humidity: number | null
          pressure: number | null
          wind_speed: number | null
          wind_direction: number | null
          precipitation: number | null
          observed_at: string
          fetched_at: string
        }
        Insert: {
          id?: string
          station_code: string
          station_name?: string | null
          municipality?: string | null
          ibge_code?: string | null
          latitude?: number | null
          longitude?: number | null
          temperature?: number | null
          humidity?: number | null
          pressure?: number | null
          wind_speed?: number | null
          wind_direction?: number | null
          precipitation?: number | null
          observed_at: string
          fetched_at?: string
        }
        Update: {
          id?: string
          station_code?: string
          station_name?: string | null
          municipality?: string | null
          ibge_code?: string | null
          latitude?: number | null
          longitude?: number | null
          temperature?: number | null
          humidity?: number | null
          pressure?: number | null
          wind_speed?: number | null
          wind_direction?: number | null
          precipitation?: number | null
          observed_at?: string
          fetched_at?: string
        }
      }
      dengue_data: {
        Row: {
          id: string
          ibge_code: string
          municipality_name: string | null
          epidemiological_week: number
          year: number
          cases: number
          cases_est: number | null
          alert_level: number
          incidence_rate: number | null
          population: number | null
          fetched_at: string
        }
        Insert: {
          id?: string
          ibge_code: string
          municipality_name?: string | null
          epidemiological_week: number
          year: number
          cases?: number
          cases_est?: number | null
          alert_level?: number
          incidence_rate?: number | null
          population?: number | null
          fetched_at?: string
        }
        Update: {
          id?: string
          ibge_code?: string
          municipality_name?: string | null
          epidemiological_week?: number
          year?: number
          cases?: number
          cases_est?: number | null
          alert_level?: number
          incidence_rate?: number | null
          population?: number | null
          fetched_at?: string
        }
      }
      fire_spots: {
        Row: {
          id: string
          latitude: number
          longitude: number
          brightness: number | null
          scan: number | null
          track: number | null
          acq_date: string
          acq_time: string | null
          satellite: string | null
          instrument: string | null
          confidence: string | null
          municipality: string | null
          ibge_code: string | null
          fetched_at: string
        }
        Insert: {
          id?: string
          latitude: number
          longitude: number
          brightness?: number | null
          scan?: number | null
          track?: number | null
          acq_date: string
          acq_time?: string | null
          satellite?: string | null
          instrument?: string | null
          confidence?: string | null
          municipality?: string | null
          ibge_code?: string | null
          fetched_at?: string
        }
        Update: {
          id?: string
          latitude?: number
          longitude?: number
          brightness?: number | null
          scan?: number | null
          track?: number | null
          acq_date?: string
          acq_time?: string | null
          satellite?: string | null
          instrument?: string | null
          confidence?: string | null
          municipality?: string | null
          ibge_code?: string | null
          fetched_at?: string
        }
      }
      alerts: {
        Row: {
          id: string
          source: string
          severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
          title: string
          description: string | null
          affected_area: unknown | null
          affected_municipalities: string[] | null
          starts_at: string | null
          ends_at: string | null
          is_active: boolean
          external_id: string | null
          raw_data: unknown | null
          created_at: string
        }
        Insert: {
          id?: string
          source: string
          severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
          title: string
          description?: string | null
          affected_area?: unknown | null
          affected_municipalities?: string[] | null
          starts_at?: string | null
          ends_at?: string | null
          is_active?: boolean
          external_id?: string | null
          raw_data?: unknown | null
          created_at?: string
        }
        Update: {
          id?: string
          source?: string
          severity?: 'critical' | 'high' | 'medium' | 'low' | 'info'
          title?: string
          description?: string | null
          affected_area?: unknown | null
          affected_municipalities?: string[] | null
          starts_at?: string | null
          ends_at?: string | null
          is_active?: boolean
          external_id?: string | null
          raw_data?: unknown | null
          created_at?: string
        }
      }
      news_items: {
        Row: {
          id: string
          source: string
          title: string
          description: string | null
          url: string
          image_url: string | null
          published_at: string
          urgency: 'urgent' | 'important' | 'normal'
          category: string | null
          keywords: string[] | null
          fetched_at: string
        }
        Insert: {
          id?: string
          source: string
          title: string
          description?: string | null
          url: string
          image_url?: string | null
          published_at: string
          urgency?: 'urgent' | 'important' | 'normal'
          category?: string | null
          keywords?: string[] | null
          fetched_at?: string
        }
        Update: {
          id?: string
          source?: string
          title?: string
          description?: string | null
          url?: string
          image_url?: string | null
          published_at?: string
          urgency?: 'urgent' | 'important' | 'normal'
          category?: string | null
          keywords?: string[] | null
          fetched_at?: string
        }
      }
      legislative_items: {
        Row: {
          id: string
          external_id: string
          type: string
          number: string | null
          year: number | null
          title: string
          description: string | null
          author: string | null
          status: string | null
          url: string | null
          published_at: string | null
          fetched_at: string
        }
        Insert: {
          id?: string
          external_id: string
          type: string
          number?: string | null
          year?: number | null
          title: string
          description?: string | null
          author?: string | null
          status?: string | null
          url?: string | null
          published_at?: string | null
          fetched_at?: string
        }
        Update: {
          id?: string
          external_id?: string
          type?: string
          number?: string | null
          year?: number | null
          title?: string
          description?: string | null
          author?: string | null
          status?: string | null
          url?: string | null
          published_at?: string | null
          fetched_at?: string
        }
      }
      air_quality: {
        Row: {
          id: string
          city: string
          station_name: string | null
          aqi: number | null
          dominant_pollutant: string | null
          pm25: number | null
          pm10: number | null
          o3: number | null
          no2: number | null
          co: number | null
          observed_at: string
          fetched_at: string
        }
        Insert: {
          id?: string
          city: string
          station_name?: string | null
          aqi?: number | null
          dominant_pollutant?: string | null
          pm25?: number | null
          pm10?: number | null
          o3?: number | null
          no2?: number | null
          co?: number | null
          observed_at: string
          fetched_at?: string
        }
        Update: {
          id?: string
          city?: string
          station_name?: string | null
          aqi?: number | null
          dominant_pollutant?: string | null
          pm25?: number | null
          pm10?: number | null
          o3?: number | null
          no2?: number | null
          co?: number | null
          observed_at?: string
          fetched_at?: string
        }
      }
      river_levels: {
        Row: {
          id: string
          station_code: string
          station_name: string | null
          river_name: string | null
          municipality: string | null
          ibge_code: string | null
          latitude: number | null
          longitude: number | null
          level_cm: number | null
          flow_m3s: number | null
          alert_level: string | null
          observed_at: string
          fetched_at: string
        }
        Insert: {
          id?: string
          station_code: string
          station_name?: string | null
          river_name?: string | null
          municipality?: string | null
          ibge_code?: string | null
          latitude?: number | null
          longitude?: number | null
          level_cm?: number | null
          flow_m3s?: number | null
          alert_level?: string | null
          observed_at: string
          fetched_at?: string
        }
        Update: {
          id?: string
          station_code?: string
          station_name?: string | null
          river_name?: string | null
          municipality?: string | null
          ibge_code?: string | null
          latitude?: number | null
          longitude?: number | null
          level_cm?: number | null
          flow_m3s?: number | null
          alert_level?: string | null
          observed_at?: string
          fetched_at?: string
        }
      }
      data_cache: {
        Row: {
          cache_key: string
          source: string
          data: unknown
          fetched_at: string
        }
        Insert: {
          cache_key: string
          source: string
          data: unknown
          fetched_at?: string
        }
        Update: {
          cache_key?: string
          source?: string
          data?: unknown
          fetched_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
