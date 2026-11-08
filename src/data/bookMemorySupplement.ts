// Locally curated from the user's morphology books and associative-memory book.
// Entries with unreliable OCR meanings were intentionally excluded.
export const BOOK_EXTRA_PREFIXES = [
  { forms: ['hyper'], meaning: '超过；过度；过强' },
  { forms: ['retro'], meaning: '向后；相反' },
  { forms: ['radio'], meaning: '放射；辐射' },
  { forms: ['abs'], meaning: '离开；除去' },
  { forms: ['circum'], meaning: '环绕；周围' },
  { forms: ['de'], meaning: '向下；去除' },
  { forms: ['counter'], meaning: '相反；对抗' },
  { forms: ['un'], meaning: '不；否定' },
  { forms: ['over'], meaning: '过度；在上' },
  { forms: ['bene'], meaning: '好；善' },
  { forms: ['sur'], meaning: '在上；超过' },
  { forms: ['en'], meaning: '使……；进入' },
  { forms: ['auto'], meaning: '自己；自动' },
  { forms: ['pre'], meaning: '在前；预先' },
  { forms: ['im'], meaning: '不；否定；进入' },
  { forms: ['mini'], meaning: '小；微型' },
  { forms: ['down'], meaning: '向下；降低' },
  { forms: ['semi'], meaning: '半；部分' },
  { forms: ['sub'], meaning: '在下；次级' },
  { forms: ['under'], meaning: '在下；不足' }
]

export const BOOK_EXTRA_ROOTS = [
  { forms: ['struct'], meaning: '建造；建立' },
  { forms: ['rad'], meaning: '根；射线' },
  { forms: ['seism'], meaning: '地震；震动' },
  { forms: ['glut'], meaning: '吞咽；大量吃' },
  { forms: ['cav'], meaning: '洞；空腔' },
  { forms: ['vapor'], meaning: '蒸汽；汽化' },
  { forms: ['arm'], meaning: '武器；装备' },
  { forms: ['contamin'], meaning: '污染；弄脏' },
  { forms: ['ethn'], meaning: '民族；族群' },
  { forms: ['cogn', 'gnos'], meaning: '知道；认识' },
  { forms: ['phob'], meaning: '恐惧；厌恶' },
  { forms: ['act'], meaning: '行动；做' },
  { forms: ['agon'], meaning: '挣扎；斗争' },
  { forms: ['ambul'], meaning: '走；行走' },
  { forms: ['ann', 'enn'], meaning: '年；每年' },
  { forms: ['ant', 'anc'], meaning: '古老；先前' },
  { forms: ['bat'], meaning: '打；击' },
  { forms: ['celer'], meaning: '快；迅速' },
  { forms: ['cid', 'cis'], meaning: '切；杀' },
  { forms: ['cit'], meaning: '唤起；引用' },
  { forms: ['cond'], meaning: '藏；隐藏' },
  { forms: ['corn'], meaning: '角；尖端' },
  { forms: ['corp', 'corpor'], meaning: '身体；主体' },
  { forms: ['dict'], meaning: '说；断言' },
  { forms: ['doc'], meaning: '教；教导' },
  { forms: ['duc'], meaning: '引导；带领' },
  { forms: ['flect', 'flex'], meaning: '弯曲；转折' },
  { forms: ['form'], meaning: '形状；形成' },
  { forms: ['fract', 'frag'], meaning: '打碎；断裂' },
  { forms: ['grad'], meaning: '步；等级；前进' },
  { forms: ['gyn'], meaning: '妇女；女性' },
  { forms: ['habit'], meaning: '居住；习惯' },
  { forms: ['jun', 'juven'], meaning: '年轻；青年' },
  { forms: ['mit'], meaning: '放；送；派出' },
  { forms: ['ment'], meaning: '思想；心智' },
  { forms: ['mers', 'merg'], meaning: '沉；没入；融合' },
  { forms: ['migr'], meaning: '迁移；移动' },
  { forms: ['mob'], meaning: '移动；推动' },
  { forms: ['mod'], meaning: '模式；尺度' },
  { forms: ['morb', 'mort'], meaning: '死亡；疾病' },
  { forms: ['mut'], meaning: '改变；交换' },
  { forms: ['neg'], meaning: '否认；否定' },
  { forms: ['norm'], meaning: '规则；规范' },
  { forms: ['nunci', 'nounce'], meaning: '讲；宣布' },
  { forms: ['onym'], meaning: '名字；名称' },
  { forms: ['oper'], meaning: '工作；操作' },
  { forms: ['opt'], meaning: '选择；看' },
  { forms: ['ora'], meaning: '嘴；说' },
  { forms: ['ori', 'orig'], meaning: '升起；开始' },
  { forms: ['orn'], meaning: '装饰；装备' },
  { forms: ['pass'], meaning: '感受；承受' },
  { forms: ['soci'], meaning: '社会；同伴' },
  { forms: ['electr'], meaning: '电；电子的' },
  { forms: ['pel', 'puls'], meaning: '推动；驱动' },
  { forms: ['phag'], meaning: '吃；吞噬' },
  { forms: ['priv'], meaning: '个人；私人' },
  { forms: ['pugn'], meaning: '打；战斗' },
  { forms: ['sanguin'], meaning: '血；血液' },
  { forms: ['sinu'], meaning: '弯曲；曲线' },
  { forms: ['speci'], meaning: '种类；特别' },
  { forms: ['stell'], meaning: '星；星星' },
  { forms: ['stitut', 'stit'], meaning: '建立；放置' },
  { forms: ['tour', 'torn', 'tourn'], meaning: '转；回转' }
]

export const BOOK_EXTRA_SUFFIXES = [
  { forms: ['able'], meaning: '形容词后缀：能够……的' },
  { forms: ['ant'], meaning: '名词后缀：人或物' },
  { forms: ['ium'], meaning: '名词后缀：物质、场所或状态' },
  { forms: ['ism'], meaning: '名词后缀：主义、体系或特征' },
  { forms: ['ster'], meaning: '名词后缀：从事……的人' }
]

// High-confidence associative clues explicitly present in the 7000-word memory book.
export const HOMOPHONE_MEMORY: Record<string, string> = {
  pest: '拍死它。看到害虫就拍死它，自然能记住 pest。',
  ambulance: '俺不能死。紧急情况下快叫救护车：ambulance。',
  roman: '罗马。Roman 的读音可直接锚定中文“罗马”。',
  dome: '躲哥。圆顶下躲着哥哥，联想 dome = 圆顶。',
  commission: '可没收。佣金、委托金多到可以被没收，记住 commission。',
  schedule: '死磕就。把日程死磕到底，联想 schedule = 日程安排。',
  embarrassed: '俺不累死。当众出糗很尴尬，但我不会累死：embarrassed。',
  admire: 're 读音近“阿姨”：广告里迷人的阿姨令人钦佩，记住 admire = 钦佩。',
  adventure: 'venture 读音近“玩车”：广告里的玩车是一场冒险，记住 adventure = 冒险。',
  aloud: 'loud 读音近“老的”：老人大声地叫喊，记住 aloud = 大声地。',
  ampere: '读音直接接近“安培”，ampere 就是电流单位安培。',
  appreciate: 're 读音近“阿姨”：阿婆婆和阿姨都懂得感谢，记住 appreciate = 欣赏、感谢。',
  association: 'ation 读音近“爱心”：爱心团体组成协会，记住 association = 协会、联合。',
  assure: 're 读音近“阿姨”：阿姨向你作出保证，记住 assure = 使确信、保证。',
  acquire: '谐音“阿Q儿”：阿Q儿努力学习，终于获得学位，记住 acquire = 获得、学到。',
  ambition: 'tion 读音近“神”：吃完面包后精神十足、充满雄心，记住 ambition = 雄心、抱负。'
}

export function getHomophoneMemory(word: string): string {
  const normalized = String(word || '').toLowerCase().replace(/[’]/g, "'")
  const candidates = [normalized]
  if (normalized.endsWith('ies')) candidates.push(normalized.slice(0, -3) + 'y')
  if (normalized.endsWith('es')) candidates.push(normalized.slice(0, -2))
  if (normalized.endsWith('s')) candidates.push(normalized.slice(0, -1))
  if (normalized.endsWith('ed')) candidates.push(normalized.slice(0, -2), normalized.slice(0, -1))
  if (normalized.endsWith('ing')) candidates.push(normalized.slice(0, -3), normalized.slice(0, -3) + 'e')
  for (const candidate of candidates) {
    if (HOMOPHONE_MEMORY[candidate]) return HOMOPHONE_MEMORY[candidate]
  }
  return ''
}