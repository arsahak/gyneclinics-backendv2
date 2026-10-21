// Matches the video id out of any common YouTube URL shape: watch?v=,
// youtu.be/, /embed/, and /shorts/.
const YOUTUBE_ID_PATTERN =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export const extractYoutubeId = (url: string): string | null => {
  const match = url.trim().match(YOUTUBE_ID_PATTERN);
  return match ? match[1] : null;
};

// Store the canonical embeddable form so the frontend can drop it straight
// into an <iframe> without re-parsing whatever URL shape the user pasted.
export const youtubeEmbedUrl = (id: string): string =>
  `https://www.youtube.com/embed/${id}`;
