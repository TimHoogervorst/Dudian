export const storyDifficulty={
  easy:{questions:1,points:1.5,focusCards:2},
  medium:{questions:2,points:2,focusCards:3},
  hard:{questions:3,points:2.5,focusCards:6}
} as const;

export function lengthBudget(shortLimit:number,chapters:number){
  const extra=Math.min(shortLimit,2)*(chapters-1);
  return shortLimit+Math.min(extra,Math.max(0,12-shortLimit));
}
