"use client";

// The "back stack": every open layer (sheet, dialog, menu, viewer, selection
// mode, reply/edit/forward bar...) pushes a history entry, so the Android back
// button / browser back closes the topmost layer first and only then leaves the
// page. Closing a layer from the UI pops its entry again (no double back step).
//
// Next's router restores pages from history.state (it needs `__NA`), so every
// entry copies the current state and only adds our marker.

type Layer = { id: number; close: () => void };

const stack: Layer[] = [];
let nextId = 1;
let ignorePops = 0;
let listening = false;

function onPopState() {
  if (ignorePops > 0) {
    ignorePops--; // the pop we caused ourselves
    return;
  }
  const top = stack.pop();
  top?.close(); // the hook's cleanup finds the layer gone and does nothing
}

// Registers an open layer. `close` closes it (called on back). Returns a
// release function for closing it from the UI.
export function pushLayer(close: () => void): () => void {
  if (!listening) {
    window.addEventListener("popstate", onPopState);
    listening = true;
  }
  const layer: Layer = { id: nextId++, close };
  stack.push(layer);
  window.history.pushState({ ...window.history.state, __layer: layer.id }, "");

  return () => {
    const index = stack.indexOf(layer);
    if (index === -1) return; // already closed by back
    stack.splice(index, 1);
    // Drop our history entry, but only if it is still the current one (after a
    // navigation it isn't, and going back would undo the navigation).
    if (index === stack.length && window.history.state?.__layer === layer.id) {
      ignorePops++;
      window.history.back();
    }
  };
}

// Closes a Radix layer (dialog, sheet, menu, popover) the way Escape does.
export function closeWithEscape() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}
