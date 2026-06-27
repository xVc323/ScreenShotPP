// Décide si l'on doit présenter la bannière de mise à jour.
// - auto : on saute la version explicitement ignorée (égalité de chaîne) ;
//   quand une version différente sort, on re-notifie.
// - manuel : un check explicite montre toujours une MAJ disponible.
export function shouldNotify(availableVersion, skippedVersion, { auto } = {}) {
  if (!availableVersion) return false;
  if (!auto) return true;
  return availableVersion !== skippedVersion;
}
