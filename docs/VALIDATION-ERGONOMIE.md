# Ergonomie des cours — 18 octobre 2026

Changement limité aux cours et au composant de conversation partagé avec Maman Chouette. La direction artistique, les quatre rubriques et les 16 séances sont conservées.

## Vérifications

- TypeScript et compilation de production.
- Tests API avec PostgreSQL PGlite : contexte du geste affiché, même si l’enregistrement précédent est encore en attente ; validation des valeurs ; consigne retrouvée côté serveur ; aucune modification de progression par le chat ; stockage du contexte ; historique paginé sans perte ni accès au carnet propriétaire. Les tests utilisent explicitement des adaptateurs SMTP, Blobs et DeepSeek simulés.
- Parcours Chromium sur ordinateur, tablette et téléphone : ouverture/fermeture sans navigation, brouillon conservé, texte et photographie avec consentement, étape et cases conservées, historique retrouvé dans la rubrique Maman Chouette, fermeture par Échap, absence de débordement et d’erreur de console. Sur téléphone, la saisie et l’envoi sont aussi vérifiés avec une hauteur de viewport réduite, simulant l’espace disponible au-dessus du clavier ; ce contrôle ne remplace pas un essai sur chaque clavier physique iOS/Android.
- Les parcours existants sont conservés : programme, progression, notes, carnet, PDF, studio, préférences et protection de l’administration.
- Les 15 photographies locales existantes ont été vérifiées en HTTPS sur le site : statut 200, type WebP, octets identiques aux fichiers du dépôt. Aucun fichier actuellement défaillant n’a été reproduit. Le composant réinitialise maintenant son état quand la référence change et utilise une photographie locale du même animal si l’original et sa source externe échouent. Cette panne est provoquée dans un test navigateur pour vérifier le secours.

Aucun email réel n’est nécessaire pour cette modification. Les envois à Papa restent désactivés. Les appels IA de production continuent à utiliser l’intégration officielle existante ; aucun adaptateur de test ni endpoint `__test` n’est inclus dans les fonctions déployées.

Résultats locaux : 31 tests API réussis, 24 scénarios navigateur réussis ; le parcours du mini-chat a été rejoué avec succès sur les trois tailles après les derniers ajustements. La compilation TypeScript/Vite et le packaging Netlify des deux fonctions ont réussi. Les captures du panneau sur ordinateur et téléphone ont été inspectées.

## Contrôle du site déployé

Déploiement `6ad52af71f18fa321f8d04cc` sur le projet Netlify existant. En HTTPS, sur ordinateur (1440 px), tablette (820 px) et téléphone (390 px) : ouverture et fermeture du panneau, fermeture par Échap, aucune navigation, progression inchangée, aucun débordement horizontal et aucune erreur JavaScript ou de console. Captures de production enregistrées ; capture mobile inspectée. `/api/chat?lesson_id=1` répond 200 après l’application de la migration ; `/api/admin/status` continue de refuser les visiteurs sans session propriétaire (401).

Ces contrôles de production n’ont envoyé aucune question ni photographie de test à l’IA et n’ont ajouté aucune donnée d’essai au compte de Papa. Les appels réels à DeepSeek avaient été vérifiés lors de la livraison initiale (voir `VALIDATION.md`) ; le nouveau contexte et le parcours photo ont été vérifiés ici avec les adaptateurs isolés. Aucun email réel n’a été envoyé.
