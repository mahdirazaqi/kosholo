import "server-only";

// Hours after sending during which a chat/group message can be edited
// (EDIT_WINDOW_HOURS, default 48). Channel posts have no limit.
export function editWindowHours() {
  const value = Number(process.env.EDIT_WINDOW_HOURS);
  return value > 0 ? value : 48;
}
