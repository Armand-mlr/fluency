# 2026.09.30-content.1 — Bibliothèque et parcours sans IA

- 504 nouvelles fiches B2+/C1/C2, 12 collections de 42 : définition, traduction, exemple traduit, registre et note d’usage. 560 fiches au total en installation neuve.
- 32 leçons originales, 5 parcours, 128 exercices avec corrigés pédagogiques et grilles d’autoévaluation.
- Lecture et pratique suivies séparément ; réponses intégrées aux cartes et aux sessions Today.
- 6 nouveaux ateliers Writing Lab et 6 nouvelles familles de nuances : 14 ensembles dans chaque section.
- Contenus éditoriaux déplacés dans des JSON séparés : vocabulaire, leçons, exercices d’origine, écriture et nuances.
- Vocabulaire paginé, filtres de niveau/registre/origine, fiches lisibles, pratique directe et liens depuis les leçons.
- Installation incrémentale : ajouts uniques, cartes inchangées, notes personnelles conservées, suppressions respectées. Sauvegardes version 2, import des anciennes sauvegardes maintenu.
- Nouvelle documentation de contribution et contrôles de contenu/migration. Les intégrations IA sont conservées.

# Studio edition — 28 septembre 2026

## Livraison

Refonte des couleurs, hiérarchies et mises en page ; tableau de bord enrichi ; réglages repensés en sections ; import guidé et atelier IA. Les polices restent locales, les animations sont limitées et respectent les préférences système.

Connexion Ollama locale ou API compatible OpenAI, configuration et clé côté serveur, récupération des modèles, test par génération réelle, délais d’attente et messages d’erreur. Pas de résultat IA fictif, pas de basculement automatique vers le cloud.

Profil configurable, import/export séparé de la sauvegarde complète, exemples JSON fournis. Import de vocabulaire transactionnel avec validation, aperçu, exclusion et gestion des doublons. Créations IA validées avant sauvegarde et intégrées aux sessions.

## Tests

- Compilation de production et TypeScript : réussis.
- ESLint : réussi sans avertissement.
- Contrôles du moteur et 127 exercices : réussis.
- Tests ETL, doublons, rollback, profils, exports sans secrets et persistance IndexedDB simulée : réussis.
- API Next.js réelle avec serveur de modèle simulé : configuration, liste des modèles, génération, modèle absent, masquage de clé et rejet d’origine tierce vérifiés.

- Tests Chromium : modification du profil et rechargement, import JSON avec exclusion et doublons, persistance du vocabulaire, création IA désactivée sans configuration, dix routes sans débordement en largeur mobile, aucune exception JavaScript.
- Rendus clair/sombre et réglages mobiles contrôlés visuellement.

## Limites

Aucun modèle Ollama réel n’est installé dans l’environnement de livraison : la vitesse, la consommation mémoire et la justesse pédagogique restent à vérifier sur votre machine. Les réponses IA sont contrôlées structurellement, pas certifiées exactes. La version vise les niveaux B1 à C2 et un seul utilisateur local. La connexion distante exige une API compatible OpenAI prenant en charge les sorties JSON. Les secrets locaux sont protégés par les permissions du fichier, pas chiffrés.
