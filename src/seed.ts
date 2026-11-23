import type { Story, Token } from './store.ts';

const words: Record<string, [string, string]> = {
  今天: ['jīntiān', 'today'], 下午: ['xiàwǔ', 'afternoon'], 我: ['wǒ', 'I'],
  和: ['hé', 'and'], 朋友: ['péngyou', 'friend'], 去: ['qù', 'go to'],
  喝: ['hē', 'drink'], 茶: ['chá', 'tea'], 她: ['tā', 'she'], 问: ['wèn', 'ask'],
  你: ['nǐ', 'you'], 想: ['xiǎng', 'would like'], 什么: ['shénme', 'what'],
  说: ['shuō', 'say'], 一: ['yī', 'one'], 杯: ['bēi', 'cup'], 好: ['hǎo', 'good'],
  这: ['zhè', 'this'], 是: ['shì', 'is'], 的: ['de', 'possessive particle'],
  水: ['shuǐ', 'water'], 很: ['hěn', 'very'], 热: ['rè', 'hot'],
  外面: ['wàimian', 'outside'], 下雨: ['xiàyǔ', 'rain'], 了: ['le', 'change of state'],
  我们: ['wǒmen', 'we'], 坐: ['zuò', 'sit'], 在: ['zài', 'at'], 这里: ['zhèlǐ', 'here'],
  看: ['kàn', 'look at'], 雨: ['yǔ', 'rain'], 再见: ['zàijiàn', 'goodbye'],
  明天: ['míngtiān', 'tomorrow'], 来: ['lái', 'come'], 吗: ['ma', 'question particle'],
};
function paragraph(line: string): Token[] {
  let sentence = 0;
  return line.split(' ').map(text => {
    const definition = words[text];
    const token = definition ? { text, pinyin: definition[0], meaning: definition[1], sentence } : { text, sentence };
    if ('。？！'.includes(text)) sentence++;
    return token;
  });
}
export const seedStory: Story = {
  id: 'tea-shop',
  title: 'At the tea shop',
  chapters: [
    { title: 'A cup of tea', paragraphs: [
      '今天 下午 ， 我 和 朋友 去 喝 茶 。',
      '她 问 我 ： “ 你 想 喝 什么 ？ ”',
      '我 说 ： “ 我 想 喝 一 杯 茶 。 ”',
      '她 说 ： “ 好 。 这 是 你 的 茶 。 ”',
    ].map(paragraph) },
    { title: 'A rainy afternoon', paragraphs: [
      '茶 很 热 。 外面 下雨 了 。',
      '我们 坐 在 这里 ， 喝 茶 ， 看 雨 。',
      '她 问 ： “ 明天 你 来 吗 ？ ”',
      '我 说 ： “ 好 ， 明天 再见 ！ ”',
    ].map(paragraph) },
  ],
};

