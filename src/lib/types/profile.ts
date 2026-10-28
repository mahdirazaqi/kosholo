// One profile photo as the viewer may see it (ordered, first = main).
export type ProfilePhotoItem = {
  id: string;
  fullUrl: string; // /api/media/{uploadId}        1280px (viewer)
  mediumUrl: string; // /api/media/{uploadId}/medium  640px (profile header)
  thumbUrl: string; // /api/media/{uploadId}/thumb   160px (avatars)
  placeholder: string | null; // tiny blurred data URL
  createdAt: string; // ISO
  isMain: boolean;
};
