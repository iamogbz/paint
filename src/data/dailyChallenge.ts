export interface SampleImage {
  id: string;
  name: string;
  dataUrl: string;
}

// Ensure Vite includes the keys for files in the public directory
const imageModules = import.meta.glob('/public/challengeImage/*.{png,jpg,jpeg,webp,gif,svg}');

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
