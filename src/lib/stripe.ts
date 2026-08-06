// src/lib/stripe.ts
//
// Singleton de Stripe.js no front. Carrega o SDK uma única vez por sessão.
// Toda chamada client-side a Stripe (Elements, redirectToCheckout, etc.)
// deve passar por aqui — nunca importar `loadStripe` direto nos componentes.
import { loadStripe, type Stripe } from '@stripe/stripe-js'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined

let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!publishableKey) {
    if (import.meta.env.PROD) {
      throw new Error('VITE_STRIPE_PUBLISHABLE_KEY não configurado em produção.')
    }
    console.warn('VITE_STRIPE_PUBLISHABLE_KEY ausente. Stripe desabilitado em dev.')
    return Promise.resolve(null)
  }
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey)
  }
  return stripePromise
}
