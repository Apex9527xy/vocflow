import initSqlJs, { Database as SqlJsDatabase, type BindParams } from 'sql.js'
import { app } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { seedWordbooks } from './seedWordbooks'
import { isDatabaseDirty, markDatabaseClean, markDatabaseDirty } from './database-state'

export { markDatabaseDirty }

const __dirname = dirname(fileURLToPath(import.meta.url))

let db: SqlJsDatabase | null = null
let dbPath: string = ''
let backupCreatedForSession = false

export async function initDatabase(): Promise<SqlJsDatabase> {
  const userDataPath = app.getPath('userData')
  dbPath = join(userDataPath, 'cet4-coach.db')

  console.log('初始化数据库...')
  console.log('用户数据路径:', userDataPath)
  console.log('数据库路径:', dbPath)

  const SQL = await initSqlJs()

  const databaseExisted = existsSync(dbPath)
  if (databaseExisted) {
    console.log('加载现有数据库')
    try {
      db = new SQL.Database(readFileSync(dbPath))
    } catch (error) {
      const backupPath = dbPath + '.bak'
      if (!existsSync(backupPath)) throw error
      console.warn('主数据库损坏，已自动从上一份安全备份恢复:', error)
      db = new SQL.Database(readFileSync(backupPath))
      copyFileSync(backupPath, dbPath)
    }
  } else {
    console.log('创建新数据库')
    db = new SQL.Database()
  }

  db.run('PRAGMA journal_mode = OFF')
  db.run('PRAGMA foreign_keys = ON')

  runMigrations(db)

  // 自动导入/更新 PDF 词书
  const wordbooksChanged = seedWordbooks(db, [
    join(__dirname, '..', 'resources', 'wordbooks', 'manifest.json'),
    join(__dirname, '..', '..', 'resources', 'wordbooks', 'manifest.json'),
    join(process.cwd(), 'resources', 'wordbooks', 'manifest.json')
  ])

  // 种子阅读和翻译内容
  seedContent(db)
  if (wordbooksChanged || !databaseExisted) markDatabaseDirty()
  saveDatabase()

  console.log('数据库初始化完成')
  return db
}

function seedContent(db: SqlJsDatabase): void {
  // 检查是否已有内容
  const readingCount = db.exec('SELECT COUNT(*) as c FROM reading_passages')
  const rCount = readingCount[0]?.values[0]?.[0] ?? 0

  if (rCount === 0) {
    console.log('导入阅读文章种子数据...')
    const passages = [
      { title: 'The Rise of Online Education', content: 'In recent years, online education has become increasingly popular around the world. The COVID-19 pandemic accelerated this trend, forcing millions of students to learn from home. While online learning offers flexibility and convenience, it also presents challenges such as reduced social interaction and the need for strong self-discipline. Many educators believe that a blended approach, combining online and traditional classroom methods, may be the most effective way to teach in the future.', topic: 'education', question: 'According to the passage, what is considered the most effective approach to education?', options: ['Fully online education', 'Traditional classroom only', 'A blended approach combining both', 'Self-study without guidance'], answer: 2 },
      { title: 'The Importance of Sleep', content: 'Sleep is essential for both physical and mental health. During sleep, the body repairs itself and the brain processes information from the day. Studies have shown that lack of sleep can lead to decreased concentration, weakened immunity, and even long-term health problems such as heart disease. Experts recommend that adults get seven to nine hours of sleep each night for optimal health.', topic: 'health', question: 'How many hours of sleep do experts recommend for adults?', options: ['Five to six hours', 'Six to seven hours', 'Seven to nine hours', 'Nine to ten hours'], answer: 2 },
      { title: 'Urban Green Spaces', content: 'Cities around the world are increasingly investing in green spaces such as parks, gardens, and urban forests. These areas provide numerous benefits: they improve air quality, reduce noise pollution, and offer residents places to exercise and relax. Research has also shown that access to green spaces can reduce stress and improve mental well-being. Some cities have even started planting trees along streets and creating rooftop gardens to maximize green coverage.', topic: 'environment', question: 'Which of the following is NOT mentioned as a benefit of urban green spaces?', options: ['Improving air quality', 'Reducing noise pollution', 'Increasing property values', 'Reducing stress'], answer: 2 },
      { title: 'The Power of Habits', content: 'Scientists have discovered that habits are formed through a three-step loop: cue, routine, and reward. A cue triggers the brain to perform a behavior, the routine is the behavior itself, and the reward helps the brain remember the loop for the future. Understanding this process can help people develop good habits and break bad ones. For example, if someone wants to start exercising regularly, they can choose a specific cue (like waking up in the morning), establish a routine (a 30-minute workout), and set a reward (a healthy breakfast).', topic: 'psychology', question: 'According to the passage, what are the three steps of a habit loop?', options: ['Plan, action, result', 'Cue, routine, reward', 'Thought, behavior, outcome', 'Trigger, habit, satisfaction'], answer: 1 },
      { title: 'Water Conservation', content: 'Fresh water is a limited resource, and its conservation is becoming increasingly important as the global population grows. Simple actions like fixing leaky faucets, taking shorter showers, and using water-efficient appliances can make a significant difference. Agriculture accounts for about 70% of global water use, so improving irrigation methods is also crucial. Some regions have implemented water recycling systems that treat wastewater for non-drinking purposes, which helps reduce the strain on fresh water supplies.', topic: 'environment', question: 'According to the passage, what accounts for the largest share of global water use?', options: ['Industrial use', 'Agriculture', 'Domestic use', 'Recreation'], answer: 1 }
    ]
    for (const p of passages) {
      db.run(
        `INSERT INTO reading_passages (title, content, topic, question, options_json, answer, source) VALUES (?, ?, ?, ?, ?, ?, 'builtin')`,
        [p.title, p.content, p.topic, p.question, JSON.stringify(p.options), p.answer]
      )
    }
    console.log(`导入了 ${passages.length} 篇阅读文章`)
  }

  const transCount = db.exec('SELECT COUNT(*) as c FROM translation_sentences')
  const tCount = transCount[0]?.values[0]?.[0] ?? 0

  if (tCount === 0) {
    console.log('导入翻译句子种子数据...')
    const sentences = [
      { en: 'The rapid development of technology has changed our daily lives.', cn: '科技的快速发展改变了我们的日常生活。', keywords_en: ['rapid', 'development', 'technology'], keywords_cn: ['快速', '发展', '技术'], topic: 'culture' },
      { en: 'It is widely believed that education plays a crucial role in personal growth.', cn: '人们普遍认为教育在个人成长中起着至关重要的作用。', keywords_en: ['widely', 'education', 'crucial'], keywords_cn: ['普遍', '教育', '至关重要'], topic: 'education' },
      { en: 'With the improvement of living standards, more people are concerned about their health.', cn: '随着生活水平的提高，越来越多的人关注自己的健康。', keywords_en: ['improvement', 'standards', 'concerned'], keywords_cn: ['提高', '水平', '关注'], topic: 'society' },
      { en: 'The government has taken effective measures to protect the environment.', cn: '政府已采取有效措施来保护环境。', keywords_en: ['government', 'effective', 'measures'], keywords_cn: ['政府', '有效', '措施'], topic: 'environment' },
      { en: 'Cultural exchange programs help promote mutual understanding between nations.', cn: '文化交流项目有助于促进国家之间的相互理解。', keywords_en: ['cultural', 'exchange', 'mutual'], keywords_cn: ['文化', '交流', '相互'], topic: 'culture' },
      { en: 'The Internet provides us with convenient access to vast amounts of information.', cn: '互联网为我们提供了便捷获取海量信息的途径。', keywords_en: ['provides', 'convenient', 'access'], keywords_cn: ['提供', '便捷', '获取'], topic: 'tech' },
      { en: 'Many young people choose to study abroad to broaden their horizons.', cn: '许多年轻人选择出国留学以开阔视野。', keywords_en: ['abroad', 'broaden', 'horizons'], keywords_cn: ['出国', '开阔', '视野'], topic: 'education' },
      { en: 'It is necessary to maintain a positive attitude when facing difficulties.', cn: '面对困难时保持积极态度是必要的。', keywords_en: ['necessary', 'maintain', 'positive'], keywords_cn: ['必要', '保持', '积极'], topic: 'society' },
      { en: 'The traditional festival symbolizes family reunion and harmony.', cn: '这个传统节日象征着家庭团聚与和谐。', keywords_en: ['traditional', 'symbolizes', 'harmony'], keywords_cn: ['传统', '象征', '和谐'], topic: 'culture' },
      { en: 'Volunteering not only benefits others but also enriches our own experience.', cn: '志愿服务不仅有益于他人，也丰富了我们自己的经历。', keywords_en: ['volunteering', 'benefits', 'enriches'], keywords_cn: ['志愿', '有益', '丰富'], topic: 'society' },
      { en: 'Artificial intelligence is transforming the way we work and live.', cn: '人工智能正在改变我们的工作和生活方式。', keywords_en: ['artificial', 'intelligence', 'transforming'], keywords_cn: ['人工智能', '改变', '方式'], topic: 'tech' },
      { en: 'Online shopping has become an essential part of modern consumer habits.', cn: '网上购物已成为现代消费习惯的重要组成部分。', keywords_en: ['online', 'shopping', 'essential'], keywords_cn: ['网上', '购物', '重要'], topic: 'tech' },
      { en: 'Social media has greatly influenced the way people communicate with each other.', cn: '社交媒体极大地影响了人们相互交流的方式。', keywords_en: ['social', 'media', 'influenced'], keywords_cn: ['社交', '媒体', '影响'], topic: 'tech' },
      { en: 'Renewable energy sources such as solar and wind power are becoming increasingly popular.', cn: '太阳能和风能等可再生能源正变得越来越受欢迎。', keywords_en: ['renewable', 'energy', 'increasingly'], keywords_cn: ['可再生', '能源', '越来越'], topic: 'environment' },
      { en: 'The university aims to cultivate students\' ability to think independently.', cn: '这所大学旨在培养学生独立思考的能力。', keywords_en: ['cultivate', 'independently', 'ability'], keywords_cn: ['培养', '独立', '能力'], topic: 'education' },
      { en: 'Reading extensively can help improve vocabulary and writing skills.', cn: '大量阅读有助于提高词汇量和写作技巧。', keywords_en: ['extensively', 'vocabulary', 'skills'], keywords_cn: ['大量', '词汇', '技巧'], topic: 'education' },
      { en: 'Scholarships are awarded to students who demonstrate outstanding academic performance.', cn: '奖学金授予学业成绩优异的学生。', keywords_en: ['scholarships', 'outstanding', 'academic'], keywords_cn: ['奖学金', '优异', '学业'], topic: 'education' },
      { en: 'Reducing plastic waste is one of the most urgent environmental challenges.', cn: '减少塑料废弃物是最紧迫的环境挑战之一。', keywords_en: ['reducing', 'plastic', 'urgent'], keywords_cn: ['减少', '塑料', '紧迫'], topic: 'environment' },
      { en: 'Climate change poses a serious threat to the global ecosystem.', cn: '气候变化对全球生态系统构成严重威胁。', keywords_en: ['climate', 'threat', 'ecosystem'], keywords_cn: ['气候', '威胁', '生态'], topic: 'environment' },
      { en: 'Planting more trees can help absorb carbon dioxide from the atmosphere.', cn: '种植更多的树木有助于吸收大气中的二氧化碳。', keywords_en: ['planting', 'absorb', 'atmosphere'], keywords_cn: ['种植', '吸收', '大气'], topic: 'environment' },
      { en: 'The aging population has become a significant social issue in many countries.', cn: '人口老龄化已成为许多国家的重大社会问题。', keywords_en: ['aging', 'population', 'significant'], keywords_cn: ['老龄化', '人口', '重大'], topic: 'society' },
      { en: 'Public transportation plays a vital role in reducing traffic congestion.', cn: '公共交通在缓解交通拥堵方面发挥着至关重要的作用。', keywords_en: ['transportation', 'vital', 'congestion'], keywords_cn: ['交通', '至关重要', '拥堵'], topic: 'society' },
      { en: 'Equal access to healthcare is a fundamental right for every citizen.', cn: '平等获得医疗保健是每个公民的基本权利。', keywords_en: ['access', 'healthcare', 'fundamental'], keywords_cn: ['获得', '医疗', '基本'], topic: 'society' },
      { en: 'Small and medium-sized enterprises are the backbone of the national economy.', cn: '中小企业是国民经济的支柱。', keywords_en: ['enterprises', 'backbone', 'economy'], keywords_cn: ['企业', '支柱', '经济'], topic: 'economy' },
      { en: 'The global economy has been significantly affected by the pandemic.', cn: '全球经济受到了疫情的严重影响。', keywords_en: ['global', 'economy', 'significantly'], keywords_cn: ['全球', '经济', '严重'], topic: 'economy' },
      { en: 'Investment in education yields long-term economic benefits for society.', cn: '对教育的投资为社会带来长期的经济效益。', keywords_en: ['investment', 'yields', 'benefits'], keywords_cn: ['投资', '带来', '效益'], topic: 'economy' },
      { en: 'International trade promotes economic growth and cultural exchange.', cn: '国际贸易促进了经济增长和文化交流。', keywords_en: ['international', 'trade', 'promotes'], keywords_cn: ['国际', '贸易', '促进'], topic: 'economy' },
      { en: 'Honesty and integrity are essential qualities for building trust.', cn: '诚实和正直是建立信任的基本品质。', keywords_en: ['honesty', 'integrity', 'essential'], keywords_cn: ['诚实', '正直', '基本'], topic: 'society' },
      { en: 'The advancement of medical technology has saved countless lives.', cn: '医疗技术的进步挽救了无数生命。', keywords_en: ['advancement', 'medical', 'countless'], keywords_cn: ['进步', '医疗', '无数'], topic: 'tech' },
      { en: 'Learning a foreign language can enhance cognitive abilities.', cn: '学习外语可以增强认知能力。', keywords_en: ['foreign', 'language', 'cognitive'], keywords_cn: ['外语', '学习', '认知'], topic: 'education' },
      { en: 'Urbanization has brought both opportunities and challenges to rural areas.', cn: '城镇化给农村地区既带来了机遇也带来了挑战。', keywords_en: ['urbanization', 'opportunities', 'challenges'], keywords_cn: ['城镇化', '机遇', '挑战'], topic: 'society' }
    ]
    for (const s of sentences) {
      db.run(
        `INSERT INTO translation_sentences (en, cn, keywords_en, keywords_cn, topic, source) VALUES (?, ?, ?, ?, ?, 'builtin')`,
        [s.en, s.cn, JSON.stringify(s.keywords_en), JSON.stringify(s.keywords_cn), s.topic]
      )
    }
    console.log(`导入了 ${sentences.length} 条翻译句子`)
  }
}

function sqlRun(db: SqlJsDatabase, sql: string, params: unknown[] = []): void {
  const stmt = db.prepare(sql)
  stmt.bind(params as BindParams)
  stmt.step()
  stmt.free()
}

/**
 * sql.js 的数据库是整库内存快照。只有发生写操作时才落盘，
 * 避免“未修改的旧实例”在定时保存或退出时覆盖其他窗口刚写入的数据。
 */
export function saveDatabase(force = false): boolean {
  if (!db || !dbPath || (!force && !isDatabaseDirty())) return false
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const data = db.export()
  const buffer = Buffer.from(data)
  const temporaryPath = dbPath + '.tmp-' + process.pid
  if (existsSync(dbPath) && !backupCreatedForSession) {
    copyFileSync(dbPath, dbPath + '.bak')
    backupCreatedForSession = true
  }
  writeFileSync(temporaryPath, buffer)
  renameSync(temporaryPath, dbPath)
  markDatabaseClean()
  return true
}

function ensureColumn(db: SqlJsDatabase, table: string, column: string, definition: string): void {
  const result = db.exec(`PRAGMA table_info(${table})`)
  const columns = (result[0]?.values ?? []).map(row => String(row[1]))
  if (!columns.includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    markDatabaseDirty()
  }
}

function createExamCollectionTable(db: SqlJsDatabase, tableName: string, ifNotExists = false): void {
  db.run(`
    CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_key TEXT NOT NULL UNIQUE,
      exam_type TEXT NOT NULL DEFAULT 'unknown'
        CHECK (exam_type IN (
          'basic-primary', 'basic-junior', 'basic-senior',
          'CET4', 'CET6', 'POSTGRAD', 'IELTS', 'TOEFL', 'UNKNOWN', 'unknown'
        )),
      year INTEGER CHECK (year IS NULL OR year BETWEEN 2000 AND 2099),
      session TEXT NOT NULL DEFAULT 'unknown'
        CHECK (session IN ('01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', 'unknown')),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'review_required'
        CHECK (status IN ('ready', 'partial', 'review_required', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)
}

function migrateExamCollectionTaxonomy(db: SqlJsDatabase): void {
  const currentSql = String(
    db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='exam_collection'")[0]?.values?.[0]?.[0] || ''
  )
  const hasExpandedTypes = currentSql.includes("'basic-primary'")
  const hasExpandedMonths = currentSql.includes("'01'") && currentSql.includes("'12'") && currentSql.includes("'10'")
  if (!currentSql || (hasExpandedTypes && hasExpandedMonths)) return

  db.run('PRAGMA foreign_keys = OFF')
  db.run('PRAGMA legacy_alter_table = ON')
  try {
    db.run('ALTER TABLE exam_collection RENAME TO exam_collection_legacy')
    createExamCollectionTable(db, 'exam_collection')
    db.run(`
      INSERT INTO exam_collection
        (id, collection_key, exam_type, year, session, title, status, created_at, updated_at, sort_order)
      SELECT id, collection_key, exam_type, year, session, title, status, created_at, updated_at,
             COALESCE(sort_order, 0)
      FROM exam_collection_legacy
    `)
    db.run('DROP TABLE exam_collection_legacy')
    markDatabaseDirty()
  } finally {
    db.run('PRAGMA legacy_alter_table = OFF')
    db.run('PRAGMA foreign_keys = ON')
  }
}

function runMigrations(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      phonetic_us TEXT,
      meaning_cn TEXT NOT NULL,
      pos TEXT,
      example_sentence TEXT,
      level TEXT DEFAULT 'cet4',
      frequency INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_words_level ON words(level)')
  db.run('CREATE INDEX IF NOT EXISTS idx_words_frequency ON words(frequency DESC)')

  db.run(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // 日活统计：每个自然日只保留一行，launch_count 记录当天及累计启动次数。
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_daily (
      activity_date TEXT PRIMARY KEY,
      launch_count INTEGER NOT NULL DEFAULT 1,
      first_opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_activity_last_opened ON activity_daily(last_opened_at DESC)')

  db.run(`
    CREATE TABLE IF NOT EXISTS word_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      short_name TEXT,
      stage TEXT,
      description TEXT,
      source_file TEXT,
      word_count INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS word_book_words (
      book_id INTEGER NOT NULL REFERENCES word_books(id) ON DELETE CASCADE,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      position INTEGER DEFAULT 0,
      PRIMARY KEY (book_id, word_id)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_word_book_words_word ON word_book_words(word_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_word_book_words_book ON word_book_words(book_id)')

  db.run(`
    CREATE TABLE IF NOT EXISTS word_learning (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL REFERENCES words(id) UNIQUE,
      familiarity INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      last_review_at TEXT,
      next_review_at TEXT,
      interval_days REAL DEFAULT 0,
      ease_factor REAL DEFAULT 2.5,
      status TEXT DEFAULT 'new',
      consecutive_correct INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_word_learning_next ON word_learning(next_review_at)')
  db.run('CREATE INDEX IF NOT EXISTS idx_word_learning_status ON word_learning(status)')
  db.run('CREATE INDEX IF NOT EXISTS idx_word_learning_familiarity ON word_learning(familiarity)')

  db.run(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      session_type TEXT NOT NULL,
      words_studied INTEGER DEFAULT 0,
      words_mastered INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0,
      pomodoro_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL UNIQUE,
      new_words_target INTEGER DEFAULT 20,
      review_words_target INTEGER DEFAULT 30,
      listening_minutes INTEGER DEFAULT 10,
      reading_minutes INTEGER DEFAULT 10,
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stat_date TEXT NOT NULL UNIQUE,
      words_learned INTEGER DEFAULT 0,
      words_reviewed INTEGER DEFAULT 0,
      words_mastered INTEGER DEFAULT 0,
      total_study_minutes INTEGER DEFAULT 0,
      streak_days INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // 真题试卷表
  db.run(`
    CREATE TABLE IF NOT EXISTS exam_papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      paper_name TEXT,
      year INTEGER,
      season TEXT,
      source TEXT,
      paper_type TEXT,
      file_name TEXT,
      file_path TEXT,
      source_path TEXT,
      file_hash TEXT,
      file_size INTEGER,
      page_count INTEGER,
      detection_source TEXT,
      text_excerpt TEXT,
      cover_path TEXT,
      remark TEXT,
      library_root TEXT,
      last_opened_at TEXT,
      imported_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // 真题题目表
  db.run(`
    CREATE TABLE IF NOT EXISTS exam_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL,
      question_order INTEGER DEFAULT 0,
      passage TEXT,
      question_text TEXT NOT NULL,
      options_json TEXT,
      answer TEXT,
      explanation TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_exam_questions_paper ON exam_questions(paper_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_questions_section ON exam_questions(section_type)')

  ensureColumn(db, 'exam_papers', 'paper_name', 'TEXT')
  ensureColumn(db, 'exam_papers', 'paper_type', 'TEXT')
  ensureColumn(db, 'exam_papers', 'file_name', 'TEXT')
  ensureColumn(db, 'exam_papers', 'file_path', 'TEXT')
  ensureColumn(db, 'exam_papers', 'source_path', 'TEXT')
  ensureColumn(db, 'exam_papers', 'file_hash', 'TEXT')
  ensureColumn(db, 'exam_papers', 'file_size', 'INTEGER')
  ensureColumn(db, 'exam_papers', 'page_count', 'INTEGER')
  ensureColumn(db, 'exam_papers', 'detection_source', 'TEXT')
  ensureColumn(db, 'exam_papers', 'text_excerpt', 'TEXT')
  ensureColumn(db, 'exam_papers', 'cover_path', 'TEXT')
  ensureColumn(db, 'exam_papers', 'remark', 'TEXT')
  ensureColumn(db, 'exam_papers', 'library_root', 'TEXT')
  ensureColumn(db, 'exam_papers', 'last_opened_at', 'TEXT')
  ensureColumn(db, 'exam_papers', 'updated_at', 'TEXT')
  ensureColumn(db, 'exam_papers', 'set_no', 'INTEGER')
  ensureColumn(db, 'exam_papers', 'variant', 'TEXT')
  ensureColumn(db, 'exam_papers', 'resource_status', "TEXT DEFAULT 'incomplete'")
  ensureColumn(db, 'exam_papers', 'resource_fingerprint', 'TEXT')
  ensureColumn(db, 'exam_papers', 'import_batch_id', 'INTEGER')
  ensureColumn(db, 'exam_papers', 'reader_mode', "TEXT DEFAULT 'single'")
  ensureColumn(db, 'exam_papers', 'last_position_json', 'TEXT')
  db.run("UPDATE exam_papers SET paper_name = COALESCE(paper_name, title), updated_at = COALESCE(updated_at, imported_at, datetime('now'))")
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_papers_library_group ON exam_papers(year, season, paper_type)')
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_papers_file_hash ON exam_papers(file_hash) WHERE file_hash IS NOT NULL')

  // 真题资源集：一套真题由文本、音频、解析三个角色组成
  db.run(`
    CREATE TABLE IF NOT EXISTS exam_paper_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('text', 'audio', 'analysis')),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      page_count INTEGER,
      duration_seconds REAL,
      extracted_text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(paper_id, role)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_resources_paper ON exam_paper_resources(paper_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_resources_role ON exam_paper_resources(role)')
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_resources_hash ON exam_paper_resources(file_hash)')

  db.run(`
    CREATE TABLE IF NOT EXISTS exam_import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_path TEXT,
      import_mode TEXT,
      total_sets INTEGER DEFAULT 0,
      imported_sets INTEGER DEFAULT 0,
      skipped_sets INTEGER DEFAULT 0,
      failed_sets INTEGER DEFAULT 0,
      summary_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // 旧版听力音频表需在资源迁移读取前创建
  db.run(`
    CREATE TABLE IF NOT EXISTS exam_audio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL DEFAULT 'listening',
      file_path TEXT NOT NULL,
      file_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_audio_paper ON exam_audio(paper_id)')

  db.run(`
    INSERT OR IGNORE INTO exam_paper_resources
      (paper_id, role, file_name, file_path, file_hash, file_size, mime_type, page_count)
    SELECT id, 'text', COALESCE(file_name, title || '.pdf'), file_path,
           COALESCE(file_hash, 'legacy-' || id), COALESCE(file_size, 0), 'application/pdf', page_count
    FROM exam_papers
    WHERE file_path IS NOT NULL AND file_path <> ''
      AND NOT EXISTS (
        SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'text'
      )
  `)

  db.run(`
    INSERT OR IGNORE INTO exam_paper_resources
      (paper_id, role, file_name, file_path, file_hash, file_size, mime_type)
    SELECT paper_id, 'audio', COALESCE(file_name, 'audio'), file_path,
           'legacy-audio-' || id, 0, 'audio/mpeg'
    FROM exam_audio
    WHERE file_path IS NOT NULL AND file_path <> ''
      AND EXISTS (SELECT 1 FROM exam_papers p WHERE p.id = exam_audio.paper_id)
      AND NOT EXISTS (
        SELECT 1 FROM exam_paper_resources r
        WHERE r.paper_id = exam_audio.paper_id AND r.role = 'audio'
      )
  `)

  db.run(`
    UPDATE exam_papers
    SET resource_status = CASE
      WHEN EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'text')
       AND EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'audio')
       AND EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'analysis')
        THEN 'complete'
      WHEN EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'text')
       AND EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'audio')
        THEN 'missing_analysis'
      WHEN EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'text')
       AND EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'analysis')
        THEN 'missing_audio'
      WHEN EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id AND r.role = 'text')
        THEN 'text_only'
      ELSE 'incomplete'
    END
    WHERE EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id)
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_sets_type_year ON exam_papers(paper_type, year, season, set_no)')
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sets_fingerprint ON exam_papers(resource_fingerprint) WHERE resource_fingerprint IS NOT NULL')

  // 真题合集：管理单元为 考试类型 + 年份 + 场次
  createExamCollectionTable(db, 'exam_collection', true)
  ensureColumn(db, 'exam_collection', 'sort_order', 'INTEGER NOT NULL DEFAULT 0')
  migrateExamCollectionTaxonomy(db)
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_collection_scope ON exam_collection(exam_type, year, session)')
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_collection_status ON exam_collection(status, updated_at DESC)')
  const orderStats = db.exec("SELECT COUNT(*) AS total, SUM(CASE WHEN sort_order > 0 THEN 1 ELSE 0 END) AS ordered FROM exam_collection")[0]?.values[0]
  if (Number(orderStats?.[0] || 0) > 0 && Number(orderStats?.[1] || 0) === 0) {
    const ids = db.exec('SELECT id FROM exam_collection ORDER BY updated_at DESC, id DESC')[0]?.values ?? []
    ids.forEach((row, index) => db.run('UPDATE exam_collection SET sort_order = ? WHERE id = ?', [index + 1, Number(row[0])]))
    markDatabaseDirty()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS collection_paper (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
      paper_no INTEGER NOT NULL CHECK (paper_no BETWEEN 1 AND 3),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'review_required'
        CHECK (status IN ('ready', 'partial', 'review_required')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (collection_id, paper_no)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_collection_paper_collection ON collection_paper(collection_id, paper_no)')

  db.run(`
    CREATE TABLE IF NOT EXISTS collection_audio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
      audio_slot TEXT NOT NULL CHECK (audio_slot IN ('A', 'B')),
      label TEXT,
      source_file_path TEXT NOT NULL,
      managed_file_path TEXT,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0 CHECK (file_size >= 0),
      mime_type TEXT,
      duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'missing', 'review_required')),
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (collection_id, audio_slot),
      UNIQUE (file_hash)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_collection_audio_collection ON collection_audio(collection_id, audio_slot)')
  db.run('CREATE INDEX IF NOT EXISTS idx_collection_audio_hash ON collection_audio(file_hash)')
  // A/B 是人为指定的合集级槽位，即使两个文件内容完全相同，也允许分别导入 A 和 B。
  const collectionAudioSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='collection_audio'")[0]?.values?.[0]?.[0]
  if (String(collectionAudioSql || '').includes('UNIQUE (file_hash)')) {
    db.run('PRAGMA foreign_keys = OFF')
    db.run('DROP INDEX IF EXISTS idx_collection_audio_collection')
    db.run('DROP INDEX IF EXISTS idx_collection_audio_hash')
    db.run('ALTER TABLE collection_audio RENAME TO collection_audio_legacy')
    db.run(`
      CREATE TABLE collection_audio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
        audio_slot TEXT NOT NULL CHECK (audio_slot IN ('A', 'B')),
        label TEXT,
        source_file_path TEXT NOT NULL,
        managed_file_path TEXT,
        file_name TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0 CHECK (file_size >= 0),
        mime_type TEXT,
        duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
        status TEXT NOT NULL DEFAULT 'available'
          CHECK (status IN ('available', 'missing', 'review_required')),
        imported_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (collection_id, audio_slot)
      )
    `)
    db.run(`
      INSERT INTO collection_audio
        (id, collection_id, audio_slot, label, source_file_path, managed_file_path, file_name, file_hash,
         file_size, mime_type, duration_seconds, status, imported_at, updated_at)
      SELECT id, collection_id, audio_slot, label, source_file_path, managed_file_path, file_name, file_hash,
             file_size, mime_type, duration_seconds, status, imported_at, updated_at
      FROM collection_audio_legacy
    `)
    db.run('DROP TABLE collection_audio_legacy')
    db.run('CREATE INDEX IF NOT EXISTS idx_collection_audio_collection ON collection_audio(collection_id, audio_slot)')
    db.run('CREATE INDEX IF NOT EXISTS idx_collection_audio_hash ON collection_audio(file_hash)')
    db.run('PRAGMA foreign_keys = ON')
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS collection_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
      paper_id INTEGER REFERENCES collection_paper(id) ON DELETE SET NULL,
      audio_slot TEXT CHECK (audio_slot IS NULL OR audio_slot IN ('A', 'B')),
      title TEXT NOT NULL,
      source_file_path TEXT NOT NULL,
      source_file_hash TEXT NOT NULL,
      file_name TEXT,
      status TEXT NOT NULL DEFAULT 'review_required'
        CHECK (status IN ('pending_review', 'confirmed', 'rejected', 'missing')),
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_collection_analysis_collection ON collection_analysis(collection_id, paper_id, audio_slot)')
  db.run('CREATE INDEX IF NOT EXISTS idx_collection_analysis_hash ON collection_analysis(source_file_hash)')

  // 未匹配到真题卷的解析文件，不创建独立合集，等待人工绑定
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_analysis_import (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_file_path TEXT NOT NULL,
      source_file_hash TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      exam_type TEXT NOT NULL DEFAULT 'unknown',
      year INTEGER,
      session TEXT NOT NULL DEFAULT 'unknown',
      set_no INTEGER,
      file_size INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      segment_count INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'bound', 'discarded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_analysis_status ON pending_analysis_import(status, updated_at DESC)')

  db.run(`
    CREATE TABLE IF NOT EXISTS content_segment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
      paper_id INTEGER REFERENCES collection_paper(id) ON DELETE SET NULL,
      analysis_id INTEGER REFERENCES collection_analysis(id) ON DELETE SET NULL,
      audio_slot TEXT CHECK (audio_slot IS NULL OR audio_slot IN ('A', 'B')),
      source_file_path TEXT NOT NULL,
      source_file_hash TEXT NOT NULL,
      page_no INTEGER NOT NULL CHECK (page_no >= 1),
      range_info TEXT NOT NULL,
      content_type TEXT NOT NULL
        CHECK (content_type IN ('paper', 'answer', 'analysis', 'listening_script')),
      text_excerpt TEXT,
      segment_order INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
      status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('auto_confirmed', 'pending_review', 'confirmed', 'rejected')),
      manual_override INTEGER NOT NULL DEFAULT 0 CHECK (manual_override IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_content_segment_collection ON content_segment(collection_id, content_type, status)')
  db.run('CREATE INDEX IF NOT EXISTS idx_content_segment_paper ON content_segment(paper_id, content_type, segment_order)')
  db.run('CREATE INDEX IF NOT EXISTS idx_content_segment_analysis ON content_segment(analysis_id, content_type, segment_order)')
  db.run('CREATE INDEX IF NOT EXISTS idx_content_segment_source_hash ON content_segment(source_file_hash, page_no)')
  db.run('CREATE INDEX IF NOT EXISTS idx_content_segment_review ON content_segment(status, confidence, updated_at DESC)')
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_content_segment_source_range
    ON content_segment(source_file_hash, page_no, content_type, range_info)`)

  // 真题错题记录
  db.run(`
    CREATE TABLE IF NOT EXISTS exam_wrong_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
      paper_id INTEGER NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL,
      user_answer TEXT,
      correct_answer TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_wrong_paper ON exam_wrong_answers(paper_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_wrong_section ON exam_wrong_answers(section_type)')

  // 生词本
  db.run(`
    CREATE TABLE IF NOT EXISTS vocabulary_notebook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER REFERENCES words(id),
      word_text TEXT NOT NULL,
      meaning_cn TEXT,
      phonetic_us TEXT,
      source TEXT,
      context TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_vocab_word ON vocabulary_notebook(word_text)')
  // 查词历史
  db.run(`
    CREATE TABLE IF NOT EXISTS lookup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      meaning_cn TEXT,
      phonetic_us TEXT,
      source TEXT,
      context TEXT,
      lookup_count INTEGER DEFAULT 1,
      first_looked_up_at TEXT DEFAULT (datetime('now')),
      last_looked_up_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_lookup_history_last ON lookup_history(last_looked_up_at DESC)')

  // 阅读文章
  db.run(`
    CREATE TABLE IF NOT EXISTS reading_passages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      topic TEXT,
      difficulty INTEGER DEFAULT 1,
      question TEXT,
      options_json TEXT,
      answer INTEGER,
      source TEXT DEFAULT 'builtin',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_reading_topic ON reading_passages(topic)')

  // 翻译句子
  db.run(`
    CREATE TABLE IF NOT EXISTS translation_sentences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      en TEXT NOT NULL,
      cn TEXT NOT NULL,
      keywords_en TEXT,
      keywords_cn TEXT,
      topic TEXT,
      source TEXT DEFAULT 'builtin',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_trans_topic ON translation_sentences(topic)')

  // 写作历史
  db.run(`
    CREATE TABLE IF NOT EXISTS writing_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      prompt TEXT,
      essay_text TEXT NOT NULL,
      word_count INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      keyword_score INTEGER DEFAULT 0,
      structure_score INTEGER DEFAULT 0,
      length_score INTEGER DEFAULT 0,
      feedback_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // 学习提醒
  db.run(`
    CREATE TABLE IF NOT EXISTS study_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reminder_type TEXT NOT NULL DEFAULT 'daily',
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      message TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // 文献抓取与阅读
  db.run(`
    CREATE TABLE IF NOT EXISTS literature_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      authors TEXT,
      year TEXT,
      source TEXT,
      source_url TEXT,
      doi TEXT,
      abstract TEXT,
      content_text TEXT,
      file_path TEXT,
      file_type TEXT DEFAULT 'web',
      metadata_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_opened_at TEXT
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_literature_created ON literature_items(created_at DESC)')
  db.run('CREATE INDEX IF NOT EXISTS idx_literature_source ON literature_items(source)')

  db.run(`
    CREATE TABLE IF NOT EXISTS literature_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES literature_items(id) ON DELETE CASCADE,
      annotation_type TEXT NOT NULL DEFAULT 'highlight',
      page_number INTEGER,
      quote TEXT,
      note TEXT,
      color TEXT DEFAULT 'yellow',
      geometry_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  ensureColumn(db, 'literature_annotations', 'geometry_json', 'TEXT')
  db.run('CREATE INDEX IF NOT EXISTS idx_literature_annotations_item ON literature_annotations(item_id, created_at DESC)')

  // 真题与真题合集的页面批注。scope_key 隔离不同试卷、角色与来源文件。
  db.run(`
    CREATE TABLE IF NOT EXISTS exam_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_key TEXT NOT NULL,
      page_number INTEGER NOT NULL CHECK (page_number >= 1),
      annotation_type TEXT NOT NULL,
      quote TEXT,
      note TEXT,
      color TEXT DEFAULT '#facc15',
      geometry_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_exam_annotations_scope ON exam_annotations(scope_key, page_number, created_at DESC)')
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function getDbPath(): string {
  return dbPath
}
