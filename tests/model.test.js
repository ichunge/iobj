
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import defineModel from '../src/model.js';
import defineField from '../src/field.js';

describe('Model Functionality', () => {
  it('should define model using object shorthands', () => {
    const M = defineModel({
      name: 'defaultName',
      age: 0
    });
    const m = new M();
    expect(m.value.name).toBe('defaultName');
    expect(m.value.age).toBe(0);
    expect(m.fields.name).toBeDefined();
    expect(m.fields.age).toBeDefined();
  });

  it('should define model using array of fields', () => {
    const NameField = defineField('name', { defaultValue: 'N' });
    const AgeField = defineField('age', { defaultValue: 1 });
    const M = defineModel([NameField, AgeField]);
    const m = new M();
    expect(m.value.name).toBe('N');
    expect(m.value.age).toBe(1);
  });

  it('should aggregate isModified state', async () => {
    const M = defineModel({
      f1: 'a',
      f2: 'b'
    });
    const m = new M();
    expect(m.isDirty).toBe(false);

    m.value.f1 = 'changed';
    await m.sync();
    expect(m.isDirty).toBe(true);
    expect(m.modified.f1).toBe(true);
    expect(m.modified.f2).toBe(false);

    m.value.f1 = 'a';
    await m.sync();
    expect(m.isDirty).toBe(false);
  });

  it('should aggregate isValid state correctly (All Valid)', async () => {
    const M = defineModel({
      f1: { validator: async ()=>true, defaultValue: 'a' },
      f2: { validator: async ()=>true, defaultValue: 'b' }
    });
    const m = new M();
    // Initial: undefined
    expect(m.isValid).toBeUndefined();
    await m.validate();
    await m.sync();
    expect(m.isValid).toBe(true);
  });

  it('should aggregate isValid state correctly (One Invalid)', async () => {
    const M = defineModel({
      f1: { validator: async ()=>true, defaultValue: 'a' },
      f2: { validator: async ()=> { throw 'err'}, defaultValue: 'b' }
    });
    const m = new M();

    await m.validate();
    await m.sync();
    expect(m.isValid).toBe(false);
  });

  it('should aggregate isValid state correctly (Mixed Undefined/True)', async () => {
    const M = defineModel({
      f1: { validator: async ()=>true, defaultValue: 'a' },
      f2: { validator: async ()=>true, defaultValue: 'b' }
    });
    const m = new M();

    // Validate only f1
    await m.fields.f1.validate();

    expect(m.validation.f1.isValid).toBe(true);
    expect(m.validation.f2.isValid).toBeUndefined();

    // Mixed true/undefined -> undefined (incomplete validation)
    expect(m.isValid).toBeUndefined();
  });

  it('should support $resetModified', async () => {
    const M = defineModel({ f1: 'a' });
    const m = new M();
    m.value.f1 = 'changed';
    await m.sync();
    expect(m.isDirty).toBe(true);

    m.reset();
    await m.sync();
    expect(m.isDirty).toBe(false);
    expect(m.modified.f1).toBe(false);
  });

  it('should support set() method', () => {
    const M = defineModel({ f1: 'a' });
    const m = new M();
    m.set('f1', 'b');
    expect(m.value.f1).toBe('b');
  });

  it('should initialize with data correctly', () => {
    const M = defineModel({ f1: 'a' });
    const m = new M({ f1: 'b' });
    expect(m.value.f1).toBe('b');
    // Initial data shouldn't be dirty
    expect(m.fields.f1.isDirty).toBe(false);
    expect(m.isDirty).toBe(false);
  });
});

describe('Model with Zod Validation', () => {
  it('should validate all fields with zod rules', async () => {
    const M = defineModel({
      email: { defaultValue: '', rule: z.string().email() },
      age: { defaultValue: 0, rule: z.number().min(18) }
    });
    const m = new M();

    // Both fields invalid
    await m.validate();
    expect(m.isValid).toBe(false);

    // Fix email only
    m.value.email = 'test@example.com';
    await m.validate();
    expect(m.isValid).toBe(false);

    // Fix age as well
    m.value.age = 20;
    await m.validate();
    expect(m.isValid).toBe(true);
  });

  it('should track validation state per field with zod', async () => {
    const M = defineModel({
      name: { defaultValue: '', rule: z.string().min(2) },
      phone: { defaultValue: '', rule: z.string().regex(/^\d{10,11}$/) }
    });
    const m = new M();

    m.value.name = 'John';
    m.value.phone = '123'; // Invalid phone

    await m.validate();

    expect(m.validation.name.isValid).toBe(true);
    expect(Array.isArray(m.validation.phone.validation)).toBe(true);
    expect(m.validation.phone.isValid).toBe(false);
    expect(m.isValid).toBe(false);
  });

  it('should mix zod fields with custom validator fields', async () => {
    const M = defineModel({
      username: { defaultValue: '', rule: z.string().min(3) },
      password: {
        defaultValue: '',
        validator: async (v) => {
          if (v.length < 6) throw new Error('Password min 6 chars');
        }
      }
    });
    const m = new M();

    m.value.username = 'ab';  // Fails zod min(3)
    m.value.password = '123'; // Fails custom validator

    await m.validate();
    expect(m.isValid).toBe(false);
    expect(Array.isArray(m.validation.username.validation)).toBe(true);
    expect(Array.isArray(m.validation.password.validation)).toBe(true);
    expect(m.validation.username.isValid).toBe(false);
    expect(m.validation.password.isValid).toBe(false);

    m.value.username = 'john';
    m.value.password = '123456';
    await m.validate();
    expect(m.isValid).toBe(true);
  });

  it('should validate with complex zod object schema on field', async () => {
    const addressSchema = z.object({
      city: z.string().min(1),
      zip: z.string().regex(/^\d{5,6}$/)
    });

    const AddressField = defineField('address', {
      defaultValue: { city: '', zip: '' },
      rule: addressSchema
    });
    const M = defineModel([AddressField]);
    const m = new M();

    await m.validate();
    expect(m.isValid).toBe(false);

    m.value.address = { city: 'Beijing', zip: '100000' };
    await m.validate();
    expect(m.isValid).toBe(true);
  });

  it('should support zod optional fields', async () => {
    const M = defineModel({
      nickname: { defaultValue: undefined, rule: z.string().optional() }
    });
    const m = new M();

    await m.validate();
    expect(m.isValid).toBe(true);

    m.value.nickname = 'test';
    await m.validate();
    expect(m.isValid).toBe(true);
  });

  it('should validate with zod array schema', async () => {
    const M = defineModel({
      tags: { defaultValue: [], rule: z.array(z.string()).min(1) }
    });
    const m = new M();

    // Empty array fails min(1)
    await m.validate();
    expect(m.isValid).toBe(false);

    m.value.tags = ['vue', 'react'];
    await m.validate();
    expect(m.isValid).toBe(true);
  });

  it('should validate model with multiple chained zod rules per field', async () => {
    const M = defineModel({
      username: {
        defaultValue: '',
        rule: z.string()
          .min(3, 'Username min 3 chars')
          .max(16, 'Username max 16 chars')
          .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Must start with letter, only alphanumeric and underscore')
      },
      email: {
        defaultValue: '',
        rule: z.string()
          .email('Invalid email')
          .min(5, 'Email too short')
          .max(100, 'Email too long')
      },
      password: {
        defaultValue: '',
        rule: z.string()
          .min(8, 'Password min 8 chars')
          .max(32, 'Password max 32 chars')
          .regex(/[A-Z]/, 'Must contain uppercase')
          .regex(/[a-z]/, 'Must contain lowercase')
          .regex(/[0-9]/, 'Must contain digit')
          .regex(/[!@#$%^&*]/, 'Must contain special character')
      }
    });
    const m = new M();

    // All invalid initially
    await m.validate();
    expect(m.isValid).toBe(false);
    expect(Array.isArray(m.validation.username.validation)).toBe(true);
    expect(Array.isArray(m.validation.email.validation)).toBe(true);
    expect(Array.isArray(m.validation.password.validation)).toBe(true);

    // Fix username: starts with digit - fails
    m.value.username = '1user';
    await m.validate();
    expect(Array.isArray(m.validation.username.validation)).toBe(true);

    // Fix username correctly
    m.value.username = 'john_doe';
    await m.validate();
    expect(m.validation.username.isValid).toBe(true);

    // Email: missing @ - fails
    m.value.email = 'invalidemail';
    await m.validate();
    expect(Array.isArray(m.validation.email.validation)).toBe(true);

    // Fix email
    m.value.email = 'john@example.com';
    await m.validate();
    expect(m.validation.email.isValid).toBe(true);

    // Password: missing special char
    m.value.password = 'Abcdefg1';
    await m.validate();
    expect(Array.isArray(m.validation.password.validation)).toBe(true);

    // Fix password
    m.value.password = 'Abcdefg1!';
    await m.validate();
    expect(m.validation.password.isValid).toBe(true);
    expect(m.isValid).toBe(true);
  });

  it('should validate with zod intersection (and) of multiple schemas', async () => {
    const baseSchema = z.object({ id: z.string().uuid() });
    const timestampSchema = z.object({ createdAt: z.string().datetime() });
    const combinedSchema = z.intersection(baseSchema, timestampSchema);

    const M = defineModel({
      record: {
        defaultValue: { id: '', createdAt: '' },
        rule: combinedSchema
      }
    });
    const m = new M();

    // Invalid id and timestamp
    await m.validate();
    expect(m.isValid).toBe(false);

    // Valid UUID but invalid timestamp
    m.value.record = { id: '550e8400-e29b-41d4-a716-446655440000', createdAt: 'not-a-date' };
    await m.validate();
    expect(m.isValid).toBe(false);

    // Both valid
    m.value.record = { id: '550e8400-e29b-41d4-a716-446655440000', createdAt: '2024-01-01T00:00:00Z' };
    await m.validate();
    expect(m.isValid).toBe(true);
  });

  it('should validate with zod union (or) of multiple schemas', async () => {
    const phoneOrEmail = z.union([
      z.string().email(),
      z.string().regex(/^\d{10,11}$/)
    ]);

    const M = defineModel({
      contact: { defaultValue: '', rule: phoneOrEmail }
    });
    const m = new M();

    // Neither email nor phone
    m.value.contact = 'abc';
    await m.validate();
    expect(m.isValid).toBe(false);

    // Valid email
    m.value.contact = 'test@example.com';
    await m.validate();
    expect(m.isValid).toBe(true);

    // Valid phone
    m.value.contact = '13812345678';
    await m.validate();
    expect(m.isValid).toBe(true);
  });
});

describe('Model Synchronization and Aggregation', () => {
  // 1. 数据双向绑定
  it('should synchronize value between model.value and model.fields', () => {
    const M = defineModel({
      prop: { defaultValue: 'initial' }
    });
    const m = new M();

    // Model -> Field
    m.value.prop = 'updated_via_model';
    expect(m.fields.prop.value).toBe('updated_via_model');

    // Field -> Model
    m.fields.prop.value = 'updated_via_field';
    expect(m.value.prop).toBe('updated_via_field');
  });

  // 2. Dirty 状态聚合
  it('should synchronize dirty state and aggregate isModified', async () => {
    const M = defineModel({
      f1: 'orig1',
      f2: 'orig2'
    });
    const m = new M();

    expect(m.isDirty).toBe(false);
    expect(m.modified.f1).toBe(false);

    // Modify via field
    m.fields.f1.value = 'changed';

    // Check field dirty
    await m.sync();
    expect(m.fields.f1.isDirty).toBe(true);

    // Check model sync
    expect(m.modified.f1).toBe(true);
    expect(m.isDirty).toBe(true);

    // Restore via field
    m.fields.f1.value = 'orig1';
    await m.sync();
    expect(m.fields.f1.isDirty).toBe(false);
    expect(m.modified.f1).toBe(false);
    expect(m.isDirty).toBe(false);
  });

  // 3. 验证状态一致性
  it('should synchronize validation state and aggregate isValid', async () => {
    const M = defineModel({
      f1: { defaultValue: '', rule: z.string().min(3) },
      f2: { defaultValue: '', rule: z.string().min(3) }
    });
    const m = new M();

    // Initial state
    expect(m.isValid).toBeUndefined();
    expect(m.validation.f1.isValid).toBeUndefined();

    // Validate single field (invalid)
    m.fields.f1.value = 'a';
    await m.fields.f1.validate();

    // Check sync
    expect(m.fields.f1.isValid).toBe(false);
    expect(Array.isArray(m.validation.f1.validation)).toBe(true);
    expect(m.validation.f1.isValid).toBe(false);

    // Check aggregation (one invalid -> model invalid)
    expect(m.isValid).toBe(false);

    // Make f1 valid
    m.fields.f1.value = 'abc';
    await m.fields.f1.validate();

    expect(m.fields.f1.isValid).toBe(true);
    expect(m.validation.f1.isValid).toBe(true);

    // f2 is still undefined, so model.isValid should be undefined (mixed valid/undefined)
    expect(m.isValid).toBeUndefined();

    // Validate f2 (valid)
    m.fields.f2.value = 'def';
    await m.fields.f2.validate();

    expect(m.validation.f2.isValid).toBe(true);
    expect(m.isValid).toBe(true);
  });
});

describe('Model Reset Functionality', () => {
  it('should reset modified state via $resetModified', async () => {
    const M = defineModel({
      f1: 'a',
      f2: 'b'
    });
    const m = new M();

    m.value.f1 = 'changed1';
    m.value.f2 = 'changed2';
    await m.sync();

    expect(m.isDirty).toBe(true);
    expect(m.modified.f1).toBe(true);
    expect(m.modified.f2).toBe(true);

    m.reset();

    expect(m.isDirty).toBe(false);
    expect(m.modified.f1).toBe(false);
    expect(m.modified.f2).toBe(false);
  });

  it('should reset all field values to initial values', async () => {
    const M = defineModel({
      f1: 'init1',
      f2: 'init2'
    });
    const m = new M();

    m.value.f1 = 'changed1';
    m.value.f2 = 'changed2';
    await m.sync();

    m.reset();

    expect(m.value.f1).toBe('init1');
    expect(m.value.f2).toBe('init2');
    expect(m.fields.f1.value).toBe('init1');
    expect(m.fields.f2.value).toBe('init2');
  });

  it('should reset validation state to undefined', async () => {
    const M = defineModel({
      f1: { defaultValue: '', rule: z.string().min(3) },
      f2: { defaultValue: '', rule: z.string().min(3) }
    });
    const m = new M();

    m.value.f1 = 'a';
    m.value.f2 = 'b';
    await m.validate();

    expect(m.isValid).toBe(false);
    expect(Array.isArray(m.validation.f1.validation)).toBe(true);
    expect(Array.isArray(m.validation.f2.validation)).toBe(true);

    m.reset();

    expect(m.isValid).toBeUndefined();
    expect(m.validation.f1).toBeUndefined();
    expect(m.validation.f2).toBeUndefined();
    expect(m.fields.f1.isValid).toBeUndefined();
    expect(m.fields.f2.isValid).toBeUndefined();
  });

  it('should return this for chaining', () => {
    const M = defineModel({ f1: 'a' });
    const m = new M();
    expect(m.reset()).toBe(m);
  });

  it('should reset model initialized with custom data to init values', async () => {
    const M = defineModel({
      f1: 'default1',
      f2: 'default2'
    });
    const m = new M({ f1: 'custom1', f2: 'custom2' });

    expect(m.value.f1).toBe('custom1');
    m.value.f1 = 'changed';
    await m.sync();
    expect(m.isDirty).toBe(true);

    m.reset();

    // reset 恢复到实例化时的初始值（initVal），即传入构造函数的值
    expect(m.value.f1).toBe('custom1');
    expect(m.value.f2).toBe('custom2');
    expect(m.isDirty).toBe(false);
  });
});

describe('Model Validation Errors Synchronization', () => {
  it('should sync validation errors from fields to model.validation', async () => {
    const M = defineModel({
      email: { defaultValue: 'invalid', rule: z.string().email('Invalid email') },
      age: { defaultValue: -1, rule: z.number().min(0, 'Age must be positive') }
    });
    const m = new M();

    await m.validate();

    expect(m.isValid).toBe(false);

    // 检查 validation 结构：失败时为错误数组
    expect(m.validation.email).toBeDefined();
    expect(Array.isArray(m.validation.email.validation)).toBe(true);
    expect(m.validation.email.validation.length).toBeGreaterThan(0);
    expect(m.validation.email.isValid).toBe(false);

    expect(m.validation.age).toBeDefined();
    expect(Array.isArray(m.validation.age.validation)).toBe(true);
  });

  it('should update model.validation when field validation changes', async () => {
    const M = defineModel({
      name: { defaultValue: '', rule: z.string().min(2) }
    });
    const m = new M();

    // 初始验证失败
    m.value.name = 'a';
    await m.fields.name.validate();

    expect(Array.isArray(m.validation.name.validation)).toBe(true);
    expect(m.validation.name.validation.length).toBeGreaterThan(0);
    expect(m.validation.name.isValid).toBe(false);

    // 修正后验证通过
    m.value.name = 'abc';
    await m.fields.name.validate();

    expect(m.validation.name.isValid).toBe(true);
  });

  it('should reflect field validation errors in model.validation structure', async () => {
    const M = defineModel({
      password: {
        defaultValue: '',
        rule: z.string()
          .min(8, 'At least 8 characters')
          .regex(/[A-Z]/, 'Must contain uppercase')
      }
    });
    const m = new M();

    m.value.password = 'short';
    await m.validate();

    expect(Array.isArray(m.validation.password.validation)).toBe(true);
    // Zod 只返回第一个失败的错误
    expect(m.validation.password.validation[0].message).toBe('At least 8 characters');
    expect(m.fields.password.validation[0].message).toBe('At least 8 characters');
  });
});
