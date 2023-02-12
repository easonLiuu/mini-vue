import { mergeOptions } from "./utils";


export function initGlobalAPI(Vue) {
  //静态方法
  Vue.options = {};
  Vue.mixin = function (mixin) {
    //将用户的选项和全局上的options进行合并
    this.options = mergeOptions(this.options, mixin);
    return this;
  };
}
