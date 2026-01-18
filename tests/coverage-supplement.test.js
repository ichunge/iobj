
import { describe, it, expect, vi } from 'vitest';
import defineField from '../src/field.js';
import defineModel, { Model } from '../src/model.js';
import Base from '../src/base.js';
import { z } from 'zod';

describe('Coverage Supplement - Field', () => {
  it('should handle undefined value falling back to defaultValue', () => {
    // defaultValue as function
    const F1 = defineField('f1', { defaultValue: () => 'func' });
    const f1 = new F1();
    expect(f1.value).toBe('func');

    // defaultValue as value
    const F2 = defineField('f2', { defaultValue: 'val' });
    const f2 = new F2();
    expect(f2.value).toBe('val');

    // no defaultValue, use provided value in defineField
    const F3 = defineField('f3', { value: 'init' });
    const f3 = new F3();
    expect(f3.value).toBe('init');
  });

  it('should handle array value and dirty checking with deep clone', async () => {
    const F = defineField('arr', { defaultValue: [] });
    const f = new F();
    
    // Test arrayProxy
    expect(Array.isArray(f.value)).toBe(true);
    
    f.value.push(1);
    await f.sync();
    expect(f.isDirty).toBe(true);

    f.reset();
    expect(f.isDirty).toBe(false);
    expect(f.value).toEqual([]);
    
    // Deep clone check on reset
    f.value.push(2);
    await f.sync();
    f.reset();
    expect(f.value.length).toBe(0);
  });

  it('should handle validator returning false (legacy style)', async () => {
    const F = defineField('f', {
      defaultValue: '',
      validator: async (v) => {
        if (v === 'bad') return false;
        return true;
      }
    });
    const f = new F();
    f.value = 'bad';
    await expect(f.validate()).resolves.toBe(false);
    expect(f.validation[0].message).toBe('Validation failed');
  });

  it('should handle validator throwing null/undefined', async () => {
    const F = defineField('f', {
      defaultValue: '',
      validator: async () => { throw null; }
    });
    const f = new F();
    await expect(f.validate()).rejects.toBe(null);
  });

  it('should optimize validation when error is same', async () => {
    const spy = vi.fn();
    const F = defineField('f', {
      defaultValue: '',
      validator: async () => { throw 'error'; }
    });
    const f = new F();
    f.on('validChange', spy);

    await f.validate();
    expect(spy).toHaveBeenCalledTimes(1); // undefined -> false

    // Validate again, error message same
    await f.validate();
    expect(spy).toHaveBeenCalledTimes(1); // No new emit
  });
  
  it('should handle skipEmpty with null/undefined/empty array', async () => {
    // null (default)
    const F1 = defineField('f1', { defaultValue: null });
    const f1 = new F1();
    await expect(f1.validate(true)).resolves.toBeUndefined();

    // undefined (default)
    const F2 = defineField('f2', { defaultValue: undefined });
    const f2 = new F2();
    await expect(f2.validate(true)).resolves.toBeUndefined();

    // empty string (default)
    const F3 = defineField('f3', { defaultValue: '' });
    const f3 = new F3();
    await expect(f3.validate(true)).resolves.toBeUndefined();
  });
  
  it('should handle skipEmpty with empty array', async () => {
      const F = defineField('f', { defaultValue: [] });
      const f = new F();
      await expect(f.validate(true)).resolves.toBeUndefined();
      
      f.value.push(1);
      // Not empty now, should validate (and pass/fail based on rule, here pass default)
      await expect(f.validate(true)).resolves.toBe(true);
  });

  it('should handle defineField with existing Field class', () => {
    const F1 = defineField('f1', {});
    const F2 = defineField(F1);
    expect(F2).toBe(F1);
  });
});

describe('Coverage Supplement - Model', () => {
  it('should handle defineModel with no args', () => {
     // Model used as base class maybe? Or just empty definition
     const M = defineModel({});
     const m = new M();
     expect(m.fields).toEqual({});
  });

  it('should handle validation aggregation with empty fields', () => {
    const M = defineModel({});
    const m = new M();
    // No fields -> isValid undefined? Or true? 
    // Code says: if (values.length === 0) return undefined;
    expect(m.isValid).toBeUndefined();
  });

  it('should handle validation aggregation with mixed states', async () => {
      const M = defineModel({
          f1: { validator: async ()=>true },
          f2: { validator: async ()=> { throw 'err'} }, // Fail
          f3: { validator: async ()=>true } // Not validated yet
      });
      const m = new M();
      
      await m.fields.f2.validate();
      // f2 fail, f1/f3 undefined. 
      // some(isArray) -> false (isValid=false)
      expect(m.isValid).toBe(false);
      
      await m.fields.f1.validate();
      // f1 pass, f2 fail, f3 undefined. Still fail.
      expect(m.isValid).toBe(false);
  });

  it('should handle defineFields with array/object mixed', () => {
    const M = defineModel(['a', 'b']);
    const m = new M();
    expect(m.fields.a).toBeDefined();
    expect(m.fields.b).toBeDefined();
  });

  it('should handle defineFields with nested Model', () => {
    const SubM = defineModel({ sub: 'val' });
    console.log('SubM.__model__:', SubM.__model__);
    const M = defineModel({
        child: SubM,
        simple: 's'
    });
    const m = new M();
    console.log('m.fields keys:', Object.keys(m.fields));
    
    expect(m.fields.child.__model__).toBe(true);
    expect(m.fields.child.value.sub).toBeDefined();
    expect(m.fields.simple.value).toBe('s');
  });

  it('should handle defineFields with non-object config (shorthand)', () => {
      const M = defineModel({
          d: new Date(),
          n: null,
          arr: []
      });
      const m = new M();
      expect(m.fields.d.value).toBeInstanceOf(Date);
      expect(m.fields.n.value).toBeNull();
      expect(Array.isArray(m.fields.arr.value)).toBe(true);
  });
  
  it('should handle validate(arg1=boolean)', async () => {
      const M = defineModel({ f: { validator: async ()=>true }});
      const m = new M();
      const spy = vi.spyOn(m.fields.f, 'validate');
      
      // validate(true) -> skipEmpty=true
      m.fields.f.value = '';
      await m.validate(true);
      expect(spy).toHaveBeenCalledWith(true);
  });
  
  it('should handle validate(options={force:true})', async () => {
      const M = defineModel({ f: { validator: async ()=>true }});
      const m = new M();
      const spy = vi.spyOn(m.fields.f, 'validate');
      
      await m.validate(); // first run
      expect(spy).toHaveBeenCalledTimes(1);
      
      // second run, valid result exists. 
      // Force=true should trigger again
      await m.validate({ force: true });
      expect(spy).toHaveBeenCalledTimes(2);
      
      // Force=false (default), should skip if valid?
      // Wait, code says: if (force || field.isValid === undefined || fieldState.pending)
      // So if isValid is true, it skips.
      await m.validate();
      expect(spy).toHaveBeenCalledTimes(2); // Should not increase
  });

  it('should handle fieldValidChangeHandler edge cases', async () => {
    const M = defineModel({ f: { validator: async ()=> { throw 'err' } } });
    const m = new M();
    
    // Simulate direct call to handler or via event to test "isValid === false ? f.validation : isValid" logic
    // Actually we can just test normal flow where validation is array
    await m.validate();
    expect(m.validation.f.errors).toEqual(m.fields.f.validation);
    expect(Array.isArray(m.validation.f.errors)).toBe(true);
  });
  
  it('should handle fieldModifiedChangeHandler when isDirty does not change', async () => {
      const M = defineModel({ f1: 'a', f2: 'b' });
      const m = new M();
      const spy = vi.fn();
      m.on('modifiedChange', spy);
      
      // f1 dirty -> model dirty (true) -> emit
      m.fields.f1.value = 'changed';
      await m.sync();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(true);
      // expect(spy.mock.calls[0][1]).toBe(m);
      spy.mockClear();
      
      // f2 dirty -> model still dirty (true) -> NO emit
      m.fields.f2.value = 'changed';
      await m.sync();
      expect(spy).not.toHaveBeenCalled();
      
      // f1 clean -> model still dirty (due to f2) -> NO emit
      m.fields.f1.value = 'a';
      await m.sync();
      expect(spy).not.toHaveBeenCalled();
      
      // f2 clean -> model clean (false) -> emit
      m.fields.f2.value = 'b';
      await m.sync();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(false);
      // expect(spy.mock.calls[0][1]).toBe(m);
  });
});
