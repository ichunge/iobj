import arrayProxy from "./.asset/array-proxy.js";
import isDiff, { clone } from "./.asset/is-diff.js";
import { ValidateAdapter } from "./validate.js";
import mitt from 'mitt';
import instanceStateMap from "./instance-map.js";
import Base from "./base.js";

/**
 * 注册验证器适配器
 * @param name 适配器名称
 * @param validate 验证器函数
 */

function checkIsEmpty(value,isArray) {
  if (value === undefined || value === null || value === '') {
    return true;
  } else if (isArray && value.length === 0) {
    return true;
  }
  return false;
}

// FIX: Split set and notify logic
let notifyChange = function() {
  let ths = this;
  const state = instanceStateMap.get(ths);
  if (state.pending) {
    return;
  }
  state.pending = true;
  // 捕获微任务注册时的基准值，用于后续比较
  queueMicrotask(async () => {
    // 先同步更新状态，确保 sync() 后能立即读取
    state.pending = false;
    if(!isDiff(state._value, state.value)) {
      return;
    }
    const isDirty = ths.isDirty;
    const _isDirty = isDiff(state.value, ths.initVal);
    // 如果是数组，创建副本以避免引用相同导致无法检测变化
    state._value = Array.isArray(state.value) ? clone(state.value) : state.value;
    if (isDirty !== _isDirty) {
      ths.isDirty = _isDirty;
      instanceStateMap.get(ths).bus.emit('modifiedChange', _isDirty);
    }
    ths.validate();
  });
};

let set = function (val) {
  let ths = this;
  // 立即同步更新 value，确保 get 能返回最新值
  const state = instanceStateMap.get(ths);
  state.value = ths.format ? ths.format(val) : val;
  // 微任务防抖：批量处理同一事件循环内的多次赋值
  notifyChange.call(ths);
}

class Proto extends Base {
  constructor(value, opts = {}) {
    super();
    let ths = this;
    // 初始化实例状态
    if (value === undefined) {
      value = typeof ths.defaultValue === "function" ? ths.defaultValue() : ths.defaultValue;
    }

    if(opts.isDirty !== undefined) {
      ths.isDirty = opts.isDirty;
    }

    if(opts.isValid !== undefined) {
      ths.isValid = opts.isValid;
    }
    
    if(opts.validation){
      ths.validation =pts.validation;
    }
    
    if (Array.isArray(value)) {
      // FIX: pass notifyChange as callback, bound to ths
      value = arrayProxy(value, notifyChange.bind(ths));
      ths.isArray = true;
    }
    const formatted = ths.format(value);
    // 关键修正：确保存储的是副本，不是 Proxy 引用，避免随 state.value 变化
    // FIX: Deep clone initVal for arrays to support deep diff
    this.initVal = (ths.isArray && Array.isArray(formatted)) ? clone(formatted) : formatted;
    // Also deep clone _value
    const _valueInit = (ths.isArray && Array.isArray(formatted)) ? clone(formatted) : formatted;

    instanceStateMap.set(ths, {
      bus: mitt(),
      pending: false, // 是否正在计算isDirty 和isValid·
      value: formatted,  // 当前值（格式化后）
      _value: _valueInit, // 用于脏检查的缓存值
    });
    const state = instanceStateMap.get(ths);
    Object.defineProperty(ths, "value", {set: set, get: () => state.value, enumerable: true, configurable: true});
    ths.validation = opts.validation || [];
  }
  async validate(skipEmpty = false) {
    let isValid = this.isValid;
    const state = instanceStateMap.get(this);
    if(state.pending) {
      return new Promise(resolve => {
        this.once('validChangeEnd', (isValid) => resolve(isValid));
      });
    }
    if(skipEmpty && checkIsEmpty(this.value, this.isArray)) {
      instanceStateMap.get(this).bus.emit('validChangeEnd', isValid);
      return isValid;
    }
    // 有验证器，默认假设通过，catch 中会改为 false
    isValid = true;
    let isErrorNotSame = false;
    let _validation;
    if (this.validator) {
      await this.validator.validate(this.value)
      .then(()=>{
        _validation = [];
      })
      .catch(e=>{
        // FIX: Handle null/undefined throw
        if (e === null) throw e; 
        console.log('Validation Error:', this.name, e);
        isValid = false;
        // 兼容 Zod 错误 (e.issues) 和普通 Error (转为数组)
        const errors = e.issues || [{ message: e?.message || e }];
        const validation = this.validation;
        isErrorNotSame = validation?.length !== errors.length;
        if(!isErrorNotSame) {
          isErrorNotSame = errors.some((err,idx)=>{
            return err.message !== validation[idx]?.message;
          });
        }
        if(isErrorNotSame) {
          _validation = errors;
        }
      });
    }
    
    if (isValid !== this.isValid || isErrorNotSame) {
      this.validation = _validation;
      this.isValid = isValid;
      instanceStateMap.get(this).bus.emit('validChange', isValid);
    }
    instanceStateMap.get(this).bus.emit('validChangeEnd', isValid);
    return this.isValid;
  }
  format(value) {
    return value;
  }
  reset() {
    this.validation = [];
    const state = instanceStateMap.get(this);
    state.value = this.isArray ? arrayProxy(clone(this.initVal), notifyChange.bind(this)) : this.initVal;
    state._value = this.isArray ? clone(this.initVal) : this.initVal;
    this.isValid = undefined;
    this.isDirty = false;
    return this;
  }
}

/**
 *
 * @param name 字段名
 * @param clsOpt 字段选项, clsOpt
 * @returns 字段对象
 */
export default function defineField(name, clsOpt = {}) {
  if (name && (name.__field__ || name.__model__)) return name;
  let {
    defaultValue,
    value,
    format,
    validator,
    rule,
    isValid,
    readonly,
    validation,
    ...otherOpts
  } = clsOpt;
  class F extends Proto {
    name       = name;
    initValue  = value;
    isValid    = isValid;
    __field__  = true;
  }

  if (typeof validator === 'function') {
    // FIX: Handle boolean return from synchronous validator
    F.prototype.validator = { validate: async (val) => {
      const res = await validator(val);
      if (res === false) throw new Error('Validation failed');
      return res;
    }};
  } else if(validator || rule)  {
    F.prototype.validator = new ValidateAdapter(validator, rule);
  }

  if(format) {
    F.prototype.format = format;
  }

  // FIXED: Set defaultValue on prototype to ensure it's available in Proto constructor
  F.prototype.defaultValue = defaultValue === undefined ? value : defaultValue;

  Object.defineProperty(F, "name", {value: name})
  F._name = name;
  F.__field__ = true;  // 静态属性，供 defineModel 识别已定义的 Field
  Object.assign(F.prototype, otherOpts);
  return F;
}

export function defineFields(fieldsCfg = {}) {
  let fields = [];
  const _defineField = (name, opts) => {
    const realName = name !== undefined ? name : opts.name;
    const f = (opts.__field__ || opts.__model__) ? opts : defineField(realName, opts);
    fields.push(f);
  };
  if (Array.isArray(fieldsCfg)) {
    fieldsCfg.forEach(i => _defineField(undefined,i));
  } else {
    Object.entries(fieldsCfg).forEach(([k, cfg]) => {
      // FIX: Check if cfg is Model class
      let isModel = false;
      if (typeof cfg === 'function' && cfg.prototype) {
         if (cfg.prototype instanceof Base) isModel = true;
      }

      if (!isModel && (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg) || cfg instanceof Date)) {
        cfg = {defaultValue: cfg};
      }
      _defineField(k, cfg);
    });
  }
  return fields;
};