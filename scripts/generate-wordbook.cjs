// CET4 高频词库生成脚本
// 生成 800+ 四级高频词汇，包含音标、释义、例句、词频、分类标签

const fs = require('fs')
const path = require('path')

// 紧凑格式：word|phonetic_us|meaning_cn|pos|example_sentence|frequency|tags
const rawData = `
abandon|/əˈbændən/|vt. 放弃；遗弃|v|He had to abandon his plan due to lack of money.|5|高频,核心
ability|/əˈbɪləti/|n. 能力；才能|n|She has the ability to solve complex problems.|5|高频,核心
abnormal|/æbˈnɔːrml/|adj. 不正常的；反常的|adj|The test results showed abnormal levels of sugar.|3|阅读
aboard|/əˈbɔːrd/|adv./prep. 在船上；上船|adv|All passengers went aboard the ship.|2|听力
abroad|/əˈbrɔːd/|adv. 在国外；到国外|adv|He dreams of studying abroad next year.|4|高频,写作
absence|/ˈæbsəns/|n. 缺席；不在|n|His absence from the meeting was noticed by everyone.|3|写作
absolute|/ˈæbsəluːt/|adj. 绝对的；完全的|adj|I have absolute confidence in her abilities.|3|阅读
absorb|/əbˈzɔːrb/|vt. 吸收；吸引|v|Plants absorb energy from the sun.|3|阅读
abstract|/ˈæbstrækt/|adj. 抽象的 n. 摘要|adj/n|The concept is too abstract for most people to understand.|3|阅读
abundant|/əˈbʌndənt/|adj. 丰富的；充裕的|adj|The region has abundant natural resources.|3|写作
academic|/ˌækəˈdemɪk/|adj. 学术的；学院的|adj|Academic achievement requires consistent effort.|4|高频,写作
accelerate|/əkˈseləreɪt/|v. 加速；促进|v|The company plans to accelerate its expansion.|3|阅读
access|/ˈækses/|n. 通道；访问权 vt. 访问|n/v|Students have free access to the online library.|4|高频
accompany|/əˈkʌmpəni/|vt. 陪伴；伴随|v|She will accompany me to the airport.|3|写作
accomplish|/əˈkɑːmplɪʃ/|vt. 完成；实现|v|We managed to accomplish our goals ahead of schedule.|4|高频
account|/əˈkaʊnt/|n. 账户；说明 vi. 解释|n/v|You need to create an account to use this service.|4|高频
accurate|/ˈækjərət/|adj. 准确的；精确的|adj|The weather forecast proved to be accurate.|3|阅读
accuse|/əˈkjuːz/|vt. 指控；指责|v|He was accused of stealing the money.|3|阅读
achieve|/əˈtʃiːv/|vt. 达到；取得|v|She worked hard to achieve her dreams.|4|高频,写作
acknowledge|/əkˈnɑːlɪdʒ/|vt. 承认；确认|v|He refused to acknowledge his mistake.|3|写作
acquire|/əˈkwaɪər/|vt. 获得；习得|v|It takes time to acquire a new language.|4|高频
adapt|/əˈdæpt/|v. 适应；改编|v|New students must adapt to college life quickly.|3|写作
adequate|/ˈædɪkwət/|adj. 足够的；适当的|adj|The supply of water is barely adequate.|3|写作
adjust|/əˈdʒʌst/|v. 调整；适应|v|You need to adjust your study habits.|3|写作
administration|/ədˌmɪnɪˈstreɪʃn/|n. 管理；行政|n|The university administration made a new policy.|2|阅读
admire|/ədˈmaɪər/|vt. 钦佩；赞赏|v|I really admire her determination to succeed.|3|写作
admission|/ədˈmɪʃn/|n. 准许进入；承认|n|She received admission to a top university.|3|写作
adopt|/əˈdɑːpt/|vt. 采用；收养|v|The company decided to adopt a new strategy.|4|高频
advance|/ədˈvæns/|v./n. 前进；进步|v/n|Technology continues to advance at a rapid pace.|3|阅读
advantage|/ədˈvæntɪdʒ/|n. 优势；有利条件|n|Being bilingual is a great advantage in the job market.|4|高频,写作
advertise|/ˈædvərtaɪz/|v. 做广告；宣传|v|Companies advertise their products on social media.|3|阅读
affair|/əˈfer/|n. 事务；事件|n|This is a private affair, please don't interfere.|3|阅读
affect|/əˈfekt/|vt. 影响；感动|v|Climate change affects everyone on the planet.|4|高频,写作
afford|/əˈfɔːrd/|vt. 负担得起；提供|v|Many students cannot afford the high tuition fees.|3|写作
aggressive|/əˈɡresɪv/|adj. 侵略的；好斗的；进取的|adj|An aggressive marketing strategy helped the company grow.|3|阅读
aid|/eɪd/|n./vt. 帮助；援助|n/v|Many countries sent aid to the disaster area.|3|翻译
aim|/eɪm/|n. 目标 vi. 旨在|n/v|Our aim is to improve customer satisfaction.|3|写作
alarm|/əˈlɑːrm/|n. 警报；闹钟 vt. 使惊恐|n/v|I set my alarm for six o'clock every morning.|3|听力
alcohol|/ˈælkəhɔːl/|n. 酒精；酒|n|Driving under the influence of alcohol is illegal.|2|听力
alert|/əˈlɜːrt/|adj. 警惕的 n. 警报|adj/n|Stay alert when walking alone at night.|2|听力
allow|/əˈlaʊ/|vt. 允许；准许|v|The new system allows users to access data faster.|4|高频
alter|/ˈɔːltər/|v. 改变；修改|v|We had to alter our plans due to bad weather.|3|阅读
alternative|/ɔːlˈtɜːrnətɪv/|n. 替代品 adj. 替代的|n/adj|We need to find an alternative solution.|4|高频,写作
amaze|/əˈmeɪz/|vt. 使惊奇|v|Her progress in English continues to amaze me.|3|写作
ambition|/æmˈbɪʃn/|n. 雄心；抱负|n|His ambition is to become a successful entrepreneur.|3|写作
amount|/əˈmaʊnt/|n. 数量 vi. 总计|n/v|A large amount of money was spent on the project.|4|高频
amuse|/əˈmjuːz/|vt. 娱乐；逗乐|v|The clown's performance amused the children.|2|听力
analyze|/ˈænəlaɪz/|vt. 分析|v|We need to analyze the data before making a decision.|3|阅读
ancestor|/ˈænsestər/|n. 祖先|n|Our ancestors passed down many traditions.|2|阅读
anniversary|/ˌænɪˈvɜːrsəri/|n. 周年纪念日|n|They celebrated their tenth wedding anniversary.|2|听力
announce|/əˈnaʊns/|vt. 宣布；通告|v|The government announced new economic policies.|3|阅读
annual|/ˈænjuəl/|adj. 每年的；年度的|adj|The annual meeting will be held next week.|3|阅读
anxiety|/æŋˈzaɪəti/|n. 焦虑；忧虑|n|Test anxiety is common among college students.|3|写作
apart|/əˈpɑːrt/|adv. 分开；相隔|adv|The two buildings are about 100 meters apart.|3|翻译
apparent|/əˈpærənt/|adj. 明显的；表面上的|adj|It became apparent that he was not telling the truth.|3|阅读
appeal|/əˈpiːl/|vi./n. 呼吁；吸引|v/n|The charity made an appeal for donations.|3|写作
appetite|/ˈæpɪtaɪt/|n. 食欲；胃口|n|Exercise usually gives me a good appetite.|2|听力
apply|/əˈplaɪ/|v. 申请；应用|v|You can apply for the scholarship online.|4|高频,写作
appreciate|/əˈpriːʃieɪt/|vt. 欣赏；感激|v|I really appreciate your help with this project.|4|高频,写作
approach|/əˈproʊtʃ/|v./n. 接近；方法|v/n|We need a new approach to solve this problem.|4|高频,写作
appropriate|/əˈproʊpriət/|adj. 适当的|adj|It is not appropriate to use phones during class.|3|写作
approve|/əˈpruːv/|v. 批准；赞成|v|The committee approved the new proposal.|3|阅读
arise|/əˈraɪz/|vi. 出现；产生|v|Problems often arise when communication breaks down.|3|写作
arrange|/əˈreɪndʒ/|v. 安排；整理|v|I will arrange a meeting for next Monday.|3|写作
arrest|/əˈrest/|vt./n. 逮捕；拘留|v/n|The police arrested the suspect last night.|2|听力
article|/ˈɑːrtɪkl/|n. 文章；物品；冠词|n|She wrote an interesting article about climate change.|3|阅读
artificial|/ˌɑːrtɪˈfɪʃl/|adj. 人工的；人造的|adj|Artificial intelligence is changing many industries.|3|阅读
ashamed|/əˈʃeɪmd/|adj. 羞愧的|adj|He felt ashamed of his behavior at the party.|3|写作
aspect|/ˈæspekt/|n. 方面；面貌|n|This is one of the most important aspects of the problem.|3|写作
assemble|/əˈsembl/|v. 集合；组装|v|The students assembled in the main hall.|3|阅读
assess|/əˈses/|vt. 评估；评定|v|Teachers need to assess students' progress regularly.|3|阅读
assign|/əˈsaɪn/|vt. 分配；指派|v|The manager assigned the task to the new employee.|3|阅读
assist|/əˈsɪst/|v. 帮助；协助|v|Nurses assist doctors during operations.|3|翻译
associate|/əˈsoʊʃieɪt/|vt. 联想 vi. 交往|v|People often associate success with happiness.|3|写作
assume|/əˈsuːm/|vt. 假设；承担|v|Don't assume that everyone agrees with you.|3|写作
atmosphere|/ˈætməsfɪr/|n. 大气；气氛|n|The restaurant has a friendly atmosphere.|3|写作
attach|/əˈtætʃ/|vt. 附上；系；使依恋|v|Please attach your resume to the email.|3|写作
attempt|/əˈtempt/|n./vt. 尝试；企图|n/v|She made an attempt to break the world record.|3|写作
attend|/əˈtend/|v. 出席；照料|v|All students must attend the orientation.|4|高频
attention|/əˈtenʃn/|n. 注意力；关注|n|Please pay attention to the safety instructions.|4|高频,听力
attitude|/ˈætɪtuːd/|n. 态度；看法|n|A positive attitude is essential for success.|4|高频,写作
attract|/əˈtrækt/|vt. 吸引|v|The new policy attracted a lot of criticism.|3|写作
audience|/ˈɔːdiəns/|n. 观众；听众|n|The audience applauded at the end of the speech.|3|阅读
authority|/əˈθɔːrəti/|n. 权威；当局|n|The local authorities are investigating the incident.|3|阅读
available|/əˈveɪləbl/|adj. 可用的；有空的|adj|This service is available 24 hours a day.|4|高频,写作
avenue|/ˈævənuː/|n. 大街；途径|n|They walked down the tree-lined avenue.|2|翻译
average|/ˈævərɪdʒ/|adj. 平均的 n. 平均值|adj/n|The average temperature in summer is about 30 degrees.|3|阅读
avoid|/əˈvɔɪd/|vt. 避免；回避|v|Try to avoid making the same mistake twice.|3|写作
award|/əˈwɔːrd/|n. 奖品 vt. 授予|n/v|She received an award for her outstanding performance.|3|写作
aware|/əˈwer/|adj. 意识到的；知道的|adj|Are you aware of the risks involved?|3|写作
awful|/ˈɔːfl/|adj. 可怕的；糟糕的|adj|The weather was awful, so we stayed indoors.|2|听力
awkward|/ˈɔːkwərd/|adj. 尴尬的；笨拙的|adj|There was an awkward silence after his comment.|2|听力
background|/ˈbækɡraʊnd/|n. 背景|n|He has a strong background in computer science.|3|写作
backward|/ˈbækwərd/|adj. 向后的；落后的|adj|The country still has some backward areas.|2|阅读
balance|/ˈbæləns/|n. 平衡 vt. 使平衡|n/v|It's important to maintain a balance between work and life.|4|高频,写作
ban|/bæn/|vt./n. 禁止|v/n|The government decided to ban smoking in public places.|3|阅读
barely|/ˈberli/|adv. 几乎不；仅仅|adv|She barely had time to finish the exam.|3|翻译
bargain|/ˈbɑːrɡən/|n. 便宜货 vi. 讨价还价|n/v|This dress is a real bargain at half price.|3|听力
barrier|/ˈbæriər/|n. 障碍；屏障|n|Language barriers can make communication difficult.|3|写作
battle|/ˈbætl/|n. 战斗；斗争|n|He lost his battle with cancer last year.|3|阅读
bear|/ber/|vt. 忍受；承担 n. 熊|v/n|I can't bear the noise anymore.|3|写作
behave|/bɪˈheɪv/|vi. 表现；行为|v|Children should learn to behave properly in public.|3|写作
belong|/bɪˈlɔːŋ/|vi. 属于|v|This book belongs to the library.|3|翻译
bend|/bend/|v. 弯曲；屈服|v|The road bends sharply to the left.|2|翻译
benefit|/ˈbenɪfɪt/|n. 利益 vt. 有益于|n/v|Exercise has many health benefits.|4|高频,写作
betray|/bɪˈtreɪ/|vt. 背叛；出卖|v|He would never betray his friends.|2|阅读
bitter|/ˈbɪtər/|adj. 苦的；痛苦的|adj|The medicine has a bitter taste.|2|翻译
blame|/bleɪm/|vt. 责备 n. 责任|v/n|Don't blame others for your own mistakes.|3|写作
blank|/blæŋk/|adj. 空白的 n. 空白处|adj/n|Please fill in the blank spaces on the form.|3|翻译
blast|/blæst/|n. 爆炸；一阵|n|A blast of cold air hit us when we opened the door.|2|阅读
blend|/blend/|v./n. 混合|v/n|Blend the ingredients until smooth.|2|翻译
bless|/bles/|vt. 祝福；保佑|v|May God bless you.|2|听力
block|/blɑːk/|n. 街区；障碍物 vt. 阻塞|n/v|The bank is just two blocks away.|3|听力
board|/bɔːrd/|n. 木板；董事会 vt. 上船|n/v|The board of directors will meet tomorrow.|3|阅读
bold|/boʊld/|adj. 大胆的；粗体的|adj|She made a bold decision to quit her job.|2|写作
border|/ˈbɔːrdər/|n. 边界；边境|n|They crossed the border into the neighboring country.|3|翻译
bore|/bɔːr/|vt. 使厌烦|v|Long lectures tend to bore students.|2|听力
bound|/baʊnd/|adj. 必然的；束缚的|adj|You are bound to succeed if you keep trying.|3|写作
brand|/brænd/|n. 品牌；商标|n|This is a well-known brand of sports shoes.|3|阅读
brave|/breɪv/|adj. 勇敢的|adj|She was brave enough to speak up for what is right.|3|写作
brief|/briːf/|adj. 简短的 n. 摘要|adj/n|Can you give me a brief introduction to the topic?|3|写作
brilliant|/ˈbrɪliənt/|adj. 杰出的；明亮的|adj|She had a brilliant idea for the project.|3|写作
broadcast|/ˈbrɔːdkæst/|v./n. 广播；播放|v/n|The news will be broadcast live tonight.|3|阅读
budget|/ˈbʌdʒɪt/|n. 预算|n|We need to cut costs to stay within the budget.|3|阅读
burden|/ˈbɜːrdn/|n. 负担 vt. 使负重|n/v|The heavy workload is a burden for many students.|3|写作
burst|/bɜːrst/|v. 爆炸；突然发作|v|She burst into tears when she heard the news.|2|翻译
cabinet|/ˈkæbɪnət/|n. 橱柜；内阁|n|The documents are stored in the filing cabinet.|2|阅读
campaign|/kæmˈpeɪn/|n. 运动；战役|n|They launched an advertising campaign for the new product.|3|阅读
cancel|/ˈkænsl/|vt. 取消|v|The flight was canceled due to bad weather.|3|听力
capable|/ˈkeɪpəbl/|adj. 有能力的|adj|She is a very capable manager.|3|写作
capacity|/kəˈpæsəti/|n. 容量；能力|n|The stadium has a capacity of 50,000 people.|3|阅读
capture|/ˈkæptʃər/|vt. 捕获；俘获|v|The photographer captured the beautiful sunset.|3|写作
career|/kəˈrɪr/|n. 职业；生涯|n|She chose teaching as her lifelong career.|4|高频,写作
cargo|/ˈkɑːrɡoʊ/|n. 货物|n|The ship is carrying a cargo of grain.|2|阅读
cast|/kæst/|vt. 投掷；铸造|v|He cast his fishing line into the river.|2|阅读
catalog|/ˈkætəlɔːɡ/|n. 目录|n|You can browse the course catalog online.|2|阅读
category|/ˈkætəɡɔːri/|n. 类别；种类|n|This book falls into the category of science fiction.|3|阅读
cautious|/ˈkɔːʃəs/|adj. 谨慎的；小心的|adj|You should be cautious when investing money.|3|写作
cease|/siːs/|v. 停止；终止|v|The company ceased operations last year.|2|阅读
celebrate|/ˈselɪbreɪt/|v. 庆祝|v|We went out to celebrate her promotion.|3|写作
challenge|/ˈtʃælɪndʒ/|n. 挑战 vt. 向...挑战|n/v|Learning a new language is a real challenge.|4|高频,写作
champion|/ˈtʃæmpiən/|n. 冠军|n|She became the world champion at age 18.|2|听力
channel|/ˈtʃænl/|n. 频道；渠道；海峡|n|What channel is the news on?|3|听力
chapter|/ˈtʃæptər/|n. 章节|n|Please read chapter five for next class.|3|翻译
character|/ˈkærəktər/|n. 性格；角色；字符|n|Honesty is an important part of her character.|4|高频,写作
charity|/ˈtʃærəti/|n. 慈善；慈善机构|n|She donates a lot of money to charity.|3|写作
charm|/tʃɑːrm/|n. 魅力|n|The old town still retains its traditional charm.|3|写作
chart|/tʃɑːrt/|n. 图表|n|The chart shows the company's growth over five years.|3|阅读
chase|/tʃeɪs/|vt./n. 追逐|v/n|The cat chased the mouse around the room.|2|翻译
cheat|/tʃiːt/|v. 欺骗；作弊|v|Students who cheat on exams will be punished.|2|听力
chemical|/ˈkemɪkl/|adj. 化学的 n. 化学品|adj/n|Chemical reactions can produce energy.|3|阅读
chief|/tʃiːf/|adj. 主要的 n. 首领|adj/n|The chief reason for his success is hard work.|3|阅读
circumstance|/ˈsɜːrkəmstæns/|n. 环境；情况|n|Under no circumstances should you give up.|3|写作
civil|/ˈsɪvl/|adj. 公民的；民事的；文明的|adj|Everyone has basic civil rights.|3|阅读
claim|/kleɪm/|vt./n. 声称；要求|v/n|He claims that he saw the accident.|4|高频,阅读
clarify|/ˈklærɪfaɪ/|vt. 澄清；阐明|v|Could you clarify what you meant by that?|3|写作
classic|/ˈklæsɪk/|adj. 经典的 n. 名著|adj/n|This is a classic example of bad management.|3|写作
climate|/ˈklaɪmət/|n. 气候；风气|n|Climate change is a global concern.|4|高频,写作
clue|/kluː/|n. 线索|n|The police found a clue at the crime scene.|2|听力
collapse|/kəˈlæps/|vi./n. 倒塌；崩溃|v/n|The building collapsed during the earthquake.|3|阅读
colleague|/ˈkɑːliːɡ/|n. 同事|n|I discussed the problem with my colleagues.|3|写作
collection|/kəˈlekʃn/|n. 收集；收藏品|n|She has a large collection of stamps.|3|翻译
combine|/kəmˈbaɪn/|v. 结合；联合|v|If you combine hard work with talent, you will succeed.|3|写作
comfort|/ˈkʌmfərt/|n. 舒适 vt. 安慰|n/v|She took comfort in knowing her family was safe.|3|写作
command|/kəˈmænd/|n./v. 命令；指挥|n/v|The officer gave the command to advance.|3|阅读
comment|/ˈkɑːment/|n./v. 评论|n/v|The mayor refused to comment on the issue.|3|写作
commerce|/ˈkɑːmɜːrs/|n. 商业；贸易|n|E-commerce has grown rapidly in recent years.|3|阅读
commit|/kəˈmɪt/|vt. 犯（罪）；承诺|v|He committed a serious crime.|4|高频
communicate|/kəˈmjuːnɪkeɪt/|v. 交流；沟通|v|It's important to communicate clearly with your team.|4|高频,写作
community|/kəˈmjuːnəti/|n. 社区；群体|n|The local community supported the charity event.|3|写作
companion|/kəmˈpæniən/|n. 同伴；伙伴|n|She was a wonderful companion on the trip.|3|写作
compare|/kəmˈper/|v. 比较|v|Don't compare yourself with others.|3|写作
compete|/kəmˈpiːt/|vi. 竞争|v|Athletes from around the world compete in the Olympics.|3|写作
complain|/kəmˈpleɪn/|v. 抱怨；投诉|v|Customers often complain about the slow service.|3|听力
complex|/kəmˈpleks/|adj. 复杂的 n. 综合体|adj/n|This is a very complex problem to solve.|4|高频,写作
component|/kəmˈpoʊnənt/|n. 组成部分；部件|n|Trust is a key component of any relationship.|3|阅读
concentrate|/ˈkɑːnsntreɪt/|v. 集中；专注|v|I can't concentrate with all this noise.|4|高频
concept|/ˈkɑːnsept/|n. 概念；观念|n|The concept of time varies across cultures.|3|阅读
concern|/kənˈsɜːrn/|n. 关心 vt. 涉及|n/v|Environmental protection is a major concern.|4|高频,写作
conclude|/kənˈkluːd/|v. 得出结论；结束|v|From the evidence, we can conclude he is innocent.|3|写作
condition|/kənˈdɪʃn/|n. 条件；状况|n|The car is in excellent condition.|3|写作
conduct|/kənˈdʌkt/|vt. 进行；指挥 n. 行为|v/n|The researchers conducted a survey among students.|3|阅读
conference|/ˈkɑːnfərəns/|n. 会议；研讨会|n|She attended an international conference on education.|3|阅读
confess|/kənˈfes/|v. 承认；坦白|v|He confessed that he had made a mistake.|3|写作
confidence|/ˈkɑːnfɪdəns/|n. 信心；信任|n|She has great confidence in her abilities.|4|高频,写作
confirm|/kənˈfɜːrm/|vt. 确认；证实|v|Can you confirm your reservation?|3|写作
conflict|/ˈkɑːnflɪkt/|n. 冲突；矛盾|n|The two countries are in conflict over territory.|3|阅读
confuse|/kənˈfjuːz/|vt. 使困惑；混淆|v|The instructions confused many students.|3|写作
congress|/ˈkɑːŋɡrəs/|n. 国会；议会|n|The bill was passed by Congress.|2|阅读
connect|/kəˈnekt/|v. 连接；联系|v|The internet connects people all over the world.|4|高频
conquer|/ˈkɑːŋkər/|vt. 征服；战胜|v|She managed to conquer her fear of public speaking.|3|写作
conscience|/ˈkɑːnʃəns/|n. 良心|n|His conscience wouldn't let him cheat.|3|写作
conscious|/ˈkɑːnʃəs/|adj. 有意识的；清醒的|adj|She is very conscious of her health.|3|写作
consequence|/ˈkɑːnsɪkwens/|n. 结果；后果|n|Think about the consequences before you act.|3|写作
conservative|/kənˈsɜːrvətɪv/|adj. 保守的|adj|He is quite conservative in his views.|3|阅读
consider|/kənˈsɪdər/|v. 考虑；认为|v|You should consider all possible options.|4|高频
consistent|/kənˈsɪstənt/|adj. 一致的；始终如一的|adj|Consistent practice is the key to improvement.|4|高频,写作
constant|/ˈkɑːnstənt/|adj. 不断的；恒定的|adj|The constant noise from the construction site is annoying.|3|写作
construct|/kənˈstrʌkt/|vt. 建造；构建|v|They plan to construct a new bridge.|3|阅读
consult|/kənˈsʌlt/|v. 咨询；查阅|v|You should consult a doctor about your symptoms.|3|听力
consume|/kənˈsuːm/|vt. 消费；消耗|v|People consume more energy in winter.|3|阅读
contact|/ˈkɑːntækt/|n./vt. 联系；接触|n/v|Please contact us if you have any questions.|4|高频
contain|/kənˈteɪn/|vt. 包含；容纳|v|The report contains important information.|4|高频
content|/kənˈtent/|adj. 满意的 n. 内容|adj/n|She is content with her current life.|4|高频
contest|/ˈkɑːntest/|n. 比赛；竞赛|n|She won first prize in the singing contest.|3|听力
context|/ˈkɑːntekst/|n. 上下文；背景|n|You can guess the meaning from the context.|4|高频,阅读
contract|/ˈkɑːntrækt/|n. 合同|n|Both parties signed the contract.|3|阅读
contrast|/ˈkɑːntræst/|n. 对比；差异|n|In contrast to his brother, he is very outgoing.|3|写作
contribute|/kənˈtrɪbjuːt/|v. 贡献；捐献|v|Everyone can contribute to protecting the environment.|3|写作
control|/kənˈtroʊl/|vt./n. 控制|v/n|She couldn't control her emotions.|4|高频
convenient|/kənˈviːniənt/|adj. 方便的|adj|Online shopping is convenient for busy people.|3|写作
convention|/kənˈvenʃn/|n. 习俗；大会；公约|n|By convention, people shake hands when they meet.|3|阅读
convince|/kənˈvɪns/|vt. 说服；使信服|v|She convinced me to change my mind.|3|写作
cooperate|/koʊˈɑːpəreɪt/|vi. 合作|v|The two companies decided to cooperate on the project.|3|写作
cope|/koʊp/|vi. 应对；处理|v|She has learned to cope with stress.|3|写作
core|/kɔːr/|n. 核心 adj. 核心的|n/adj|The core of the problem is lack of funding.|3|阅读
corporate|/ˈkɔːrpərət/|adj. 公司的；法人的|adj|Corporate social responsibility is important.|3|阅读
correspond|/ˌkɔːrəˈspɑːnd/|vi. 对应；通信|v|Your words should correspond with your actions.|3|写作
costly|/ˈkɔːstli/|adj. 昂贵的；代价高的|adj|The mistake proved to be costly.|3|写作
council|/ˈkaʊnsl/|n. 委员会；理事会|n|The city council approved the new budget.|2|阅读
counter|/ˈkaʊntər/|n. 柜台 vt. 反驳|n/v|Please pay at the counter.|3|听力
courage|/ˈkɜːrɪdʒ/|n. 勇气|n|It takes courage to admit your mistakes.|3|写作
crash|/kræʃ/|v./n. 碰撞；崩溃|v/n|The stock market crashed in 2008.|3|阅读
create|/kriˈeɪt/|vt. 创造；创建|v|Artists create beauty from imagination.|4|高频,写作
credit|/ˈkredɪt/|n. 信用；学分 vt. 归功于|n/v|You need 120 credits to graduate.|4|高频
crew|/kruː/|n. 全体船员；工作人员|n|The crew members worked as a team.|3|听力
crime|/kraɪm/|n. 犯罪；罪行|n|Crime rates have decreased in recent years.|3|阅读
crisis|/ˈkraɪsɪs/|n. 危机|n|The company faced a financial crisis.|3|阅读
critical|/ˈkrɪtɪkl/|adj. 批评的；关键的|adj|It is critical that we act now.|4|高频,写作
cultivate|/ˈkʌltɪveɪt/|vt. 培养；耕作|v|Students should cultivate good study habits.|3|写作
culture|/ˈkʌltʃər/|n. 文化；培养|n|Learning about other cultures is fascinating.|4|高频,写作
curiosity|/ˌkjʊriˈɑːsəti/|n. 好奇心|n|Curiosity drives people to explore the unknown.|3|写作
current|/ˈkɜːrənt/|adj. 当前的 n. 水流|adj/n|The current situation requires immediate action.|4|高频
custom|/ˈkʌstəm/|n. 习俗；海关|n|It's a local custom to give gifts during festivals.|3|写作
damage|/ˈdæmɪdʒ/|n./vt. 损害；破坏|n/v|The storm caused serious damage to the crops.|3|写作
dawn|/dɔːn/|n. 黎明；开端|n|We set out at dawn to avoid the heat.|3|写作
debate|/dɪˈbeɪt/|n./v. 辩论；讨论|n/v|There is an ongoing debate about education reform.|3|写作
debt|/det/|n. 债务|n|Many students graduate with significant debt.|3|写作
decade|/ˈdekeɪd/|n. 十年|n|The city has changed a lot in the past decade.|3|写作
deceive|/dɪˈsiːv/|vt. 欺骗|v|Don't try to deceive yourself.|3|写作
decline|/dɪˈklaɪn/|v./n. 下降；拒绝|v/n|The population of the town has declined sharply.|4|高频,阅读
decorate|/ˈdekəreɪt/|vt. 装饰|v|They decorated the room with flowers and balloons.|2|翻译
decrease|/dɪˈkriːs/|v./n. 减少|v/n|The price of oil decreased significantly.|3|阅读
defeat|/dɪˈfiːt/|vt./n. 击败；失败|v/n|They refused to admit defeat.|3|写作
defend|/dɪˈfend/|vt. 防御；辩护|v|Everyone has the right to defend themselves.|3|写作
define|/dɪˈfaɪn/|vt. 定义；界定|v|How do you define success?|3|写作
definite|/ˈdefɪnət/|adj. 明确的；肯定的|adj|We need a definite answer by Friday.|3|写作
degree|/dɪˈɡriː/|n. 程度；学位；度|n|To a certain degree, I agree with you.|4|高频
delay|/dɪˈleɪ/|v./n. 延迟；耽搁|v/n|The flight was delayed by two hours.|3|听力
deliberate|/dɪˈlɪbərət/|adj. 故意的；深思熟虑的|adj|It was a deliberate decision, not an accident.|3|阅读
delicate|/ˈdelɪkət/|adj. 精致的；脆弱的|adj|The situation requires delicate handling.|3|阅读
deliver|/dɪˈlɪvər/|vt. 递送；发表|v|The package will be delivered tomorrow.|3|听力
demand|/dɪˈmænd/|n./vt. 要求；需求|n/v|There is a growing demand for renewable energy.|4|高频,写作
depart|/dɪˈpɑːrt/|vi. 离开；出发|v|The train departs from platform 3.|3|听力
depend|/dɪˈpend/|vi. 依赖；取决于|v|It depends on the weather.|4|高频
deposit|/dɪˈpɑːzɪt/|n. 存款；押金 vt. 存放|n/v|You need to pay a deposit to reserve the room.|2|听力
depress|/dɪˈpres/|vt. 使沮丧；使萧条|v|The bad news depressed everyone.|3|写作
derive|/dɪˈraɪv/|v. 源自；获得|v|Many English words derive from Latin.|3|阅读
describe|/dɪˈskraɪb/|vt. 描述|v|Can you describe what happened?|3|写作
deserve|/dɪˈzɜːrv/|vt. 值得；应得|v|You deserve a break after working so hard.|3|写作
design|/dɪˈzaɪn/|vt./n. 设计|v/n|The building was designed by a famous architect.|3|写作
desire|/dɪˈzaɪər/|n./vt. 渴望；欲望|n/v|She has a strong desire to succeed.|3|写作
desperate|/ˈdespərət/|adj. 绝望的；不顾一切的|adj|He was desperate to find a job.|3|写作
despite|/dɪˈspaɪt/|prep. 尽管|prep|Despite the rain, we enjoyed the trip.|4|高频,写作
destination|/ˌdestɪˈneɪʃn/|n. 目的地|n|We finally reached our destination.|3|听力
destroy|/dɪˈstrɔɪ/|vt. 破坏；毁灭|v|The fire destroyed the entire building.|3|阅读
detail|/ˈdiːteɪl/|n. 细节|n|Please give me more details about the project.|3|写作
detect|/dɪˈtekt/|vt. 察觉；发现|v|The system can detect any unusual activity.|3|阅读
determine|/dɪˈtɜːrmɪn/|vt. 决定；确定|v|We need to determine the cause of the problem.|4|高频,写作
develop|/dɪˈveləp/|v. 发展；开发|v|The company is developing new technology.|4|高频,写作
device|/dɪˈvaɪs/|n. 设备；装置|n|This device can measure your heart rate.|3|阅读
devote|/dɪˈvoʊt/|vt. 致力于；奉献|v|She devoted her life to helping others.|3|写作
differ|/ˈdɪfər/|vi. 不同；有差异|v|Opinions differ on this issue.|3|写作
digest|/daɪˈdʒest/|vt. 消化；领会|v|It takes time to digest the information.|3|阅读
dilemma|/dɪˈlemə/|n. 困境；进退两难|n|She faced the dilemma of choosing between two jobs.|3|写作
diminish|/dɪˈmɪnɪʃ/|v. 减少；缩小|v|The pain will gradually diminish.|3|阅读
diploma|/dɪˈploʊmə/|n. 文凭；毕业证书|n|She received her diploma at the graduation ceremony.|2|听力
disappear|/ˌdɪsəˈpɪr/|vi. 消失|v|The sun disappeared behind the clouds.|3|写作
discipline|/ˈdɪsəplɪn/|n. 纪律；学科|n|Self-discipline is essential for success.|4|高频,写作
discount|/ˈdɪskaʊnt/|n. 折扣|n|Students get a 10% discount at this store.|3|听力
discover|/dɪˈskʌvər/|vt. 发现|v|Scientists discovered a new species of plant.|3|写作
discuss|/dɪˈskʌs/|vt. 讨论|v|Let's discuss this matter in detail.|4|高频
disease|/dɪˈziːz/|n. 疾病|n|Heart disease is a leading cause of death.|3|阅读
display|/dɪˈspleɪ/|vt./n. 展示；显示|v/n|The museum displays ancient artifacts.|3|阅读
dispute|/dɪˈspjuːt/|n./v. 争论；纠纷|n/v|The two sides are in dispute over the contract.|3|阅读
distance|/ˈdɪstəns/|n. 距离；远处|n|The distance between the two cities is 300 kilometers.|3|翻译
distinct|/dɪˈstɪŋkt/|adj. 明显的；不同的|adj|There is a distinct difference between the two.|3|阅读
distinguish|/dɪˈstɪŋɡwɪʃ/|v. 区分；辨别|v|Can you distinguish real news from fake news?|3|写作
distribute|/dɪˈstrɪbjuːt/|vt. 分配；分发|v|The organization distributes food to the poor.|3|阅读
district|/ˈdɪstrɪkt/|n. 地区；区域|n|This is the business district of the city.|3|翻译
disturb|/dɪˈstɜːrb/|vt. 打扰；扰乱|v|Please don't disturb me while I'm working.|3|写作
diverse|/daɪˈvɜːrs/|adj. 多样的；不同的|adj|The university has a diverse student population.|4|高频,写作
document|/ˈdɑːkjumənt/|n. 文件；文档|n|Please sign the document at the bottom.|3|阅读
domestic|/dəˈmestɪk/|adj. 国内的；家庭的|adj|The domestic economy is growing steadily.|3|阅读
dominate|/ˈdɑːmɪneɪt/|v. 支配；主导|v|The team dominated the game from start to finish.|3|阅读
donate|/ˈdoʊneɪt/|vt. 捐赠|v|Many people donated blood after the disaster.|3|写作
draft|/dræft/|n. 草稿 vt. 起草|n/v|This is just the first draft of my essay.|3|写作
drain|/dreɪn/|v. 排水；耗尽 n. 下水道|v/n|The hard work drained his energy.|2|翻译
dramatic|/drəˈmætɪk/|adj. 戏剧性的；巨大的|adj|There has been a dramatic improvement in her health.|3|写作
drift|/drɪft/|vi. 漂流；漂泊|v|The boat drifted out to sea.|2|阅读
durable|/ˈdʊrəbl/|adj. 耐用的；持久的|adj|This is a very durable material.|2|阅读
dynamic|/daɪˈnæmɪk/|adj. 动态的；充满活力的|adj|She is a dynamic young leader.|3|写作
eager|/ˈiːɡər/|adj. 渴望的；热切的|adj|The students are eager to learn new things.|3|写作
earn|/ɜːrn/|vt. 赚取；赢得|v|She earns a good salary as an engineer.|3|写作
economic|/ˌiːkəˈnɑːmɪk/|adj. 经济的|adj|The country is facing economic difficulties.|4|高频,阅读
edition|/ɪˈdɪʃn/|n. 版本|n|This is the latest edition of the textbook.|2|阅读
educate|/ˈedʒukeɪt/|vt. 教育；培养|v|Parents should educate their children about safety.|3|写作
effective|/ɪˈfektɪv/|adj. 有效的|adj|This is an effective way to improve your memory.|4|高频,写作
efficient|/ɪˈfɪʃnt/|adj. 高效的|adj|The new system is more efficient than the old one.|4|高频,写作
elaborate|/ɪˈlæbərət/|adj. 精心制作的 vi. 详细说明|adj/v|Could you elaborate on your plan?|3|阅读
elect|/ɪˈlekt/|vt. 选举；选择|v|He was elected president of the student union.|3|阅读
element|/ˈelɪmənt/|n. 元素；要素|n|Trust is an essential element of teamwork.|3|阅读
eliminate|/ɪˈlɪmɪneɪt/|vt. 消除；淘汰|v|We must eliminate all sources of error.|3|写作
embrace|/ɪmˈbreɪs/|vt. 拥抱；接受|v|We should embrace change rather than fear it.|3|写作
emerge|/iˈmɜːrdʒ/|vi. 出现；浮现|v|A new trend has emerged in the fashion industry.|3|阅读
emotion|/ɪˈmoʊʃn/|n. 情感；情绪|n|He tried to control his emotions.|3|写作
emphasis|/ˈemfəsɪs/|n. 强调；重点|n|The school places great emphasis on creativity.|4|高频,写作
employ|/ɪmˈplɔɪ/|vt. 雇用；使用|v|The company employs over 500 people.|3|写作
enable|/ɪˈneɪbl/|vt. 使能够|v|The internet enables people to work from home.|3|写作
encounter|/ɪnˈkaʊntər/|vt./n. 遭遇；遇见|v/n|I encountered many difficulties along the way.|3|写作
encourage|/ɪnˈkɜːrɪdʒ/|vt. 鼓励|v|Teachers should encourage students to ask questions.|4|高频,写作
engage|/ɪnˈɡeɪdʒ/|v. 参加；吸引；订婚|v|Students should engage actively in class discussions.|3|写作
enormous|/ɪˈnɔːrməs/|adj. 巨大的|adj|The project required an enormous amount of work.|3|写作
ensure|/ɪnˈʃʊr/|vt. 确保；保证|v|Please ensure that all doors are locked.|4|高频
enterprise|/ˈentərpraɪz/|n. 企业；事业|n|Small enterprises are important for the local economy.|3|阅读
enthusiasm|/ɪnˈθuːziæzəm/|n. 热情；热心|n|She showed great enthusiasm for the project.|3|写作
entire|/ɪnˈtaɪər/|adj. 全部的；整个的|adj|The entire class passed the exam.|3|写作
environment|/ɪnˈvaɪrənmənt/|n. 环境|n|We must protect the natural environment.|4|高频,写作
equal|/ˈiːkwəl/|adj. 相等的；平等的|adj|All people are born equal.|3|写作
equip|/ɪˈkwɪp/|vt. 装备；配备|v|The lab is equipped with modern instruments.|3|阅读
essential|/ɪˈsenʃl/|adj. 必要的；本质的|adj|Water is essential for life.|4|高频,写作
establish|/ɪˈstæblɪʃ/|vt. 建立；确立|v|The company was established in 1995.|4|高频,写作
estimate|/ˈestɪmət/|vt./n. 估计；评估|v/n|We estimate the project will take six months.|3|阅读
evaluate|/ɪˈvæljueɪt/|vt. 评估；评价|v|Teachers evaluate students' performance regularly.|3|写作
eventually|/ɪˈventʃuəli/|adv. 最终；终于|adv|Eventually, she achieved her goal.|3|写作
evidence|/ˈevɪdəns/|n. 证据|n|There is no evidence to support his claim.|3|阅读
evolve|/iˈvɑːlv/|v. 进化；发展|v|Languages evolve over time.|3|阅读
exact|/ɪɡˈzækt/|adj. 精确的|adj|I need the exact date of the event.|3|写作
examine|/ɪɡˈzæmɪn/|vt. 检查；考试|v|The doctor examined the patient carefully.|3|写作
exceed|/ɪkˈsiːd/|vt. 超过；超越|v|The result exceeded our expectations.|3|写作
exception|/ɪkˈsepʃn/|n. 例外|n|There is no exception to this rule.|3|写作
exchange|/ɪksˈtʃeɪndʒ/|n./vt. 交换；兑换|n/v|I would like to exchange this shirt for a larger size.|3|听力
exclude|/ɪkˈskluːd/|vt. 排除；不包括|v|The price excludes taxes.|3|阅读
execute|/ˈeksɪkjuːt/|vt. 执行；处决|v|We need to execute the plan immediately.|3|阅读
exhibit|/ɪɡˈzɪbɪt/|vt./n. 展览；展示|v/n|The museum is exhibiting works by local artists.|3|阅读
exist|/ɪɡˈzɪst/|vi. 存在|v|Do you believe aliens exist?|3|写作
expand|/ɪkˈspænd/|v. 扩展；扩大|v|The company plans to expand overseas.|3|写作
expect|/ɪkˈspekt/|vt. 期望；预期|v|What do you expect to achieve this year?|4|高频
expense|/ɪkˈspens/|n. 费用；代价|n|Travel expenses can be quite high.|3|写作
experiment|/ɪkˈsperɪmənt/|n. 实验|n|The experiment proved the theory was correct.|3|阅读
expert|/ˈekspɜːrt/|n. 专家 adj. 熟练的|n/adj|She is an expert in international law.|3|写作
explain|/ɪkˈspleɪn/|v. 解释；说明|v|Can you explain why you were late?|3|写作
explode|/ɪkˈsploʊd/|v. 爆炸；激增|v|The population has exploded in recent years.|3|阅读
explore|/ɪkˈsplɔːr/|vt. 探索；探究|v|Let's explore the possibilities together.|3|写作
export|/ɪkˈspɔːrt/|vt./n. 出口；输出|v/n|The country exports coffee to many countries.|3|阅读
expose|/ɪkˈspoʊz/|vt. 暴露；揭露|v|The report exposed serious problems in the system.|3|阅读
extend|/ɪkˈstend/|v. 延伸；扩展|v|They decided to extend the deadline.|3|写作
extent|/ɪkˈstent/|n. 程度；范围|n|To some extent, I agree with you.|3|写作
external|/ɪkˈstɜːrnl/|adj. 外部的；外来的|adj|External factors can affect the economy.|3|阅读
extraordinary|/ɪkˈstrɔːrdəneri/|adj. 非凡的；特别的|adj|She has an extraordinary talent for music.|3|写作
extreme|/ɪkˈstriːm/|adj. 极端的；极度的|adj|Extreme weather events are becoming more common.|3|写作
facility|/fəˈsɪləti/|n. 设施；设备|n|The hotel has excellent sports facilities.|3|阅读
factor|/ˈfæktər/|n. 因素|n|Hard work is a key factor in success.|3|写作
faculty|/ˈfæklti/|n. 才能；全体教员|n|She is a member of the law faculty.|3|阅读
fade|/feɪd/|vi. 褪色；逐渐消失|v|The music slowly faded away.|3|翻译
faith|/feɪθ/|n. 信仰；信心|n|I have faith in your ability to succeed.|3|写作
false|/fɔːls/|adj. 错误的；假的|adj|The rumor turned out to be false.|3|写作
familiar|/fəˈmɪliər/|adj. 熟悉的|adj|This song sounds familiar to me.|3|写作
fancy|/ˈfænsi/|adj. 精致的 vt. 想象|adj/v|That's a fancy restaurant.|2|听力
fascinate|/ˈfæsɪneɪt/|vt. 使着迷|v|Science has always fascinated me.|3|写作
fashion|/ˈfæʃn/|n. 时尚；方式|n|Fashion changes quickly nowadays.|3|写作
fatal|/ˈfeɪtl/|adj. 致命的|adj|The accident proved fatal.|2|阅读
fault|/fɔːlt/|n. 错误；缺点|n|It's not your fault that things went wrong.|3|写作
feature|/ˈfiːtʃər/|n. 特征 vt. 以...为特色|n/v|The new phone has many advanced features.|3|阅读
federal|/ˈfedərəl/|adj. 联邦的|adj|Federal law prohibits discrimination.|2|阅读
feedback|/ˈfiːdbæk/|n. 反馈|n|We welcome feedback from our customers.|3|写作
female|/ˈfiːmeɪl/|adj. 女性的 n. 女性|adj/n|The female students performed better on average.|3|阅读
fiction|/ˈfɪkʃn/|n. 小说；虚构|n|Science fiction is a popular genre.|3|阅读
fierce|/fɪrs/|adj. 凶猛的；激烈的|adj|There is fierce competition for the scholarship.|3|写作
finance|/faɪˈnæns/|n. 金融；财务|n|She works in the finance department.|3|阅读
firm|/fɜːrm/|adj. 坚定的 n. 公司|adj/n|She has a firm belief in justice.|3|写作
flame|/fleɪm/|n. 火焰|n|The building was engulfed in flames.|2|翻译
flash|/flæʃ/|n. 闪光 vi. 闪烁|n/v|Lightning flashed across the sky.|2|翻译
flexible|/ˈfleksəbl/|adj. 灵活的；柔韧的|adj|We need a more flexible approach.|3|写作
float|/floʊt/|v. 漂浮|v|The boat floated down the river.|2|翻译
flourish|/ˈflɜːrɪʃ/|vi. 繁荣；兴旺|v|The arts flourished during that period.|3|阅读
focus|/ˈfoʊkəs/|v./n. 集中；焦点|v/n|We need to focus on the most important tasks.|4|高频,写作
forbid|/fərˈbɪd/|vt. 禁止|v|Smoking is forbidden in this building.|3|写作
forecast|/ˈfɔːrkæst/|n./vt. 预测；预报|n/v|The weather forecast says it will rain tomorrow.|3|听力
foreign|/ˈfɔːrən/|adj. 外国的|adj|She speaks three foreign languages.|4|高频
formal|/ˈfɔːrml/|adj. 正式的|adj|You should wear formal clothes for the interview.|3|写作
former|/ˈfɔːrmər/|adj. 以前的；前者的|adj|The former president attended the ceremony.|3|阅读
fortune|/ˈfɔːrtʃən/|n. 财富；运气|n|He made a fortune in the stock market.|3|写作
found|/faʊnd/|vt. 建立；创办|v|The university was founded in 1850.|3|写作
frame|/freɪm/|n. 框架；结构|n|The picture is in a wooden frame.|3|翻译
frank|/fræŋk/|adj. 坦白的；直率的|adj|To be frank, I don't agree with you.|3|写作
frequent|/ˈfriːkwənt/|adj. 频繁的|adj|Frequent exercise is good for your health.|4|高频,写作
frontier|/frʌnˈtɪr/|n. 边境；前沿|n|Space is the final frontier.|2|阅读
fulfill|/fʊlˈfɪl/|vt. 实现；满足|v|She wants to fulfill her dream of becoming a doctor.|3|写作
function|/ˈfʌŋkʃn/|n. 功能 vi. 运行|n/v|What is the function of this button?|3|写作
fund|/fʌnd/|n. 基金 vt. 资助|n/v|The project is funded by the government.|3|阅读
fundamental|/ˌfʌndəˈmentl/|adj. 基本的；根本的|adj|This is a fundamental principle of physics.|3|阅读
gain|/ɡeɪn/|v. 获得；增加|v|She gained valuable experience from the internship.|4|高频
gap|/ɡæp/|n. 差距；缺口|n|There is a big gap between rich and poor.|3|写作
gaze|/ɡeɪz/|vi./n. 凝视|v/n|She gazed at the stars in wonder.|3|写作
gender|/ˈdʒendər/|n. 性别|n|Gender equality is an important issue.|3|阅读
generate|/ˈdʒenəreɪt/|vt. 产生；生成|v|The wind turbines generate electricity.|3|阅读
generous|/ˈdʒenərəs/|adj. 慷慨的；大方的|adj|She is always generous with her time.|3|写作
genius|/ˈdʒiːniəs/|n. 天才|n|Einstein was a mathematical genius.|2|写作
genuine|/ˈdʒenjuɪn/|adj. 真正的；真诚的|adj|She showed genuine concern for her students.|3|写作
gesture|/ˈdʒestʃər/|n. 手势；姿态|n|He made a gesture of impatience.|3|翻译
global|/ˈɡloʊbl/|adj. 全球的|adj|Global warming is a serious threat.|4|高频,写作
glory|/ˈɡlɔːri/|n. 光荣；荣耀|n|They returned home covered in glory.|3|写作
govern|/ˈɡʌvərn/|v. 统治；管理|v|The country is governed by a democratic system.|3|阅读
grab|/ɡræb/|v. 抓住；抢夺|v|She grabbed her bag and ran out the door.|2|听力
grace|/ɡreɪs/|n. 优雅；恩典|n|She dances with great grace.|3|写作
gradual|/ˈɡrædʒuəl/|adj. 逐渐的|adj|There has been a gradual improvement in his health.|3|写作
grain|/ɡreɪn/|n. 谷物；颗粒|n|China is a major producer of grain.|3|翻译
grant|/ɡrænt/|vt. 授予；同意 n. 拨款|v/n|The university granted her a scholarship.|3|写作
grasp|/ɡræsp/|vt./n. 抓住；理解|v/n|It took me a while to grasp the concept.|3|写作
grateful|/ˈɡreɪtfl/|adj. 感激的|adj|I am grateful for your support.|3|写作
grave|/ɡreɪv/|adj. 严重的；严肃的|adj|The situation is very grave.|2|阅读
guarantee|/ˌɡærənˈtiː/|n./vt. 保证；担保|n/v|Hard work does not guarantee success.|3|写作
guidance|/ˈɡaɪdns/|n. 指导；引导|n|Students need guidance in choosing a career.|3|写作
habit|/ˈhæbɪt/|n. 习惯|n|Reading is a good habit to develop.|4|高频,写作
halt|/hɔːlt/|v./n. 停止|v/n|Production came to a halt due to the strike.|3|阅读
handle|/ˈhændl/|vt. 处理 n. 把手|v/n|She knows how to handle difficult situations.|3|写作
hardship|/ˈhɑːrdʃɪp/|n. 困难；艰辛|n|They endured many hardships during the war.|3|写作
harm|/hɑːrm/|n./vt. 伤害|n/v|Smoking can cause serious harm to your health.|3|写作
harmony|/ˈhɑːrməni/|n. 和谐；协调|n|People should live in harmony with nature.|3|写作
harsh|/hɑːrʃ/|adj. 严厉的；严酷的|adj|The punishment was too harsh for the crime.|3|阅读
harvest|/ˈhɑːrvɪst/|n./v. 收获；收割|n/v|Farmers are busy during the harvest season.|3|翻译
hatred|/ˈheɪtrɪd/|n. 仇恨；憎恨|n|Hatred only leads to more conflict.|3|写作
hazard|/ˈhæzərd/|n. 危险；危害|n|Smoking is a health hazard.|3|写作
headline|/ˈhedlaɪn/|n. 头条新闻|n|The scandal made headlines around the world.|2|阅读
heal|/hiːl/|v. 治愈；愈合|v|Time can heal emotional wounds.|2|写作
heap|/hiːp/|n. 堆；大量|n|There is a heap of books on the desk.|2|翻译
hesitate|/ˈhezɪteɪt/|vi. 犹豫；迟疑|v|Don't hesitate to ask if you need help.|3|写作
highlight|/ˈhaɪlaɪt/|vt. 强调；突出|v|The report highlights the importance of education.|3|阅读
hint|/hɪnt/|n. 暗示；提示|n|She gave me a hint about the answer.|2|听力
hollow|/ˈhɑːloʊ/|adj. 空的；空洞的|adj|The tree trunk was hollow inside.|2|阅读
honor|/ˈɑːnər/|n. 荣誉 vt. 尊敬|n/v|It is a great honor to be invited.|3|写作
horizon|/həˈraɪzn/|n. 地平线；眼界|n|Traveling can broaden your horizons.|3|写作
horror|/ˈhɔːrər/|n. 恐怖；恐惧|n|She screamed in horror when she saw the snake.|2|阅读
host|/hoʊst/|n. 主人 vt. 主持|n/v|Beijing hosted the Olympic Games in 2008.|3|写作
humble|/ˈhʌmbl/|adj. 谦虚的；卑微的|adj|Despite his success, he remains humble.|3|写作
ideal|/aɪˈdiːəl/|adj. 理想的 n. 理想|adj/n|This is an ideal place for a vacation.|3|写作
identify|/aɪˈdentɪfaɪ/|vt. 识别；确认|v|Can you identify the man in the photo?|3|写作
ignore|/ɪɡˈnɔːr/|vt. 忽视；不理睬|v|You can't ignore the problem forever.|3|写作
illustrate|/ˈɪləstreɪt/|vt. 说明；举例说明|v|Let me illustrate my point with an example.|3|写作
image|/ˈɪmɪdʒ/|n. 图像；形象|n|The company wants to improve its public image.|3|写作
imagine|/ɪˈmædʒɪn/|vt. 想象|v|Can you imagine life without electricity?|3|写作
immediate|/ɪˈmiːdiət/|adj. 立即的；直接的|adj|The problem requires immediate attention.|4|高频,写作
impact|/ɪmˈpækt/|n./v. 影响；冲击|n/v|Technology has a huge impact on our lives.|4|高频,写作
implement|/ˈɪmplɪment/|vt. 实施；执行|v|We need to implement the new policy.|3|阅读
imply|/ɪmˈplaɪ/|vt. 暗示；意味着|v|His silence implied agreement.|3|写作
import|/ɪmˈpɔːrt/|vt./n. 进口；输入|v/n|Japan imports most of its oil.|3|阅读
impose|/ɪmˈpoʊz/|vt. 强加；征收|v|The government imposed new taxes.|3|阅读
impress|/ɪmˈpres/|vt. 给...留下印象|v|Her presentation impressed the audience.|3|写作
improve|/ɪmˈpruːv/|v. 改善；提高|v|Reading can help improve your vocabulary.|4|高频,写作
incident|/ˈɪnsɪdənt/|n. 事件；事故|n|The incident was reported to the police.|3|阅读
include|/ɪnˈkluːd/|vt. 包括|v|The price includes breakfast.|4|高频
income|/ˈɪnkʌm/|n. 收入|n|She has a stable income from her job.|4|高频,写作
increase|/ɪnˈkriːs/|v./n. 增加|v/n|The population continues to increase.|4|高频,写作
indicate|/ˈɪndɪkeɪt/|vt. 表明；指示|v|Research indicates that exercise improves mood.|3|阅读
individual|/ˌɪndɪˈvɪdʒuəl/|adj. 个人的 n. 个人|adj/n|Each individual has unique needs.|3|写作
industry|/ˈɪndəstri/|n. 工业；行业|n|The tourism industry is growing rapidly.|4|高频,阅读
influence|/ˈɪnfluəns/|n./vt. 影响|n/v|Social media has a strong influence on young people.|4|高频,写作
inform|/ɪnˈfɔːrm/|vt. 通知；告知|v|Please inform us of any changes.|3|写作
initial|/ɪˈnɪʃl/|adj. 最初的|adj|My initial reaction was surprise.|3|写作
initiative|/ɪˈnɪʃətɪv/|n. 主动性；倡议|n|She took the initiative to organize the event.|3|写作
injure|/ˈɪndʒər/|vt. 伤害；损害|v|Several people were injured in the accident.|3|阅读
innocent|/ˈɪnəsnt/|adj. 无辜的；天真的|adj|He was proved innocent of the crime.|3|阅读
innovation|/ˌɪnəˈveɪʃn/|n. 创新|n|Innovation is key to business success.|3|写作
input|/ˈɪnpʊt/|n. 输入；投入|n|We value your input on this matter.|3|阅读
inquiry|/ɪnˈkwaɪəri/|n. 询问；调查|n|The police launched an inquiry into the incident.|2|阅读
insert|/ɪnˈsɜːrt/|vt. 插入|v|Insert the card into the slot.|3|翻译
inspect|/ɪnˈspekt/|vt. 检查；视察|v|The building was inspected for safety.|3|阅读
inspire|/ɪnˈspaɪər/|vt. 激励；启发|v|Her story inspired many young people.|3|写作
install|/ɪnˈstɔːl/|vt. 安装|v|We need to install new software.|3|写作
instance|/ˈɪnstəns/|n. 例子；实例|n|For instance, you could try a different method.|3|写作
institute|/ˈɪnstɪtuːt/|n. 学院；研究所|n|She works at a research institute.|3|阅读
instrument|/ˈɪnstrəmənt/|n. 工具；乐器|n|She plays several musical instruments.|3|翻译
insurance|/ɪnˈʃʊrəns/|n. 保险|n|Do you have health insurance?|3|听力
intend|/ɪnˈtend/|vt. 打算；意图|v|I intend to study abroad next year.|3|写作
intense|/ɪnˈtens/|adj. 强烈的；紧张的|adj|The competition was very intense.|3|写作
intention|/ɪnˈtenʃn/|n. 意图；目的|n|I have no intention of giving up.|3|写作
interact|/ˌɪntərˈækt/|vi. 互动；相互作用|v|Children learn by interacting with others.|3|写作
interfere|/ˌɪntərˈfɪr/|vi. 干涉；干扰|v|Don't interfere in other people's business.|3|写作
internal|/ɪnˈtɜːrnl/|adj. 内部的|adj|The company is undergoing internal restructuring.|3|阅读
interpret|/ɪnˈtɜːrprɪt/|v. 解释；口译|v|How do you interpret this poem?|3|写作
interval|/ˈɪntərvl/|n. 间隔；休息时间|n|There was a short interval between the meetings.|3|阅读
intimate|/ˈɪntɪmət/|adj. 亲密的；私人的|adj|She shared her most intimate thoughts with me.|3|写作
invade|/ɪnˈveɪd/|v. 入侵；侵犯|v|The enemy invaded the country at dawn.|3|阅读
invest|/ɪnˈvest/|v. 投资；投入|v|The company plans to invest in renewable energy.|3|写作
investigate|/ɪnˈvestɪɡeɪt/|v. 调查；研究|v|The police are investigating the case.|3|阅读
involve|/ɪnˈvɑːlv/|vt. 涉及；包含|v|The job involves a lot of travel.|4|高频,写作
isolate|/ˈaɪsəleɪt/|vt. 隔离；孤立|v|The village was isolated by the flood.|3|阅读
issue|/ˈɪʃuː/|n. 问题；议题|n|Environmental issues are becoming more urgent.|4|高频,写作
journal|/ˈdʒɜːrnl/|n. 期刊；日志|n|She published her research in a scientific journal.|3|阅读
journey|/ˈdʒɜːrni/|n. 旅程；行程|n|The journey took about three hours.|3|写作
justice|/ˈdʒʌstɪs/|n. 正义；公正|n|Everyone deserves justice under the law.|3|写作
justify|/ˈdʒʌstɪfaɪ/|vt. 证明...正当|v|How can you justify your actions?|3|写作
keen|/kiːn/|adj. 渴望的；敏锐的|adj|She is keen to learn new skills.|3|写作
launch|/lɔːntʃ/|vt. 发射；启动|v|The company launched a new product last month.|3|阅读
layer|/ˈleɪər/|n. 层|n|The cake has three layers.|2|翻译
layout|/ˈleɪaʊt/|n. 布局；设计|n|The layout of the website is very user-friendly.|2|阅读
leading|/ˈliːdɪŋ/|adj. 领先的；主要的|adj|She is a leading expert in her field.|3|写作
leak|/liːk/|v./n. 泄漏|v/n|Water is leaking from the pipe.|2|翻译
legal|/ˈliːɡl/|adj. 法律的；合法的|adj|Is it legal to park here?|3|写作
leisure|/ˈliːʒər/|n. 休闲；空闲|n|What do you do in your leisure time?|3|写作
liberal|/ˈlɪbərəl/|adj. 自由的；开明的|adj|She has a liberal attitude towards life.|3|阅读
likely|/ˈlaɪkli/|adj. 可能的|adj|It is likely to rain this afternoon.|4|高频
limit|/ˈlɪmɪt/|n. 限制 vt. 限制|n/v|There is a limit to my patience.|4|高频,写作
link|/lɪŋk/|n. 联系 vt. 连接|n/v|There is a strong link between diet and health.|3|写作
load|/loʊd/|n. 负荷 vt. 装载|n/v|The truck was carrying a heavy load.|3|翻译
loan|/loʊn/|n. 贷款 vt. 借出|n/v|He took out a loan to buy a car.|3|听力
locate|/ˈloʊkeɪt/|vt. 找到；位于|v|The hotel is located in the city center.|3|翻译
logic|/ˈlɑːdʒɪk/|n. 逻辑|n|There is no logic in his argument.|3|写作
loyal|/ˈlɔɪəl/|adj. 忠诚的|adj|A loyal friend is hard to find.|3|写作
luxury|/ˈlʌkʃəri/|n. 奢侈；奢侈品|n|For some people, clean water is a luxury.|3|写作
magnificent|/mæɡˈnɪfɪsnt/|adj. 壮丽的；宏伟的|adj|The view from the top was magnificent.|3|写作
maintain|/meɪnˈteɪn/|vt. 保持；维持|v|It's important to maintain good relationships.|4|高频,写作
major|/ˈmeɪdʒər/|adj. 主要的 n. 专业|adj/n|What is your major in college?|4|高频
manage|/ˈmænɪdʒ/|v. 管理；设法做到|v|How do you manage your time?|4|高频
manifest|/ˈmænɪfest/|vt. 表明 adj. 明显的|v/adj|Her nervousness manifested in her trembling voice.|2|阅读
manufacture|/ˌmænjuˈfæktʃər/|vt. 制造 n. 制造业|v/n|The company manufactures electronic devices.|3|阅读
margin|/ˈmɑːrdʒən/|n. 边缘；利润；页边空白|n|Write your notes in the margin.|3|阅读
massive|/ˈmæsɪv/|adj. 巨大的；大量的|adj|The project received massive support.|3|写作
mature|/məˈtʃʊr/|adj. 成熟的|adj|She is very mature for her age.|3|写作
measure|/ˈmeʒər/|v. 测量 n. 措施|v/n|The government took measures to control inflation.|3|写作
medium|/ˈmiːdiəm/|n. 媒介 adj. 中等的|n/adj|Television is a powerful medium of communication.|3|写作
mental|/ˈmentl/|adj. 精神的；心理的|adj|Mental health is just as important as physical health.|4|高频,写作
mention|/ˈmenʃn/|vt./n. 提到；提及|v/n|Did she mention anything about the meeting?|3|写作
mercy|/ˈmɜːrsi/|n. 仁慈；宽恕|n|The judge showed mercy to the young offender.|3|写作
merit|/ˈmerɪt/|n. 优点；价值|n|Each application will be judged on its merit.|3|写作
mild|/maɪld/|adj. 温和的；轻微的|adj|The weather is quite mild for this time of year.|2|阅读
military|/ˈmɪləteri/|adj. 军事的 n. 军队|adj/n|He served in the military for five years.|3|阅读
minimum|/ˈmɪnɪməm/|n./adj. 最小量；最低的|n/adj|What is the minimum requirement for this job?|3|写作
minor|/ˈmaɪnər/|adj. 较小的；次要的|adj|It's just a minor problem.|3|写作
miracle|/ˈmɪrəkl/|n. 奇迹|n|It's a miracle that no one was hurt.|3|写作
miserable|/ˈmɪzrəbl/|adj. 痛苦的；悲惨的|adj|The weather has been miserable all week.|3|写作
mission|/ˈmɪʃn/|n. 使命；任务|n|Our mission is to help people live better lives.|3|写作
mobile|/ˈmoʊbl/|adj. 移动的；可动的|adj|Mobile phones have changed our lives.|3|写作
moderate|/ˈmɑːdərət/|adj. 适度的；温和的|adj|Moderate exercise is good for your health.|3|写作
modest|/ˈmɑːdɪst/|adj. 谦虚的；适度的|adj|She is modest about her achievements.|3|写作
monitor|/ˈmɑːnɪtər/|vt. 监控 n. 监视器|v/n|The system monitors air quality in real time.|3|阅读
mood|/muːd/|n. 心情；情绪|n|Music can improve your mood.|3|写作
moral|/ˈmɔːrəl/|adj. 道德的 n. 寓意|adj/n|It's your moral duty to tell the truth.|3|写作
motion|/ˈmoʊʃn/|n. 运动；动作|n|The car was in constant motion.|3|阅读
motivate|/ˈmoʊtɪveɪt/|vt. 激励；激发|v|What motivates you to work hard?|3|写作
mount|/maʊnt/|v. 登上；增加|v|Pressure is mounting on the government to act.|3|阅读
mutual|/ˈmjuːtʃuəl/|adj. 相互的；共同的|adj|The feeling is mutual.|3|写作
mystery|/ˈmɪstri/|n. 神秘；谜|n|The cause of the fire remains a mystery.|3|写作
negative|/ˈneɡətɪv/|adj. 消极的；否定的|adj|Don't be so negative about life.|3|写作
neglect|/nɪˈɡlekt/|vt. 忽视；疏忽|v|Don't neglect your health.|3|写作
negotiate|/nɪˈɡoʊʃieɪt/|v. 谈判；协商|v|The two sides are negotiating a peace deal.|3|阅读
network|/ˈnetwɜːrk/|n. 网络|n|Social networks have changed how we communicate.|3|写作
neutral|/ˈnuːtrəl/|adj. 中立的|adj|Switzerland remained neutral during the war.|3|阅读
normal|/ˈnɔːrml/|adj. 正常的；标准的|adj|Everything is back to normal now.|4|高频
noticeable|/ˈnoʊtɪsəbl/|adj. 明显的；显著的|adj|There has been a noticeable improvement in her work.|3|写作
notion|/ˈnoʊʃn/|n. 概念；观念|n|I have no notion of what you're talking about.|3|阅读
numerous|/ˈnuːmərəs/|adj. 许多的；大量的|adj|She has received numerous awards for her work.|3|写作
object|/əbˈdʒekt/|vi. 反对 n. 物体；目标|v/n|I object to being treated like a child.|3|写作
objective|/əbˈdʒektɪv/|n. 目标 adj. 客观的|n/adj|What is your main objective in life?|3|写作
obligation|/ˌɑːblɪˈɡeɪʃn/|n. 义务；责任|n|We have an obligation to protect the environment.|3|写作
observe|/əbˈzɜːrv/|vt. 观察；遵守|v|Scientists observe animals in their natural habitat.|3|写作
obstacle|/ˈɑːbstəkl/|n. 障碍|n|Lack of money is a major obstacle.|3|写作
obtain|/əbˈteɪn/|vt. 获得；得到|v|How can I obtain a copy of the report?|3|写作
obvious|/ˈɑːbviəs/|adj. 明显的|adj|The answer is obvious to everyone.|4|高频
occasion|/əˈkeɪʒn/|n. 场合；时机|n|This is a special occasion for celebration.|3|写作
occupy|/ˈɑːkjupaɪ/|vt. 占据；占用|v|Reading occupies most of my free time.|3|写作
offend|/əˈfend/|vt. 冒犯；得罪|v|I didn't mean to offend you.|3|写作
opponent|/əˈpoʊnənt/|n. 对手；反对者|n|He defeated his opponent in the election.|3|阅读
opportunity|/ˌɑːpərˈtuːnəti/|n. 机会|n|This is a great opportunity for you.|4|高频,写作
oppose|/əˈpoʊz/|vt. 反对|v|Many people oppose the new policy.|3|写作
optimistic|/ˌɑːptɪˈmɪstɪk/|adj. 乐观的|adj|She is optimistic about the future.|3|写作
option|/ˈɑːpʃn/|n. 选择；选项|n|What options do we have?|3|写作
organize|/ˈɔːrɡənaɪz/|vt. 组织|v|She organized a party for her birthday.|3|写作
origin|/ˈɔːrɪdʒɪn/|n. 起源；来源|n|What is the origin of this tradition?|3|写作
original|/əˈrɪdʒənl/|adj. 原始的；独创的|adj|This is the original version of the song.|3|写作
outcome|/ˈaʊtkʌm/|n. 结果|n|What was the outcome of the meeting?|3|写作
outline|/ˈaʊtlaɪn/|n. 大纲 vt. 概述|n/v|She outlined the main points of the plan.|3|写作
output|/ˈaʊtpʊt/|n. 产量；输出|n|The factory has increased its output by 20%.|3|阅读
outstanding|/aʊtˈstændɪŋ/|adj. 杰出的；未付的|adj|She gave an outstanding performance.|3|写作
overcome|/ˌoʊvərˈkʌm/|vt. 克服；战胜|v|She overcame many difficulties to succeed.|4|高频,写作
overlook|/ˌoʊvərˈlʊk/|vt. 忽视；俯瞰|v|Don't overlook the importance of small details.|3|写作
overseas|/ˌoʊvərˈsiːz/|adv./adj. 海外|adv/adj|She dreams of working overseas.|3|写作
owe|/oʊ/|vt. 欠；归功于|v|We owe our success to hard work.|3|写作
pace|/peɪs/|n. 速度；步伐|n|Technology is changing at a rapid pace.|3|写作
panel|/ˈpænl/|n. 面板；专家组|n|The panel of judges included three experts.|2|阅读
participate|/pɑːrˈtɪsɪpeɪt/|vi. 参与；参加|v|Everyone is encouraged to participate in the discussion.|3|写作
particular|/pərˈtɪkjələr/|adj. 特别的；特定的|adj|Is there any particular reason for your decision?|3|写作
passion|/ˈpæʃn/|n. 激情；热情|n|She has a passion for music.|3|写作
patience|/ˈpeɪʃns/|n. 耐心|n|Teaching requires a lot of patience.|3|写作
pattern|/ˈpætərn/|n. 模式；图案|n|Can you see any pattern in the data?|3|写作
pause|/pɔːz/|vi./n. 暂停|v/n|Let's pause for a moment and think.|3|写作
peak|/piːk/|n. 顶峰 adj. 高峰的|n/adj|The mountain peak is covered with snow.|3|写作
peculiar|/pɪˈkjuːliər/|adj. 奇怪的；独特的|adj|There is a peculiar smell in the room.|2|阅读
penalty|/ˈpenəlti/|n. 惩罚；罚款|n|The penalty for late payment is 10%.|3|阅读
perceive|/pərˈsiːv/|vt. 察觉；感知|v|How do you perceive the current situation?|3|写作
perform|/pərˈfɔːrm/|v. 执行；表演|v|The band performed their new song.|3|写作
permanent|/ˈpɜːrmənənt/|adj. 永久的；长期的|adj|The accident caused permanent damage.|3|写作
permit|/pərˈmɪt/|v. 允许 n. 许可证|v/n|Smoking is not permitted in this area.|3|写作
persist|/pərˈsɪst/|vi. 坚持；持续|v|If symptoms persist, see your doctor.|3|写作
personality|/ˌpɜːrsəˈnæləti/|n. 个性；人格|n|She has a warm and friendly personality.|3|写作
perspective|/pərˈspektɪv/|n. 视角；观点|n|Let's look at this from a different perspective.|3|写作
phenomenon|/fəˈnɑːmɪnən/|n. 现象|n|Globalization is a complex phenomenon.|3|阅读
philosophy|/fɪˈlɑːsəfi/|n. 哲学；人生哲学|n|My philosophy is to live each day to the fullest.|3|写作
physical|/ˈfɪzɪkl/|adj. 身体的；物理的|adj|Regular physical exercise is important for health.|4|高频,写作
pillar|/ˈpɪlər/|n. 柱子；支柱|n|Education is a pillar of modern society.|2|写作
pioneer|/ˌpaɪəˈnɪr/|n. 先驱者|n|She was a pioneer in the field of computer science.|3|写作
plastic|/ˈplæstɪk/|n. 塑料 adj. 塑料的|n/adj|Plastic waste is a major environmental problem.|3|写作
pledge|/pledʒ/|n./vt. 承诺；保证|n/v|The government pledged to reduce taxes.|3|阅读
plot|/plɑːt/|n. 情节；阴谋|n|The plot of the movie was very interesting.|2|阅读
policy|/ˈpɑːləsi/|n. 政策；方针|n|The school has a strict anti-bullying policy.|4|高频,阅读
pollute|/pəˈluːt/|vt. 污染|v|Factories pollute the air and water.|3|写作
portion|/ˈpɔːrʃn/|n. 部分；一份|n|A large portion of the budget goes to education.|3|写作
pose|/poʊz/|v. 造成；摆姿势|v|Climate change poses a serious threat to humanity.|3|写作
positive|/ˈpɑːzətɪv/|adj. 积极的；肯定的|adj|She always has a positive attitude.|4|高频,写作
possess|/pəˈzes/|vt. 拥有；具有|v|She possesses great leadership skills.|3|写作
potential|/pəˈtenʃl/|adj. 潜在的 n. 潜力|adj/n|You have the potential to do great things.|4|高频,写作
poverty|/ˈpɑːvərti/|n. 贫困；贫穷|n|Millions of people live in poverty.|3|写作
practical|/ˈpræktɪkl/|adj. 实际的；实用的|adj|We need a more practical solution.|3|写作
precious|/ˈpreʃəs/|adj. 珍贵的|adj|Time is more precious than money.|3|写作
precise|/prɪˈsaɪs/|adj. 精确的|adj|Can you be more precise about what you want?|3|写作
predict|/prɪˈdɪkt/|vt. 预测；预言|v|It's hard to predict what will happen next.|3|写作
prefer|/prɪˈfɜːr/|vt. 更喜欢|v|I prefer coffee to tea.|3|写作
preserve|/prɪˈzɜːrv/|vt. 保存；保护|v|We must preserve our natural resources.|3|写作
pressure|/ˈpreʃər/|n. 压力；压强|n|She works well under pressure.|4|高频,写作
presume|/prɪˈzuːm/|vt. 假定；推测|v|I presume you've already heard the news.|2|阅读
prevail|/prɪˈveɪl/|vi. 盛行；占优势|v|Justice will prevail in the end.|3|写作
previous|/ˈpriːviəs/|adj. 以前的；先前的|adj|Do you have any previous experience?|3|写作
pride|/praɪd/|n. 骄傲；自豪|n|She takes great pride in her work.|3|写作
primary|/ˈpraɪmeri/|adj. 主要的；初级的|adj|My primary goal is to finish school.|3|写作
principle|/ˈprɪnsəpl/|n. 原则；原理|n|He refused to compromise his principles.|3|写作
priority|/praɪˈɔːrəti/|n. 优先；优先事项|n|Education should be a top priority.|3|写作
procedure|/prəˈsiːdʒər/|n. 程序；步骤|n|What is the correct procedure for applying?|3|阅读
proceed|/proʊˈsiːd/|vi. 继续；进行|v|Let's proceed with the next item on the agenda.|3|写作
process|/ˈprɑːses/|n. 过程 vt. 处理|n/v|Learning is a lifelong process.|4|高频
produce|/prəˈduːs/|vt. 生产；产生|v|The factory produces cars.|4|高频
profession|/prəˈfeʃn/|n. 职业；专业|n|Teaching is a noble profession.|3|写作
profit|/ˈprɑːfɪt/|n. 利润 vi. 受益|n/v|The company made a huge profit this year.|3|写作
progress|/ˈprɑːɡres/|n./vi. 进步；进展|n/v|You have made great progress.|4|高频,写作
prohibit|/prəˈhɪbɪt/|vt. 禁止|v|Smoking is prohibited on school grounds.|3|写作
project|/ˈprɑːdʒekt/|n. 项目；工程|n|We are working on a new project.|4|高频
promote|/prəˈmoʊt/|vt. 促进；提升|v|Exercise promotes good health.|4|高频,写作
proof|/pruːf/|n. 证据；证明|n|Do you have any proof of your identity?|3|写作
property|/ˈprɑːpərti/|n. 财产；特性|n|This land is private property.|3|写作
proportion|/prəˈpɔːrʃn/|n. 比例；部分|n|A large proportion of students passed the exam.|3|阅读
proposal|/prəˈpoʊzl/|n. 提议；建议|n|They accepted my proposal.|3|写作
prospect|/ˈprɑːspekt/|n. 前景；可能性|n|The job has excellent career prospects.|3|写作
protect|/prəˈtekt/|vt. 保护|v|We must protect the environment.|4|高频,写作
protest|/ˈproʊtest/|n./v. 抗议|n/v|Students held a protest against the new rules.|3|阅读
prove|/pruːv/|vt. 证明；证实|v|Can you prove that you are right?|3|写作
provide|/prəˈvaɪd/|vt. 提供|v|The school provides free meals for students.|4|高频,写作
provoke|/prəˈvoʊk/|vt. 激起；挑衅|v|His remarks provoked anger among the audience.|3|阅读
publish|/ˈpʌblɪʃ/|vt. 出版；发表|v|She published her first novel last year.|3|写作
purchase|/ˈpɜːrtʃəs/|vt./n. 购买|v/n|You can purchase tickets online.|3|写作
pursue|/pərˈsuː/|vt. 追求；追赶|v|She decided to pursue a career in medicine.|3|写作
quality|/ˈkwɑːləti/|n. 质量；品质|n|We aim to provide high quality service.|4|高频,写作
quantity|/ˈkwɑːntəti/|n. 数量|n|Quality is more important than quantity.|3|写作
quit|/kwɪt/|v. 停止；放弃|v|Never quit trying to achieve your dreams.|3|写作
quote|/kwoʊt/|vt. 引用 n. 引文|v/n|Can I quote you on that?|3|写作
racial|/ˈreɪʃl/|adj. 种族的|adj|Racial discrimination is illegal.|3|阅读
radical|/ˈrædɪkl/|adj. 根本的；激进的|adj|We need to make some radical changes.|3|阅读
range|/reɪndʒ/|n. 范围；幅度|n|The price range is from $10 to $50.|3|写作
rank|/ræŋk/|n. 等级 vt. 排列|n/v|She is ranked number one in the world.|3|写作
rapid|/ˈræpɪd/|adj. 迅速的|adj|The city has undergone rapid development.|4|高频,写作
rare|/rer/|adj. 稀有的；罕见的|adj|This is a rare opportunity.|3|写作
rate|/reɪt/|n. 比率；率 vt. 评价|n/v|The unemployment rate has decreased.|4|高频,阅读
react|/riˈækt/|vi. 反应；回应|v|How did she react to the news?|3|写作
reasonable|/ˈriːznəbl/|adj. 合理的|adj|The price seems reasonable.|3|写作
recall|/rɪˈkɔːl/|vt. 回忆；召回|v|I can't recall where I put my keys.|3|写作
recognize|/ˈrekəɡnaɪz/|vt. 认出；承认|v|I didn't recognize her at first.|4|高频,写作
recommend|/ˌrekəˈmend/|vt. 推荐；建议|v|I recommend this book to all students.|3|写作
recover|/rɪˈkʌvər/|v. 恢复；康复|v|It took her months to recover from the illness.|3|写作
reduce|/rɪˈduːs/|vt. 减少；降低|v|We need to reduce our carbon footprint.|4|高频,写作
refer|/rɪˈfɜːr/|v. 参考；提到|v|Please refer to page 10 of the manual.|3|写作
reflect|/rɪˈflekt/|v. 反映；反射；反思|v|Take time to reflect on your experiences.|3|写作
reform|/rɪˈfɔːrm/|n./v. 改革|n/v|The education system needs reform.|3|阅读
regard|/rɪˈɡɑːrd/|vt. 看待 n. 尊重|v/n|She is highly regarded by her colleagues.|3|写作
region|/ˈriːdʒən/|n. 地区；区域|n|This region is known for its wine production.|3|写作
regret|/rɪˈɡret/|vt./n. 后悔；遗憾|v/n|I regret not studying harder in school.|3|写作
regular|/ˈreɡjələr/|adj. 定期的；规律的|adj|Regular exercise can improve your health.|4|高频,写作
regulate|/ˈreɡjuleɪt/|vt. 调节；管理|v|Laws regulate the use of public spaces.|3|阅读
reinforce|/ˌriːɪnˈfɔːrs/|vt. 加强；增强|v|This exercise reinforces what you have learned.|3|写作
reject|/rɪˈdʒekt/|vt. 拒绝；排斥|v|His application was rejected.|3|写作
relate|/rɪˈleɪt/|v. 关联；叙述|v|How does this relate to the topic?|3|写作
release|/rɪˈliːs/|vt./n. 释放；发布|v/n|The new album will be released next month.|3|阅读
relevant|/ˈreləvənt/|adj. 相关的|adj|Your experience is highly relevant to this job.|4|高频,写作
relief|/rɪˈliːf/|n. 缓解；救济|n|It was a relief to hear that everyone was safe.|3|写作
rely|/rɪˈlaɪ/|vi. 依赖；依靠|v|You can always rely on me.|3|写作
remain|/rɪˈmeɪn/|vi. 保持；剩余|v|The situation remains unchanged.|4|高频,写作
remark|/rɪˈmɑːrk/|n./v. 评论；注意|n/v|She made a remark about his new haircut.|3|写作
remedy|/ˈremədi/|n. 补救方法 vt. 补救|n/v|There is no simple remedy for this problem.|3|写作
remote|/rɪˈmoʊt/|adj. 遥远的；偏远的|adj|They live in a remote mountain village.|3|写作
remove|/rɪˈmuːv/|vt. 移除；消除|v|Please remove your shoes at the door.|3|写作
renew|/rɪˈnuː/|vt. 更新；续期|v|I need to renew my passport.|2|听力
replace|/rɪˈpleɪs/|vt. 替换；取代|v|Robots may replace humans in some jobs.|3|写作
represent|/ˌreprɪˈzent/|vt. 代表；表示|v|She represents the company at meetings.|3|写作
reputation|/ˌrepjuˈteɪʃn/|n. 名声；声誉|n|The school has an excellent reputation.|3|写作
request|/rɪˈkwest/|n./vt. 请求；要求|n/v|Your request has been approved.|3|写作
require|/rɪˈkwaɪər/|vt. 需要；要求|v|This job requires a lot of patience.|4|高频,写作
rescue|/ˈreskjuː/|vt./n. 救援；营救|v/n|The firefighters rescued the family from the fire.|3|阅读
research|/rɪˈsɜːrtʃ/|n./v. 研究|n/v|She is doing research on climate change.|4|高频
reserve|/rɪˈzɜːrv/|vt. 保留；预订|v|I'd like to reserve a table for two.|3|听力
resist|/rɪˈzɪst/|v. 抵抗；抵制|v|I can't resist chocolate.|3|写作
resolve|/rɪˈzɑːlv/|vt. 解决；决心|v|We need to resolve this conflict peacefully.|3|写作
resource|/ˈriːsɔːrs/|n. 资源|n|Natural resources are limited.|4|高频,写作
respond|/rɪˈspɑːnd/|vi. 回答；回应|v|She didn't respond to my message.|3|写作
responsible|/rɪˈspɑːnsəbl/|adj. 负责的；有责任的|adj|Who is responsible for this mess?|4|高频,写作
restore|/rɪˈstɔːr/|vt. 恢复；修复|v|We need to restore public trust.|3|写作
restrict|/rɪˈstrɪkt/|vt. 限制；约束|v|The new law restricts the use of fireworks.|3|写作
retain|/rɪˈteɪn/|vt. 保持；保留|v|She managed to retain her sense of humor.|3|写作
reveal|/rɪˈviːl/|vt. 揭示；显示|v|The report revealed serious problems.|3|写作
revenue|/ˈrevənuː/|n. 收入；税收|n|The government needs to increase tax revenue.|3|阅读
reverse|/rɪˈvɜːrs/|v./n. 反转；颠倒|v/n|The court reversed the earlier decision.|3|阅读
revolution|/ˌrevəˈluːʃn/|n. 革命|n|The internet has caused a revolution in communication.|3|写作
reward|/rɪˈwɔːrd/|n. 奖励 vt. 奖赏|n/v|Hard work will be rewarded.|3|写作
risk|/rɪsk/|n. 风险 vt. 冒...风险|n/v|Smoking increases the risk of cancer.|4|高频,写作
rival|/ˈraɪvl/|n. 对手 vt. 与...匹敌|n/v|The two companies are fierce rivals.|3|阅读
role|/roʊl/|n. 角色；作用|n|Education plays an important role in society.|4|高频,写作
routine|/ruːˈtiːn/|n. 常规 adj. 常规的|n/adj|A daily routine can help you be more productive.|3|写作
ruin|/ˈruːɪn/|vt. 毁灭 n. 废墟|v/n|The heavy rain ruined our picnic.|2|写作
rural|/ˈrʊrəl/|adj. 农村的|adj|Life in rural areas is very different from city life.|3|写作
sacrifice|/ˈsækrɪfaɪs/|n./v. 牺牲|n/v|She made many sacrifices for her family.|3|写作
sample|/ˈsæmpl/|n. 样本；样品|n|Can I have a free sample of the product?|3|翻译
satellite|/ˈsætəlaɪt/|n. 卫星|n|The satellite was launched into orbit.|3|阅读
satisfaction|/ˌsætɪsˈfækʃn/|n. 满意；满足|n|Customer satisfaction is our priority.|3|写作
scale|/skeɪl/|n. 规模；比例|n|The project was on a massive scale.|3|写作
schedule|/ˈskedʒuːl/|n. 时间表 vt. 安排|n/v|The meeting is scheduled for 3 PM.|4|高频,听力
scheme|/skiːm/|n. 计划；方案|n|The government launched a new housing scheme.|3|阅读
secure|/sɪˈkjʊr/|adj. 安全的 vt. 获得|adj/v|I need to secure a loan for my business.|3|写作
seek|/siːk/|vt. 寻求；寻找|v|Many people seek happiness in material things.|3|写作
select|/sɪˈlekt/|vt. 选择|v|Please select your preferred language.|3|写作
senior|/ˈsiːniər/|adj. 年长的；高级的|adj|She is a senior manager at the firm.|3|写作
sensitive|/ˈsensətɪv/|adj. 敏感的|adj|She is very sensitive to criticism.|3|写作
separate|/ˈsepəreɪt/|v. 分开 adj. 分开的|v/adj|The wall separates the two rooms.|3|写作
sequence|/ˈsiːkwəns/|n. 顺序；序列|n|The events happened in chronological sequence.|3|阅读
severe|/sɪˈvɪr/|adj. 严重的；严厉的|adj|The country is facing severe economic problems.|3|写作
shelter|/ˈʃeltər/|n. 庇护所 vt. 庇护|n/v|They sought shelter from the storm.|3|写作
shift|/ʃɪft/|v./n. 转移；轮班|v/n|We need to shift our focus to the new project.|3|写作
shortage|/ˈʃɔːrtɪdʒ/|n. 短缺；不足|n|There is a shortage of skilled workers.|3|写作
signal|/ˈsɪɡnəl/|n. 信号|n|The traffic signal turned red.|3|翻译
significant|/sɪɡˈnɪfɪkənt/|adj. 重要的；显著的|adj|There has been a significant change in her attitude.|4|高频,写作
similar|/ˈsɪmələr/|adj. 相似的|adj|Your idea is similar to mine.|4|高频
simplify|/ˈsɪmplɪfaɪ/|vt. 简化|v|We need to simplify the procedure.|3|写作
sincere|/sɪnˈsɪr/|adj. 真诚的|adj|Please accept my sincere apologies.|3|写作
sketch|/sketʃ/|n. 素描；草图|n|She drew a quick sketch of the building.|2|翻译
slight|/slaɪt/|adj. 轻微的；少量的|adj|I have a slight headache.|3|写作
social|/ˈsoʊʃl/|adj. 社会的；社交的|adj|Social media has transformed communication.|4|高频,写作
solar|/ˈsoʊlər/|adj. 太阳的|adj|Solar energy is a clean source of power.|3|阅读
solution|/səˈluːʃn/|n. 解决方案|n|We need to find a solution to this problem.|4|高频,写作
somewhat|/ˈsʌmwʌt/|adv. 有点；稍微|adv|I was somewhat surprised by the result.|3|写作
source|/sɔːrs/|n. 来源；源头|n|What is the source of your information?|4|高频,写作
species|/ˈspiːʃiːz/|n. 物种|n|Many species are at risk of extinction.|3|阅读
specific|/spəˈsɪfɪk/|adj. 具体的；特定的|adj|Can you be more specific?|4|高频,写作
sphere|/sfɪr/|n. 球体；范围|n|The Earth is not a perfect sphere.|2|阅读
split|/splɪt/|v./n. 分裂；分开|v/n|Let's split the bill.|2|听力
sponsor|/ˈspɑːnsər/|vt. 赞助 n. 赞助者|v/n|The event is sponsored by a local company.|3|阅读
spot|/spɑːt/|n. 地点；斑点 vt. 发现|n/v|This is a great spot for a picnic.|3|翻译
stable|/ˈsteɪbl/|adj. 稳定的|adj|The economy is now stable.|3|写作
standard|/ˈstændərd/|n. 标准 adj. 标准的|n/adj|Education standards have improved.|4|高频,写作
status|/ˈsteɪtəs/|n. 地位；状态|n|What is your marital status?|3|写作
steady|/ˈstedi/|adj. 稳定的|adj|There has been a steady improvement.|3|写作
stimulate|/ˈstɪmjuleɪt/|vt. 刺激；激励|v|Good questions stimulate creative thinking.|3|写作
stock|/stɑːk/|n. 股票；库存|n|The stock market crashed yesterday.|3|阅读
strategy|/ˈstrætədʒi/|n. 策略；战略|n|We need a new marketing strategy.|4|高频,写作
strength|/streŋkθ/|n. 力量；优势|n|Everyone has their own strengths and weaknesses.|3|写作
stress|/stres/|n. 压力 vt. 强调|n/v|Too much stress can cause health problems.|4|高频,写作
structure|/ˈstrʌktʃər/|n. 结构|n|The structure of the essay is well organized.|3|写作
struggle|/ˈstrʌɡl/|vi./n. 挣扎；斗争|v/n|She struggled to open the heavy door.|3|写作
style|/staɪl/|n. 风格；方式|n|Everyone has their own learning style.|3|写作
subject|/ˈsʌbdʒɪkt/|n. 主题；学科|n|What is your favorite subject?|4|高频
submit|/səbˈmɪt/|v. 提交；服从|v|Please submit your application by Friday.|3|写作
subsequent|/ˈsʌbsɪkwənt/|adj. 随后的|adj|Subsequent events proved her right.|3|阅读
substance|/ˈsʌbstəns/|n. 物质；实质|n|Water is a liquid substance.|3|阅读
substitute|/ˈsʌbstɪtuːt/|n. 替代品 v. 替代|n/v|There is no substitute for hard work.|3|写作
succeed|/səkˈsiːd/|v. 成功；继承|v|If you don't try, you'll never succeed.|4|高频,写作
sufficient|/səˈfɪʃnt/|adj. 足够的；充分的|adj|We don't have sufficient evidence.|3|写作
suggest|/səˈdʒest/|vt. 建议；暗示|v|What do you suggest we do?|4|高频
summarize|/ˈsʌməraɪz/|vt. 总结；概述|v|Can you summarize the main points?|3|写作
superior|/suːˈpɪriər/|adj. 优越的；上级的|adj|This model is superior to the old one.|3|写作
supply|/səˈplaɪ/|vt./n. 供给；供应|v/n|The water supply was cut off.|3|写作
support|/səˈpɔːrt/|vt./n. 支持；支撑|v/n|Thank you for your support.|4|高频,写作
suppose|/səˈpoʊz/|vt. 假设；认为|v|I suppose you're right.|3|写作
supreme|/suːˈpriːm/|adj. 最高的；至高的|adj|The Supreme Court made the final decision.|2|阅读
surface|/ˈsɜːrfɪs/|n. 表面|n|The surface of the lake was very calm.|3|写作
surplus|/ˈsɜːrplʌs/|n. 剩余；盈余|n|The country has a trade surplus.|2|阅读
surround|/səˈraʊnd/|vt. 围绕；包围|v|Mountains surround the small village.|3|写作
survey|/ˈsɜːrveɪ/|n. 调查|n|A recent survey shows that most people agree.|3|写作
survive|/sərˈvaɪv/|v. 幸存；生存|v|Only a few plants can survive in the desert.|3|写作
suspect|/səˈspekt/|vt. 怀疑 n. 嫌疑人|v/n|I suspect he is lying.|3|写作
suspend|/səˈspend/|vt. 暂停；悬挂|v|The service has been suspended due to the storm.|3|阅读
sustain|/səˈsteɪn/|vt. 维持；支撑|v|The roof is not strong enough to sustain heavy snow.|3|阅读
symbol|/ˈsɪmbl/|n. 象征；符号|n|The dove is a symbol of peace.|3|写作
sympathy|/ˈsɪmpəθi/|n. 同情|n|I have sympathy for those who lost their homes.|3|写作
system|/ˈsɪstəm/|n. 系统；制度|n|The education system needs improvement.|4|高频,写作
tackle|/ˈtækl/|vt. 处理；解决|v|We must tackle the problem immediately.|3|写作
talent|/ˈtælənt/|n. 天赋；才能|n|She has a natural talent for music.|3|写作
target|/ˈtɑːrɡɪt/|n. 目标 vt. 瞄准|n/v|We achieved our sales target this month.|3|写作
technique|/tekˈniːk/|n. 技术；技巧|n|You need to improve your study techniques.|3|写作
technology|/tekˈnɑːlədʒi/|n. 技术|n|Technology is changing the world rapidly.|4|高频,写作
temporary|/ˈtempəreri/|adj. 临时的；暂时的|adj|This is only a temporary solution.|3|写作
tendency|/ˈtendənsi/|n. 趋势；倾向|n|There is a tendency for prices to rise.|3|写作
terminal|/ˈtɜːrmɪnl/|n. 终端 adj. 末期的|n/adj|The bus terminal is very crowded.|2|听力
territory|/ˈterətɔːri/|n. 领土；领域|n|The explorers entered unknown territory.|3|阅读
thorough|/ˈθɜːroʊ/|adj. 彻底的；全面的|adj|The police conducted a thorough investigation.|3|写作
threat|/θret/|n. 威胁|n|Pollution poses a threat to our health.|3|写作
thrill|/θrɪl/|n. 激动 vt. 使激动|n/v|It was a thrill to meet my favorite singer.|3|写作
tolerate|/ˈtɑːləreɪt/|vt. 容忍；忍受|v|I won't tolerate such behavior.|3|写作
tough|/tʌf/|adj. 坚强的；困难的|adj|It's a tough decision to make.|3|写作
trace|/treɪs/|vt. 追踪 n. 痕迹|v/n|The police tried to trace the missing person.|3|写作
track|/træk/|n. 轨道；跑道 vt. 跟踪|n/v|Keep track of your expenses.|3|写作
traditional|/trəˈdɪʃənl/|adj. 传统的|adj|Traditional values are still important.|3|写作
transfer|/trænsˈfɜːr/|v./n. 转移；调动|v/n|She transferred to another department.|3|写作
transform|/trænsˈfɔːrm/|vt. 改变；转换|v|The internet has transformed our lives.|4|高频,写作
tremendous|/trəˈmendəs/|adj. 巨大的；极大的|adj|She has made tremendous progress.|3|写作
trend|/trend/|n. 趋势；潮流|n|What are the latest fashion trends?|3|写作
trial|/ˈtraɪəl/|n. 审判；试验|n|The new drug is undergoing clinical trials.|3|阅读
trigger|/ˈtrɪɡər/|vt. 触发 n. 扳机|v/n|The incident triggered a heated debate.|3|阅读
triumph|/ˈtraɪʌmf/|n. 胜利；成功|n|The election was a triumph for democracy.|3|写作
tuition|/tuˈɪʃn/|n. 学费|n|College tuition has increased dramatically.|3|写作
typical|/ˈtɪpɪkl/|adj. 典型的|adj|This is a typical example of his work.|3|写作
ultimate|/ˈʌltɪmət/|adj. 最终的；根本的|adj|The ultimate goal is to improve quality of life.|3|写作
undergo|/ˌʌndərˈɡoʊ/|vt. 经历；遭受|v|The city is undergoing rapid changes.|3|写作
undertake|/ˌʌndərˈteɪk/|vt. 承担；从事|v|She undertook the task willingly.|3|写作
unique|/juˈniːk/|adj. 独特的|adj|Everyone has their own unique personality.|4|高频,写作
universal|/ˌjuːnɪˈvɜːrsl/|adj. 普遍的；全体的|adj|Music is a universal language.|3|写作
update|/ˌʌpˈdeɪt/|vt. 更新|v|Please update your contact information.|3|写作
urge|/ɜːrdʒ/|vt. 催促；强烈要求|v|I urge you to reconsider your decision.|3|写作
utilize|/ˈjuːtəlaɪz/|vt. 利用|v|We should utilize all available resources.|3|写作
vacant|/ˈveɪkənt/|adj. 空的；空缺的|adj|Is this seat vacant?|2|听力
vague|/veɪɡ/|adj. 模糊的|adj|His explanation was very vague.|3|写作
valid|/ˈvælɪd/|adj. 有效的；合理的|adj|Your passport must be valid for at least six months.|3|写作
value|/ˈvæljuː/|n. 价值 vt. 重视|n/v|I value your opinion very much.|4|高频,写作
variety|/vəˈraɪəti/|n. 多样性；种类|n|The store offers a wide variety of products.|3|写作
version|/ˈvɜːrʒn/|n. 版本|n|This is the latest version of the software.|3|写作
via|/ˈvaɪə/|prep. 通过；经由|prep|I sent the file via email.|3|写作
victim|/ˈvɪktɪm/|n. 受害者|n|The victim was taken to the hospital.|3|阅读
view|/vjuː/|n. 观点；景色|n|In my view, education is the key to success.|4|高频,写作
violate|/ˈvaɪəleɪt/|vt. 违反；侵犯|v|He violated the traffic rules.|3|阅读
virtual|/ˈvɜːrtʃuəl/|adj. 虚拟的；实质上的|adj|Virtual reality is an exciting new technology.|3|阅读
visible|/ˈvɪzəbl/|adj. 可见的；明显的|adj|The stars are clearly visible tonight.|3|写作
vision|/ˈvɪʒn/|n. 视力；愿景|n|She has a clear vision for the future.|3|写作
visual|/ˈvɪʒuəl/|adj. 视觉的|adj|Visual aids can help students learn better.|3|写作
vital|/ˈvaɪtl/|adj. 至关重要的|adj|Water is vital for survival.|3|写作
volume|/ˈvɑːljuːm/|n. 体积；音量；卷|n|Please turn down the volume.|3|听力
voluntary|/ˈvɑːlənteri/|adj. 自愿的|adj|She does voluntary work at the hospital.|3|写作
wander|/ˈwɑːndər/|vi. 漫步；走神|v|Don't let your mind wander during class.|3|写作
welfare|/ˈwelfer/|n. 福利；幸福|n|The government provides welfare for the poor.|3|阅读
widespread|/ˈwaɪdspred/|adj. 广泛的|adj|There is widespread support for the new policy.|3|写作
wisdom|/ˈwɪzdəm/|n. 智慧|n|He shared his wisdom with the younger generation.|3|写作
withdraw|/wɪðˈdrɔː/|v. 撤回；取款|v|I need to withdraw some money from the bank.|3|听力
witness|/ˈwɪtnəs/|n. 证人 vt. 目击|n/v|We are witnessing a technological revolution.|3|写作
worship|/ˈwɜːrʃɪp/|vt./n. 崇拜；敬拜|v/n|Some people worship money above all else.|3|写作
worthwhile|/ˌwɜːrθˈwaɪl/|adj. 值得的|adj|It was a worthwhile experience.|3|写作
yield|/jiːld/|v. 产出；屈服|v|The research yielded some interesting results.|3|阅读
zone|/zoʊn/|n. 区域；地带|n|This is a no-parking zone.|3|翻译
`.trim()

function generate() {
  const lines = rawData.split('\n').filter(line => line.trim())
  const words = lines.map(line => {
    const parts = line.split('|')
    return {
      word: parts[0].trim(),
      phonetic_us: parts[1].trim(),
      meaning_cn: parts[2].trim(),
      pos: parts[3].trim(),
      example_sentence: parts[4].trim(),
      level: 'cet4',
      frequency: parseInt(parts[5]),
      tags: JSON.stringify(parts[6].split(',').map(t => t.trim()))
    }
  })

  // 去重
  const seen = new Set()
  const unique = words.filter(w => {
    if (seen.has(w.word)) return false
    seen.add(w.word)
    return true
  })

  const outPath = path.join(__dirname, '..', 'resources', 'wordbooks', 'cet4-core.json')
  fs.writeFileSync(outPath, JSON.stringify(unique, null, 2), 'utf-8')
  console.log(`Generated ${unique.length} words to ${outPath}`)

  // 统计
  const freqCounts = {}
  unique.forEach(w => { freqCounts[w.frequency] = (freqCounts[w.frequency] || 0) + 1 })
  console.log('Frequency distribution:', freqCounts)
}

generate()
