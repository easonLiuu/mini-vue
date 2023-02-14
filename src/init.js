import { compileToFunction } from "./compiler";
import { callHook, mountComponent } from "./lifecycle";
import { initState } from "./state";
import { mergeOptions } from "./utils";

export function initMixin(Vue) {
  //初始化操作
  Vue.prototype._init = function (options) {
    //vm.$options： 获取用户的配置
    const vm = this;
    //将用户的选项挂载到实例上
    //将用户传的和全局配的的进行合并
    //定义的全局指令过滤器等 都会挂载到实例上
    vm.$options = mergeOptions(this.constructor.options, options);
    callHook(vm, 'beforeCreate');
    //初始化状态 初始化计算属性 watch
    initState(vm);
    callHook(vm, 'created');
    if (options.el) {
      //实现数据的挂载
      vm.$mount(options.el);
    }
  };

  Vue.prototype.$mount = function (el) {
    const vm = this;
    el = document.querySelector(el);
    let ops = vm.$options;
    if (!ops.render) {
      //先进行查找有没有render函数
      let template; //没有查找是否写了template
      if (!ops.template && el) {
        template = el.outerHTML;
        //没有写模版 写了el
      } else {
        if (el) {
          template = ops.template; //如果有el 采用模版的内容
        }
      }
      //写了template就用写了的template
      if (template) {
        //对模版编译
        const render = compileToFunction(template);
        ops.render = render;
      }
    }
    console.log(ops.render); //最终获取render方法
    //组件的挂载
    mountComponent(vm, el);

    //script标签引用的vue.global.js 编译是浏览器运行的
    //runtime运行时 不包含模版编译 整个编译是打包时候通过loader来转义.vue文件 用runtime不能使用template
  };
}
