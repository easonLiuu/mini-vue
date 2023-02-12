import Watcher from "./observe/watcher";
import { createElementVNode, createTextVNode } from "./vdom";

function createElm(vnode) {
  let { tag, data, children, text } = vnode;
  if (typeof tag === "string") {
    vnode.el = document.createElement(tag); //这里将真实节点和虚拟节点对应起来 后面如果修改属性了 可以直接找到虚拟节点对应的真实节点
    //更新属性
    patchProps(vnode.el, data);
    children.forEach((child) => {
      vnode.el.appendChild(createElm(child));
    });
  } else {
    vnode.el = document.createTextNode(text);
  }
  return vnode.el;
}

function patchProps(el, props) {
  for (let key in props) {
    if (key === "style") {
      //style{color: 'red'}
      for (let styleName in props.style) {
        el.style[styleName] = props.style[styleName];
      }
    } else {
      el.setAttribute(key, props[key]);
    }
  }
}

function patch(oldVNode, vnode) {
  //初渲染流程
  const isRealElement = oldVNode.nodeType;
  if (isRealElement) {
    const elm = oldVNode; //获取真实元素
    const parentElm = elm.parentNode; //拿到父元素
    //创建真实元素
    let newEle = createElm(vnode);
    parentElm.insertBefore(newEle, elm.nextSibling); //先插入再删 否则顺序会乱
    parentElm.removeChild(elm); //删除老节点
    return newEle;
  } else {
    //diff算法
  }
}
export function initLifeCycle(Vue) {
  //虚拟dom变成真实dom
  Vue.prototype._update = function (vnode) {
    const vm = this;
    const el = vm.$el;
    console.log(vnode, el);
    //patch既有初始化的功能 又有更新的功能
    vm.$el = patch(el, vnode);
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
export function callHook(vm, hook) { //调用钩子函数
  const handlers = vm.$options[hook];
  if (handlers) {
    handlers.forEach((handler) => handler.call(vm));
  }
}
