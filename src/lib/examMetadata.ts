export const examPaperTypeOptions: Array<{ value: ExamPaperTypeKey; label: string }> = [
  { value: 'basic-primary', label: '小学' },
  { value: 'basic-junior', label: '初中' },
  { value: 'basic-senior', label: '高中' },
  { value: 'CET4', label: '四级' },
  { value: 'CET6', label: '六级' },
  { value: 'POSTGRAD', label: '考研英语' },
  { value: 'IELTS', label: '雅思' },
  { value: 'TOEFL', label: '托福' }
]

export const examPaperTypeImportOptions: Array<{ value: ExamPaperTypeKey; label: string }> = [
  ...examPaperTypeOptions,
  { value: 'unknown', label: '未识别' }
]

export const examMonthOptions: Array<{ value: ExamSeasonKey; label: string }> = Array.from(
  { length: 12 },
  (_, index) => {
    const month = index + 1
    return {
      value: String(month).padStart(2, '0') as ExamSeasonKey,
      label: `${month}月`
    }
  }
)

export const basicExamTypes: ExamPaperTypeKey[] = ['basic-primary', 'basic-junior', 'basic-senior']

export function examPaperTypeLabel(value: string | null | undefined): string {
  return examPaperTypeOptions.find(item => item.value === value)?.label || '类型未分类'
}

export function examSeasonLabel(value: string | null | undefined): string {
  const match = String(value || '').match(/^(0[1-9]|1[0-2])$/)
  return match ? `${Number(match[1])}月` : '场次未分类'
}
