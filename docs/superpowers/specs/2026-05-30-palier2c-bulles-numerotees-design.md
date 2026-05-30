# Palier 2c — Bulles numérotées — Design

- **Date** : 2026-05-30
- **Statut** : Design validé
- **Dépend de** : Palier 2b (mergé dans `master`)
- **Contexte parent** : `docs/superpowers/specs/2026-05-30-screenshotpp-design.md` (§5, feature signature)

---

## 1. Objectif
Ajouter l'outil **Bulle numérotée** à l'éditeur : un clic pose une pastille numérotée qui
s'incrémente ; un double-clic ajoute/édite un **cartouche de texte** relié par un trait ;
suppression avec **renumérotation automatique**. Dernière brique de l'éditeur (avant
Palier 3 OCR/mosaïque).

## 2. Comportement
- Outil **Bubble**. **Clic** dans la sélection → pose une pastille ronde numérotée
  (couleur courante). Numéro auto-incrémenté (1, 2, 3…).
- **Double-clic** sur une bulle → `<textarea>` au-dessus (réutilise la saisie 2b
  généralisée). Texte saisi → **trait + cartouche** reliés à la bulle ; vide → pastille
  seule. Re-double-clic = éditer.
- **Déplacement** : glisser la bulle déplace l'ensemble (cartouche + trait suivent) ;
  glisser le **cartouche** seul le repositionne (trait suit). Bulle supprimable (Suppr).
- **Renumérotation auto** : le numéro **n'est pas stocké**, il est **dérivé du rang** de la
  bulle parmi les bulles (ordre dans `annotations`). Supprimer une bulle décale les rangs →
  renumérotation automatique, sans état à maintenir.
- **Undo/redo** comme le reste ; **fusion à l'export** (Konva → image).

## 3. Apparence (conforme à la maquette validée session 1)
- Pastille : `Konva.Circle` plein (couleur courante) + numéro **blanc gras** centré.
- Cartouche : `Konva.Rect` fond sombre (`#0d1117`), **bordure = couleur**, texte clair ;
  **trait** (`Konva.Line`) de la couleur reliant le centre du cartouche au centre de la bulle.

## 4. Architecture
- Descripteur compound `bubble` : `{ id, type:"bubble", x, y, color, label, labelOffset }`
  où `(x,y)` = centre de la pastille, `label` = texte (vide = pas de cartouche),
  `labelOffset = {dx,dy}` = position du cartouche relative à la bulle (défaut au-dessus).
- Rendu en `Konva.Group` (origine = centre bulle) : cercle + numéro ; si `label`, un trait +
  un sous-groupe cartouche (nommé `label`, déplaçable indépendamment).
- **Fonction pure `bubbleNumberAt(annotations, index)`** (rang 1-based de la bulle, ou null)
  dans `src/editor/bubbles.js` → **testée `node:test`**. `editor.js` l'utilise au rendu.
- Saisie de texte **généralisée** : `openTextEditor(point, { initial, onCommit })` sert au
  texte libre (2b) **et** au label de bulle (`onCommit` écrit `descriptor.label`).
- Intégration `editor.js` : `setTool` accepte `bubble` ; `pointerdown` pose la bulle au clic ;
  `renderAnnotations` calcule le numéro et délègue à `makeBubbleNode` ; suppression via le
  flux existant (filtre par id) → renumérotation au re-rendu ; `setTool` met aussi à jour le
  `draggable` des sous-groupes cartouche (`find(".label")`).

## 5. Tests
- `bubbleNumberAt` : rangs, non-bulles, après suppression simulée → `node:test` (ajouté à la CI).
- Interaction (clic, double-clic, drag, renumérotation visuelle) = **vérif GUI manuelle**.

## 6. Critère d'acceptation
Sur le `.app` release : poser plusieurs bulles (numéros croissants), ajouter un cartouche par
double-clic, déplacer bulle et cartouche (trait suit), supprimer une bulle (les suivantes se
renumérotent), undo/redo, et copier/enregistrer une image où bulles+cartouches sont fusionnés
— macOS et Windows, CI verte.

## 7. Reporté
OCR + mosaïque (Palier 3), réglages/installateurs (Palier 4), styles avancés de bulle
(taille réglable, formes).
