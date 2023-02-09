//h() _c()
export function createElementVNode(vm, tag, data, ...children) {
  if (data == null) {
    data = {};
  }
  let key = data.key;
  if (key) {
    delete data.key;
  }
  return vnode(vm, tag, key, data, children);
}

//_v()
export function createTextVNode(vm, text) {
  return vnode(vm, undefined, undefined, undefined, undefined, text);
}

//ast是语法层面的转化 描述语法本身 描述js css html
//虚拟DOM 描述的dom元素 可以增加自定义属性 描述DOM的
function vnode(vm, tag, key, data, children, text) {
  return {
    vm,
    tag,
    key,
    data,
    children,
    text,
  };
}
