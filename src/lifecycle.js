export function initLifeCycle(Vue) {
  Vue.prototype._update = function () {
    console.log("update");
  };
  Vue.prototype._render = function () {
    console.log("render");
  };
}

export function mountComponent(vm, el) {
  //1.调用render 产生虚拟DOM

  vm._update(vm._render()); //vm.$options.render()  虚拟节点

  //2.根据虚拟DOM产生真实DOM

  //3.插入到el元素中
}

//核心流程 1.创造响应式数据 2.模版转换成ast语法树 3.ast语法树转换成render函数 4.后续每次数据更新可以只执行render函数 无需再次执行ast转换的过程
//5.render函数会产生虚拟节点 使用响应式数据
//根据生成的虚拟节点创建真实DOM
