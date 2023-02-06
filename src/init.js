import { initState } from "./state";

export function initMixin(Vue) {
  //初始化操作
  Vue.prototype._init = function (options) {
    //vm.$options： 获取用户的配置
    const vm = this;
    //将用户的选项挂载到实例上
    vm.$options = options;
    //初始化状态
    initState(vm);
  };
}


