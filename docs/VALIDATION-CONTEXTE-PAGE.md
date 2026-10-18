# Contexte de la page ouverte — 18 octobre 2026

La fonction partagée `lessonPageContext` fournit les titres et les consignes utilisés à la fois par le cours et par le contexte transmis à DeepSeek. Le serveur reçoit uniquement des références validées (séance, phase, geste, type de page) et retrouve les textes pédagogiques lui-même. Aucune lecture arbitraire du DOM, des formulaires personnels ou des secrets n’est transmise.

Le prompt distingue explicitement la page ouverte et la séance de référence. Il donne priorité au contenu de la page pour « ici », « ça » et « cet exercice », même si la conversation concernait auparavant un autre geste. Le numéro de geste est capturé au moment de l’envoi, y compris avant la fin d’une sauvegarde automatique. Le même contexte accompagne les demandes d’analyse photographique via l’intégration existante.

## Vérifications automatiques

- Deux messages successifs dans la première séance : « Échauffe ta main » transmet « Trace cinq lignes, cinq courbes et cinq petits cercles. » ; « Ajoute une goutte d’eau » transmet « Dilue trois bandes de couleur avec des quantités d’eau différentes. ». Le prompt système du second ne contient plus la première consigne.
- Présence du titre de séance, de la phase et des conseils ; contenu propre aux phases Regarder et Terminer ; distinction de la rubrique Maman Chouette ; rejet d’une page inconnue sans appel fournisseur.
- Navigateur : trois messages après changement de geste et de phase, puis un message dans la rubrique Maman Chouette. Sur ordinateur, le chat reste ouvert pendant les changements ; sur tablette et téléphone, il est refermé pour accéder à la consigne puis rouvert. La requête suivante contient toujours le contexte courant.
- Les intégrations DeepSeek, SMTP et Blobs sont simulées uniquement dans les tests isolés. Aucun message d’essai n’est ajouté au compte de Papa, aucun email réel n’est envoyé et le garde-fou anniversaire reste inchangé.

Résultats : compilation TypeScript/Vite réussie, 34 tests API et 27 scénarios Chromium réussis sur les trois tailles. Le nouveau parcours vérifie successivement deux gestes, un changement de phase et l’ouverture du bureau de Maman Chouette, sans erreur de console.
