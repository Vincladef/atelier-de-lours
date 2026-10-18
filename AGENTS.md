# L’Atelier de l’Ours

Application privée de dessin pour un débutant adulte. La référence visuelle est `docs/reference/maquette.html`. Garder les quatre rubriques, le papier, les couleurs, les typographies et les photographies réalistes. Le compte du père commence vide ; aucune donnée de la maquette ne doit être importée.

## Développement

- Utiliser le checkout existant dans `/workspace/atelier-de-lours`. L’environnement cloud est déjà isolé ; ne pas créer de worktree sans demande explicite.
- Node 22 ou ultérieur, `npm ci`, `npm run build`, `npm test`, `npm run test:e2e`.
- Les tests utilisent un moteur PostgreSQL PGlite isolé et des intégrations mail/IA simulées explicitement. Ce dispositif de test n’est jamais déployé.
- Ne pas présenter ces tests comme des appels réels aux fournisseurs. Les contrôles réels sont consignés séparément.
- Exécuter le parcours avec Chromium aux trois tailles et vérifier les erreurs de console après un changement fonctionnel.

## Production et données

- GitHub : `Vincladef/atelier-de-lours`, branche `main`.
- Netlify existant exclusivement : `8f6c804f-819f-4730-a2f7-a4b06125438a`.
- Neon existant exclusivement : `twilight-surf-30368613`, via `DATABASE_URL` dans les fonctions.
- Secrets uniquement serveur : `DATABASE_URL`, `DEEPSEEK_API_KEY`, `EMAIL_FROM`, `GMAIL_APP_PASSWORD`, `PAPA_EMAIL`.
- Ne jamais afficher les secrets, extraire des jetons du proxy, les mettre dans Git, le frontend, les journaux ou une réponse HTTP.
- Ne jamais envoyer un email réel à `PAPA_EMAIL` pendant le développement ou les tests. Tests réels exclusivement à `EMAIL_FROM`.
- Ne jamais activer `gift_activated` sans une instruction explicite du propriétaire. Ne pas désactiver le garde-fou pour tester.
- Les photos sont privées dans Netlify Blobs. Toute lecture nécessite une session et une vérification de propriétaire en base.
- Ne transmettre une photo à DeepSeek que sur demande explicite d’analyse avec consentement.
- Ajouter une migration SQL versionnée ; ne pas modifier une migration déjà appliquée. Ne pas réinitialiser les données pour résoudre un problème de configuration.
- Aucun endpoint de vérification temporaire ne doit rester dans le déploiement final. Ne jamais publier de session ou de lien de connexion.
