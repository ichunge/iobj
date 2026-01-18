import instanceStateMap from "./instance-map.js";
import mitt from "mitt";
export default class Base {
  isDirty = false;
  isValid = undefined;
  sync(){
    let ths = this;
    return new Promise(resolve => queueMicrotask(() => resolve(ths)));
  }
  on(event, listener) {
    let ths = instanceStateMap.get(this);
    // if(!ths.bus){
    //   ths.bus = mitt()
    // }
    ths.bus.on(event, listener);
    return () => ths.bus.off(event, listener);
  }
  once(event, listener) {
    const off = this.on(event, (...args) => {
      listener(...args);
      off();
    });
    return off;
  }
}
