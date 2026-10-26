// The only user shape that may be sent to another user's browser.
// Never add email, passwordHash or other private fields here.
export const publicUserSelect = {
  id: true,
  name: true,
  username: true,
  avatarUrl: true,
} as const;

export type PublicUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
};
