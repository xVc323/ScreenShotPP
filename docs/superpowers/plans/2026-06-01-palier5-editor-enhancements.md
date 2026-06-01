# Palier 5 — Plan d'implémentation

Design: `docs/superpowers/specs/2026-06-01-palier5-editor-enhancements-design.md`
Ordre: A → B → C. Tester sur le `.app` release à chaque lot.

## Lot A — HUD de sélection (loupe + x,y + taille)

- [ ] `src/editor/editor.js` : ajouter l'option `onSelectMove` ; l'appeler dans
      `pointermove`/`pointerdown` **uniquement tant que `selection` est nul**, avec
      `{ point: {x,y} (logique), rect: brouillon|null }`. Continuer d'appeler
      `onSelectionDone` (qui sert à masquer le HUD).
- [ ] `src/overlay.html` : conteneur `#loupe` (canvas + libellés) caché par défaut.
- [ ] `src/overlay.css` : style de la loupe (carré, bordure, réticule via canvas, libellés).
- [ ] `src/overlay.js` : module loupe — sur `onSelectMove`, dessiner depuis `image`
      (région `point*scale ± size/2/zoom`, `imageSmoothing=false`), réticule, libellés
      `x,y` (= `round(point*scale)`) et `W×H` (= `round(rect*scale)`) ; positionner près du
      curseur en restant dans le viewport ; masquer sur `onSelectionDone`.
- [ ] Vérif GUI : loupe nette, coordonnées plausibles, taille correcte, disparaît après pose.

## Lot B — Cartouche de bulle

- [ ] `src/editor/bubbles.js` : `bubbleConnectorEnd(dx, dy, radius)` pur (point sur le
      cercle vers le cartouche ; gère dx=dy=0).
- [ ] `src/editor/bubbles.test.js` : tests (direction, longueur = radius, cas nul).
- [ ] `src/editor/editor.js` (`makeBubbleNode`) : trait `[off.dx, off.dy, ...edge]` au lieu
      de `[off.dx, off.dy, 0, 0]` ; idem dans `dragmove` du cartouche (recalcul de l'edge).
- [ ] Vérif GUI : trait ne déborde plus sur la bulle ; cartouche déplaçable, trait droit
      par défaut, suit le cartouche proprement.

## Lot C — Lancement au démarrage

- [ ] `src-tauri/Cargo.toml` : dép. `tauri-plugin-autostart`.
- [ ] `src-tauri/src/lib.rs` : `.plugin(tauri_plugin_autostart::init(LaunchAgent, None))`.
- [ ] `src-tauri/src/settings.rs` : champ `launch_at_login: bool` (défaut false).
- [ ] `src-tauri/src/commands.rs` : appliquer enable/disable autostart dans `update_settings` ;
      aligner au démarrage.
- [ ] `src/index.html` + `src/main.js` : case « Launch at login », chargée et enregistrée.
- [ ] Vérif GUI : cocher → l'app se relance après login/redémarrage ; décocher → non.

## Clôture

- [ ] `cargo test --lib` + `node --test` verts, `git diff --check` propre.
- [ ] Build `.app` release, validation GUI des 3 lots, merge dans master.
