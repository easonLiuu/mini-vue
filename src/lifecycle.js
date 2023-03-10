import Watcher from "./observe/watcher";
import { createElementVNode, createTextVNode } from "./vdom";
import { patch } from "./vdom/patch";

export function initLifeCycle(Vue) {
  //虚拟dom变成真实dom
  Vue.prototype._update = function (vnode) {
    const vm = this;
    const el = vm.$el;
    const prevVNode = vm._vnode;
    vm._vnode = vnode; //把组件第一次产生的虚拟节点保存到_vnode上
    if (prevVNode) {
      //之前渲染过了
      vm.$el = patch(prevVNode, vnode);
    } else {
      vm.$el = patch(el, vnode);
    }
    //patch既有初始化的功能 又有更新的功能
  };
  //_c('div',{},...children)
  Vue.prototype._c = function () {
    return createElementVNode(this, ...arguments);
  };
  //_v(text)
  Vue.prototype._v = function () {
    return createTextVNode(this, ...arguments);
  };
  Vue.prototype._s = function (value) {
    console.log(value);
    if (typeof value !== "object") return value;
    return JSON.stringify(value);
  };
  Vue.prototype._render = function () {
    //渲染时会去实例中取值 属性和试图绑在一起
    const vm = this;
    //让with中的this指向vm
    return vm.$options.render.call(vm);
  };
}

export function mountComponent(vm, el) {
  //这里的el是通过querySelector处理过的
  vm.$el = el;
  //1.调用render 产生虚拟DOM
  const updateComponent = () => {
    vm._update(vm._render());
  };
  const watcher = new Watcher(vm, updateComponent, true); //true用于标识是一个渲染Watcher
  console.log(watcher);

  //vm.$options.render()  虚拟节点

  //2.根据虚拟DOM产生真实DOM

  //3.插入到el元素中
}

//核心流程 1.创造响应式数据 2.模版转换成ast语法树 3.ast语法树转换成render函数 4.后续每次数据更新可以只执行render函数 无需再次执行ast转换的过程
//5.render函数会产生虚拟节点 使用响应式数据
//根据生成的虚拟节点创建真实DOM
export function callHook(vm, hook) {
  //调用钩子函数
  const handlers = vm.$options[hook];
  if (handlers) {
    handlers.forEach((handler) => handler.call(vm));
  }
}
