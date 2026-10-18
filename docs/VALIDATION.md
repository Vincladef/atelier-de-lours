# Vérification du 18 octobre 2026

## Application et environnement local

- Compilation TypeScript et Vite de production : réussie.
- Packaging réel des fonctions avec Netlify Build : réussi.
- 28 tests serveur : 28 réussis, aucun échec ni test ignoré. Le moteur PostgreSQL PGlite exécute les migrations et les requêtes ; SMTP, Blobs et DeepSeek sont remplacés par des adaptateurs isolés dans cette suite.
- 18 scénarios Chromium : 18 réussis, aucun échec ni test ignoré, sur ordinateur (1440 px), tablette (820 px) et téléphone (390 px). Les scénarios couvrent les quatre rubriques, les huit semaines et les seize séances, les phases, les étapes cochées, les notes et la reprise après rechargement, le questionnaire, l’import et la suppression d’images, les métadonnées, le PDF, le studio, les questions IA, le consentement photo, les préférences et la déconnexion.
- Deux contrôles complémentaires sur téléphone : navigation par événements tactiles et tracé au doigt par le protocole tactile Chromium, suivis de l’enregistrement du croquis. Tous deux réussis.
- Vérification de l’absence de débordement horizontal sur les écrans parcourus. Captures et contrôle des erreurs JavaScript sur le parcours complet.
- Les 16 vidéos pédagogiques et les deux bonus répondent à oEmbed avec les titres et auteurs attendus et une intégration autorisée. Ce contrôle ne remplace pas un visionnage intégral des démonstrations. Les exercices restent accessibles sans lecteur vidéo.
- Les 15 photographies de référence ont été téléchargées, optimisées en WebP et conservées avec leurs sources et crédits.

## Contrôle final de production

- Site vérifié directement en HTTPS dans Chromium sur ordinateur, tablette et téléphone : réponse 200, images chargées, aucun débordement horizontal, aucune erreur JavaScript ou de console de l’application. Le 401 de `/api/state` avant connexion est attendu.
- Le certificat public du proxy de l’environnement est approuvé uniquement dans un profil Chromium isolé et pour le domaine de l’application ; la vérification TLS reste active.
- L’ancien import Google Fonts a été supprimé : les polices sont servies localement. La barre et le badge Netlify ont été désactivés via les paramètres du projet, sans changement de formule.
- Réinstallation propre avec `npm ci`, compilation et connexion/écriture/relecture à travers le proxy Vite vérifiées.
- Le paquet API conserve la bibliothèque native Linux glibc vérifiée ; la variante musl inutile est exclue par `included_files`. Archive API : environ 10,1 Mo ; travailleur d’emails : environ 0,62 Mo. Les migrations sont présentes dans les deux archives.
- Déploiement final : `6ad51bb9eb66dd3fb0bcf200`, sur le projet Netlify existant. Deux fonctions présentes : `api` et `mail-worker`, ce dernier programmé toutes les 15 minutes.

## Fournisseurs réels — production

Contrôles effectués avec les variables existantes du projet Netlify `8f6c804f-819f-4730-a2f7-a4b06125438a`, dans le contexte de production. Les aperçus de ce projet ne reçoivent pas les cinq secrets applicatifs ; ce n’est pas un échec de l’application.

| Contrôle | Résultat |
|---|---|
| Démarrage de l’API et migrations PostgreSQL | Réussi, `/api/health` retourne 200 |
| Connexion à un hôte Neon | Vérifiée, via le `DATABASE_URL` déjà configuré |
| Sauvegarde d’une note et relecture de progression | Réussie |
| Envoi d’un lien de connexion Gmail au propriétaire | Réussi |
| Consommation du lien et ouverture d’une session propriétaire | Réussie |
| Lecture d’état authentifiée | Réussie |
| Enregistrement et relecture d’un JPEG dans Netlify Blobs | Réussis |
| Refus de la photographie sans authentification | Vérifié, 401 |
| Question pédagogique via l’API officielle DeepSeek | Réussie, modèle `deepseek-flash` |
| Analyse réelle d’une image technique par DeepSeek | Réussie, modèle `deepseek-flash` |
| Email hebdomadaire de test, uniquement au propriétaire | Réussi |
| Travailleur d’emails sans activation du cadeau | Aucun envoi, état désactivé |
| Réglage du cadeau après les essais | Toujours désactivé |
| Compte du père | Aucun compte apprenant ni donnée fictive créés |

Deux emails réels ont été envoyés à `EMAIL_FROM` pendant ces essais. Aucun email réel n’a été envoyé à `PAPA_EMAIL`. L’image technique, la note, les échanges de vérification et la session ont été supprimés ou révoqués après les contrôles ; le carnet du propriétaire sert de compte séparé. Les cinq secrets n’ont été ni copiés dans le dépôt ni exposés dans les réponses publiques.

Les contrôles réels ont utilisé une fonction temporaire protégée par un jeton aléatoire à usage unique, sans exposer de secret dans son résultat. Sa variable temporaire a été retirée ; la fonction et son code sont retirés du déploiement final. Le déploiement final ne contient que l’API et le travailleur programmé.

## Sécurité et limites connues

- Audit npm des dépendances de production : 0 vulnérabilité signalée.
- L’audit complet signale 16 alertes hautes dans la chaîne de développement de Netlify CLI 27.13.0 (notamment dépendances de glob, certificats et image). Elles ne sont pas dans les dépendances d’exécution de l’application ni dans son bundle public. Aucun contournement de TLS, d’intégrité ou d’assertion n’a été utilisé pour obtenir les résultats. La correction de ces dépendances appartient aux versions amont de l’outil ; un retour à une ancienne CLI n’est pas appliqué pour masquer l’audit.
- Les vidéos externes peuvent changer de disponibilité après la vérification. Le lien YouTube et les consignes de pratique sont toujours proposés.
- Les erreurs SMTP dont l’acceptation est incertaine demandent une vérification du propriétaire plutôt qu’un renvoi automatique pouvant doubler un message.
- L’accès du père et les notifications ne sont pas activés par ces tests. Leur activation reste une action explicite du propriétaire, au moment d’offrir le cadeau.
