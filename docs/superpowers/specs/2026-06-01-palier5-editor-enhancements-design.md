# Palier 5 — Améliorations éditeur + lancement au démarrage

**Date:** 2026-06-01
**Statut:** design validé (ordre A → B → C)

Trois lots indépendants ajoutés à l'app existante (capture + éditeur Konva + réglages).
Aucun changement du format d'export ni de la capture elle-même.

---

## Lot A — HUD de sélection (loupe + coordonnées + taille)

**But:** aider à viser une zone au pixel près pendant la sélection.

- **Loupe** : petit `<canvas>` carré (≈140 px, grossissement ×8, `imageSmoothing` off) qui
  suit le curseur **tant que la sélection n'est pas posée**. Il échantillonne l'image de
  capture pleine résolution autour du curseur, avec un **réticule** central.
- **Position curseur** `x:… y:…` en **pixels physiques** de l'écran capturé
  (`logique × scale`), affichée sous la loupe.
- **Taille** `W × H` en pixels physiques, affichée **pendant le glisser** de sélection.
- Disparaît dès que la sélection est posée (`onSelectionDone`) et pendant l'annotation.

**Architecture:** l'éditeur expose un hook `onSelectMove({ point, rect })` appelé pendant
la phase de pré-sélection (point = curseur logique, rect = brouillon de sélection ou null).
`overlay.js` détient le HUD (loupe + libellés), se positionne près du curseur en restant
dans le viewport, et dessine depuis l'`image` déjà chargée. Découplé de l'export : le HUD
est du DOM hors `#stage`, jamais composé dans le PNG.

## Lot B — Cartouche de bulle

- **Trait qui déborde (fix):** le trait reliant le cartouche à la bulle va aujourd'hui
  jusqu'au **centre** du cercle → il déborde sur le rond. Le faire **s'arrêter au bord du
  cercle** (rayon 15) dans la direction du cartouche.
- **Cartouche déplaçable, trait droit par défaut:** fiabiliser le glisser du cartouche
  (déjà `draggable` en outil select) ; le trait reste **droit** et recalcule son extrémité
  côté bulle (bord du cercle) à chaque `dragmove`. Offset par défaut inchangé (droit,
  vertical vers le haut).

**Architecture:** modifications localisées dans `makeBubbleNode` (`src/editor/editor.js`).
Helper pur `bubbleConnectorEnd(dx, dy, radius)` testé dans `src/editor/bubbles.test.js`.

## Lot C — Lancement au démarrage

- Plugin **`tauri-plugin-autostart`** (macOS = LaunchAgent, Windows = clé registre `Run`).
- **Case « Launch at login »** dans la fenêtre de réglages, persistée
  (`Settings.launch_at_login`), appliquée immédiatement à l'enregistrement.
- Au démarrage, l'état autostart effectif est aligné sur le réglage.

**Architecture:** champ `launch_at_login: bool` dans `settings.rs` ; commande
`set_autostart(enabled)` (via `AutoLaunchManager`) appelée par `update_settings` ; UI dans
`index.html` / `main.js`. Plugin initialisé dans `lib.rs`.

---

## Hors-scope

Pas de couleur RGB du pixel dans la loupe (peut venir plus tard), pas de raccourci dédié,
pas de zoom de toute l'image.
