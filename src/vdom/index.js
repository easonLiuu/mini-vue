//h() _c()
const isReservedTag = (tag) => {
  return ["a", "div", "p", "button", "ul", "li", "span"].includes(tag);
};
export function createElementVNode(vm, tag, data, ...children) {
  if (data == null) {
    data = {};
  }
  let key = data.key;
  if (key) {
    delete data.key;
  }
  if (isReservedTag(tag)) {
    return vnode(vm, tag, key, data, children);
  } else {
    //创造组件的虚拟节点 包含组件的构造函数
    let Ctor = vm.$options.components[tag]; //组件的构造函数
    //Ctor就是组件的定义 可能是一个Sub类 还有可能是组件的obj选项
    return createComponentVNode(vm, tag, key, data, children, Ctor);
  }
}
function createComponentVNode(vm, tag, key, data, children, Ctor) {
  if (typeof Ctor === "object") {
    Ctor = vm.$options._base.extend(Ctor);
  }
  data.hook = {
    init(vnode) {
      //稍后创造真实节点的时候如果是组件则调用init方法
      //保存组件的实例到虚拟节点上
      let instance = vnode.componentInstance = new vnode.componentOptions.Ctor;
      instance.$mount(); //instance.$el
    },
  };
  return vnode(vm, tag, key, data, children, null, { Ctor });
}

//_v()
export function createTextVNode(vm, text) {
  return vnode(vm, undefined, undefined, undefined, undefined, text);
}

//ast是语法层面的转化 描述语法本身 描述js css html
//虚拟DOM 描述的dom元素 可以增加自定义属性 描述DOM的
function vnode(vm, tag, key, data, children, text, componentOptions) {
  return {
    vm,
    tag,
    key,
    data,
    children,
    text,
    componentOptions, //包含组件的构造函数
  };
}
export function isSameVNode(vnode1, vnode2) {
  return vnode1.tag === vnode2.tag && vnode1.key === vnode2.key;
}
