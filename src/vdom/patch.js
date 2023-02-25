import { isSameVNode } from ".";

export function createElm(vnode) {
  let { tag, data, children, text } = vnode;
  if (typeof tag === "string") {
    vnode.el = document.createElement(tag); //这里将真实节点和虚拟节点对应起来 后面如果修改属性了 可以直接找到虚拟节点对应的真实节点
    //更新属性
    patchProps(vnode.el, {}, data);
    children.forEach((child) => {
      vnode.el.appendChild(createElm(child));
    });
  } else {
    vnode.el = document.createTextNode(text);
  }
  return vnode.el;
}

export function patchProps(el, oldProps = {}, props = {}) {
  //老的属性中有要删除老的 新的没有
  let oldStyles = oldProps.style || {};
  let newStyles = props.style || {};
  for (let key in oldStyles) {
    //老的样式中有新的 没有删除
    if (!newStyles[key]) {
      el.style[key] = "";
    }
  }

  for (let key in oldProps) {
    //老的属性中有
    if (!props[key]) {
      //新的没有删除属性
      el.removeAttribute(key);
    }
  }

  for (let key in props) {
    //新的覆盖老的
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

export function patch(oldVNode, vnode) {
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
    //1.两个节点不是同一个节点 直接删除老节点 换上新节点 无比对
    //2.两个节点是同一个节点 判断节点的tag和key 比较两个节点的属性是否有差异
    //复用老节点 将差异的属性更新
    //3.节点比较完毕后比较两人的儿子
    return patchVNode(oldVNode, vnode);
  }
}

function patchVNode(oldVNode, vnode) {
  if (!isSameVNode(oldVNode, vnode)) {
    //用老节点的父亲进行替换
    let el = createElm(vnode);
    oldVNode.el.parentNode.replaceChild(el, oldVNode.el);
    return el;
  }
  //文本的情况 文本我们期望比较文本的内容 undefined
  let el = (vnode.el = oldVNode.el); //复用老节点的元素
  if (!oldVNode.tag) {
    //是文本
    if (!oldVNode.text !== vnode.text) {
      el.textContent = vnode.text; //用新的文本覆盖掉老的
    }
  }
  //是标签 需要比对标签的属性
  patchProps(el, oldVNode.data, vnode.data);
  //console.log(oldVNode, vnode);
  //比较儿子节点 比较的时候 一方有儿子 一方没儿子
  //两方都有儿子
  let oldChildren = oldVNode.children || [];
  let newChildren = vnode.children || [];
  console.log(oldChildren, newChildren);
  if (oldChildren.length > 0 && newChildren.length > 0) {
    //完整diff 需要比较两个人的儿子
    updateChildren(el, oldChildren, newChildren);
  } else if (newChildren.length > 0) {
    //没有老的有新的
    mountChildren(el, newChildren);
  } else if (oldChildren.length > 0) {
    //新的没有老的有 删除
    el.innerHTML = ""; //这里可以循环删除 就简写了
  }
  return el;
}
function mountChildren(el, newChildren) {
  for (let i = 0; i < newChildren.length; i++) {
    let child = newChildren[i];
    el.appendChild(createElm(child));
  }
}
function updateChildren(el, oldChildren, newChildren) {
  //操作列表经常会使用 push shift pop unshift reverse sort 针对这些情况做优化
  //vue2采用双指针的方式比较两个节点
  let oldStartIndex = 0;
  let newStartIndex = 0;
  let oldEndIndex = oldChildren.length - 1;
  let newEndIndex = newChildren.length - 1;

  let oldStartVNode = oldChildren[0];
  let newStartVNode = newChildren[0];

  let oldEndVNode = oldChildren[oldEndIndex];
  let newEndVNode = newChildren[newEndIndex];
  function makeIndexByKey(children) {
    let map = {};
    children.forEach((child, index) => {
      map[child.key] = index;
    });
    return map;
  }
  let map = makeIndexByKey(oldChildren);

  //为了比较两个儿子 增高性能 有一些优化手段
  //console.log(el, oldChildren, newChildren)
  //循环的时候为什么要加key？
  //
  console.log(oldStartVNode, newStartVNode, oldEndVNode, newEndVNode);
  while (oldStartIndex <= oldEndIndex && newStartIndex <= newEndIndex) {
    //空就跳过去
    if (!oldStartVNode) {
      oldStartVNode = oldChildren[++oldStartIndex];
    } else if (!oldEndVNode) {
      oldEndVNode = oldChildren[--oldEndIndex];
    }
    //双方有一方头指针大于尾部则停止循环
    if (isSameVNode(oldStartVNode, newStartVNode)) {
      patchVNode(oldStartVNode, newStartVNode); //如果是相同节点 递归比较子节点
      oldStartVNode = oldChildren[++oldStartIndex];
      newStartVNode = newChildren[++newStartIndex];
      //比较开头节点
    } else if (isSameVNode(oldEndVNode, newEndVNode)) {
      patchVNode(oldEndVNode, newEndVNode);
      oldEndVNode = oldChildren[--oldEndIndex];
      newEndVNode = newChildren[--newEndIndex];
      //比较开头节点
    }
    //交叉比对 abcd->dabc
    else if (isSameVNode(oldEndVNode, newStartVNode)) {
      patchVNode(oldEndVNode, newStartVNode);
      //先移动再赋值
      //老的尾部移动到老的前面 insertBefore具有移动性 将原来的元素移动走
      el.insertBefore(oldEndVNode.el, oldStartVNode.el);
      oldEndVNode = oldChildren[--oldEndIndex];
      newStartVNode = newChildren[++newStartIndex];
    } else if (isSameVNode(oldStartVNode, newEndVNode)) {
      patchVNode(oldStartVNode, newEndVNode);
      //先移动再赋值
      //老的尾部移动到老的前面 insertBefore具有移动性 将原来的元素移动走
      el.insertBefore(oldStartVNode.el, oldEndVNode.el.nextSibling);
      oldStartVNode = oldChildren[++oldStartIndex];
      newEndVNode = newChildren[--newEndIndex];
    }
    //给动态列表添加key的时候尽量避免用索引  可能会发生错误复用
    else {
      //乱序比对
      //根据老的列表做一个映射关系 用新的去找 找到移动 找不到添加 最后删除多余的
      let moveIndex = map[newStartVNode.key];
      if (moveIndex !== undefined) {
        let moveVNode = oldChildren[moveIndex]; //找到对应的虚拟节点
        el.insertBefore(moveVNode.el, oldStartVNode.el);
        oldChildren[moveIndex] = undefined; //标识这个节点已经移走了
        patchVNode(moveVNode, newStartVNode);
      } else {
        //找不到直接插入
        el.insertBefore(createElm(newStartVNode), oldStartVNode.el);
      }
      newStartVNode = newChildren[++newStartIndex];
    }
  }
  if (newStartIndex <= newEndIndex) {
    //多余的插入进去
    for (let i = newStartIndex; i <= newEndIndex; i++) {
      let childEl = createElm(newChildren[i]);
      //这里可能向后追加 也可能向前追加
      //获取下一个元素
      let anchor = newChildren[newEndIndex + 1]
        ? newChildren[newEndIndex + 1].el
        : null;
      //el.appendChild(childEl);
      //anchor为null时会认为是appendChild
      el.insertBefore(childEl, anchor);
    }
  }
  if (oldStartIndex <= oldEndIndex) {
    //老的多了 删除老的
    for (let i = oldStartIndex; i <= oldEndIndex; i++) {
      if (oldChildren[i]) {
        //虚拟节点上有el属性
        let childEl = oldChildren[i].el;
        el.removeChild(childEl);
      }
    }
  }
}
