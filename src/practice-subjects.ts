import {catalog} from './catalog.ts';

export interface Subject {zh:string;en:string}

const topics=[
  ['火车站','Train station','来 去 坐 回 北京'],
  ['学校','At school','老师 学生 学习 书 写'],
  ['商店','At the shop','买 钱 东西 苹果 衣服'],
  ['下雨','A rainy day','水 天气 冷 伞 家'],
  ['喝 茶','Tea time','茶 水 喝 杯子 热'],
  ['看 电影','Movie night','电影 看 朋友 晚上'],
  ['做 菜','Cooking together','菜 吃 做 米饭 妈妈'],
  ['小 猫','A little cat','猫 小 家 喜欢 看见'],
  ['新 朋友','A new friend','朋友 认识 名字 高兴'],
  ['看 书','Reading a book','书 读 看 字 喜欢'],
  ['买 水果','Shopping for fruit','水果 苹果 买 钱 多少'],
  ['我 的 家','My home','家 住 爸爸 妈妈 椅子'],
  ['坐 飞机','A plane trip','飞机 坐 北京 去 时间'],
  ['饭馆','At a restaurant','饭馆 吃 米饭 菜 桌子'],
  ['打电话','A phone call','打电话 说 听 朋友'],
  ['踢足球','Playing football','踢足球 运动 跑步 脚 球'],
  ['过 生日','A birthday celebration','生日 快乐 礼物 买 朋友'],
  ['周末 计划','Weekend plans','周末 计划 打算 明天 一起'],
  ['运动 俱乐部','Sports club','运动 比赛 参加 篮球 训练'],
  ['去 旅游','Going on a trip','旅游 旅行 车站 宾馆 地图'],
  ['参加 比赛','Entering a competition','比赛 参加 赢 努力 运动'],
  ['保护 环境','Protecting the environment','环境 保护 垃圾 公园 地球'],
  ['社区 活动','A community event','社区 活动 邻居 帮忙 组织'],
  ['传统 节日','A traditional festival','传统 节日 历史 文化 庆祝'],
  ['志愿者','Volunteering','志愿者 服务 社会 帮助'],
].map(([label,en,keywords])=>{
  const words=label.split(' ');
  return {zh:words.join(''),en,level:Math.max(...words.map(word=>catalog.wordLevel(word)??6)),keywords:keywords.split(' ')};
});

export function suggestSubjects(level:number,targets:string[],avoid:Subject[]){
  const band=Math.min(6,Math.floor(level)+1);
  const previous=new Set(avoid.map(subject=>subject.zh));
  return topics.filter(topic=>topic.level<=band).map(topic=>{
    const matches=targets.filter(word=>topic.zh.includes(word)||topic.keywords.some(key=>key.includes(word))).length;
    return {topic,fresh:!previous.has(topic.zh),rank:Math.min(matches,3)+topic.level/band+Math.random()};
  }).sort((a,b)=>Number(b.fresh)-Number(a.fresh)||b.rank-a.rank).slice(0,5)
    .map(({topic:{zh,en}})=>({zh,en}));
}

