// 独立保存数据库脏状态，避免连接层与包装层互相导入时产生循环依赖。
let databaseDirty = false

export function markDatabaseDirty(): void {
  databaseDirty = true
}

export function isDatabaseDirty(): boolean {
  return databaseDirty
}

export function markDatabaseClean(): void {
  databaseDirty = false
}
