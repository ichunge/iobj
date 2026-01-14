<script>
import { z } from 'zod'
import { defineModel } from 'iobj'

// 定义 Zod 规则
const nameRule = z.string().min(2, '姓名至少 2 个字符')
const emailRule = z.string().email('请输入有效邮箱').refine(v => v.endsWith('@gmail.com'), '必须是 Gmail 邮箱')
const ageRule = z.number({ invalid_type_error: '请输入数字' }).int('必须是整数').positive('必须是正整数')
const tagsRule = z.array(z.string().min(1, '标签不能为空')).min(1, '至少添加 1 个标签')

// 定义 Model
export const UserModel = defineModel('User', {
  name: { defaultValue: '', rule: nameRule },
  email: { defaultValue: '', rule: emailRule },
  age: { defaultValue: null, rule: ageRule, format: v => v === '' ? null : Number(v) },
  tags: { defaultValue: ['vue'], rule: tagsRule }
})
</script>

<script setup>
import { reactive, ref, onMounted, onUnmounted, computed } from 'vue'
const validation = reactive({})
const _user = new UserModel({},{validation});
// 创建实例
const user = reactive(_user);

console.log(user.isDirty);
// 响应式状态
const formData = reactive(user.value)

// 标签操作
const addTag = () => formData.tags.push('')
const removeTag = (index) => formData.tags.splice(index, 1)

// 获取字段错误信息
const getErrors = (v) => {
  const errors = v?.validation;
  if(Array.isArray(errors) && errors.length > 0){
    return errors.map(e => e.message).join('; ')
  }
  return "";
}

// 手动触发校验
const validateAll = async () => {
  await user.validate();
  Object.assign(validation, user.validation)
}

// 重置表单
const resetForm = () => {
  user.reset()
  // 同步响应式状态
  Object.assign(formData, user.value)
  Object.keys(validation).forEach(k => validation[k] = user.validation[k])
}

// 状态样式
const statusClass = computed(() => {
  if (user.isValid === undefined) return 'status-pending'
  return user.isValid ? 'status-valid' : 'status-invalid'
})
</script>

<template>
  <div class="container">
    <h1>Vue3 + iobj 表单验证</h1>

    <div class="status-bar">
      <span :class="['badge', user.isDirty ? 'dirty' : 'clean']">
        {{ user.isDirty ? '已修改' : '未修改' }}
      </span>
      <span :class="['badge', statusClass]">
        {{ user.isValid === undefined ? '待验证' : (user.isValid ? '有效' : '无效') }} 
      </span>
    </div>

    <form @submit.prevent="validateAll">
      <div class="field">
        <label>姓名</label>
        <input v-model="formData.name" placeholder="至少 2 个字符" />
        <div class="errors" v-if="validation.name?.isValid === false">
          <span>{{ getErrors(validation.name) }}</span>
        </div>
      </div>

      <div class="field">
        <label>邮箱</label>
        <input v-model="formData.email" placeholder="必须是 @gmail.com" />
        <div class="errors" v-if="validation.email?.isValid === false">
          <span>{{ getErrors(validation.email) }}</span>
        </div>
      </div>

      <div class="field">
        <label>年龄</label>
        <input v-model="formData.age" type="number" placeholder="正整数" />
        <div class="errors" v-if="validation.age?.isValid === false">
          <span>{{ getErrors(validation.age) }}</span>
        </div>
      </div>

      <div class="field">
        <label>标签</label>
        <div v-for="(tag, index) in formData.tags" :key="index" class="tag-row">
          <input v-model="formData.tags[index]" placeholder="标签名称" />
          <button type="button" class="btn-sm btn-remove" @click="removeTag(index)">×</button>
        </div>
        <button type="button" class="btn-sm" @click="addTag">+ 添加标签</button>
        <div class="errors" v-if="validation.tags?.isValid === false">
           <span>{{ getErrors(validation.tags) }}</span>
        </div>
      </div>

      <div class="actions">
        <button type="submit">全量校验</button>
        <button type="button" class="btn-reset" @click="resetForm">重置</button>
      </div>
    </form>

    <pre class="debug">{{ JSON.stringify({isDirty:user.isDirty,  isValid:user.isValid, formData, validation }, null, 2) }}</pre>
  </div>
</template>

<style scoped>
.container {
  max-width: 480px;
  margin: 2rem auto;
  font-family: system-ui, sans-serif;
}
.status-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
}
.dirty { background: #fef3c7; color: #92400e; }
.clean { background: #d1fae5; color: #065f46; }
.status-pending { background: #e5e7eb; color: #374151; }
.status-valid { background: #d1fae5; color: #065f46; }
.status-invalid { background: #fee2e2; color: #991b1b; }
.field {
  margin-bottom: 1rem;
}
.field label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}
.field input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  box-sizing: border-box;
}
.errors {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}
.errors span {
  display: block;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
button {
  background: #2563eb;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
button:hover {
  background: #1d4ed8;
}
.btn-reset {
  background: #6b7280;
}
.btn-reset:hover {
  background: #4b5563;
}
.tag-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}
.btn-remove {
  background: #ef4444;
}
.btn-remove:hover {
  background: #dc2626;
}
.debug {
  margin-top: 2rem;
  padding: 1rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 0.75rem;
  overflow: auto;
}
</style>

