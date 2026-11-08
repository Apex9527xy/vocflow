export interface LiteratureSite {
  id: string
  name: string
  url: string
  category: string
  description: string
  keywords: string[]
}

export const LITERATURE_SITES: LiteratureSite[] = [
  {
    id: 'cnki',
    name: '中国知网 CNKI',
    url: 'https://kns.cnki.net/',
    category: '中文文献',
    description: '中文期刊、学位论文、会议论文与报纸数据库',
    keywords: ['知网', '中文', '期刊', '学位论文', 'cnki']
  },
  {
    id: 'wanfang',
    name: '万方数据',
    url: 'https://www.wanfangdata.com.cn/',
    category: '中文文献',
    description: '中文期刊、学位论文、会议与科技报告',
    keywords: ['万方', '中文', '学位论文', '期刊']
  },
  {
    id: 'pubmed',
    name: 'PubMed',
    url: 'https://pubmed.ncbi.nlm.nih.gov/',
    category: '生命科学',
    description: '生物医学与生命科学文献索引',
    keywords: ['医学', '生物', 'health', 'medicine', 'biomedical']
  },
  {
    id: 'google-scholar',
    name: 'Google Scholar',
    url: 'https://scholar.google.com/',
    category: '综合检索',
    description: '跨学科学术搜索与引用追踪',
    keywords: ['谷歌学术', 'scholar', '综合', '引用']
  },
  {
    id: 'semantic-scholar',
    name: 'Semantic Scholar',
    url: 'https://www.semanticscholar.org/',
    category: '综合检索',
    description: 'AI 辅助的学术文献搜索与摘要分析',
    keywords: ['semantic', 'ai', '综合', '摘要']
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    url: 'https://arxiv.org/',
    category: '预印本',
    description: '数学、物理、计算机科学与人工智能预印本',
    keywords: ['预印本', '计算机', '物理', '数学', 'ai', 'cs']
  },
  {
    id: 'crossref',
    name: 'Crossref',
    url: 'https://search.crossref.org/',
    category: '综合检索',
    description: 'DOI 元数据与跨出版社文献检索',
    keywords: ['doi', 'metadata', '元数据', '综合']
  },
  {
    id: 'openalex',
    name: 'OpenAlex',
    url: 'https://openalex.org/',
    category: '开放学术',
    description: '开放学术图谱、作者与引用关系搜索',
    keywords: ['open', '开放', '引用', '作者']
  },
  {
    id: 'doaj',
    name: 'DOAJ',
    url: 'https://doaj.org/',
    category: '开放获取',
    description: '开放获取期刊与文章目录',
    keywords: ['开放获取', 'oa', '期刊', 'open access']
  },
  {
    id: 'core',
    name: 'CORE',
    url: 'https://core.ac.uk/',
    category: '开放获取',
    description: '全球开放获取论文与机构仓储聚合',
    keywords: ['开放获取', '机构仓储', 'open access']
  },
  {
    id: 'ieee',
    name: 'IEEE Xplore',
    url: 'https://ieeexplore.ieee.org/',
    category: '工程技术',
    description: '电子电气、计算机与工程技术文献',
    keywords: ['ieee', '工程', '计算机', '电子', '通信']
  },
  {
    id: 'springer',
    name: 'SpringerLink',
    url: 'https://link.springer.com/',
    category: '综合出版',
    description: 'Springer 期刊、图书与会议论文',
    keywords: ['springer', '期刊', '图书', '会议']
  },
  {
    id: 'science-direct',
    name: 'ScienceDirect',
    url: 'https://www.sciencedirect.com/',
    category: '综合出版',
    description: 'Elsevier 科技与医学期刊',
    keywords: ['elsevier', '科技', '医学', '期刊']
  },
  {
    id: 'jstor',
    name: 'JSTOR',
    url: 'https://www.jstor.org/',
    category: '人文社科',
    description: '人文、社会科学与历史文献',
    keywords: ['人文', '社科', '历史', 'jstor']
  }
]
