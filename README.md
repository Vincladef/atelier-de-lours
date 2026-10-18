# L’Atelier de l’Ours

Une formation personnelle de dessin : huit semaines, seize séances, un carnet photographique et Maman Chouette. L’application reprend la maquette fournie dans `docs/reference/maquette.html`.

- Site : https://atelier-de-lours.netlify.app
- Dépôt : https://github.com/Vincladef/atelier-de-lours
- Projet Netlify : `8f6c804f-819f-4730-a2f7-a4b06125438a`
- Projet Neon : `twilight-surf-30368613`

## Installation et développement

Node 22 ou ultérieur et npm. Utiliser le checkout existant ; aucun worktree supplémentaire n’est nécessaire.

```sh
npm ci
npm run build
npm test
npm run test:e2e
```

Playwright utilise Chromium système s’il est présent, sinon le navigateur installé par `npx playwright install chromium`. Un chemin spécifique peut être fourni dans `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Le paquet de l’API conserve la variante Linux glibc de Sharp attendue par Netlify. Les variantes Linux musl sont exclues du paquet avec un glob négatif `included_files`. Le travailleur d’emails n’embarque pas Sharp ; seule l’API traite les images.

`npm run test:server` sert la compilation sur le port 8890 avec PostgreSQL PGlite isolé, un stockage en mémoire, une boîte de test et une IA simulée. Ce serveur est réservé aux tests, écoute uniquement sur la boucle locale et ne fait partie d’aucun déploiement. Les tests navigateur y effectuent une vraie navigation, une connexion par lien et des écritures SQL. Ils ne prouvent pas la disponibilité des fournisseurs réels.

Pour travailler avec les services réels, utiliser `npx netlify dev --site atelier-de-lours`, après authentification Netlify, avec les variables du projet accessibles aux fonctions. Le serveur Vite seul (`npm run dev`) utilise le port 8890 comme proxy API. Dans un environnement avec proxy HTTPS, transmettre à la CLI Netlify ses options `--http-proxy` et `--http-proxy-certificate-filename`, sans désactiver TLS.

## Architecture

- `src/components/` : les écrans React, le carnet, le studio et les formulaires.
- `src/data/curriculum.json` : les 16 séances et les huit courriers fournis ; aucun progrès fictif.
- `src/lib/store.tsx` : état du compte, sauvegardes sérialisées, reprise des écritures échouées.
- `server/api.ts` : API authentifiée, validation, progression et carnet.
- `server/security.ts` : sessions, liens à usage unique, contrôle d’origine et limites de requêtes.
- `server/db.ts` et `migrations/` : PostgreSQL, migrations transactionnelles sous verrou.
- `server/ai.ts` : API officielle DeepSeek, modèle `deepseek-flash`, contexte pédagogique réel, consentement et plafonds.
- `server/mail.ts` : file persistante, dédoublonnage, reprises limitées et calendrier Europe/Paris.
- `netlify/functions/` : API et fonction programmée toutes les 15 minutes.
- `public/photos/` : photographies optimisées conservées localement ; sources dans `src/data/photos.json`.
- `tests/` : tests serveur et parcours navigateur sur ordinateur, tablette et téléphone.

La documentation DeepSeek consultée confirme la vision pour `deepseek-flash`. Chaque demande vérifie aussi les modalités annoncées par `/models`. Le mode de réflexion est désactivé pour les réponses pédagogiques courtes. Les appels sont limités à 12 par heure et 30 par jour par utilisateur, avec un plafond global de 40 par jour et 700 jetons de sortie par réponse. Les photos ne sont envoyées que lors d’une analyse explicitement demandée. Les pièces jointes ne sont pas conservées dans l’historique du dialogue.

## Configuration serveur

Les cinq variables ci-dessous existent déjà dans Netlify. Aucun nom préfixé par `VITE_` ne doit contenir un secret.

| Variable | Utilisation |
|---|---|
| `DATABASE_URL` | Connexion à la base Neon existante |
| `DEEPSEEK_API_KEY` | API officielle DeepSeek |
| `EMAIL_FROM` | Adresse Gmail expéditrice et compte propriétaire |
| `GMAIL_APP_PASSWORD` | Mot de passe d’application Gmail SMTP |
| `PAPA_EMAIL` | Seul compte apprenant autorisé |

`EMAIL_FROM` et `PAPA_EMAIL` doivent être deux adresses distinctes : en cas de conflit, aucun lien n’est envoyé. Les sessions utilisent un cookie HttpOnly, Secure en HTTPS, SameSite=Lax ; les jetons ne sont conservés en base que sous forme d’empreinte. Les mutations contrôlent l’origine. Aucun mot de passe de compte ni interface d’inscription publique.

Les métadonnées des dessins sont dans Neon ; les JPEG normalisés, sans métadonnées EXIF, dans un store Netlify Blobs privé. L’API conserve la séparation entre le compte partagé de Papa et le compte propriétaire, accessible uniquement avec sa session. Le navigateur réduit les images, puis le serveur vérifie leur contenu, les dimensions et le poids. L’export PDF est produit à la demande sur l’appareil connecté.

## Anniversaire et emails

**Les envois à Papa restent désactivés tant que le propriétaire ne les active pas.** Le réglage `gift_activated` est créé à `false`. La fonction programmée et le transport SMTP vérifient ce réglage ; les liens de connexion à Papa sont également bloqués jusque-là. Les tests réels ne peuvent cibler que l’adresse du propriétaire.

L’atelier s’ouvre directement sans connexion, à la demande du propriétaire. Tous les visiteurs du lien partagent le carnet, les photos et la progression de Papa ; aucune donnée fictive n’est ajoutée. Les limites IA restent actives. Le propriétaire se connecte via Préférences → Accès propriétaire avec `EMAIL_FROM`. Son carnet est séparé de celui du père. Pour offrir le cadeau, il peut ouvrir Préférences → Administration du cadeau, puis confirmer explicitement `ACTIVER LES ENVOIS À PAPA`. Cette activation n’est effectuée ni par le build ni par les tests réels. Papa choisit ensuite s’il souhaite recevoir le courrier et les rappels. Il peut les désactiver dans ses préférences.

La file SQL utilise une clé unique pour chaque courrier. Les rejets SMTP temporaires explicites sont repris au plus trois fois. Une déconnexion ou un timeout après un envoi potentiellement accepté devient `uncertain`, sans renvoi automatique : cela évite de doubler un message. Le calendrier ne passe pas à une semaine dont les précédentes n’ont pas été terminées. Les rappels sont facultatifs.

## Déploiement

`netlify.toml` définit `npm run build`, la publication de `dist`, les fonctions, la programmation et les en-têtes de sécurité. Les migrations s’appliquent automatiquement lors du premier démarrage d’une fonction, sous transaction et verrou pour éviter les conflits de démarrages simultanés. Elles peuvent aussi être lancées avec `npm run migrate` depuis un contexte serveur autorisé.

```sh
npx netlify build --offline --context production
npx netlify deploy --no-build --prod --site atelier-de-lours
```

Vérifier que l’identifiant retourné est celui du projet existant. Ne jamais utiliser `--create-site` ni `--site-name`. La publication du code GitHub et les déploiements CLI sont distincts. Le workflow GitHub Actions exécute les vérifications ; il ne possède aucun secret applicatif.

## Sources et vérifications

- Source pédagogique et maquette fournies par le propriétaire.
- Résultats oEmbed YouTube : `src/data/video-status.json`. Une vidéo peut devenir indisponible après la vérification ; le lien direct et la pratique restent accessibles sans vidéo.
- Photographies et crédits : `src/data/photos.json`, `docs/photo-verification.json`, licence Unsplash. Aucun téléchargement des vidéos.
- Typographies : DM Sans et Fraunces, licences SIL dans `public/licenses/`.
- DeepSeek : https://api-docs.deepseek.com/guides/vision et https://api-docs.deepseek.com/api/list-models.
- Les résultats des tests et des intégrations réellement exécutés sont consignés dans `docs/VALIDATION.md`.
