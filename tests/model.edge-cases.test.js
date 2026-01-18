
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import defineModel from '../src/model.js';
import defineField from '../src/field.js';

describe('Model Edge Cases', () => {
  describe('Empty and Invalid Inputs', () => {
    it('should handle empty fields configuration', () => {
      const M = defineModel({});
      const m = new M();
      expect(m.fields).toEqual({});
      expect(m.value).toEqual({});
      expect(m.isDirty).toBe(false);
      expect(m.isValid).toBeUndefined();
    });

    it('should handle model with no fields', async () => {
      const M = defineModel({});
      const m = new M();
      await expect(m.validate()).resolves.toBeUndefined();
    });

    it('should handle null/undefined field values', () => {
      const M = defineModel({
        name: null,
        age: undefined,
        email: ''
      });
      const m = new M();
      expect(m.value.name).toBeNull();
      expect(m.value.age).toBeUndefined();
      expect(m.value.email).toBe('');
    });

    it('should handle Date objects as defaultValue', () => {
      const date = new Date();
      const M = defineModel({
        createdAt: date
      });
      const m = new M();
      expect(m.value.createdAt).toBeInstanceOf(Date);
      expect(m.value.createdAt.getTime()).toBe(date.getTime());
    });

    it('should handle Array as defaultValue', () => {
      const M = defineModel({
        tags: []
      });
      const m = new M();
      expect(Array.isArray(m.value.tags)).toBe(true);
      expect(m.value.tags.length).toBe(0);
    });
  });

  describe('Field Name Edge Cases', () => {
    it('should handle field names with special characters', () => {
      const M = defineModel({
        'field-name': 'value',
        'field_name': 'value',
        'field.name': 'value',
        '123field': 'value'
      });
      const m = new M();
      expect(m.value['field-name']).toBe('value');
      expect(m.value['field_name']).toBe('value');
      expect(m.value['field.name']).toBe('value');
      expect(m.value['123field']).toBe('value');
    });

    it('should handle empty string as field name', () => {
      const M = defineModel({
        '': 'empty'
      });
      const m = new M();
      expect(m.value['']).toBe('empty');
    });
  });

  describe('Validation Edge Cases', () => {
    it('should handle validator that throws non-Error objects', async () => {
      const M = defineModel({
        f1: {
          defaultValue: '',
          validator: async () => { throw 'string error'; }
        }
      });
      const m = new M();
      await m.validate();
      expect(m.isValid).toBe(false);
      expect(Array.isArray(m.validation.f1.errors)).toBe(true);
    });

    it('should handle validator that throws null', async () => {
      const M = defineModel({
        f1: {
          defaultValue: '',
          validator: async () => { throw null; }
        }
      });
      const m = new M();
      await expect(m.validate()).rejects.toBeNull();
    });

    it('should handle validator that returns Promise.reject', async () => {
      const M = defineModel({
        f1: {
          defaultValue: '',
          validator: async () => Promise.reject(new Error('rejected'))
        }
      });
      const m = new M();
      await m.validate();
      expect(m.isValid).toBe(false);
    });

    it('should handle synchronous validator function', async () => {
      const M = defineModel({
        f1: {
          defaultValue: '',
          validator: (val) => val.length > 3
        }
      });
      const m = new M();
      m.value.f1 = 'ab';
      await m.validate();
      expect(m.isValid).toBe(false);

      m.value.f1 = 'abcd';
      await m.validate();
      expect(m.isValid).toBe(true);
    });

    it('should handle validator that returns false', async () => {
      const M = defineModel({
        f1: {
          defaultValue: '',
          validator: async () => false
        }
      });
      const m = new M();
      await m.validate();
      expect(m.isValid).toBe(false);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent validate calls', async () => {
      const M = defineModel({
        f1: { defaultValue: '', validator: async () => true },
        f2: { defaultValue: '', validator: async () => true }
      });
      const m = new M();

      // 并发调用 validate
      const promises = [
        m.validate(),
        m.validate(),
        m.validate()
      ];

      const results = await Promise.all(promises);
      // 所有结果应该一致
      expect(results.every(r => r === results[0])).toBe(true);
    });

    it('should handle rapid value changes', async () => {
      const M = defineModel({
        f1: { defaultValue: 'a' }
      });
      const m = new M();

      // 快速连续修改
      m.value.f1 = 'b';
      m.value.f1 = 'c';
      m.value.f1 = 'd';

      await m.sync();
      expect(m.value.f1).toBe('d');
      expect(m.isDirty).toBe(true);
    });
  });

  describe('Reset Edge Cases', () => {
    it('should handle reset on empty model', () => {
      const M = defineModel({});
      const m = new M();
      expect(() => m.reset()).not.toThrow();
      expect(m.isDirty).toBe(false);
    });

    it('should handle reset after multiple modifications', async () => {
      const M = defineModel({
        f1: 'a',
        f2: 'b',
        f3: 'c'
      });
      const m = new M();

      m.value.f1 = 'x';
      m.value.f2 = 'y';
      m.value.f3 = 'z';
      await m.sync();

      m.reset();
      await m.sync();

      expect(m.value.f1).toBe('a');
      expect(m.value.f2).toBe('b');
      expect(m.value.f3).toBe('c');
      expect(m.isDirty).toBe(false);
    });
  });

  describe('Event Edge Cases', () => {
    it('should update state BEFORE emitting event', async () => {
      const M = defineModel({ f1: 'a' });
      const m = new M();

      let dirtyStateInListener = null;
      m.on('modifiedChange', () => {
        // 关键验证：在事件触发的那一刻，isDirty 状态必须已经更新完毕
        dirtyStateInListener = m.isDirty;
        // 如果这里抛错，会产生 Unhandled Rejection，干扰测试运行
        // 我们通过检查状态的时序来间接证明代码的健壮性
      });

      m.value.f1 = 'b';
      await m.sync();

      expect(dirtyStateInListener).toBe(true);
      expect(m.isDirty).toBe(true);
    });

    it('should handle multiple event listeners', async () => {
      const M = defineModel({ f1: 'a' });
      const m = new M();

      const calls = [];
      m.on('modifiedChange', (isDirty) => calls.push(`listener1:${isDirty}`));
      m.on('modifiedChange', (isDirty) => calls.push(`listener2:${isDirty}`));

      m.value.f1 = 'b';
      await m.sync();

      expect(calls.length).toBe(2);
      expect(calls).toContain('listener1:true');
      expect(calls).toContain('listener2:true');
    });

    it('should handle event listener removal', async () => {
      const M = defineModel({ f1: 'a' });
      const m = new M();

      const calls = [];
      const off = m.on('modifiedChange', (isDirty) => calls.push(isDirty));

      m.value.f1 = 'b';
      await m.sync();
      expect(calls.length).toBe(1);

      off();
      m.value.f1 = 'c';
      await m.sync();
      expect(calls.length).toBe(1); // 不应该再调用
    });
  });

  describe('Zod Validation Edge Cases', () => {
    it('should handle zod schema with transform', async () => {
      const M = defineModel({
        code: {
          defaultValue: 'abc',
          rule: z.string().transform(val => val.toUpperCase())
        }
      });
      const m = new M();

      // transform 不应该影响验证结果
      await m.validate();
      expect(m.isValid).toBe(true);
    });

    it('should handle zod schema with default', async () => {
      const M = defineModel({
        optional: {
          defaultValue: undefined,
          rule: z.string().optional().default('default')
        }
      });
      const m = new M();

      await m.validate();
      expect(m.isValid).toBe(true);
    });

    it('should handle zod schema with nullable', async () => {
      const M = defineModel({
        nullable: {
          defaultValue: null,
          rule: z.string().nullable()
        }
      });
      const m = new M();

      await m.validate();
      expect(m.isValid).toBe(true);
    });
  });

  describe('Array Field Edge Cases', () => {
    it('should handle empty array modifications', async () => {
      const M = defineModel({
        tags: []
      });
      const m = new M();

      m.value.tags.push('tag1');
      await m.sync();
      expect(m.isDirty).toBe(true);

      m.value.tags.pop();
      await m.sync();
      expect(m.isDirty).toBe(false);
    });

    it('should handle array with complex objects', async () => {
      const M = defineModel({
        items: [{
          id: 1,
          name: 'item1'
        }]
      });
      const m = new M();

      m.value.items[0].name = 'changed';
      await m.sync();
      expect(m.isDirty).toBe(true);
    });
  });

  describe('Nested Model Edge Cases', () => {
    it('should handle field that is already a Field instance', () => {
      const NameField = defineField('name', { defaultValue: 'John' });
      const M = defineModel([NameField]);
      const m = new M();

      expect(m.value.name).toBe('John');
      expect(m.fields.name).toBeInstanceOf(NameField);
    });

    it('should handle field that is already a Model instance', () => {
      const SubModel = defineModel({
        subField: 'value'
      });
      const M = defineModel({
        nested: SubModel
      });
      const m = new M();

      // 应该正确处理嵌套模型
      expect(m.fields.nested).toBeDefined();
    });
  });

  describe('Options Edge Cases', () => {
    it('should handle model initialization with custom validation state', () => {
      const M = defineModel({
        f1: { defaultValue: '', rule: z.string().min(3) }
      });
      const m = new M({}, {
        validation: { f1: { isValid: true, errors: [] } },
        modified: { f1: false }
      });

      expect(m.validation.f1.isValid).toBe(true);
      expect(m.modified.f1).toBe(false);
    });

    it('should handle model initialization with partial options', () => {
      const M = defineModel({
        f1: 'a'
      });
      const m = new M({}, {
        validation: {}
      });

      expect(m.validation.f1.isValid).toBeUndefined();
      expect(m.validation.f1.errors).toEqual([]);
      expect(m.modified).toEqual({"f1": false});
    });
  });
});

