# iobj

对象/表单的修改状态(dirty)与校验状态(valid)管理库（ESM）。

当前实现以 `Model/Field` 为核心：字段值写入后通过微任务批处理更新 `isDirty/isValid`，并通过事件同步到模型层聚合状态。

### 安装

#### 从 GitHub 安装

```bash
npm install github:ichunge/iobj
# 或使用 pnpm
pnpm add github:ichunge/iobj
# 或使用 yarn
yarn add github:ichunge/iobj
```


#### 安装依赖

如需使用默认校验适配器（Zod）：

```bash
npm i zod
```

### 快速开始（Model）

```js
import defineModel from 'iobj/model'
import { z } from 'zod'

const User = defineModel({
  name: { defaultValue: '', rule: z.string().min(2, '至少 2 个字符') },
  email: { defaultValue: '', rule: z.string().email('邮箱格式不正确') },
  age: { defaultValue: 0 },
})

const u = new User({ name: 'Li' })

u.value.name = 'A'              // 写入会触发微任务：dirty 计算 + validate()
await u.sync()                  // 等待微任务执行完，确保状态已刷新

console.log(u.isDirty)          // true/false
console.log(u.modified.name)    // true/false

await u.validate(true)          // skipEmpty=true：空值跳过校验（保持当前 isValid）
console.log(u.isValid)          // undefined | true | false
console.log(u.validation.name)  // { isValid: undefined|true|false, validation: [...] }
```

### 定义 Field（defineField）

`defineField(name, opts)` 返回一个可实例化的 Field 类（构造参数为初始值）。

```js
import defineField from 'iobj/field.js'
import { z } from 'zod'

const Email = defineField('email', {
  defaultValue: '',
  format: (v) => String(v ?? '').trim(),
  rule: z.string().email('邮箱格式不正确'), // 未指定 validator 时默认使用 zod 适配器
})

const f = new Email('  a@b.com  ')
await f.sync?.()
await f.validate()
console.log(f.value)       // 'a@b.com'
console.log(f.isDirty)     // true/false
console.log(f.isValid)     // undefined | true | false
console.log(f.validation)  // [] | [ { message }, ... ]
```

`opts` 配置：

- `defaultValue`: 未传入构造参数时的默认值（支持函数）
- `format(value)`: 初始化/写入时格式化（例如 trim、toUpperCase 等）
- `validator`:
  - 传函数：`async (val) => true` 或 `throw new Error(message)`（失败必须 throw）
  - 传字符串：校验适配器名（默认 `zod`）
- `rule`: 规则对象，交给适配器执行（例如 Zod schema）
- 其他字段：会 `Object.assign` 到字段实例上（可用于扩展元信息）

### vue
https://ichunge.github.io/iobj/index.html

https://github.com/ichunge/iobj/blob/master/demo/vue3-demo/src/index.vue

### 定义 Model（defineModel）

`defineModel([name], fields)` 返回一个可实例化的 Model 类（构造参数为初始数据）。

```js
import defineModel from 'iobj/src/model.js'
import defineField from '@ilearn/iobj/src/field.js'
import { z } from 'zod'

const Age = defineField('age', { defaultValue: 0, rule: z.number().min(0, '年龄不能为负') })

const User = defineModel('User', {
  name: { defaultValue: '', rule: z.string().min(2, '至少 2 个字符') },
  email: { defaultValue: '', rule: z.string().email('邮箱格式不正确') },
  age: Age,          // 也可以直接复用已定义的 Field 类
  enabled: true,     // 原始值简写：等价于 { defaultValue: true }
})

const u = new User({ name: 'Li' }) // 传入的初始值会作为各字段 initVal 基线
```

`fields` 支持两种形态：

- 对象：`{ [fieldName]: fieldCfg }`
  - `fieldCfg` 可以是 Field 配置对象、已定义的 Field 类、或原始值简写（转为 `{ defaultValue: xxx }`）
- 数组：`[fieldCfg, ...]`
  - `fieldCfg` 可以是已定义的 Field 类
  - 或包含 `name` 的配置对象：`{ name: 'x', defaultValue: 1, ... }`

### 概念与状态结构

- **Field（字段实例）**
  - `field.value`: 当前值（写入会触发微任务批处理）
  - `field.initVal`: 初始化值（构造时格式化后的基线）
  - `field.isDirty`: 是否相对 `initVal` 发生变化
  - `field.isValid`: `undefined | true | false`
  - `field.validation`: 验证错误结果数组（失败时写入；通过时清空 `[]`）

- **Model（模型实例）**
  - `model.value`: 纯数据对象（每个 key 都代理到对应 Field）
  - `model.fields`: 字段实例映射（`{ [name]: FieldInstance }`）
  - `model.modified`: 字段 dirty 映射（`{ [name]: boolean }`）
  - `model.validation`: 字段 valid 映射（`{ [name]: { isValid: boolean|undefined, validation: Error[] } }`）
  - `model.isDirty`: `modified` 的聚合（任一字段为 `true` 则为 `true`）
  - `model.isValid`: 三态聚合
    - 任一字段为错误数组（失败）→ `false`
    - 否则任一字段为 `undefined`（未验证）→ `undefined`
    - 否则 → `true`

### 校验（Field / Model）

#### Field 校验

```js
import defineField from '../field.js'
import { z } from 'zod'

const Email = defineField('email', {
  defaultValue: '',
  rule: z.string().email('邮箱格式不正确'),
})

const f = new Email()
await f.validate()      // -> true/false/undefined
console.log(f.validation)
```

字段配置项（`defineField(name, opts)`）核心字段：

- `defaultValue`: 未传入构造参数时的默认值（支持函数）
- `format(val)`: 写入/初始化时格式化（例如 trim、toUpperCase 等）
- `validator`: 自定义校验函数（`async (val) => true` 或 `throw new Error(message)`）
- `rule`: 规则对象（默认用 Zod `parseAsync`，失败时走 `e.errors`/`e.message` 解析）

#### Model 校验

```js
await model.validate() // 对所有字段执行 validate(skipEmpty)
```

注意：当前实现的 `Model` 校验是**字段级校验的聚合**，不包含额外的“模型级跨字段规则”。

### sync：等待微任务刷新

字段赋值/数组变异会把 dirty 计算与 validate 合并到同一个微任务中批处理；如果你在赋值后立刻读取 `isDirty/isValid`，应 `await instance.sync()`：

```js
model.value.name = 'next'
await model.sync()
console.log(model.isDirty, model.isValid)
```

### reset：回到初始化基线

```js
model.reset()
// - 每个字段回到其 initVal（即实例化时的初始值）
// - model.modified[*] 清为 false
// - model.validation[*] 清为 undefined
// - model.isDirty=false, model.isValid=undefined
```

### 数组字段

当字段值为数组时，会代理 `push/pop/shift/unshift/splice/sort/reverse` 等变异方法，
变异后同样走微任务批处理（建议 `await sync()` 后读取聚合状态）。

### 事件（on/off）

`Field` 与 `Model` 都继承 `Base`，提供事件订阅：

```js
const off = model.on('modifiedChange', (isDirty) => {
  console.log('model dirty =>', isDirty)
})

// Field 事件回调参数为：(isValid)
const off2 = model.fields.name.on('validChange', (isValid) => {
  console.log(model.fields.name.name, 'valid =>', isValid)
})

off()
off2()
```

已使用的事件名：

- `modifiedChange`
  - Field：`boolean`
  - Model：`boolean`
- `validChange`
  - Field：`(undefined|true|false)`
  - Model：`(undefined|true|false)`

### 自定义校验适配器（非 Zod）

默认适配器名为 `zod`，其行为等价于 `rule.parseAsync(value)`。
你可以注册新的适配器，并通过 `validator` 传入适配器名 + `rule` 传入规则对象：

```js
import { registerValidateAdapter } from '../validate.js'
import defineField from '../src/field.js'

registerValidateAdapter('my', async (value, rule) => {
  return rule(value) // 失败请 throw
})

const F = defineField('x', { validator: 'my', rule: (v) => { if (!v) throw new Error('必填') } })
```


