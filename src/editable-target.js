/** Les champs éditables conservent leurs raccourcis natifs. */
export function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return ["input", "textarea", "select"].includes(tagName)
    || target?.isContentEditable === true
    || Boolean(target?.closest?.("[contenteditable='true']"));
}

/** Escape ferme le panneau OCR avant de pouvoir annuler la capture. */
export function shouldCloseOcrPanel(event, panelHidden) {
  return event.key === "Escape" && !panelHidden;
}
