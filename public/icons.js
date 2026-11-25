const paths = {
  speaker: 'M3 9h4l5-5v16l-5-5H3Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  bookmark: 'M6 3h12v18l-6-4-6 4Z',
  newspaper: 'M3 4h15v14a2 2 0 0 0 4 0V8h-4M3 4v14a2 2 0 0 0 2 2h15M6 8h4v4H6zM13 8h2m-2 4h2m-9 4h9',
  conversation: 'M3 3h13v10H8l-5 4ZM19 8h2v13l-5-4h-5v-1',
  microphone: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0Zm-4 6a7 7 0 0 0 14 0m-7 7v3m-4 0h8',
  headphones: 'M3 14v-2a9 9 0 0 1 18 0v2M3 13h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2Zm18 0h-3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2Z',
  easy: 'M2 19h20M4 19l6-9 6 9',
  medium: 'M2 19h20M2 19l6-8 3 4 5-10 6 14',
  hard: 'M1 19h22M1 19l5-8 3 4 5-12 9 16m-12-9 3 1 2-3',
  short: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 4v5l4-2',
  long: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 4v10',
  book: 'M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15',
  books: 'M3 4h4v16H3z M9 6h4v14H9z M15 5l4-1 4 15-4 1z',
  settings: 'm10 3 .5-1h3l.5 2 2 .9 2-.7 2 2-1 2 .9 2 2.1.8v3l-2.1.6-.9 2 1 2-2 2-2-.8-2 1-.5 1.7h-3L10 20l-2-.9-2 .8-2-2 1-2-.9-2L2 13v-3l2.1-.6L5 7.5l-1-2 2-2 2 .8 2-.8ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  flag: 'M4 21V4m0 1c5-5 10 4 16 0v10c-6 4-11-5-16 0',
};

export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ui-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
