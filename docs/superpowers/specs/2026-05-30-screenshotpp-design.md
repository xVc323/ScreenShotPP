# ScreenShotPP — Document de design

- **Date** : 2026-05-30
- **Statut** : Design validé (en attente de relecture utilisateur)
- **Auteur** : xVc323 + Claude

---

## 1. Vision

Un logiciel de capture d'écran **multiplateforme (macOS + Windows)**, léger, tournant en
arrière-plan, déclenché par un raccourci global. Il permet de sélectionner une zone de
l'écran, de l'annoter richement (formes, flèches, texte, bulles numérotées, mosaïque),
d'en extraire le texte par OCR, puis de la copier dans le presse-papier ou de
l'enregistrer sur disque.

**Objectif** : remplacer les outils de capture existants jugés insatisfaisants, avec un
flux rapide et des outils d'annotation orientés tutoriels (les bulles numérotées étant la
fonctionnalité signature).

### Langue de l'interface
Toute l'interface de l'application est en **anglais** (boutons, menus, réglages, libellés).

### Non-objectifs (hors périmètre pour l'instant — YAGNI)
- Capture vidéo / enregistrement d'écran.
- Capture automatique selon la position du curseur (explicitement reporté : on fait la
  sélection manuelle de zone d'abord).
- Édition d'images importées depuis le disque.
- Synchronisation cloud / partage en ligne.
- Linux (cible : macOS + Windows uniquement).

---

## 2. Choix techniques

| Sujet | Choix | Raison |
|---|---|---|
| Framework | **Tauri** | Cœur Rust (langage souhaité), interface web pour l'éditeur, installateurs auto, binaires légers |
| Cœur logique | **Rust** | Capture, raccourci global, presse-papier, fichiers, OCR, tray |
| Interface | **Web (HTML/CSS/JS + canvas)** | Le canvas web est l'outil le plus adapté pour l'éditeur d'annotation |
| OCR | **API natives OS** | Vision (macOS), Windows.Media.Ocr (Windows) — gratuit, multilingue, rien à embarquer |
| Distribution | **Tauri bundler** | `.dmg`/`.app` (macOS), `.msi`/`.exe` (Windows) |

### Bibliothèques pressenties (à confirmer lors de l'implémentation)
- Capture d'écran : crate Rust de capture (ex. `xcap`) ou API natives via le système.
- Canvas d'annotation : une bibliothèque de dessin sur canvas (ex. Konva.js / Fabric.js)
  ou un canvas maison — à trancher au palier 2.
- Raccourci global : plugin `tauri-plugin-global-shortcut`.
- Presse-papier image : plugin presse-papier de Tauri / crate dédiée.

---

## 2 bis. Multiplateforme & livrables

- **Un seul projet, un seul code source.** Tauri/Rust compile ce même code en deux
  binaires natifs distincts. Pas de back-end dédoublé à maintenir.
- **Différences OS = petites branches conditionnelles** (`#[cfg(target_os = "...")]`) dans
  le même code, isolées : politique d'arrière-plan (Dock macOS vs tray Windows), OCR
  (Vision vs Windows.Media.Ocr), installateur. Le reste (interface, capture, recadrage,
  presse-papier, sauvegarde) est identique.
- **Deux livrables finaux, inévitables** (un binaire ne tourne que sur son OS) :
  - **macOS** : `.app` livré dans un `.dmg` (drag & drop), idéalement signé + notarisé.
  - **Windows** : installateur `.msi` / `.exe` (Tauri bundler).
- **Chaque livrable se compile sur son propre OS** : le `.app` sur le Mac, le `.exe`/`.msi`
  via **GitHub Actions** (matrice `macos-latest` + `windows-latest`), qui produit les deux
  automatiquement à chaque push.

## 3. Architecture

```
┌──────────────────────────────────────────────┐
│                  Cœur Rust                     │
│  - Capture d'écran (multi-moniteur)            │
│  - Raccourci global                            │
│  - Presse-papier (image + texte)               │
│  - Enregistrement fichier (PNG/JPG/WebP)       │
│  - OCR natif (Vision / Windows.Media.Ocr)      │
│  - Icône menu bar / system tray                │
│  - Stockage des réglages                       │
└───────────────▲───────────────┬───────────────┘
                │ commands Tauri │ events
┌───────────────┴───────────────▼───────────────┐
│            Interface web (WebView)             │
│  - Overlay de sélection de zone                │
│  - Éditeur d'annotation (canvas + barre)       │
│  - Panneau d'aperçu OCR                         │
│  - Fenêtre de réglages                          │
└────────────────────────────────────────────────┘
```

**Principe d'isolation** : chaque unité a une responsabilité claire et une interface
définie. Le cœur Rust ne connaît rien du rendu ; l'interface ne connaît rien des API
système. Ils communiquent uniquement via les commands/events Tauri.

### Modules Rust (cibles)
- `capture` : prise de l'image écran, gestion multi-moniteur et DPI.
- `hotkey` : enregistrement/désenregistrement du raccourci global.
- `clipboard` : copie image et texte.
- `storage` : enregistrement fichier, choix de format, chemins.
- `ocr` : abstraction OCR avec implémentation par plateforme.
- `tray` : icône d'arrière-plan et son menu.
- `settings` : lecture/écriture des préférences.

### Composants Interface
- `selection-overlay` : fenêtre transparente plein écran, sélection de zone.
- `editor` : canvas + barre d'outils flottante + outils de dessin.
- `ocr-panel` : aperçu et édition du texte reconnu.
- `settings-window` : préférences.

---

## 4. Déroulé d'une capture

1. L'utilisateur appuie sur le **raccourci global** (défaut **⌘⇧2 / Ctrl⇧2**, modifiable).
2. L'écran s'**assombrit**, l'utilisateur **sélectionne une zone** à la souris
   (multi-moniteur géré).
3. La **barre d'outils flottante** apparaît collée au bord de la sélection.
   **Aucune copie automatique** — l'utilisateur décide.
4. L'utilisateur annote si besoin, puis termine par :
   - **⌘C / Ctrl C** ou bouton **Copy** → image dans le presse-papier.
   - **Save (💾)** → fenêtre d'enregistrement (emplacement + format).
   - **Échap** → annule et ferme l'overlay.

### Raccourcis clavier dans l'éditeur
- `⌘C / Ctrl C` : copier · `⌘Z / Ctrl Z` : annuler · `⌘⇧Z / Ctrl⇧Z` : rétablir
- `Échap` : annuler la capture · `Entrée` : valider (action par défaut à préciser au palier 2)

---

## 5. Éditeur d'annotation

Barre d'outils flottante en 3 groupes :

**Groupe 1 — Outils de dessin**
Rectangle · Ellipse/rond · Droite · Flèche · Dessin libre · Texte · Bulle numérotée ·
Mosaïque.

**Groupe 2 — Propriétés de l'outil actif**
Couleur (palette) · épaisseur du trait. S'adaptent à l'outil sélectionné.

**Groupe 3 — Actions**
Annuler · Rétablir · **OCR** (libellé en petit texte « OCR », pas d'icône emoji) ·
Copier · Enregistrer.

### Bulles numérotées (fonctionnalité signature)
- Chaque clic avec l'outil bulle pose une **pastille numérotée** ; le compteur
  s'**incrémente automatiquement** (1, 2, 3…).
- Si l'utilisateur **tape du texte** : un **trait** relie la pastille à un **cartouche**
  contenant le texte. Sans texte : **pastille seule**.
- La pastille et le cartouche sont **déplaçables** ; le trait suit.
- **Suppression** d'une bulle → **renumérotation automatique** des suivantes
  (ex. supprimer la 2 → l'ancienne 3 devient 2).

### Mosaïque
Outil de floutage en mosaïque (pixelisation) appliqué à une zone sélectionnée, pour
masquer du texte/des informations sensibles.

---

## 6. OCR

- Utilise l'**OCR natif** de chaque système :
  - **macOS** : framework **Vision** — multilingue, avec **détection automatique** de la
    langue (macOS 13+).
  - **Windows** : **Windows.Media.Ocr** — reconnaît les langues dont le **pack de langue**
    est installé, sélection auto depuis les langues du profil utilisateur.
- **Détection automatique de la langue par défaut**, plus un **sélecteur de langue** dans
  les réglages.
- Flux : clic **OCR** → **panneau d'aperçu** affichant le texte reconnu, **modifiable et
  sélectionnable**, puis copie dans le presse-papier.
- Aucun moteur tiers à embarquer.

---

## 7. Enregistrement & presse-papier

- **PNG par défaut.** Menu déroulant **JPG / WebP** dans la fenêtre d'enregistrement.
- Nom de fichier par défaut type `Capture 2026-05-30 à 14.32.png`.
- **Dossier de sauvegarde par défaut configurable** (proposition : le Bureau ; à confirmer).
- La fenêtre d'enregistrement classique permet de choisir l'emplacement.
- **Copie image** dans le presse-papier, collable ailleurs (⌘V / Ctrl V).

---

## 8. Application en arrière-plan

- **Pas d'icône dans le Dock (macOS) ni dans la barre des tâches (Windows).**
  L'app vit dans le **menu bar (macOS)** / **system tray (Windows)**.
  - macOS : politique d'activation « accessory » (LSUIElement).
- **Menu de l'icône** :
  - Open settings
  - Change capture shortcut
  - Default save folder
  - Version number
  - Quit

---

## 9. Contraintes plateforme

### macOS
- **Permission « Enregistrement de l'écran » obligatoire** : l'app la demande au 1er usage
  et guide l'utilisateur vers Réglages Système si refusée.
- Le raccourci global peut nécessiter des permissions d'accessibilité/saisie selon
  l'implémentation.
- Distribution `.app` (drag & drop dans Applications). Signature/notarisation à prévoir
  pour éviter Gatekeeper (palier 4).

### Windows
- Installateur `.msi` / `.exe`.
- Gestion correcte du **DPI / mise à l'échelle** et du **multi-écran** (zones les plus
  sujettes aux bugs des outils de capture).

---

## 10. Réglages (modèle de données)

Préférences persistées :
- `capture_shortcut` (défaut `⌘⇧2 / Ctrl⇧2`)
- `default_save_folder`
- `default_format` (`png` | `jpg` | `webp`, défaut `png`)
- `ocr_language` (`auto` | code langue)
- `app_version` (lecture seule, affiché)

---

## 11. Stratégie de test

- **Test manuel** : **UTM (gratuit) + Windows 11 ARM** (ISO gratuit Microsoft, fonctionne
  sans clé). VM pour cliquer dans l'app sur Windows depuis le Mac.
- **CI automatique** : **GitHub Actions** avec runners Windows x64 (gratuit en dépôt
  public) pour compiler et lancer les tests à chaque modification.
- Tests par palier : chaque palier doit être démontrable et testé avant de passer au
  suivant.

---

## 12. Feuille de route par paliers

### Palier 1 — Boucle de base
Tray/menu bar + raccourci global + overlay de sélection de zone + copier presse-papier +
enregistrer fichier (PNG).
**Critère d'acceptation** : capturer une zone et la coller/enregistrer, sur macOS et
Windows, app en arrière-plan sans icône Dock/barre des tâches.

### Palier 2 — Éditeur d'annotation
Barre flottante + tous les outils de dessin (rectangle, rond, droite, flèche, dessin
libre, texte) + bulles numérotées (avec renumérotation auto) + propriétés (couleur,
épaisseur) + annuler/rétablir.
**Critère d'acceptation** : annoter une capture avec chaque outil, déplacer/supprimer des
bulles avec renumérotation correcte.

### Palier 3 — Outils avancés
OCR (panneau d'aperçu, multilingue auto) + mosaïque.
**Critère d'acceptation** : extraire du texte d'une zone (FR + EN au moins) et flouter une
zone en mosaïque.

### Palier 4 — Réglages & finitions
Fenêtre de réglages (raccourci, dossier, format, langue OCR, version) + installateurs
propres + signature/notarisation macOS.
**Critère d'acceptation** : modifier un réglage le persiste ; installateurs fonctionnels
sur les deux OS.

---

## 13. Questions ouvertes / à trancher plus tard
- Dossier de sauvegarde par défaut : Bureau ? Dossier Images ? (proposition : Bureau)
- Bibliothèque de canvas d'annotation (maison vs Konva/Fabric) → palier 2.
- Comportement de la touche `Entrée` (action par défaut) dans l'éditeur → palier 2.
- Format exact du nom de fichier par défaut.

## 14. Problèmes connus / optimisations futures

- **Léger voile gris à l'ouverture de l'overlay (~100-300 ms en release, 1-2 s en dev
  debug).** Cause : la fenêtre overlay s'affiche *avant* que l'image gelée soit encodée
  (PNG rapide) + transférée via base64/IPC. Jugé acceptable pour le Palier 1 (vérifié sur
  le `.app` release). Leviers d'optimisation à explorer plus tard :
  1. Encoder l'image **avant** de créer la fenêtre (la fenêtre s'ouvre déjà prête).
  2. Servir l'image via un **protocole natif custom** (`capture://current`) au lieu de
     base64 + IPC (moins de surcoût de transfert).
  3. Pour le confort de dev uniquement : `[profile.dev.package."*"] opt-level = 3` dans
     `Cargo.toml` pour optimiser les dépendances (encodage image) même en build debug.
- **L'icône menu bar et la latence ne sont représentatives qu'en build release/empaqueté.**
  Le mode `tauri dev` (binaire debug non empaqueté) n'affiche pas l'icône de façon fiable
  et est nettement plus lent — toujours valider le ressenti sur le `.app`.
