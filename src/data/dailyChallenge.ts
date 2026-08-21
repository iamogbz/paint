export interface SampleImage {
  id: string;
  name: string;
  dataUrl: string;
}

// Ensure Vite includes the keys for files in the public directory
const imageModules = import.meta.glob('/public/daily-challenge/*.{png,jpg,jpeg,webp,gif,svg}');

export function getAllDailyChallenges(limit?: number): SampleImage[] {
  const keys = Object.keys(imageModules).sort().reverse();
  const selectedKeys = limit ? keys.slice(0, limit) : keys;
  
  return selectedKeys.map((key) => {
    const challengeImgUrl = key.replace(/^\/public/, '');
    // Extract date from filename if possible, format: drawing_YYYY-MM-DD.ext
    const match = key.match(/drawing_(\d{4}-\d{2}-\d{2})\.\w+$/);
    const dateStr = match ? match[1] : "Unknown Date";

    return {
      id: `daily-challenge-${dateStr}`,
      name: `Daily Challenge - ${new Date(dateStr).toString().substring(0,10)}`,
      dataUrl: challengeImgUrl,
    };
  });
}

export function getDailyChallenge(): SampleImage {
  const challenges = getAllDailyChallenges(1);
  return challenges[0];
}
