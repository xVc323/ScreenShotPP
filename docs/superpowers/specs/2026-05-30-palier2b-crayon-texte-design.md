# Palier 2b — Éditeur : dessin libre + texte — Design

- **Date** : 2026-05-30
- **Statut** : Design validé
- **Dépend de** : Palier 2a (mergé dans `master`)
- **Contexte parent** : `docs/superpowers/specs/2026-05-30-screenshotpp-design.md` (§5)

---

## 1. Objectif
Ajouter à l'éditeur d'annotation deux outils : **Crayon (dessin libre)** et **Texte**
(saisie sur place). Réutilise toute l'infrastructure 2a (Konva, sélection, historique,
export composé). Hors périmètre : bulles numérotées (2c), OCR/mosaïque (Palier 3),
ré-édition du contenu d'un texte déjà posé.

## 2. Crayon (dessin libre)
- Nouveau descripteur `free` : `{ id, type:"free", points:[x0,y0,x1,y1,...], stroke, strokeWidth }`.
- Rendu : `Konva.Line` avec `tension` (lissé), `lineCap`/`lineJoin: "round"`, sans
  remplissage.
- Tracé : `pointerdown` dans la sélection démarre la ligne ; `pointermove` **ajoute** des
  points (clampés à la sélection) ; `pointerup` valide. Couleur/épaisseur courantes.
- Comportement objet : déplaçable (comme `line`/`arrow`, déplacement appliqué aux points),
  **pas de redimensionnement** (transformer sans poignées), supprimable, dans l'undo/redo.
- Rejet si dégénéré (longueur totale < seuil).

## 3. Texte (saisie sur place)
- Outil **Texte**. `pointerdown` dans la sélection → un **champ HTML `<textarea>`
  temporaire** est créé et positionné au point cliqué, à la **couleur** et à la **taille**
  courantes, focus automatique. (Pas de création de forme au drag pour cet outil.)
- Saisie WYSIWYG. Validation : **blur (clic ailleurs)**, **Échap**, ou **⌘/Ctrl+Entrée**.
  **Entrée** insère un saut de ligne (multi-ligne autorisé). Texte vide → rien posé.
- À la validation : le `<textarea>` est retiré ; si non vide, un descripteur
  `{ id, type:"text", x, y, text, fill, fontSize }` est ajouté et rendu en `Konva.Text`
  (mêmes x/y, `fontFamily` identique au textarea pour la fidélité).
- Comportement objet : déplaçable, supprimable, dans l'undo/redo. Redimensionnement et
  ré-édition du contenu = reportés.

## 4. Barre d'outils (ajouts)
- Boutons d'outil : **Crayon (✎)** et **Texte (A)** (s'ajoutent à select/rect/ellipse/line/arrow).
- **Sélecteur de taille de police** dédié `#fontsize` (16 / 24 / 32 / 48, défaut 24),
  distinct du sélecteur d'épaisseur de trait.

## 5. Architecture
- Le `<textarea>` temporaire est géré **dans `editor.js`** (il connaît coordonnées canvas,
  couleur, taille). Nouvel état `fontSize` + méthode publique `setFontSize(n)` appelée par
  la barre. `fontFamily` constante partagée (ex. `Arial`) entre textarea et `Konva.Text`.
- `editor.js` étend les fonctions existantes pour les types `free` et `text` :
  `makeDescriptor`, `makeNode`, `applyDescriptor`, `syncDescriptorFromNode`, `isDegenerate`,
  la sélection/anchors, et le cas spécial `pointermove` du crayon + le cas spécial
  `pointerdown` du texte. `setTool` accepte `free` et `text`.
- `editor.js` expose `setFontSize`. `overlay.js` ajoute les deux boutons et le `<select>`
  taille, et câble `setFontSize`. Une `destroy()`/validation du textarea en cours doit être
  déclenchée avant export/undo/redo/cancel.

## 6. Tests
- Logique pure (historique) déjà couverte ; pas de nouvelle logique pure isolable
  significative en 2b. **Vérification GUI manuelle** sur le `.app` release (dessin libre et
  saisie de texte sont intrinsèquement interactifs). CI inchangée (cargo + node historique).

## 7. Critère d'acceptation 2b
Sur le `.app` release : tracer au crayon (couleur/épaisseur), écrire du texte sur place
(couleur/taille, multi-ligne), déplacer/supprimer ces annotations, undo/redo, puis
copier/enregistrer une image où **crayon et texte sont fusionnés** — macOS et Windows, CI verte.

## 8. Risques
- Synchroniser le `<textarea>` en cours d'édition : il faut le **valider/retirer** avant
  tout export, undo/redo ou cancel (sinon texte perdu ou résidu HTML dans la capture — mais
  le textarea HTML n'apparaît pas dans `stage.toCanvas`, donc surtout risque de texte non
  committé).
- Fidélité textarea ↔ Konva.Text : même `fontFamily`, `fontSize`, couleur, et alignement du
  point d'origine (Konva.Text `x,y` = coin haut-gauche, comme le textarea).
