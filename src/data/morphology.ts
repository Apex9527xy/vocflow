import { EXTRA_PREFIXES, EXTRA_ROOTS, EXTRA_SUFFIXES } from './morphologyExtra'
import { BOOK_EXTRA_PREFIXES, BOOK_EXTRA_ROOTS, BOOK_EXTRA_SUFFIXES } from './bookMemorySupplement'

export type MorphemeType = 'prefix' | 'root' | 'suffix'

export interface Morpheme {
  type: MorphemeType
  form: string
  meaning: string
  text: string
}

export interface MorphemeRule {
  forms: string[]
  meaning: string
  ambiguous?: boolean
}

const PREFIXES: MorphemeRule[] = [
  { forms: ['ad', 'ac', 'af', 'ag', 'al', 'an', 'ap', 'ar', 'as', 'at'], meaning: '向；朝；靠近（ad- 的同化形式）', ambiguous: true },
  { forms: ['a'], meaning: '向；朝；处于；不（a- 的弱化形式）', ambiguous: true },
  { forms: ['ab', 'abs'], meaning: '离开；远离', ambiguous: true },
  { forms: ['be'], meaning: '使……；围绕；加强', ambiguous: true },
  { forms: ['ambi', 'amphi'], meaning: '两者；周围' },
  { forms: ['ana'], meaning: '向上；向后；再' },
  { forms: ['ante'], meaning: '在前；预先' },
  { forms: ['anti', 'ant'], meaning: '反对；抵抗' },
  { forms: ['auto'], meaning: '自己；自动' },
  { forms: ['bene'], meaning: '好；善' },
  { forms: ['bi'], meaning: '二；双' },
  { forms: ['circum'], meaning: '环绕；周围' },
  { forms: ['com', 'con', 'co', 'col', 'cor'], meaning: '共同；一起；加强', ambiguous: true },
  { forms: ['contra', 'counter'], meaning: '相反；对抗' },
  { forms: ['de'], meaning: '向下；去除；反向' },
  { forms: ['dia'], meaning: '穿过；横跨' },
  { forms: ['dis', 'dif', 'di'], meaning: '分开；不；相反', ambiguous: true },
  { forms: ['dys'], meaning: '坏；困难；异常' },
  { forms: ['e'], meaning: '向外；出来', ambiguous: true },
  { forms: ['en', 'em'], meaning: '使……；进入' },
  { forms: ['epi'], meaning: '在……之上；附加' },
  { forms: ['eu'], meaning: '好；优' },
  { forms: ['ex', 'ef', 'ec'], meaning: '向外；出来', ambiguous: true },
  { forms: ['extra', 'extro'], meaning: '在……之外；额外' },
  { forms: ['fore'], meaning: '在前；预先' },
  { forms: ['hetero'], meaning: '不同；异' },
  { forms: ['homo'], meaning: '相同；同' },
  { forms: ['hyper'], meaning: '超过；过度' },
  { forms: ['hypo'], meaning: '在下；不足' },
  { forms: ['in', 'im', 'il', 'ir', 'ig'], meaning: '进入；不；否定（in- 的同化形式）', ambiguous: true },
  { forms: ['inter'], meaning: '在……之间；相互' },
  { forms: ['intra', 'intro'], meaning: '在内；向内' },
  { forms: ['macro'], meaning: '大的；整体的' },
  { forms: ['mal'], meaning: '坏；不良' },
  { forms: ['meta'], meaning: '超越；变化；在后' },
  { forms: ['micro'], meaning: '微小' },
  { forms: ['mis'], meaning: '错误；不当' },
  { forms: ['mono'], meaning: '单一' },
  { forms: ['multi'], meaning: '多；多个' },
  { forms: ['neo'], meaning: '新' },
  { forms: ['non'], meaning: '不；非' },
  { forms: ['ob', 'oc', 'of', 'op'], meaning: '朝向；反对；加强（ob- 的同化形式）', ambiguous: true },
  { forms: ['omni'], meaning: '全部；一切' },
  { forms: ['over'], meaning: '在上；过度' },
  { forms: ['pan'], meaning: '全部；泛' },
  { forms: ['para'], meaning: '旁边；辅助；超越' },
  { forms: ['per'], meaning: '贯穿；完全' },
  { forms: ['peri'], meaning: '周围；环绕' },
  { forms: ['poly'], meaning: '多；多个' },
  { forms: ['post'], meaning: '在后；之后' },
  { forms: ['pre'], meaning: '在前；预先' },
  { forms: ['pro'], meaning: '向前；支持；代替' },
  { forms: ['proto'], meaning: '最初；原型' },
  { forms: ['pseudo'], meaning: '假的；伪' },
  { forms: ['re'], meaning: '再次；向后' },
  { forms: ['retro'], meaning: '向后；追溯' },
  { forms: ['se'], meaning: '分开；离开', ambiguous: true },
  { forms: ['semi'], meaning: '一半；部分' },
  { forms: ['sub', 'suc', 'suf', 'sug', 'sup', 'sus'], meaning: '在下；次级（sub- 的同化形式）', ambiguous: true },
  { forms: ['super', 'sur'], meaning: '在上；超过' },
  { forms: ['syn', 'sym', 'syl'], meaning: '共同；一起' },
  { forms: ['tele'], meaning: '远距离' },
  { forms: ['trans'], meaning: '跨越；转变' },
  { forms: ['tri'], meaning: '三' },
  { forms: ['ultra'], meaning: '超过；极端' },
  { forms: ['un'], meaning: '不；相反' },
  { forms: ['under'], meaning: '在下；不足' },
  { forms: ['uni'], meaning: '一；单一' },
  { forms: ['vice'], meaning: '代替；副职' }
]

const ROOTS: MorphemeRule[] = [
  { forms: ['cept', 'ceive', 'cip', 'cap'], meaning: '拿；抓取；接受' },
  { forms: ['port'], meaning: '搬运；携带；港口' },
  { forms: ['grad', 'gress'], meaning: '走；步；前进' },
  { forms: ['sta', 'stat', 'stit', 'sist'], meaning: '站立；稳定' },
  { forms: ['duc', 'duct'], meaning: '引导；带领' },
  { forms: ['tract'], meaning: '拉；拖；吸引' },
  { forms: ['ject'], meaning: '投掷；扔' },
  { forms: ['rupt'], meaning: '破裂；断开' },
  { forms: ['form'], meaning: '形状；形成' },
  { forms: ['mit', 'miss'], meaning: '送；放出' },
  { forms: ['vid', 'vis'], meaning: '看；视觉' },
  { forms: ['scribe', 'script'], meaning: '写；记录' },
  { forms: ['pel', 'puls'], meaning: '推；驱动' },
  { forms: ['ven', 'vent'], meaning: '来；到来' },
  { forms: ['tain', 'tent'], meaning: '保持；握住' },
  { forms: ['cede', 'ceed', 'cess'], meaning: '走；前进；让步' },
  { forms: ['vert', 'vers'], meaning: '转；改变方向' },
  { forms: ['voc', 'vok'], meaning: '声音；叫喊' },
  { forms: ['aud', 'audi'], meaning: '听；声音' },
  { forms: ['spec', 'spect', 'spic'], meaning: '看；观察' },
  { forms: ['struct', 'stru'], meaning: '建造；排列' },
  { forms: ['dict', 'dic'], meaning: '说；断言' },
  { forms: ['cur', 'cura'], meaning: '关心；注意；照料' },
  { forms: ['curs', 'cours'], meaning: '跑；流动' },
  { forms: ['put'], meaning: '思考；计算；认为' },
  { forms: ['sci'], meaning: '知道；认识' },
  { forms: ['cred'], meaning: '相信；信任' },
  { forms: ['fid'], meaning: '信任；忠诚' },
  { forms: ['jud', 'jur'], meaning: '判断；法律；发誓' },
  { forms: ['leg', 'lect', 'lig'], meaning: '选择；读；收集' },
  { forms: ['lingu'], meaning: '语言；舌头' },
  { forms: ['verb'], meaning: '词；言语' },
  { forms: ['nom', 'onym'], meaning: '名字；名称' },
  { forms: ['log', 'logue'], meaning: '言语；学科；研究' },
  { forms: ['graph'], meaning: '写；记录；图' },
  { forms: ['scrib'], meaning: '写；记录' },
  { forms: ['liter'], meaning: '文字；字母' },
  { forms: ['numer'], meaning: '数字；计数' },
  { forms: ['meter', 'metr'], meaning: '测量；尺度' },
  { forms: ['magn'], meaning: '大；伟大' },
  { forms: ['min'], meaning: '小；较少' },
  { forms: ['mult'], meaning: '多；许多' },
  { forms: ['equ'], meaning: '相等；平等' },
  { forms: ['simil', 'simul'], meaning: '相似；相同' },
  { forms: ['differ'], meaning: '不同；差异' },
  { forms: ['prim'], meaning: '第一；最初' },
  { forms: ['nov'], meaning: '新；新的' },
  { forms: ['ann', 'enni'], meaning: '年；每年' },
  { forms: ['tempor'], meaning: '时间' },
  { forms: ['chron'], meaning: '时间' },
  { forms: ['medi'], meaning: '中间；居中' },
  { forms: ['centr'], meaning: '中心' },
  { forms: ['circ', 'cycl'], meaning: '圆；环；循环' },
  { forms: ['loc'], meaning: '地方；位置' },
  { forms: ['terr', 'terra'], meaning: '土地；地球' },
  { forms: ['urb'], meaning: '城市' },
  { forms: ['civ'], meaning: '公民；城市' },
  { forms: ['popul'], meaning: '人民；大众' },
  { forms: ['dem'], meaning: '人民；民众' },
  { forms: ['soci'], meaning: '同伴；社会' },
  { forms: ['commun'], meaning: '共同；公共' },
  { forms: ['feder'], meaning: '联盟；条约' },
  { forms: ['polit'], meaning: '城邦；政治' },
  { forms: ['reg', 'rect'], meaning: '统治；规则；直' },
  { forms: ['domin'], meaning: '统治；支配' },
  { forms: ['crat'], meaning: '统治；权力' },
  { forms: ['arch'], meaning: '首领；统治；古老' },
  { forms: ['milit'], meaning: '士兵；战争' },
  { forms: ['paci'], meaning: '和平' },
  { forms: ['liber'], meaning: '自由' },
  { forms: ['priv'], meaning: '个人；私有；剥夺' },
  { forms: ['serv'], meaning: '服务；保存' },
  { forms: ['cust'], meaning: '守护；照顾' },
  { forms: ['hosp', 'host'], meaning: '客人；招待' },
  { forms: ['fisc'], meaning: '国库；财政' },
  { forms: ['monet'], meaning: '钱；货币' },
  { forms: ['econom'], meaning: '家庭管理；经济' },
  { forms: ['labor'], meaning: '劳动；工作' },
  { forms: ['oper'], meaning: '工作；操作' },
  { forms: ['erg'], meaning: '工作；能量' },
  { forms: ['techn'], meaning: '技术；技艺' },
  { forms: ['mechan'], meaning: '机器；机械' },
  { forms: ['automat'], meaning: '自动；自行运转' },
  { forms: ['dyn'], meaning: '力量；动力' },
  { forms: ['pot'], meaning: '能力；力量' },
  { forms: ['val', 'vail'], meaning: '价值；力量；强健' },
  { forms: ['fort'], meaning: '强；力量' },
  { forms: ['firm'], meaning: '坚固；确定' },
  { forms: ['dur'], meaning: '持久；坚硬' },
  { forms: ['brev'], meaning: '短' },
  { forms: ['fin'], meaning: '结束；边界' },
  { forms: ['termin'], meaning: '界限；结束' },
  { forms: ['fund', 'found'], meaning: '底部；基础' },
  { forms: ['fract', 'frag'], meaning: '破碎；断裂' },
  { forms: ['sect', 'seg'], meaning: '切；分割' },
  { forms: ['cid', 'cis'], meaning: '切；杀；落下' },
  { forms: ['cad', 'cas'], meaning: '落下；发生' },
  { forms: ['pend', 'pens'], meaning: '悬挂；称重；支付' },
  { forms: ['plic', 'plex'], meaning: '折叠；重叠' },
  { forms: ['solv', 'solut'], meaning: '解开；溶解' },
  { forms: ['clud', 'clus', 'close'], meaning: '关闭；封闭' },
  { forms: ['junct', 'join'], meaning: '连接；结合' },
  { forms: ['punct', 'pung'], meaning: '点；刺' },
  { forms: ['tact', 'tang'], meaning: '触摸；接触' },
  { forms: ['text'], meaning: '编织；文本' },
  { forms: ['tort'], meaning: '扭转；弯曲' },
  { forms: ['trib'], meaning: '给予；分配' },
  { forms: ['trud', 'trus'], meaning: '推；冲' },
  { forms: ['gest'], meaning: '携带；传递' },
  { forms: ['sum', 'sumpt'], meaning: '拿；取；消耗' },
  { forms: ['prehend', 'pris'], meaning: '抓住；理解' },
  { forms: ['sert'], meaning: '连接；放置；陈述' },
  { forms: ['sess', 'sid'], meaning: '坐；停留' },
  { forms: ['opt'], meaning: '选择；看' },
  { forms: ['nounc', 'nunci'], meaning: '宣布；报告' },
  { forms: ['prob', 'prov'], meaning: '证明；检验；好' },
  { forms: ['quest', 'quer', 'quir', 'quis'], meaning: '寻找；询问' },
  { forms: ['rog'], meaning: '询问；要求' },
  { forms: ['clam', 'claim'], meaning: '喊；宣称' },
  { forms: ['voc', 'vok'], meaning: '叫；声音' },
  { forms: ['son'], meaning: '声音' },
  { forms: ['phon'], meaning: '声音' },
  { forms: ['lingu'], meaning: '语言' },
  { forms: ['sens', 'sent'], meaning: '感觉；感知' },
  { forms: ['pass', 'pati'], meaning: '感受；承受' },
  { forms: ['path'], meaning: '感受；疾病' },
  { forms: ['psych'], meaning: '心灵；精神' },
  { forms: ['mem'], meaning: '记忆' },
  { forms: ['ment'], meaning: '思想；心智' },
  { forms: ['cogn', 'gnos'], meaning: '知道；认识' },
  { forms: ['soph'], meaning: '智慧' },
  { forms: ['phil'], meaning: '爱；喜爱' },
  { forms: ['sper'], meaning: '希望' },
  { forms: ['grat'], meaning: '感谢；愉快；恩惠' },
  { forms: ['plac'], meaning: '使高兴；平静' },
  { forms: ['vol'], meaning: '意愿；意志' },
  { forms: ['habil', 'habit'], meaning: '拥有；习惯' },
  { forms: ['mov', 'mot', 'mob'], meaning: '移动；推动' },
  { forms: ['migr'], meaning: '迁移；移动' },
  { forms: ['flu'], meaning: '流动' },
  { forms: ['riv', 'rip'], meaning: '河岸；水流' },
  { forms: ['mar'], meaning: '海；海洋' },
  { forms: ['nav'], meaning: '船；航行' },
  { forms: ['aqu'], meaning: '水' },
  { forms: ['hydr'], meaning: '水' },
  { forms: ['therm'], meaning: '热；温度' },
  { forms: ['bio'], meaning: '生命' },
  { forms: ['viv', 'vit'], meaning: '生命；活' },
  { forms: ['mort'], meaning: '死亡' },
  { forms: ['gen'], meaning: '出生；产生；种类' },
  { forms: ['nat'], meaning: '出生；天生' },
  { forms: ['mater', 'matr'], meaning: '母亲' },
  { forms: ['pater', 'patr'], meaning: '父亲' },
  { forms: ['corp'], meaning: '身体；主体' },
  { forms: ['carn'], meaning: '肉；肉体' },
  { forms: ['dent'], meaning: '牙' },
  { forms: ['derm', 'dermat'], meaning: '皮肤' },
  { forms: ['cardi'], meaning: '心脏' },
  { forms: ['neur'], meaning: '神经' },
  { forms: ['gastr'], meaning: '胃' },
  { forms: ['ocul'], meaning: '眼睛' },
  { forms: ['manu'], meaning: '手' },
  { forms: ['ped', 'pod'], meaning: '脚；足' },
  { forms: ['capit'], meaning: '头；首要' },
  { forms: ['zo'], meaning: '动物' },
  { forms: ['avi'], meaning: '鸟' },
  { forms: ['pisc'], meaning: '鱼' },
  { forms: ['flor'], meaning: '花' },
  { forms: ['foli'], meaning: '叶' },
  { forms: ['herb'], meaning: '草；草本' },
  { forms: ['semin'], meaning: '种子' },
  { forms: ['radi'], meaning: '光线；辐射' },
  { forms: ['luc', 'lum'], meaning: '光；明亮' },
  { forms: ['clar'], meaning: '清楚；明亮' },
  { forms: ['cand'], meaning: '发光；白' },
  { forms: ['photo'], meaning: '光' },
  { forms: ['astr', 'aster'], meaning: '星' },
  { forms: ['cosm'], meaning: '宇宙；世界' },
  { forms: ['geo'], meaning: '地球；土地' },
  { forms: ['tele'], meaning: '远' },
  { forms: ['vac'], meaning: '空；空闲' },
  { forms: ['plen', 'plet'], meaning: '满；填满' },
  { forms: ['grav'], meaning: '重；重力' },
  { forms: ['lev'], meaning: '轻；举起' },
  { forms: ['bar'], meaning: '重量；压力' },
  { forms: ['norm'], meaning: '标准；规范' },
  { forms: ['ord'], meaning: '顺序；命令' },
  { forms: ['integr'], meaning: '完整；整体' },
  { forms: ['tot'], meaning: '全部；整体' },
  { forms: ['part'], meaning: '部分；分开' },
  { forms: ['soli'], meaning: '单独；孤独' },
  { forms: ['vari'], meaning: '变化；不同' },
  { forms: ['vict', 'vinc'], meaning: '征服；胜利' },
  { forms: ['volv', 'volut'], meaning: '滚动；旋转' },
    { forms: ['spir'], meaning: '呼吸；精神' },
  { forms: ['hap'], meaning: '运气；偶然' },
  { forms: ['poss'], meaning: '能够；能力' },
  { forms: ['medic'], meaning: '治疗；医学' },
  { forms: ['tempt'], meaning: '尝试；试探' },
  { forms: ['gram'], meaning: '写；文字' },
  { forms: ['caus'], meaning: '原因；引起' },
  { forms: ['cre', 'cresc'], meaning: '生长；产生' },
  { forms: ['facil'], meaning: '容易；便利' },
  { forms: ['ident'], meaning: '相同；身份' },
  { forms: ['just'], meaning: '公正；法律' },
  { forms: ['mand', 'mend'], meaning: '命令；委托' },
  { forms: ['mod'], meaning: '方式；尺度' },
  { forms: ['mut'], meaning: '改变' },
  { forms: ['pet', 'peat'], meaning: '追求；请求' },
  { forms: ['tut', 'tuit'], meaning: '照看；教导' },
  { forms: ['fac', 'fect', 'fic'], meaning: '做；制造；使得' },
  { forms: ['fer'], meaning: '带来；携带；承担' },
  { forms: ['sign'], meaning: '标记；符号；示意' },
  { forms: ['tend', 'tens'], meaning: '伸展；拉紧；倾向' },
  { forms: ['test'], meaning: '证明；见证；测试' },
  { forms: ['press'], meaning: '压；挤；压迫' },
  { forms: ['hibit'], meaning: '拿住；持有；阻止' },
  { forms: ['pos', 'pon'], meaning: '放置；位置；安排' },
  { forms: ['hab'], meaning: '拥有；保持；习惯' },
  { forms: ['cuse', 'caus'], meaning: '原因；指控；理由' },
  { forms: ['chiev', 'chief'], meaning: '头；首领；达到' },
  { forms: ['proach', 'prop'], meaning: '靠近；接近' },
  { forms: ['rise'], meaning: '升起；出现' },
  { forms: ['laps'], meaning: '滑落；倒下' },
  { forms: ['bin'], meaning: '二；结合' },
  { forms: ['merc'], meaning: '贸易；商业' },
  { forms: ['par'], meaning: '相等；准备；出现' },
  { forms: ['plain'], meaning: '清楚；哀诉；平坦' },
  { forms: ['pound'], meaning: '放置；重击' },
  { forms: ['cern'], meaning: '区分；筛分；判断' },
  { forms: ['flict'], meaning: '打击；冲突' },
  { forms: ['front'], meaning: '前面；正面' },
  { forms: ['fus'], meaning: '倒；流；融合' },
  { forms: ['nect', 'nex'], meaning: '连接；绑定' },
  { forms: ['strain', 'strict', 'string'], meaning: '拉紧；束缚' },
  { forms: ['sult', 'sal'], meaning: '跳；跃；召集' },
  { forms: ['spond', 'spons'], meaning: '回答；承诺；保证' },
  { forms: ['cil', 'cal'], meaning: '召集；呼喊' },
  { forms: ['craft'], meaning: '技艺；手工' },
  { forms: ['crim'], meaning: '指控；罪行' },
  { forms: ['coron', 'crown'], meaning: '王冠；环' },
  { forms: ['deb'], meaning: '欠；债务' },
  { forms: ['ease'], meaning: '容易；舒适；缓解' },
  { forms: ['ward', 'ware'], meaning: '看守；注意；方向' },
  { forms: ['back'], meaning: '后面；背部' },
  { forms: ['ground'], meaning: '地面；基础' },
  { forms: ['batt'], meaning: '打；击' },
  { forms: ['long'], meaning: '长；长久' },
  { forms: ['brief', 'brev'], meaning: '短；简短' },
  { forms: ['budg'], meaning: '袋子；预算' },
  { forms: ['camp'], meaning: '田野；营地' },
  { forms: ['canc'], meaning: '格子；围栏；取消' },
  { forms: ['carg'], meaning: '装载；货物' },
  { forms: ['chas'], meaning: '追逐；追赶' },
  { forms: ['fair'], meaning: '做；制造' },
  { forms: ['have'], meaning: '拥有；持有' },
  { forms: ['set'], meaning: '放置；安置' },
  { forms: ['league'], meaning: '联盟；结合' },
  { forms: ['alter'], meaning: '其他；改变' },
  { forms: ['maz'], meaning: '迷惑；困惑' },
  { forms: ['muse'], meaning: '思考；沉思' },
  { forms: ['sorb'], meaning: '吸；吞' },
  { forms: ['void'], meaning: '空；离开' },
  { forms: ['change'], meaning: '交换；改变' },
  { forms: ['empt'], meaning: '拿；买；取' },
  { forms: ['pand'], meaning: '展开；铺开' },
  { forms: ['pect'], meaning: '看；观察' },
  { forms: ['plod'], meaning: '拍击；爆裂' },
  { forms: ['plor'], meaning: '呼喊；流出' },
  { forms: ['gnor'], meaning: '知道；认识' },
  { forms: ['imag'], meaning: '形象；想象' },
  { forms: ['mens'], meaning: '测量；尺度' },
  { forms: ['mun'], meaning: '职责；服务；共同' },
  { forms: ['pact'], meaning: '固定；打击；约定' },
  { forms: ['clin'], meaning: '倾斜；倾向' },
  { forms: ['come'], meaning: '来；到来' },
  { forms: ['dex'], meaning: '指出；指示' },
  { forms: ['fant'], meaning: '说话；婴孩' },
  { forms: ['herit'], meaning: '继承；继承人' },
  { forms: ['land'], meaning: '土地；陆地' },
  { forms: ['sight'], meaning: '看；景象' },
  { forms: ['stinct'], meaning: '刺；驱动；本能' },
  { forms: ['vad'], meaning: '走；前进' },
  { forms: ['vest'], meaning: '衣服；覆盖' },
  { forms: ['max'], meaning: '最大；最高' },
  { forms: ['merit'], meaning: '价值；功绩' },
  { forms: ['hod'], meaning: '道路；方法' },
  { forms: ['mole'], meaning: '团块；质量' },
  { forms: ['nerv'], meaning: '神经；筋' },
  { forms: ['fend'], meaning: '打击；防御' },
  { forms: ['orig'], meaning: '开始；起源' },
  { forms: ['rig'], meaning: '僵硬；固定' },
  { forms: ['rob'], meaning: '力量；坚固' },
  { forms: ['scen'], meaning: '舞台；场景' },
  { forms: ['schem'], meaning: '计划；图式' },
  { forms: ['scop'], meaning: '看；观察' },
  { forms: ['sever'], meaning: '严肃；严厉' },
  { forms: ['board'], meaning: '板；船上' },
  { forms: ['broad'], meaning: '宽；广大' },
  { forms: ['bandon'], meaning: '控制；支配' },
  { forms: ['ert'], meaning: '升起；直立' },
  { forms: ['half'], meaning: '一半；方面' },
  { forms: ['merge', 'mers'], meaning: '沉入；浸没' },
  { forms: ['rod', 'ros'], meaning: '咬；侵蚀' },
  { forms: ['cret'], meaning: '分开；辨别' },
  { forms: ['extrem'], meaning: '最远；极端' },
  { forms: ['pert'], meaning: '尝试；经验' },
  { forms: ['ploit'], meaning: '展开；利用' },
  { forms: ['creas'], meaning: '生长；增加' },
  { forms: ['apt'], meaning: '适合；适应' },
  { forms: ['mir'], meaning: '惊奇；观看' },
  { forms: ['vanc', 'van'], meaning: '在前；先行' },
  { forms: ['mount', 'mont'], meaning: '山；上升；攀登' },
  { forms: ['ampl'], meaning: '大；宽；充足' },
  { forms: ['rang', 'rank'], meaning: '排列；等级' },
  { forms: ['rest'], meaning: '停留；停下；休息' },
  { forms: ['art'], meaning: '技艺；人工' },
  { forms: ['sembl'], meaning: '相似；一起' },
  { forms: ['sat'], meaning: '足够；满足' },
  { forms: ['sure', 'cert'], meaning: '确定；可靠' },
  { forms: ['tach', 'tack'], meaning: '钉住；连接' },
  { forms: ['sphere', 'spher'], meaning: '球；球体；范围' },
  { forms: ['count'], meaning: '计数；计算' },
  { forms: ['know'], meaning: '知道；认识' },
  { forms: ['arm'], meaning: '武器；装备' }
]

const SUFFIXES: MorphemeRule[] = [
  { forms: ['ization', 'isation'], meaning: '名词后缀：……化的过程' },
  { forms: ['ationally'], meaning: '副词后缀：以……方式' },
  { forms: ['ability', 'ibility'], meaning: '名词后缀：能够……的性质' },
  { forms: ['ation', 'ition', 'ution', 'sion', 'tion', 'ion'], meaning: '名词后缀：行为、过程或结果' },
  { forms: ['ance', 'ence'], meaning: '名词后缀：状态、性质或行为' },
  { forms: ['ology', 'ography', 'onomy'], meaning: '名词后缀：学科或研究领域' },
  { forms: ['ment'], meaning: '名词后缀：行为、结果或状态' },
  { forms: ['ness'], meaning: '名词后缀：性质或状态' },
  { forms: ['ship'], meaning: '名词后缀：身份、关系或状态' },
  { forms: ['hood'], meaning: '名词后缀：时期、身份或状态' },
  { forms: ['dom'], meaning: '名词后缀：领域、状态或身份' },
  { forms: ['ism'], meaning: '名词后缀：主义、学说或现象' },
  { forms: ['ist'], meaning: '名词后缀：从事……的人' },
  { forms: ['ity', 'ty'], meaning: '名词后缀：性质或状态' },
  { forms: ['acy', 'cy'], meaning: '名词后缀：性质、状态或职务' },
  { forms: ['age'], meaning: '名词后缀：行为、集合或状态' },
  { forms: ['ee'], meaning: '名词后缀：动作的承受者' },
  { forms: ['eer'], meaning: '名词后缀：从事……的人' },
  { forms: ['ess'], meaning: '名词后缀：女性或特定身份' },
  { forms: ['let'], meaning: '名词后缀：小型的……' },
  { forms: ['ster'], meaning: '名词后缀：从事……的人' },
  { forms: ['ture', 'ure'], meaning: '名词后缀：行为、结果或状态' },
  { forms: ['able', 'ible'], meaning: '形容词后缀：能够……的' },
  { forms: ['al', 'ial', 'ical'], meaning: '形容词后缀：与……有关的' },
  { forms: ['an', 'ian'], meaning: '形容词/名词后缀：属于……的人或事物' },
  { forms: ['ant', 'ent'], meaning: '形容词/名词后缀：具有……性质的' },
  { forms: ['ary', 'ory'], meaning: '形容词/名词后缀：与……有关的' },
  { forms: ['ous', 'ious'], meaning: '形容词后缀：具有……性质的' },
  { forms: ['ful'], meaning: '形容词后缀：充满……的' },
  { forms: ['less'], meaning: '形容词后缀：没有……的' },
  { forms: ['ive'], meaning: '形容词后缀：具有……倾向的' },
  { forms: ['ic'], meaning: '形容词后缀：与……有关的' },
  { forms: ['ish'], meaning: '形容词后缀：带有……特征的' },
  { forms: ['like'], meaning: '形容词后缀：像……一样的' },
  { forms: ['some'], meaning: '形容词后缀：具有……倾向的' },
  { forms: ['fold'], meaning: '形容词/副词后缀：……倍' },
  { forms: ['ward'], meaning: '副词后缀：向……方向' },
  { forms: ['wise'], meaning: '副词后缀：以……方式' },
  { forms: ['most'], meaning: '形容词后缀：最……的' },
  { forms: ['esque'], meaning: '形容词后缀：具有……风格的' },
  { forms: ['ese'], meaning: '名词/形容词后缀：某地的人或语言' },
  { forms: ['oid'], meaning: '形容词后缀：像……的' },
  { forms: ['itis'], meaning: '名词后缀：炎症' },
  { forms: ['ise', 'ize'], meaning: '动词后缀：使……化' },
  { forms: ['ify'], meaning: '动词后缀：使……；变成……' },
  { forms: ['ate'], meaning: '动词/形容词后缀：使……；具有……的' },
  { forms: ['en'], meaning: '动词后缀：使……变得' },
  { forms: ['er', 'or', 'ar'], meaning: '名词后缀：做某事的人或物' },
  { forms: ['ly'], meaning: '副词后缀：以……方式' },
  { forms: ['ing'], meaning: '后缀：进行、动作或名词化' },
  { forms: ['ed'], meaning: '后缀：过去或完成' },
  { forms: ['ies', 'es', 's'], meaning: '后缀：复数或第三人称单数' },
  { forms: ['est'], meaning: '后缀：最高级' },
  { forms: ['y'], meaning: '后缀：具有……特征的；名词化' }
]

PREFIXES.push(...EXTRA_PREFIXES, ...BOOK_EXTRA_PREFIXES)
ROOTS.push(...EXTRA_ROOTS, ...BOOK_EXTRA_ROOTS)
SUFFIXES.push(...EXTRA_SUFFIXES, ...BOOK_EXTRA_SUFFIXES)

export const MORPHOLOGY_CATALOG = {
  prefixes: PREFIXES,
  roots: ROOTS,
  suffixes: SUFFIXES
}

const IRREGULAR: Record<string, string> = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have', does: 'do', did: 'do', done: 'do', doing: 'do',
  went: 'go', gone: 'go', goes: 'go', better: 'good', best: 'good',
  worse: 'bad', worst: 'bad', children: 'child', men: 'man', women: 'woman',
  people: 'person', mice: 'mouse', geese: 'goose', teeth: 'tooth', feet: 'foot',
  wrote: 'write', written: 'write', spoke: 'speak', spoken: 'speak',
  took: 'take', taken: 'take', made: 'make', came: 'come', saw: 'see', seen: 'see'
}

function addCandidate(list: string[], value: string): void {
  if (value.length >= 2 && !list.includes(value)) list.push(value)
}

export function getLemmaCandidates(word: string): string[] {
  const base = word.toLowerCase().replace(/[’]/g, "'").trim()
  const candidates: string[] = []
  addCandidate(candidates, base)
  if (IRREGULAR[base]) addCandidate(candidates, IRREGULAR[base])
  if (base.endsWith('ies') && base.length > 4) addCandidate(candidates, base.slice(0, -3) + 'y')
  if (base.endsWith('ied') && base.length > 4) addCandidate(candidates, base.slice(0, -3) + 'y')
  if (base.endsWith('es') && base.length > 3) {
    addCandidate(candidates, base.slice(0, -2))
    addCandidate(candidates, base.slice(0, -1))
  }
  if (base.endsWith('s') && !base.endsWith('ss') && base.length > 3) addCandidate(candidates, base.slice(0, -1))
  if (base.endsWith('ing') && base.length > 5) {
    const stem = base.slice(0, -3)
    addCandidate(candidates, stem)
    addCandidate(candidates, stem + 'e')
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) addCandidate(candidates, stem.slice(0, -1))
    if (base.endsWith('ying')) addCandidate(candidates, base.slice(0, -4) + 'ie')
  }
  if (base.endsWith('ed') && base.length > 4) {
    const stem = base.slice(0, -2)
    addCandidate(candidates, stem)
    addCandidate(candidates, stem + 'e')
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) addCandidate(candidates, stem.slice(0, -1))
  }
  if (base.endsWith('er') && base.length > 4) {
    addCandidate(candidates, base.slice(0, -2))
    addCandidate(candidates, base.slice(0, -1))
  }
  if (base.endsWith('est') && base.length > 5) addCandidate(candidates, base.slice(0, -3))
  return candidates
}

function findPrefix(word: string): { rule: MorphemeRule, form: string } | null {
  const candidates: Array<{ rule: MorphemeRule, form: string }> = []
  for (const rule of PREFIXES) {
    for (const form of rule.forms) {
      if (word.startsWith(form) && word.length - form.length >= 3) candidates.push({ rule, form })
    }
  }
  candidates.sort((a, b) => b.form.length - a.form.length)
  for (const candidate of candidates) {
    const cutsKnownRoot = ROOTS.some(rule => rule.forms.some(form => {
      if (form.length < 3) return false
      for (let index = 0; index < candidate.form.length; index += 1) {
        if (word.startsWith(form, index) && index + form.length > candidate.form.length) return true
      }
      return false
    }))
    if (!cutsKnownRoot) return candidate
  }
  return null
}

function findSuffix(word: string, start: number): { rule: MorphemeRule, form: string } | null {
  const roots = findRoots(word, start, word.length)
  let best: { rule: MorphemeRule, form: string } | null = null
  for (const rule of SUFFIXES) {
    for (const form of rule.forms) {
      const suffixStart = word.length - form.length
      if (!word.endsWith(form) || suffixStart < start + 2) continue
      const cutsRoot = roots.some(item => item.index < suffixStart && item.index + item.form.length > suffixStart)
      const swallowsRoot = roots.some(item => item.form.length >= 4 && item.index >= suffixStart && item.index + item.form.length <= word.length)
      if (cutsRoot || swallowsRoot) continue
      if (!best || form.length > best.form.length) best = { rule, form }
    }
  }
  return best
}

function findRoots(word: string, start: number, end: number): Array<{ rule: MorphemeRule, form: string, index: number }> {
  const matches: Array<{ rule: MorphemeRule, form: string, index: number }> = []
  for (const rule of ROOTS) {
    for (const form of rule.forms) {
      let index = word.indexOf(form, start)
      while (index >= 0 && index + form.length <= end) {
        matches.push({ rule, form, index })
        index = word.indexOf(form, index + 1)
      }
    }
  }
  const seen = new Set<string>()
  return matches
    .sort((a, b) => a.index - b.index || b.form.length - a.form.length)
    .filter(match => {
      const key = `${match.index}:${match.form}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function analyzeMorphology(input: string): Morpheme[] {
  const word = input.toLowerCase().replace(/[^a-z'-]/g, '')
  if (word.length < 3) return []
  let prefix = findPrefix(word)
  const prefixLength = prefix?.form.length ?? 0
  const suffix = findSuffix(word, prefixLength)
  const middleEnd = suffix ? word.length - suffix.form.length : word.length
  const rootMatches = findRoots(word, prefixLength, middleEnd)
  if (prefix?.rule.ambiguous && rootMatches.length === 0) prefix = null

  const result: Morpheme[] = []
  if (prefix) result.push({ type: 'prefix', form: `${prefix.form}-`, meaning: prefix.rule.meaning, text: word.slice(0, prefix.form.length) })

  let cursor = prefix?.form.length ?? 0
  for (const match of rootMatches) {
    if (match.index < cursor) continue
    result.push({ type: 'root', form: match.form, meaning: match.rule.meaning, text: word.slice(match.index, match.index + match.form.length) })
    cursor = match.index + match.form.length
  }
  if (suffix) result.push({ type: 'suffix', form: `-${suffix.form}`, meaning: suffix.rule.meaning, text: word.slice(-suffix.form.length) })
  return result
}

export function describeOriginFallback(word: string): string {
  const clean = word.toLowerCase()
  if (clean.length <= 4) {
    return '这是英语中的基础高频词，通常源自古英语或日耳曼语词根，适合作为完整词形直接记忆。'
  }
  return '该词没有可靠的拉丁/希腊词根拆分，通常属于基础英语词、历史外来借词、专有名词或长期演变形成的复合词。这类词适合按完整词形和例句记忆。'
}
