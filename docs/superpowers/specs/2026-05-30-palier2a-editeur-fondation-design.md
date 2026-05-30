# Palier 2a — Éditeur d'annotation : fondation — Design

- **Date** : 2026-05-30
- **Statut** : Design validé
- **Dépend de** : Palier 1 (mergé dans `master`)
- **Contexte parent** : `docs/superpowers/specs/2026-05-30-screenshotpp-design.md` (§5 Éditeur)

---

## 1. Objectif

Poser la fondation de l'éditeur d'annotation par-dessus la sélection : un **canvas à objets
(Konva.js)**, un framework d'outils, les **formes simples** (rectangle, rond/ellipse,
droite, flèche), les propriétés **couleur + épaisseur**, **undo/redo**, et la **fusion des
annotations dans l'image** au moment de Copier/Enregistrer.

### Hors périmètre 2a (sous-paliers suivants)
- **2b** : dessin libre (crayon) + texte.
- **2c** : bulles numérotées.
- **Palier 3** : mosaïque + OCR.
- Réajuster la sélection après coup, modifier la couleur d'une forme déjà posée (nice-to-have, reportés).

---

## 2. Décision technique : Konva.js

Bibliothèque de canvas à objets, chargée **sans bundler** : on **vendorise** `konva.min.js`
dans `src/vendor/` et on l'inclut via `<script>` (expose le global `Konva`, compatible avec
notre setup `withGlobalTauri`, aucun CDN au runtime).

Raisons : formes intégrées (Rect, Ellipse, Arrow, Line), `Konva.Transformer` pour
déplacer/redimensionner, calques, détection de clic, export canvas avec `pixelRatio` (gère
la résolution Retina). Réimplémenter tout cela à la main serait coûteux et bogué.

---

## 3. Changement d'architecture (le cœur de 2a)

**Avant (Palier 1)** : après la sélection, **Rust** recadrait l'image (`rect`) puis
copiait/enregistrait.

**Après (2a)** : le **frontend compose l'image finale** et **Rust ne fait que recevoir les
octets**.

### Structure du stage Konva (overlay)
Trois calques, du fond vers le dessus :
1. **bgLayer** — `Konva.Image` de la capture gelée, à la taille logique de l'écran.
2. **annoLayer** — les annotations (formes), **clippé à la zone de sélection** (les dessins
   ne débordent pas). Porte le `Konva.Transformer` pour sélection/déplacement/redim.
3. **dimLayer** — voile sombre avec un « trou » sur la sélection + cadre bleu. **Affichage
   uniquement, masqué à l'export.**

### Flux
1. ⌘⇧2 → capture (inchangé) → l'overlay affiche la capture dans `bgLayer`.
2. **Phase sélection** : glisser définit la zone (comme Palier 1). Au relâcher, la zone est
   fixée, le trou du `dimLayer` apparaît, la barre d'outils (avec les outils) s'affiche.
3. **Phase annotation** : l'outil actif détermine l'effet du glisser (dessiner une forme,
   ou sélectionner/déplacer). Les formes sont créées dans `annoLayer`.
4. **Copier / Enregistrer** : on masque `dimLayer`/transformer, on appelle
   `stage.toCanvas({ x, y, width, height: <sélection>, pixelRatio: <scale physique> })` —
   ceci **compose bgLayer + annoLayer et recadre à la sélection en résolution physique** —
   puis on exporte en **PNG base64**.

### Côté Rust
Les commandes `rect` du Palier 1 (`copy_selection`, `save_selection`) sont **remplacées**
par des versions « image composée » :
- `copy_composited(png_base64)` → décode le PNG → `clipboard::copy_image` (module existant).
- `save_composited(png_base64, path, format)` → décode le PNG → `storage::encode_image`
  (ré-encode en PNG/JPEG selon le choix, module existant) → `storage::write_to_disk`.

Nouveau helper `storage::decode_png_to_rgba(&[u8]) -> RgbaImage`. Les modules `clipboard` et
`storage` sont réutilisés. `capture::crop_region` (et ses tests) restent en place mais ne
sont plus utilisés par le flux copier/enregistrer (conservés, sans coût).

---

## 4. Modèle de données frontend (isolation)

Séparer **le modèle** du **rendu** pour la testabilité :

- **`annotations`** : tableau de **descripteurs de formes** (données pures :
  `{ id, type, x, y, width, height, points?, stroke, strokeWidth }`). Source de vérité.
- **Historique (`history.js`)** : pile de **snapshots** du tableau `annotations` avec un
  index courant ; `undo`/`redo` déplacent l'index ; `push(snapshot)` tronque le redo.
  **Module pur, sans DOM → testé unitairement avec le runner intégré `node:test`** (Node 22,
  aucune dépendance ajoutée).
- **Renderer (`editor.js`)** : à partir de `annotations` + état de sélection, (re)dessine
  les objets Konva. Les interactions souris créent/modifient des descripteurs puis commitent
  un snapshot dans l'historique.

---

## 5. Barre d'outils (ajouts 2a)

À la barre du Palier 1 (Copier / Enregistrer / Annuler) s'ajoutent :
**Sélection/déplacement**, **Rectangle**, **Rond/ellipse**, **Droite**, **Flèche**,
**pastilles de couleur**, **sélecteur d'épaisseur**, **Undo**, **Redo**.

- Couleur/épaisseur s'appliquent aux **nouvelles** formes (édition d'une forme existante
  reportée).
- Formes en **contour** (stroke, sans remplissage).
- Outil Sélection : clic sélectionne (Transformer), glisser déplace, poignées
  redimensionnent, **Suppr/Backspace** supprime.

---

## 6. Découpage des fichiers

```
src/
├── vendor/konva.min.js        # lib vendorisée (global Konva)
├── overlay.html               # + <script konva> + conteneur stage + boutons outils
├── overlay.css                # + styles outils/barre
├── overlay.js                 # orchestration : capture, init editor, wiring barre + copy/save
└── editor/
    ├── history.js             # pile undo/redo (pure, testée node:test)
    ├── history.test.js        # tests node:test
    └── editor.js              # intégration Konva : calques, outils, rendu, export

src-tauri/src/
├── storage.rs                 # + decode_png_to_rgba + test round-trip
└── commands.rs                # + copy_composited / save_composited ; retire les cmds rect
```

---

## 7. Tests

- **Rust** : `decode_png_to_rgba` (round-trip encode→decode, dimensions + pixel), réutilise
  les tests storage existants.
- **Frontend pur** : `history.js` via `node --test src/editor/history.test.js` (push, undo,
  redo, troncature du redo, bornes).
- **Dessin / interactions** : **vérification GUI manuelle** sur le `.app` release.
- **CI** : ajouter un job `node --test` aux côtés des `cargo test` (macOS + Windows).

---

## 8. Critère d'acceptation 2a

Sur le `.app` release : après sélection, on peut dessiner rectangle/rond/droite/flèche avec
une couleur et une épaisseur choisies, les **déplacer/redimensionner/supprimer**, **annuler/
rétablir**, puis **Copier** et **Enregistrer** une image où **les annotations sont bien
fusionnées** dans la zone sélectionnée (PNG et JPEG), sur macOS et Windows.

---

## 9. Risques connus

- **Résolution Retina** : l'export doit utiliser `pixelRatio = capture physique / taille
  logique` (déjà maîtrisé au Palier 1 via `scale`).
- **Clip de `annoLayer`** à la sélection pour éviter le débordement.
- **Voile/transformer** doivent être masqués à l'export (sinon ils apparaîtraient dans
  l'image).
