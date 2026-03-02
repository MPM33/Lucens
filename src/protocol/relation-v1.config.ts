// ─────────────────────────────────────────────────────────────────────────────
// Lucens – Protocole RELATION v1
// Config complète : 7 étapes, scoring, orientations, règles de court-circuit
//
// DRAFT – Les user_prompt et llm_prompt_template sont des propositions.
// Les libellés et formulations sont à valider avant mise en production.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProtocolConfig } from './types'

export const RELATION_V1: ProtocolConfig = {
  id: 'relation_v1',
  version: '1.0.0',
  name: 'Protocole RELATION',

  // ───────────────────────────────────────────────────────────────────────────
  // ORIENTATIONS
  // Triées du score le plus bas au plus haut.
  // ───────────────────────────────────────────────────────────────────────────
  orientations: [
    {
      id: 'partir_et_se_proteger',
      label: 'Partir et se protéger',
      description:
        "Le coût émotionnel de cette relation dépasse ce qu'elle vous apporte. La dynamique est toxique ou irrémédiablement stagnante. Partir n'est pas un échec — c'est un acte de lucidité.",
      score_range: [0, 35],
      action_plan_7_days: [
        'Réduire le contact à zéro ou au strict minimum',
        'Identifier une personne de confiance à qui parler cette semaine',
        'Écrire ce que vous ressentez sans filtre — pour vous, pas pour lui',
        'Ne pas prendre de décision définitive dans les 48h si vous êtes en état émotionnel intense',
      ],
      action_plan_30_days: [
        'Établir un protocole de no-contact ou de contact limité formalisé',
        'Reprendre une activité qui vous appartient entièrement (sport, créativité, social)',
        'Consulter un professionnel si la séparation génère une détresse persistante',
        "Observer vos patterns : qu'est-ce qui vous a maintenu dans cette dynamique ?",
      ],
      tracking_indicators: [
        "Niveau d'énergie quotidien (1–10)",
        'Nombre de contacts initiés vers lui',
        'Qualité du sommeil',
        'Sentiment de contrôle sur votre propre vie',
      ],
    },
    {
      id: 'distance_strategique',
      label: 'Prendre de la distance stratégique',
      description:
        "Ni rester ni partir — suspendre votre investissement émotionnel, créer un vide, observer sa réaction. Ce n'est pas une fuite. C'est un test de solidité réelle de la relation.",
      score_range: [36, 50],
      action_plan_7_days: [
        "Réduire significativement votre disponibilité (réponses moins rapides, moins d'initiatives)",
        'Ne pas expliquer ni justifier ce changement de comportement',
        "Observer : est-ce qu'il remarque ? Est-ce qu'il s'ajuste ?",
        'Reprendre une activité ou un espace social qui existait avant cette relation',
      ],
      action_plan_30_days: [
        "Evaluer l'évolution de la dynamique à 30 jours",
        "Si rien n'a changé de son côté : réévaluer via un nouveau tirage",
        `Si la dynamique s'est améliorée : passer en mode "Se repositionner"`,
        "Maintenir votre espace intérieur quelle que soit l'issue",
      ],
      tracking_indicators: [
        'Comportement de sa part : initiative, présence, cohérence',
        "Votre niveau d'anxiété liée à cette relation (1–10)",
        'Temps passé à penser à lui chaque jour',
        'Qualité de vos autres relations (amies, famille)',
      ],
    },
    {
      id: 'se_repositionner',
      label: 'Se repositionner',
      description:
        "Ne pas partir. Ne pas subir. Changer la dynamique : poser un cadre clair, réduire votre investissement émotionnel, reprendre le contrôle du rapport de force. C'est l'orientation la plus exigeante — et la plus puissante.",
      score_range: [51, 70],
      action_plan_7_days: [
        "Identifier le comportement précis qui vous coûte le plus — et décider d'une limite",
        'Communiquer cette limite une seule fois, clairement, sans négociation',
        'Observer la réaction sans interpréter immédiatement',
        "Réduire les attentes : moins d'espoir = moins de déception",
      ],
      action_plan_30_days: [
        'Maintenir la limite posée, sans exception',
        'Réinvestir dans votre propre vie (projets, relations, identité hors de lui)',
        'Évaluer à 30 jours : la dynamique a-t-elle changé après votre repositionnement ?',
        'Si non : envisager la distance stratégique ou la séparation',
      ],
      tracking_indicators: [
        'Tenue de vos limites posées (oui/non chaque jour)',
        'Réciprocité observable de sa part',
        'Sentiment de contrôle sur la relation (1–10)',
        "Niveau d'estime personnelle (1–10)",
      ],
    },
    {
      id: 'rester_en_conscience',
      label: 'Rester en conscience',
      description:
        'La relation a une base viable. Mais "rester" ne signifie pas attendre ou subir. Cela signifie rester avec lucidité, vigilance et des limites claires. Restez — mais en étant pleinement consciente de ce que vous faites et pourquoi.',
      score_range: [71, 100],
      action_plan_7_days: [
        'Nommer ce qui fonctionne bien dans cette relation — concretement',
        'Identifier un point de fragilité à surveiller',
        'Avoir une conversation directe sur un sujet évité',
        'Décider d\'un rituel de connexion régulier (pas de grand discours — un geste concret)',
      ],
      action_plan_30_days: [
        'Maintenir votre espace personnel et vos projets propres',
        'Évaluer la réciprocité : vos besoins sont-ils réellement vus ?',
        'Continuer à observer les signaux, pas seulement les intentions',
        "Refaire un tirage dans 30–60 jours pour mesurer l'évolution",
      ],
      tracking_indicators: [
        'Sentiment de sécurité émotionnelle (1–10)',
        'Réciprocité perçue (1–10)',
        'Évolution de votre estime personnelle dans cette relation',
        'Niveau de communication réelle sur les sujets sensibles',
      ],
    },
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // SCORING
  // ───────────────────────────────────────────────────────────────────────────
  scoring: {
    sub_score_weights: {
      estime: 1.5,
      epuisement: 1.4,
      investissement_percu: 1.2,
      alignement: 1.0,
    },

    // Règles de court-circuit.
    // Évaluées dans l'ordre — la première qui matche est appliquée.
    short_circuit_rules: [
      {
        id: 'burnout_esteem_crash',
        description: 'Épuisement critique (>70) ET estime effondrée (<30)',
        check: (s) => s.estime < 30 && s.epuisement > 70,
        forced_orientation: 'partir_et_se_proteger',
      },
      {
        id: 'absent_partner_degraded_dynamic',
        description: 'Investissement perçu très faible (<25) ET alignement bas (<40)',
        check: (s) => s.investissement_percu < 25 && s.alignement < 40,
        forced_orientation: 'distance_strategique',
      },
      {
        id: 'healthy_foundation',
        description: 'Estime élevée (>70) ET alignement élevé (>70) ET faible épuisement (<40)',
        check: (s) => s.estime > 70 && s.alignement > 70 && s.epuisement < 40,
        forced_orientation: 'rester_en_conscience',
      },
    ],

    gut_check_adjustment: {
      coherence_bonus: 4,    // +4 pts si l'intuition correspond à l'orientation algo
      opposition_penalty: 4, // -4 pts si opposition directe (ex: intuition=partir, algo=rester)
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // ÉTAPES DU PROTOCOLE
  // ───────────────────────────────────────────────────────────────────────────
  steps: [
    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 1 — Ce qui se passe réellement
    // Mesure : alignement (direct) + épuisement (inverse)
    // Weight : 1.0 (standard)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'realite_actuelle',
      position: 1,
      label: 'Ce qui se passe réellement',
      user_prompt: "Si vous deviez décrire cette relation en ce moment — sans l'enjoliver, sans la noircir — à quel point est-elle satisfaisante ?",
      user_hint: '1 = Très insatisfaisante | 5 = Globalement satisfaisante',
      has_free_text: true,
      step_weight: 1.0,
      scoring: {
        input_type: 'scale_1_5',
        contribution: {
          alignement: { direction: 'direct', contribution_factor: 0.8 },
          epuisement: { direction: 'inverse', contribution_factor: 0.6 },
        },
      },
      llm_prompt_template: `Tu analyses l'étape "Réalité actuelle" du Protocole RELATION.

Score donné : {{user_response}}/5
Texte libre : "{{free_text}}"

Rédige une analyse courte (3–4 phrases) qui :
- Reflète honnêtement ce que révèle ce score
- Identifie le signal principal dans le texte libre (s'il existe)
- Ne juge pas, ne rassure pas artificiellement
- Reste dans le registre de l'analyse, pas du conseil

Sois directe. Évite les généralités.`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 2 — Ce que l'autre montre (et cache)
    // Mesure : investissement_perçu (direct via choix)
    // Weight : 1.2 (important)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'dynamique_cachee',
      position: 2,
      label: "Ce que l'autre montre (et cache)",
      user_prompt: "Comment décririez-vous le comportement de l'autre dans cette relation en ce moment ?",
      user_hint: "Choisissez ce qui correspond le mieux à ce que vous observez, pas à ce que vous espérez.",
      has_free_text: true,
      step_weight: 1.2,
      scoring: {
        input_type: 'multiple_choice',
        options: [
          {
            id: 'disponible_coherent',
            label: 'Présent, attentionné, cohérent entre ses actes et ses mots',
            sub_scores: { investissement_percu: 80 },
          },
          {
            id: 'chaud_froid',
            label: 'Chaud et froid — imprévisible, souffle le chaud et le froid',
            sub_scores: { investissement_percu: 35 },
          },
          {
            id: 'distant_peu_disponible',
            label: "Distant, peu disponible, peu d'initiatives de sa part",
            sub_scores: { investissement_percu: 20 },
          },
          {
            id: 'comportements_problematiques',
            label: 'Comportements blessants, contrôlants ou irrespectueux',
            sub_scores: { investissement_percu: 10, estime: 15 },
          },
        ],
      },
      llm_prompt_template: `Tu analyses l'étape "Dynamique cachée" du Protocole RELATION.

Comportement observé : "{{user_response}}"
Texte libre : "{{free_text}}"

Rédige une analyse courte (3–4 phrases) qui :
- Nomme la dynamique relationnelle révélée par ce choix
- Identifie ce que cela signifie en termes de pouvoir et d'investissement
- Souligne ce que le texte libre révèle de supplémentaire (s'il existe)
- Ne minimise pas une dynamique toxique, ne dramatise pas une dynamique ambivalente

Reste factuelle. Les émotions de l'utilisatrice sont sa réalité, pas un problème à résoudre.`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 3 — Ce que cela vous coûte déjà
    // Mesure : épuisement (direct, primaire) + estime (inverse, secondaire)
    // Weight : 1.5 (critique)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'cout_emotionnel',
      position: 3,
      label: 'Ce que cela vous coûte déjà',
      user_prompt: "Cette relation telle qu'elle est aujourd'hui — à quel point vous coûte-t-elle émotionnellement ?",
      user_hint: '1 = Peu coûteuse, je la vis légèrement | 5 = Épuisante, elle me pèse profondément',
      has_free_text: true,
      step_weight: 1.5,
      scoring: {
        input_type: 'scale_1_5',
        contribution: {
          epuisement: { direction: 'direct', contribution_factor: 1.0 },
          estime: { direction: 'inverse', contribution_factor: 0.5 },
        },
      },
      llm_prompt_template: `Tu analyses l'étape "Coût émotionnel" du Protocole RELATION.

Score donné : {{user_response}}/5 (1=peu coûteuse, 5=épuisante)
Texte libre : "{{free_text}}"

Rédige une analyse courte (3–4 phrases) qui :
- Nomme l'impact de ce coût émotionnel sur l'énergie et les ressources disponibles
- Identifie si le texte libre révèle une forme d'épuisement niée ou minimisée
- Évalue si ce coût est proportionnel à ce que la relation apporte
- Ne valide pas un auto-sacrifice excessif comme normal

Sois directe sur le coût réel. C'est l'une des étapes les plus importantes.`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 4 — Ce que changerait une autre posture
    // Mesure : alignement (direct)
    // Weight : 1.0 (standard)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'alternative_strategique',
      position: 4,
      label: 'Ce que changerait une autre posture',
      user_prompt: 'Si vous adoptiez une posture différente — plus de distance, moins de disponibilité, des limites plus claires — à quel point cela pourrait-il modifier la dynamique ?',
      user_hint: "1 = Rien ne changerait, je ne vois pas d'alternative | 5 = Je vois clairement comment changer la donne",
      has_free_text: true,
      step_weight: 1.0,
      scoring: {
        input_type: 'scale_1_5',
        contribution: {
          alignement: { direction: 'direct', contribution_factor: 1.0 },
        },
      },
      llm_prompt_template: `Tu analyses l'étape "Alternative stratégique" du Protocole RELATION.

Score donné : {{user_response}}/5 (1=aucune alternative visible, 5=alternative clairement possible)
Texte libre : "{{free_text}}"

Rédige une analyse courte (3–4 phrases) qui :
- Évalue la capacité d'action réelle perçue par l'utilisatrice
- Identifie le blocage principal s'il y en a un (peur, habitude, attachement)
- Décrit concrètement ce qu'une posture différente implique dans ce contexte
- Ne prescrit pas — analyse les possibles

Cette étape mesure l'agentivité, pas la volonté. Reste sur ce terrain.`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 5 — Le moment critique (Maturité décisionnelle)
    // Composite : phase relationnelle + urgence ressentie + fenêtre d'influence
    // Mesure : alignement (partiel) + épuisement (partiel)
    // Weight : 0.8 (contextuel — modulateur)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'maturite_decisionnelle',
      position: 5,
      label: 'Le moment critique',
      user_prompt: 'Quelques questions pour comprendre le contexte de ce moment.',
      has_free_text: false,
      step_weight: 0.8,
      scoring: {
        input_type: 'composite',
        sub_inputs: [
          {
            id: 'phase_relationnelle',
            label: 'Depuis combien de temps cette relation existe-t-elle ?',
            input_type: 'multiple_choice',
            options: [
              {
                id: 'recent',
                label: 'Moins de 3 mois',
                sub_scores: { alignement: 50 }, // trop tôt pour être certain — prudence
              },
              {
                id: 'installation',
                label: 'Entre 3 et 12 mois',
                sub_scores: { alignement: 60 },
              },
              {
                id: 'long_terme',
                label: "Plus d'un an",
                sub_scores: { alignement: 65 }, // patterns installés — plus lisibles
              },
              {
                id: 'post_rupture',
                label: 'Après une rupture ou une tentative de retour',
                sub_scores: { alignement: 35 }, // contexte à haut risque de répétition
              },
            ],
          },
          {
            id: 'urgence_ressentie',
            label: 'À quel point sentez-vous que vous devez décider maintenant ?',
            input_type: 'scale_1_5',
            // Haute urgence = souvent signe d'épuisement ou d'impulsivité
            contribution: {
              epuisement: { direction: 'direct', contribution_factor: 0.4 },
            },
          },
          {
            id: 'fenetre_influence',
            label: 'Si vous changiez votre posture maintenant, cela pourrait-il encore modifier la dynamique ?',
            input_type: 'scale_1_5',
            // Fenêtre d'influence = capacité d'action = alignement
            contribution: {
              alignement: { direction: 'direct', contribution_factor: 0.5 },
            },
          },
        ],
      },
      llm_prompt_template: `Tu analyses l'étape "Maturité décisionnelle" du Protocole RELATION.

Phase relationnelle : {{phase_relationnelle}}
Urgence ressentie : {{urgence_ressentie}}/5
Fenêtre d'influence perçue : {{fenetre_influence}}/5

Rédige une analyse courte (3–4 phrases) qui :
- Évalue si ce moment est propice à une décision ou si l'urgence est émotionnelle plutôt que stratégique
- Identifie le risque d'une décision impulsive si l'urgence est très haute avec une estime basse
- Évalue la capacité réelle à modifier la dynamique compte tenu du contexte
- Situe la décision dans son contexte temporel (relation récente vs installée)

Cette étape protège contre les décisions prématurées. Nomme-le clairement si c'est le cas.`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 6 — L'effet sur votre valeur personnelle
    // Mesure : estime (direct, primaire)
    // Weight : 1.5 (critique)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'impact_estime',
      position: 6,
      label: "L'effet sur votre valeur personnelle",
      user_prompt: "Cette relation, telle qu'elle est en ce moment, comment affecte-t-elle votre sentiment de valeur personnelle ?",
      user_hint: '1 = Elle dégrade fortement mon estime | 5 = Elle préserve ou renforce mon estime',
      has_free_text: true,
      step_weight: 1.5,
      scoring: {
        input_type: 'scale_1_5',
        contribution: {
          estime: { direction: 'direct', contribution_factor: 1.0 },
        },
      },
      llm_prompt_template: `Tu analyses l'étape "Impact sur l'estime" du Protocole RELATION.

Score donné : {{user_response}}/5 (1=estime très dégradée, 5=estime préservée/renforcée)
Texte libre : "{{free_text}}"

Rédige une analyse courte (3–4 phrases) qui :
- Nomme directement ce que révèle ce score sur l'impact de la relation sur l'identité
- Identifie dans le texte libre des signaux d'auto-dévalorisation ou d'hypervigilance
- Relie l'impact sur l'estime à la dynamique identifiée dans les étapes précédentes
- Ne banalise pas un impact négatif élevé sur l'estime — c'est l'indicateur le plus important

C'est souvent l'étape la plus révélatrice. Traite-la avec précision.`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 7 — La direction que vous sentez (Gut-check)
    // Ne contribue pas aux sous-scores directement.
    // Produit un micro-ajustement (±4 pts) et une métrique de tension interne.
    // Weight : 0 (géré séparément dans scoring.gut_check_adjustment)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'direction_sentie',
      position: 7,
      label: 'La direction que vous sentez',
      user_prompt: "Avant de voir l'analyse complète — quelle direction ressentez-vous instinctivement ?",
      user_hint: "Il n'y a pas de bonne réponse. Votre intuition est une donnée précieuse.",
      has_free_text: false,
      step_weight: 0,
      scoring: {
        input_type: 'multiple_choice',
        options: [
          {
            id: 'rester_en_conscience',
            label: 'Rester — je pense que cette relation peut fonctionner',
            sub_scores: {},
          },
          {
            id: 'se_repositionner',
            label: 'Changer — ma posture doit évoluer pour que ça change',
            sub_scores: {},
          },
          {
            id: 'distance_strategique',
            label: "Me distancer — j'ai besoin de recul pour voir clair",
            sub_scores: {},
          },
          {
            id: 'partir_et_se_proteger',
            label: 'Partir — quelque chose me dit que je dois me protéger',
            sub_scores: {},
          },
        ],
      },
      llm_prompt_template: `Tu analyses l'écart entre l'intuition et l'analyse dans le Protocole RELATION.

Intuition de l'utilisatrice : "{{user_response}}"
Orientation calculée par le protocole : "{{algo_orientation}}"
Tension interne : {{tension_percent}}%

Rédige 4–5 phrases pour le rapport final qui :
- Nomme la cohérence ou la tension entre l'intuition et l'analyse
- Si tension élevée (>60%) : explore ce que cela révèle (auto-sabotage ? lucidité refoulée ?)
- Si cohérence forte : valide l'alignement entre ressenti et données
- Ne juge pas l'intuition — elle est légitime quelle qu'elle soit
- Termine sur ce que cette tension ou cohérence indique comme point d'attention

Exemple : "Votre intuition vous pousse à partir. Le protocole recommande un repositionnement. Cet écart révèle..."`,
    },
  ],
}
