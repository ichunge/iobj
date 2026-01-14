import defineModel from 'iobj/model.js'
import { z } from 'zod'

const User = defineModel({
  name: { defaultValue: '', rule: z.string().min(2, '至少 2 个字符') },
  email: { defaultValue: '', rule: z.string().email('邮箱格式不正确') },
  age: { defaultValue: 0 },
})

const u = new User({ name: 'Li' })

u.value.name = 'A'              // 写入会触发微任务：dirty 计算 + validate()
await u.sync()                  // 等待微任务执行完，确保状态已刷新

console.log("u.isDirty", u.isDirty)          // true
console.log("u.modified.name", u.modified.name)    // true

await u.validate(true)          // skipEmpty=true：空值跳过校验（保持当前 isValid）
console.log("u.isValid", u.isValid)          // false
console.log("u.validation.name", u.validation.name)  // { isValid: ..., validation: [...] }
