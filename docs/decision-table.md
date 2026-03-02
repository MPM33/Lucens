# Table de décision — Protocole RELATION v1

Document de référence humain-lisible.
Source de vérité pour les tests unitaires.
Toute modification du moteur de scoring doit se refléter ici en premier.

---

## Orientations finales

| Score final | Orientation | Description courte |
|------------|-------------|-------------------|
| 0–35 | **Partir et se protéger** | Coût > bénéfice. Dynamique toxique ou stagnante. |
| 36–50 | **Prendre de la distance stratégique** | Ni rester ni partir. Suspendre, observer, tester. |
| 51–70 | **Se repositionner** | Rester, mais changer la dynamique. Reprendre le contrôle. |
| 71–100 | **Rester en conscience** | Base viable. Rester avec lucidité et limites claires. |

---

## Sous-scores (0–100 chacun)

| Sous-score | Ce qu'il mesure | Plus c'est haut = |
|-----------|----------------|------------------|
| `alignement` | La relation est-elle viable ? Y a-t-il une base ? | Meilleur |
| `epuisement` | Quel coût émotionnel ? Quelle charge ? | **Pire** (inversé dans le score final) |
| `investissement_percu` | L'autre investit-il réellement ? | Meilleur |
| `estime` | Quel impact sur la valeur personnelle ? | Meilleur |

### Pondération des sous-scores dans le score final

```
score_final = (estime × 1.5 + (100 - epuisement) × 1.4 + investissement_percu × 1.2 + alignement × 1.0)
              ──────────────────────────────────────────────────────────────────────────────────────────
                                        (1.5 + 1.4 + 1.2 + 1.0)
```

**Note :** l'épuisement est **inversé** avant d'entrer dans la formule. Un épuisement de 80 devient une contribution de 20 au score final.

---

## Règles de court-circuit

Évaluées avant le calcul par la formule. La première règle qui matche est appliquée.

| ID | Condition | Orientation forcée |
|----|-----------|-------------------|
| `burnout_esteem_crash` | `estime < 30` ET `epuisement > 70` | Partir et se protéger |
| `absent_partner_degraded_dynamic` | `investissement_percu < 25` ET `alignement < 40` | Distance stratégique |
| `healthy_foundation` | `estime > 70` ET `alignement > 70` ET `epuisement < 40` | Rester en conscience |

---

## Micro-ajustement gut-check (étape 7)

| Situation | Ajustement |
|-----------|-----------|
| Intuition = orientation algo (distance 0) | +4 points |
| Intuition adjacente (distance 1 ou 2) | 0 point |
| Intuition opposée (distance 3) | -4 points |

**Le gut-check n'est PAS appliqué si une règle de court-circuit a été déclenchée.**

---

## Étapes du protocole

### ÉTAPE 1 — Ce qui se passe réellement
- **Input :** Échelle 1–5 + texte libre
- **Step weight :** 1.0
- **Contributions :**
  - `alignement` : direction=direct, factor=0.8
    - Scale 1 → alignement +0 | Scale 5 → alignement +100
  - `epuisement` : direction=inverse, factor=0.6
    - Scale 1 → épuisement +100 | Scale 5 → épuisement +0
- **Logique :** Une réalité très insatisfaisante (1) = pas d'alignement + épuisement. Une réalité satisfaisante (5) = bon alignement + pas d'épuisement.

---

### ÉTAPE 2 — Ce que l'autre montre (et cache)
- **Input :** Choix multiple (4 options) + texte libre
- **Step weight :** 1.2
- **Options :**

| Choix | investissement_percu | estime |
|-------|---------------------|--------|
| Présent, attentionné, cohérent | 80 | — |
| Chaud et froid, imprévisible | 35 | — |
| Distant, peu disponible | 20 | — |
| Comportements blessants ou contrôlants | 10 | 15 |

**Note :** "Comportements blessants" contribue aussi à l'estime (valeur basse = signal d'alerte).

---

### ÉTAPE 3 — Ce que cela vous coûte déjà
- **Input :** Échelle 1–5 + texte libre
- **Step weight :** 1.5 (CRITIQUE)
- **Contributions :**
  - `epuisement` : direction=direct, factor=1.0
    - Scale 1 → épuisement +0 | Scale 5 → épuisement +100
  - `estime` : direction=inverse, factor=0.5
    - Scale 1 → estime +100 | Scale 5 → estime +0
- **Logique :** Coût très élevé (5) = épuisement maximal + impact négatif sur l'estime.

---

### ÉTAPE 4 — Ce que changerait une autre posture
- **Input :** Échelle 1–5 + texte libre
- **Step weight :** 1.0
- **Contributions :**
  - `alignement` : direction=direct, factor=1.0
    - Scale 1 → alignement +0 | Scale 5 → alignement +100
- **Logique :** Voir une alternative claire (5) = agentivité = alignement plus élevé. Aucune alternative visible (1) = blocage = alignement bas.

---

### ÉTAPE 5 — Le moment critique (Composite)
- **Input :** 3 sous-inputs
- **Step weight :** 0.8 (contextuel)

#### 5a — Phase relationnelle (choix multiple)
| Phase | alignement |
|-------|-----------|
| < 3 mois | 50 |
| 3–12 mois | 60 |
| > 1 an | 65 |
| Post-rupture | 35 |

#### 5b — Urgence ressentie (échelle 1–5)
- `epuisement` : direction=direct, factor=0.4
- Haute urgence = souvent signe d'épuisement ou d'impulsivité

#### 5c — Fenêtre d'influence (échelle 1–5)
- `alignement` : direction=direct, factor=0.5
- Fenêtre large = plus d'agentivité = alignement plus élevé

#### Flags de timing (non-scoring, informatif pour le rapport LLM)
| Flag | Condition |
|------|-----------|
| `impulsive_risk` | urgence ≥ 4 ET estime < 40 |
| `limited_influence` | fenêtre ≤ 2 ET investissement_percu < 40 |
| `early_relationship` | phase = "< 3 mois" |

---

### ÉTAPE 6 — L'effet sur votre valeur personnelle
- **Input :** Échelle 1–5 + texte libre
- **Step weight :** 1.5 (CRITIQUE)
- **Contributions :**
  - `estime` : direction=direct, factor=1.0
    - Scale 1 → estime +0 | Scale 5 → estime +100
- **Logique :** Étape la plus directe. Estime très dégradée (1) = signal critique.

---

### ÉTAPE 7 — La direction que vous sentez (Gut-check)
- **Input :** Choix multiple (4 orientations)
- **Step weight :** 0 (ne contribue pas aux sous-scores)
- **Rôle :** Miroir entre intuition et calcul + micro-ajustement (±4 pts)
- **Options :** correspondent directement aux 4 orientations

---

## Exemples de cas et résultats attendus

Ces cas sont des fixtures pour les tests unitaires.

### Cas A — Relation saine, quelques doutes mineurs
```
Étape 1 (réalité) : 4
Étape 2 (dynamique) : Présent, attentionné
Étape 3 (coût) : 2
Étape 4 (alternative) : 3
Étape 5 : 3–12 mois | urgence 2 | fenêtre 4
Étape 6 (estime) : 4
Étape 7 (intuition) : Rester

Sous-scores attendus :
- alignement ≈ 70–80
- epuisement ≈ 20–30
- investissement_percu ≈ 80
- estime ≈ 75–85

Court-circuit attendu : healthy_foundation (estime>70, alignement>70, épuisement<40)
Orientation : RESTER EN CONSCIENCE
```

### Cas B — Épuisement critique + estime effondrée
```
Étape 1 (réalité) : 1
Étape 2 (dynamique) : Comportements blessants
Étape 3 (coût) : 5
Étape 4 (alternative) : 2
Étape 5 : > 1 an | urgence 5 | fenêtre 1
Étape 6 (estime) : 1
Étape 7 (intuition) : Rester (tension = 100%)

Sous-scores attendus :
- alignement ≈ 20–30
- epuisement ≈ 85–95
- investissement_percu ≈ 10–15
- estime ≈ 5–15

Court-circuit attendu : burnout_esteem_crash
Orientation : PARTIR ET SE PROTÉGER
Flag timing : impulsive_risk = true (urgence 5 + estime basse)
Tension interne : 100% (intuition=rester vs algo=partir)
```

### Cas C — Relation ambiguë, partenaire absent
```
Étape 1 (réalité) : 2
Étape 2 (dynamique) : Distant, peu disponible
Étape 3 (coût) : 3
Étape 4 (alternative) : 3
Étape 5 : 3–12 mois | urgence 3 | fenêtre 3
Étape 6 (estime) : 3
Étape 7 (intuition) : Me distancer

Sous-scores attendus :
- alignement ≈ 45–55
- epuisement ≈ 45–55
- investissement_percu ≈ 20
- estime ≈ 45–55

Court-circuit attendu : absent_partner_degraded_dynamic (invest_percu<25, alignement<40... à vérifier selon calcul exact)
Orientation probable : DISTANCE STRATÉGIQUE
Tension : 0% (intuition = orientation algo)
```

### Cas D — Repositionnement viable
```
Étape 1 (réalité) : 3
Étape 2 (dynamique) : Chaud et froid
Étape 3 (coût) : 3
Étape 4 (alternative) : 4
Étape 5 : 3–12 mois | urgence 2 | fenêtre 4
Étape 6 (estime) : 4
Étape 7 (intuition) : Changer

Score brut attendu : 51–70
Orientation : SE REPOSITIONNER
Tension : 0% (cohérence parfaite)
Ajustement gut-check : +4
```

---

## Changelog

| Date | Version | Modification |
|------|---------|-------------|
| 2026-03-01 | 1.0.0 | Version initiale — 4 orientations, 7 étapes, 4 sous-scores |
