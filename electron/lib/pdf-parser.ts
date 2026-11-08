import * as pdfjsLib from 'pdfjs-dist'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

// Node.js 环境下需要手动指定 worker 路径（必须是 file:// URL）
const require = createRequire(import.meta.url)
const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.mjs')
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href

export interface ParsedQuestion {
  section_type: string
  question_order: number
  passage?: string
  question_text: string
  options?: Record<string, string>
  answer?: string
  explanation?: string
}

export interface ParsedSection {
  type: string
  label: string
  questions: ParsedQuestion[]
}

export interface ParsedExam {
  title: string
  sections: ParsedSection[]
  rawText: string
}

export interface PdfTextExtraction {
  text: string
  pages: string[]
  pageCount: number
}

// 从 PDF 提取文本，可按页数限制用于年份/考季的快速识别
export async function extractPdfText(buffer: ArrayBuffer, maxPages?: number): Promise<PdfTextExtraction> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer, useSystemFonts: true })
  const pdf = await loadingTask.promise
  const pages: string[] = []
  const endPage = Math.min(pdf.numPages, Math.max(1, maxPages ?? pdf.numPages))

  try {
    for (let i = 1; i <= endPage; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const strings = content.items.map((item: any) => item.str)
      pages.push(strings.join(' ').replace(/\s+/g, ' ').trim())
    }
  } finally {
    await pdf.destroy()
  }

  return {
    text: pages.join('\n'),
    pages,
    pageCount: pdf.numPages
  }
}

// 识别 Part 分割点
// PDF 中罗马数字可能有空格: "Part I", "Part I I"(=II), "Part I II"(=III), "Part IV"
function splitByParts(text: string): Map<string, string> {
  const parts = new Map<string, string>()

  // PDF 中罗马数字格式不固定，I/II/III 中的 I 可能连在一起或有空格
  // 实际文本示例: "Part I Writing", "Part I I Listening", "Part I II Reading", "Part IV Translation"
  // 用 I[\sI]* 贪婪匹配一个或多个 I（可能有空格），再用 \s+ 确保后面跟 section name
  const sectionPatterns = [
    { regex: /Part\s+I[\sI]*\s+Writing/gi, type: 'writing' },
    { regex: /Part\s+I[\sI]*\s+Listening/gi, type: 'listening' },
    { regex: /Part\s+I[\sI]*\s+Reading/gi, type: 'reading' },
    { regex: /Part\s+I[\sI]*V?\s+Translation/gi, type: 'translation' }
  ]

  const matches: { type: string; index: number }[] = []

  for (const sp of sectionPatterns) {
    sp.regex.lastIndex = 0
    const m = sp.regex.exec(text)
    if (m) {
      matches.push({ type: sp.type, index: m.index })
    }
  }

  // 按位置排序
  matches.sort((a, b) => a.index - b.index)

  // 按位置分割文本
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    // 去掉末尾 KEYS 部分（答案页）
    let sectionText = text.slice(start, end).trim()
    const keysIdx = sectionText.indexOf('KEYS')
    if (keysIdx > 0) sectionText = sectionText.slice(0, keysIdx).trim()
    parts.set(matches[i].type, sectionText)
  }

  return parts
}

// 解析写作部分
function parseWriting(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []

  // 提取 Directions 和题目要求
  const dirMatch = text.match(/Directions[:\s]*([\s\S]*?)(?=For this part|$)/i)
  const taskMatch = text.match(/For this part[,\s]+([\s\S]*?)(?=\n\n|$)/i)

  if (taskMatch) {
    questions.push({
      section_type: 'writing',
      question_order: 1,
      question_text: taskMatch[0].trim(),
      answer: undefined
    })
  } else if (dirMatch) {
    questions.push({
      section_type: 'writing',
      question_order: 1,
      question_text: dirMatch[1].trim(),
      answer: undefined
    })
  }

  return questions
}

// 解析听力部分
// 真题 PDF 格式: "Questions N to M are based on ..." / "N. A) ... C) ... \n B) ... D) ..."
function parseListening(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []

  // 去掉 Directions
  const cleaned = text.replace(/Directions:[\s\S]*?(?=Questions?\s+\d)/gi, '')

  // 清理上下文中混入的题目内容（题号+选项）
  function cleanContext(raw: string): string {
    let s = raw
    // 去掉题号开头的内容: "1. A) ..." 或 "12. A) ..."
    s = s.replace(/\b\d{1,2}\s*\.\s*[A-D]\)[\s\S]*/g, '')
    // 去掉残留的选项标记: "C) ..." 或 "D) ..."
    s = s.replace(/\b[CD]\)\s+.*/g, '')
    // 去掉 Directions 残留
    s = s.replace(/Directions:[\s\S]*/gi, '')
    return s.trim().replace(/\s+/g, ' ')
  }

  // 提取 "Questions N to/and M are based on ..." 上下文
  const contextRegex = /Questions?\s+(\d+)\s+(?:to|and)\s+(\d+)\s+are\s+based\s+on\s+([\s\S]*?)(?=Questions?\s+\d|$)/gi
  const questionContexts: Map<number, string> = new Map()
  let match

  while ((match = contextRegex.exec(cleaned)) !== null) {
    const start = parseInt(match[1])
    const end = parseInt(match[2])
    // match[0] 包含完整句子 "Questions 1 and 2 are based on the news report..."
    // match[3] 只有 "based on" 之后的文本，会丢失前缀
    const ctx = cleanContext(match[0])
    if (ctx) {
      for (let i = start; i <= end; i++) {
        questionContexts.set(i, ctx)
      }
    }
  }

  // 找所有题号位置: "数字." 或 "数字 ." 后面跟选项 A)
  const qNumPositions: { num: number; pos: number }[] = []
  const qNumRegex = /(\d{1,2})\s*\.\s*[A-D]\)/g
  while ((match = qNumRegex.exec(cleaned)) !== null) {
    qNumPositions.push({ num: parseInt(match[1]), pos: match.index })
  }

  // 按题号位置切分，提取每道题的所有选项
  for (let i = 0; i < qNumPositions.length; i++) {
    const qNum = qNumPositions[i].num
    const start = qNumPositions[i].pos
    const end = i + 1 < qNumPositions.length ? qNumPositions[i + 1].pos : cleaned.length
    const block = cleaned.slice(start, end)

    // 提取所有 A) B) C) D) 选项
    const options: Record<string, string> = {}
    const optRegex = /([A-D])\)\s*([\s\S]*?)(?=[A-D]\)|$)/g
    let om
    while ((om = optRegex.exec(block)) !== null) {
      options[om[1]] = om[2].trim().replace(/\s+/g, ' ')
    }

    if (Object.keys(options).length >= 2) {
      const ctx = questionContexts.get(qNum) || ''
      questions.push({
        section_type: 'listening',
        question_order: qNum,
        passage: ctx || undefined,
        question_text: `Question ${qNum}`,
        options
      })
    }
  }

  return questions
}

// 解析阅读部分
function parseReading(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []

  // 分割 Section A/B/C
  const secAMatch = text.match(/Section\s+A([\s\S]*?)(?=Section\s+B)/i)
  const secBMatch = text.match(/Section\s+B([\s\S]*?)(?=Section\s+C)/i)
  const secCMatch = text.match(/Section\s+C([\s\S]*?)(?:KEYS|$)/i)

  let questionOrder = 0

  // === Section A: 选词填空 ===
  if (secAMatch) {
    const secAText = secAMatch[1]
    // 提取 passage（从 Directions 之后到 word bank 之前）
    const passageMatch = secAText.match(/Directions:[\s\S]*?(?:once\.\s*)([\s\S]*?)(?=\b[A-G]\)\s+\w)/i)
    const passage = passageMatch ? passageMatch[1].trim().replace(/\s+/g, ' ') : ''
    // 提取填空题号 (26-35)
    const blanks = [...secAText.matchAll(/(\d{2})\s*\./g)]
    for (const b of blanks) {
      questionOrder++
      questions.push({
        section_type: 'reading',
        question_order: questionOrder,
        passage: passage ? `【选词填空】${passage.slice(0, 300)}...` : '【选词填空】',
        question_text: `第${b[1]}题：从词库中选择合适的单词填入空白处`,
      })
    }
  }

  // === Section B: 长篇阅读（信息匹配） ===
  if (secBMatch) {
    const secBText = secBMatch[1]

    // 提取文章正文：从 Directions 结束到第一个陈述句（36.）之前
    // 文章包含带 [A]-[O] 或 A)-O) 标签的段落
    let articleText = ''
    const dirEnd = secBText.match(/Directions:[\s\S]*?(?=\n\s*(?:\[?A[\]\)]|\d{2}\s*\.))/i)
    const stmtStart = secBText.search(/\b36\s*\.\s*/)
    if (stmtStart > 0) {
      const articleRegion = secBText.slice(dirEnd ? dirEnd.index! + dirEnd[0].length : 0, stmtStart)
      // 清理但保留段落标签
      articleText = articleRegion.trim().replace(/\s{2,}/g, '\n')
    }

    // 匹配 36-45 的陈述句
    const stmtRegex = /(\d{2})\s*\.\s*([\s\S]*?)(?=\d{2}\s*\.|$)/gm
    let m
    while ((m = stmtRegex.exec(secBText)) !== null) {
      const num = parseInt(m[1])
      if (num >= 36 && num <= 45) {
        questionOrder++
        questions.push({
          section_type: 'reading',
          question_order: questionOrder,
          passage: articleText ? `【信息匹配】将以下陈述与对应段落匹配\n\n${articleText}` : '【信息匹配】将以下陈述与对应段落匹配',
          question_text: m[2].trim().replace(/\s+/g, ' '),
        })
      }
    }
  }

  // === Section C: 仔细阅读（选择题） ===
  if (secCMatch) {
    const secCText = secCMatch[1]

    // 提取 passage：找 "Questions N to M are based on the following passage" 后面的文本
    const passageRegex = /Questions?\s+(\d+)\s+(?:to|and)\s+(\d+)\s+are\s+based\s+on\s+(?:the\s+following\s+passage\.?\s*)([\s\S]*?)(?=\b(?:4[6-9]|5[0-5])\s*\.\s*[A-Z?])/gi
    const passageMap: Map<number, string> = new Map()
    let cm

    while ((cm = passageRegex.exec(secCText)) !== null) {
      const start = parseInt(cm[1])
      const end = parseInt(cm[2])
      const passage = cm[3].trim().replace(/\s+/g, ' ')
      for (let i = start; i <= end; i++) {
        passageMap.set(i, passage)
      }
    }

    // 找题号位置：必须后面跟大写字母或问号，且前面不是数字（排除 "past 50" 等）
    const qPositions: { num: number; pos: number }[] = []
    const qAll = [...secCText.matchAll(/\b(4[6-9]|5[0-5])\s*\.\s*/g)]
    for (const qm of qAll) {
      const num = parseInt(qm[1])
      const after = secCText.slice(qm.index! + qm[0].length, qm.index! + qm[0].length + 2)
      if (!/^[A-Z?]/.test(after)) continue
      const before = secCText.slice(Math.max(0, qm.index! - 10), qm.index!)
      if (/\d\s*$/.test(before)) continue
      qPositions.push({ num, pos: qm.index! })
    }

    // 按位置切分，提取每道题
    for (let i = 0; i < qPositions.length; i++) {
      const qNum = qPositions[i].num
      const start = qPositions[i].pos
      const end = i + 1 < qPositions.length ? qPositions[i + 1].pos : secCText.length
      const block = secCText.slice(start, end)

      // 提取选项
      const options: Record<string, string> = {}
      const optRegex = /([A-D])\)\s*([\s\S]*?)(?=[A-D]\)|$)/g
      let om
      while ((om = optRegex.exec(block)) !== null) {
        options[om[1]] = om[2].trim().replace(/\s+/g, ' ')
      }

      // 题目文本 = 第一个选项之前的部分
      const firstOptPos = block.search(/[A-D]\)/)
      const qText = firstOptPos > 0
        ? block.slice(0, firstOptPos).replace(/^\d{2}\s*\.\s*/, '').trim().replace(/\s+/g, ' ')
        : ''

      if (Object.keys(options).length >= 2) {
        questionOrder++
        questions.push({
          section_type: 'reading',
          question_order: questionOrder,
          passage: passageMap.get(qNum) || '',
          question_text: qText || `Question ${qNum}`,
          options
        })
      }
    }
  }

  // 如果以上都没解析出题目，用通用方式
  if (questions.length === 0) {
    const genericQ = text.match(/(\d{2})\s*\.\s*([\s\S]*?)(?=\d{2}\s*\.|$)/g)
    if (genericQ) {
      for (const q of genericQ) {
        const numMatch = q.match(/^(\d{2})\s*\.\s*([\s\S]*)/)
        if (numMatch) {
          const num = parseInt(numMatch[1])
          if (num < 26 || num > 55) continue
          questionOrder++
          const options: Record<string, string> = {}
          const optMatches = [...numMatch[2].matchAll(/([A-D])\)\s*([\s\S]*?)(?=[A-D]\)|$)/g)]
          for (const om of optMatches) {
            options[om[1]] = om[2].trim().replace(/\s+/g, ' ')
          }
          const firstOpt = numMatch[2].search(/[A-D]\)/)
          const qText = firstOpt > 0 ? numMatch[2].slice(0, firstOpt).trim().replace(/\s+/g, ' ') : ''
          questions.push({
            section_type: 'reading',
            question_order: questionOrder,
            question_text: qText || `Question ${num}`,
            options: Object.keys(options).length >= 2 ? options : undefined
          })
        }
      }
    }
  }

  return questions
}

// 解析翻译部分
function parseTranslation(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []

  // 提取 Directions 结束位置（"Answer Sheet 2." 之后）
  const dirEnd = text.match(/Answer\s+Sheet\s+\d\.?\s*/i)
  let chineseText = ''

  if (dirEnd) {
    const afterDir = text.slice(dirEnd.index! + dirEnd[0].length)
    // 提取连续的中文段落（可能包含标点和空格）
    // 中文字符范围: 一-鿿 (CJK), 加上中文标点
    const cnMatch = afterDir.match(/[一-鿿　-〿＀-￯][\s\S]*[一-鿿　-〿＀-￯。！？]/)
    if (cnMatch) {
      // 保留中文和中文标点，去掉多余空格
      chineseText = cnMatch[0].replace(/\s+/g, '').trim()
    }
  }

  if (!chineseText) {
    // 备用：找最长的连续中文段落
    const cnBlocks = text.match(/[一-鿿][\s\S]{20,}?[一-鿿。！？]/g)
    if (cnBlocks) {
      chineseText = cnBlocks.sort((a, b) => b.length - a.length)[0].replace(/\s+/g, '').trim()
    }
  }

  if (chineseText) {
    questions.push({
      section_type: 'translation',
      question_order: 1,
      question_text: `请将以下中文翻译成英文：\n\n${chineseText}`,
      answer: undefined
    })
  }

  return questions
}

// 主解析函数
export async function parseExamPdf(buffer: ArrayBuffer, title?: string): Promise<ParsedExam> {
  const rawText = (await extractPdfText(buffer)).text

  // 尝试从文本中提取标题
  let examTitle = title || '四级真题'
  const titleMatch = rawText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/)
  if (titleMatch) {
    examTitle = `${titleMatch[1]}年${titleMatch[2]}月四级真题`
  }

  const parts = splitByParts(rawText)
  const sections: ParsedSection[] = []

  // 解析各部分
  if (parts.has('writing')) {
    const questions = parseWriting(parts.get('writing')!)
    if (questions.length > 0) {
      sections.push({ type: 'writing', label: '写作', questions })
    }
  }

  if (parts.has('listening')) {
    const questions = parseListening(parts.get('listening')!)
    if (questions.length > 0) {
      sections.push({ type: 'listening', label: '听力', questions })
    }
  }

  if (parts.has('reading')) {
    const questions = parseReading(parts.get('reading')!)
    if (questions.length > 0) {
      sections.push({ type: 'reading', label: '阅读', questions })
    }
  }

  if (parts.has('translation')) {
    const questions = parseTranslation(parts.get('translation')!)
    if (questions.length > 0) {
      sections.push({ type: 'translation', label: '翻译', questions })
    }
  }

  // 如果没有解析出任何部分，尝试全文解析
  if (sections.length === 0) {
    // 尝试从全文提取选择题
    const allQuestions = parseReading(rawText)
    if (allQuestions.length > 0) {
      sections.push({ type: 'reading', label: '阅读', questions: allQuestions })
    }

    // 尝试提取翻译
    const transQ = parseTranslation(rawText)
    if (transQ.length > 0) {
      sections.push({ type: 'translation', label: '翻译', questions: transQ })
    }
  }

  // 从 KEYS 页提取答案
  // KEYS 格式: 数字行和答案行交替排列
  // PDF 文本中数字可能被空格分隔: "1 0" = 10, "2 6" = 26
  // 策略: 提取所有答案行（只含 A-D 字母），按顺序映射到题目
  const keysPageMatch = rawText.match(/KEYS[\s\S]*$/i)
  if (keysPageMatch) {
    const keysText = keysPageMatch[0]

    // 分离听力和阅读答案区域
    const listenKeysMatch = keysText.match(/Part\s+I[\sI]*\s+Listening([\s\S]*?)(?=Part\s+I[\sI]*\s+Reading|$)/i)
    const readKeysMatch = keysText.match(/Part\s+I[\sI]*\s+Reading([\s\S]*?)$/i)

    // 从文本中提取答案字母序列
    function extractAnswerSequence(text: string, letters: string): string[] {
      const re = new RegExp(`\\b([${letters}])\\b`, 'g')
      return [...text.matchAll(re)].map(m => m[1])
    }

    // 填充听力答案（1-25，只有 A-D）
    if (listenKeysMatch) {
      const answers = extractAnswerSequence(listenKeysMatch[1], 'A-D')
      for (const section of sections) {
        if (section.type === 'listening') {
          for (let i = 0; i < Math.min(section.questions.length, answers.length); i++) {
            section.questions[i].answer = answers[i]
          }
        }
      }
    }

    // 填充阅读答案
    // Section A (26-35): 选词填空，答案是 A-O 词库字母
    // Section B (36-45): 信息匹配，答案是 A-O
    // Section C (46-55): 仔细阅读，答案是 A-D
    if (readKeysMatch) {
      const readText = readKeysMatch[1]
      // 提取所有字母答案（A-O，覆盖所有阅读子题型）
      const allReadAnswers = extractAnswerSequence(readText, 'A-O')

      for (const section of sections) {
        if (section.type === 'reading') {
          // 按子题型分配答案
          const secA = section.questions.filter(q => q.question_text.includes('选词填空'))
          const secB = section.questions.filter(q => q.question_text.includes('信息匹配'))
          const secC = section.questions.filter(q => q.options && !q.question_text.includes('选词填空') && !q.question_text.includes('信息匹配'))

          let offset = 0
          // Section A: 10 题
          for (let i = 0; i < Math.min(secA.length, 10); i++) {
            if (offset < allReadAnswers.length) secA[i].answer = allReadAnswers[offset++]
          }
          // Section B: 10 题
          for (let i = 0; i < Math.min(secB.length, 10); i++) {
            if (offset < allReadAnswers.length) secB[i].answer = allReadAnswers[offset++]
          }
          // Section C: 10 题
          for (let i = 0; i < Math.min(secC.length, 10); i++) {
            if (offset < allReadAnswers.length) secC[i].answer = allReadAnswers[offset++]
          }
        }
      }
    }
  }

  // 重新编号（按 section 内部顺序）
  for (const section of sections) {
    section.questions.forEach((q, i) => {
      q.question_order = i + 1
    })
  }

  return {
    title: examTitle,
    sections,
    rawText
  }
}
