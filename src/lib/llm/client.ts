// ─────────────────────────────────────────────────────────────────────────────
// Couche LLM — Client Anthropic
//
// Deux modèles utilisés (décision 13A) :
//   - Haiku  : étapes intermédiaires (analyse par étape, parallèle)
//   - Sonnet : assemblage final (rapport visible par l'utilisatrice)
//
// Prompt caching activé sur la partie statique des system prompts.
// max_tokens contrôlé par type de génération.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'

// Singleton pour réutiliser la connexion HTTP
let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })
  }
  return _client
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de modèles et limites
// ─────────────────────────────────────────────────────────────────────────────

export const LLM_MODELS = {
  // Étapes intermédiaires : rapide, peu cher, en parallèle
  steps: process.env.LLM_MODEL_STEPS ?? 'claude-haiku-4-5-20251001',
  // Assemblage final : meilleure qualité, visible par l'utilisatrice
  assembly: process.env.LLM_MODEL_ASSEMBLY ?? 'claude-sonnet-4-6',
} as const

export const MAX_TOKENS = {
  // Analyse par étape : 3–4 phrases (~120–180 tokens), marge à 350
  step:     350,
  // Rapport assemblé complet : 600–900 mots (~900–1200 tokens), marge à 1500
  assembly: 1500,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Système prompt statique — mis en cache via prompt caching Anthropic
//
// Ce bloc est identique pour toutes les requêtes d'étape.
// Anthropic le met en cache après la première utilisation (~1000 tokens cachés).
// Coût des tokens en cache : ~10% du coût normal.
// ─────────────────────────────────────────────────────────────────────────────

export const STEP_SYSTEM_PROMPT_STATIC = `Tu es un moteur d'analyse relationnelle du Protocole RELATION.

Le Protocole RELATION est un système structuré de décision sentimentale en 7 étapes.
Il aide les femmes à prendre des décisions claires dans des situations relationnelles ambiguës.

Les 4 orientations possibles à la fin du protocole :
- RESTER EN CONSCIENCE : relation viable, nécessite lucidité et limites
- SE REPOSITIONNER : rester mais changer la dynamique, reprendre le contrôle
- PRENDRE DE LA DISTANCE STRATÉGIQUE : suspendre l'investissement, observer la réaction
- PARTIR ET SE PROTÉGER : coût émotionnel > bénéfice, dynamique toxique

Tes règles d'analyse :
- Sois directe et précise. Évite les généralités et les formules creuses.
- Ancre chaque observation dans les données fournies, pas dans des hypothèses.
- Ne minimise pas une dynamique toxique. Ne dramatise pas une situation ambivalente.
- Ne rassure pas artificiellement. La justesse vaut mieux que le réconfort.
- Reste dans le registre de l'analyse, pas du conseil.
- Ton vocabulaire : lucide, factuel, respectueux de l'intelligence de l'utilisatrice.
- Longueur : 3 à 4 phrases maximum par étape. Pas plus.

Format de réponse attendu : texte brut, en français, sans markdown, sans titre.`

// Type étendu pour les blocs system avec prompt caching.
// cache_control est supporté par l'API Anthropic mais absent des types SDK ^0.32.
export type CacheableTextBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

export const ASSEMBLY_SYSTEM_PROMPT_STATIC = `Tu es le moteur de synthèse du Protocole RELATION.

Tu reçois les analyses de 7 étapes d'une session de décision relationnelle, ainsi que les résultats du scoring algorithmique.

Ton rôle : rédiger le rapport final de la session. Ce rapport est le cœur du produit — l'utilisatrice le lira plusieurs fois.

Contraintes de rédaction :
- Commence DIRECTEMENT par l'orientation recommandée. Pas de préambule.
- Intègre les analyses des 7 étapes sans les répéter mécaniquement — synthétise.
- Nomme la tension interne si coherence_gap est élevé (gut-check vs scoring).
- Présente le plan d'action de façon concrète et actionnable.
- Ton : direct, professionnel, chaleureux sans être condescendant.
- Longueur totale : 500 à 700 mots. Pas plus.
- Structure suggérée : Orientation → Pourquoi → Ce que ça révèle → Ce que tu fais maintenant → Dans 30 jours.
- Pas de bullet points dans le corps du texte. Présente le plan d'action en liste à la fin.
- Langue : français, vouvoiement.
- Aucun markdown, aucun titre.`
