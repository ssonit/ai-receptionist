/** Open a dialog/sheet after a dropdown menu finishes closing.
 * Avoids Radix leaving `body { pointer-events: none }` stuck.
 */
export function openAfterMenuClose(action: () => void) {
  window.setTimeout(action, 0);
}
