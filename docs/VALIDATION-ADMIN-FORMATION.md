# Commandes discrètes du cadeau — 19 octobre 2026

Deux commandes dans les préférences, réservées au propriétaire : recommencer le parcours de Papa et envoyer une première invitation. Les deux exigent une confirmation textuelle. Elles ne sont pas déclenchées pendant le déploiement ou les contrôles en production.

La remise à zéro cible le compte défini par `PAPA_EMAIL`, sans toucher au compte propriétaire. Elle efface la progression, les notes de cours, les bilans et conversations, suspend les courriers et crée un nouveau cycle de formation. Le carnet reste conservé sauf case de suppression explicite. Les suppressions d’images sont immédiatement appliquées à l’accès API, puis nettoyées dans Blobs.

L’invitation emploie le modèle HTML et texte existant, un lien vers la séance suivante et un identifiant d’envoi stable. Le propriétaire choisit les courriers suivants. L’unicité par cycle évite les doubles clics ; une réponse SMTP ambiguë n’est jamais reprise à l’aveugle. Les anciennes files et confirmations d’envoi restent archivées, les tâches obsolètes sont annulées. Un verrou PostgreSQL temporaire sérialise l’envoi et la réinitialisation, sans dépendre d’une connexion permanente au pool Neon.

Tests isolés : droits propriétaire et confirmations, remise à zéro réelle en PostgreSQL PGlite, conservation du carnet par défaut, suppression explicite et nettoyage des octets, compte propriétaire préservé, rollback sur panne, blocage pendant un envoi concurrent, invitation unique et nouvel envoi après un nouveau cycle, erreur SMTP ambiguë et choix des courriers. Les emails de ces tests sont capturés par un adaptateur en mémoire ; aucun SMTP réel n’est appelé.

Résultats locaux : 47 tests serveur/MIME réussis et 36 scénarios navigateur réussis sur ordinateur, tablette et téléphone. Le parcours des nouvelles commandes a été rejoué après l’ajout de la reprise des courriers : trois contrôles réussis. En navigateur, l’invitation est envoyée uniquement à l’adaptateur SMTP de test ; le double envoi reste impossible après fermeture et réouverture des préférences. Captures des commandes inspectées. Compilation de production et packaging Netlify exécutés.

## Contrôle du déploiement

Déploiement `6ad5ddf8689d9123932927e8` sur le projet Netlify existant. La migration a été appliquée et l’API d’état répond 200. L’empreinte des données apprenant (progression, carnet, bilans, conversations et préférences) est identique avant et après la mise en ligne. Les nouvelles routes d’invitation et de réinitialisation refusent les visiteurs sans session propriétaire (401).

Consultation en HTTPS sur ordinateur, tablette et téléphone : site et aperçu du courrier chargés, aucun débordement horizontal ni erreur de console, données inchangées après consultation. Aucune commande privilégiée n’a été exécutée en production, aucune formation réelle n’a été réinitialisée et aucun email réel n’a été envoyé pendant ce changement. Les essais positifs des nouvelles commandes et de SMTP sont limités aux adaptateurs isolés de test.
