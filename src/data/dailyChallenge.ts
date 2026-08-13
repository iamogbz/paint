export interface SampleImage {
  id: string;
  name: string;
  dataUrl: string;
}

const imageModules = import.meta.glob('./challengeImages/*.{png,jpg,jpeg,webp,gif,svg}', { eager: true, import: 'default' });

export function getDailyChallenge(): SampleImage {
  const keys = Object.keys(imageModules).sort();
  // Get the most recent image alphabetically (e.g. drawing_01, drawing_02...)
  const latestKey = keys[keys.length - 1];
  const challengeImgUrl = imageModules[latestKey] as string;

  return {
    id: "daily-challenge",
    name:  `Daily Challenge - ${new Date().toString().substring(0,10)}`,
    dataUrl: challengeImgUrl,
  };
}
