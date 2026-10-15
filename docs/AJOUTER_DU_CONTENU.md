# Ajouter du contenu sans modifier les composants

Le catalogue est embarqué à la compilation. Il reste disponible sans Internet, sans clé API et sans appel LLM. Les JSON sont la source de vérité ; ne modifiez pas une copie dans `node_modules` ou dans un répertoire de compilation.

| Emplacement | Contenu |
| --- | --- |
| `src/content/catalog/vocabulary/*.json` | Les collections thématiques et le vocabulaire initial |
| `src/content/catalog/lessons/*.json` | Leçons, exemples, pièges, rappel actif et exercices associés |
| `src/content/catalog/exercises/*.json` | Banques d’origine : grammaire, lexique, style, challenges et diagnostic |
| `src/content/catalog/writing/*.json` | Ateliers de reformulation de Writing Lab |
| `src/content/catalog/nuance/*.json` | Familles de mots, collocations et exercices de nuance |
| `src/content/catalog/vocabulary.ts` | Liste explicite des collections et version de contenu |
| `src/content/catalog/lessons.ts` | Liste des leçons, thèmes et ordre des parcours |
| `src/content/catalog/types.ts` et `src/lib/types.ts` | Types des fiches, leçons et exercices |

## Une fiche de vocabulaire

Ajoutez un objet dans `items` de la collection appropriée :

```json
{
  "id": "v-example-distinct-id",
  "kind": "word",
  "text": "unruffled",
  "translationFr": "imperturbable",
  "meaning": "remaining calm despite pressure or surprise",
  "example": "She remained unruffled when the programme changed at the last minute.",
  "exampleFr": "Elle est restée imperturbable malgré le changement de programme de dernière minute.",
  "notes": "Remain unruffled ; souligne le calme face à une perturbation.",
  "level": "C1",
  "register": "neutral",
  "tags": ["emotions", "word"],
  "listIds": ["pack-emotions"]
}
```

Gardez chaque identifiant stable : il relie la fiche à sa progression. Ne créez pas une nouvelle entrée pour une simple variante avec `to`, une majuscule ou un autre pronom générique. Vérifiez le sens effectivement illustré, les prépositions, les variantes BrE/AmE utiles et la traduction idiomatique.

Pour une nouvelle collection, créez un fichier avec `version`, `id`, `title`, `description`, `color` et `items`, puis ajoutez son import à `vocabulary.ts`. Son identifiant de liste est `pack-` suivi de son `id`. Les imports explicites évitent de dépendre d’un accès au disque dans le navigateur.

Les fichiers thématiques ayant `version: 1` et `items` peuvent aussi être sélectionnés dans l’import de vocabulaire de l’app. L’utilisateur choisit alors la liste de destination et la politique de doublons dans l’interface habituelle.

## Une leçon

Reprenez la forme d’une leçon existante et le type `Lesson`. Choisissez un identifiant inédit et stable, un thème, un niveau indicatif, des collections liées et une durée réaliste. Rédigez au moins deux exemples traduits et un piège expliqué. Terminez par une question de rappel et quatre exercices :

1. `mcq` : options distinctes, `answer` indexé à partir de zéro, une `optionNotes` pour chaque option.
2. `cloze` : un trou `___`, les réponses acceptables dans `answers`, une consigne qui évite les ambiguïtés.
3. `rewrite` : consigne de transformation, `answers` et `model`. N’oubliez pas les variantes légitimes.
4. `free` : une tâche, un modèle naturel et au moins trois critères dans `rubric`. Indiquez `minWords` et `maxWords` seulement si la longueur fait partie de l’objectif.

Chaque exercice a aussi un `id` unique, `skills`, `difficulty`, `tags`, `origin: "bank"`, `instruction` et une `explanation` qui enseigne le point ciblé. Les difficultés usuelles sont B2+ = 59, C1 = 67, C1+ = 76, C2 = 86. Ajoutez la leçon à un parcours dans `lessons.ts` ; ne changez pas l’identifiant pour corriger une faute dans son texte.

Pour un nouveau format de fichier ou un autre type d’exercice, adaptez les types et les contrôles avant l’interface. Les chaînes sont rendues comme du texte, pas exécutées comme du HTML.

## Mise à jour des installations existantes

Au démarrage, `syncCatalog` installe les identifiants encore inconnus, dans une transaction IndexedDB. Une fiche personnelle de même identité lexicale est conservée et rattachée à la collection ; son texte, ses notes et ses cartes restent intacts. Une fiche ou une liste supprimée ne réapparaît pas au lancement suivant. Les identifiants de l’ancien contenu sont considérés comme déjà distribués lors de la première migration afin de respecter les suppressions antérieures.

Une modification d’un JSON de vocabulaire n’écrase pas silencieusement une fiche déjà installée : cela protège les corrections et annotations personnelles. Pour appliquer des corrections éditoriales à une installation existante, utilisez l’import guidé avec aperçu et mise à jour des champs, ou concevez une migration dédiée préservant les personnalisations. Les leçons, elles, sont lues directement dans le catalogue embarqué ; leur contenu éditorial change au prochain build, mais leur progression reste liée à leur identifiant.

Les sauvegardes complètes contiennent désormais `lessonProgress` et `contentState` (version de sauvegarde 2). Les sauvegardes antérieures restent importables. L’export de profil reste limité aux préférences.

## Vérifier puis reconstruire

```bash
npm run check:content
npm run check
npm run test:content
npm test
npm run lint
npm run build
```

Les contrôles détectent notamment les doublons, références cassées, contenus incomplets, réponses modèles refusées, mauvais indices de QCM et modèles hors des limites de longueur. Ils vérifient aussi les mises à jour sans perte de progression. Ils ne prouvent pas, à eux seuls, la justesse linguistique : relisez chaque explication et chaque distracteur.

Après une modification de JSON en production, refaites `npm run build`, puis relancez `npm start`.
