import challengeImgUrl from "./challenge_image_01.png";

export interface SampleImage {
  id: string;
  name: string;
  dataUrl: string;
}

export function getDailyChallenge(): SampleImage {
  return {
    id: "daily-challenge",
    name: "Daily Challenge",
    dataUrl: challengeImgUrl,
  };
}
