import { mergeOptions } from "./utils";

export function initGlobalAPI(Vue) {
  //静态方法
  Vue.options = {
    _base: Vue
  };
  Vue.mixin = function (mixin) {
    //将用户的选项和全局上的options进行合并
    this.options = mergeOptions(this.options, mixin);
    return this;
  };
  //手动创造组件进行挂载
  Vue.extend = function (options) {
    //根据用户参数返回一个构造函数
    function Sub(options = {}) {
      //最后使用一个组件 就是new一个实例
      this._init(options); //默认对子类进行初始化操作
    }
    Sub.prototype = Object.create(Vue.prototype); //Sub.prototype.__proto__ === Vue.prototype
    Sub.prototype.constructor = Sub;
    //希望将用户传递的参数和全局的vue.options合并
    Sub.options = mergeOptions(Vue.options, options); //保存用户传递的选项
    return Sub;
  };
  Vue.options.components = {};
  //维护在这个对象中
  Vue.component = function (id, definition) {
    //如果definition已经是函数 说明用户自己调用了Vue.extend
    definition =
      typeof definition === "function" ? definition : Vue.extend(definition);

    Vue.options.components[id] = definition;
    console.log("nnn", Vue.options.components);
  };
}
