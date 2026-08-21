export interface SampleImage {
  id: string;
  name: string;
  dataUrl: string;
}

// Ensure Vite includes the keys for files in the public directory
const imageModules = import.meta.glob('/public/daily-challenge/*.{png,jpg,jpeg,webp,gif,svg}');

export function getAllDailyChallenges(): SampleImage[] {
  const keys = Object.keys(imageModules).sort().reverse();
  
  return keys.map((key) => {
    const challengeImgUrl = key.replace(/^\/public/, '');
    // Extract date from filename if possible, format: drawing_YYYY-MM-DD.ext
    const match = key.match(/drawing_(\d{4}-\d{2}-\d{2})\.\w+$/);
    const dateStr = match ? match[1] : "Unknown Date";

    return {
      id: `daily-challenge-${dateStr}`,
      name: `Daily Challenge - ${dateStr}`,
      dataUrl: challengeImgUrl,
    };
  });
}

export function getDailyChallenge(): SampleImage {
  const keys = Object.keys(imageModules).sort();
  // Get the most recent image alphabetically (e.g. drawing_01, drawing_02...)
  const latestKey = keys[keys.length - 1];
  const challengeImgUrl = latestKey.replace(/^\/public/, '');
  
  return {
    id: "daily-challenge",
    name:  `Daily Challenge - ${new Date().toString().substring(0,10)}`,
    dataUrl: challengeImgUrl,
  };
}
