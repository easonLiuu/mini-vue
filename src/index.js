import { compileToFunction } from "./compiler";
import { initGlobalAPI } from "./globalAPI";
import { initMixin } from "./init";
import { initLifeCycle } from "./lifecycle";
import { initStateMixin } from "./state";
import { createElm, patch } from "./vdom/patch";

//将所有的方法耦合在一起
//options就是用户的选项
function Vue(options) {
  //默认调用_init
  this._init(options);
}

initMixin(Vue); //扩展init方法
initLifeCycle(Vue); //vm._update vm.render
initGlobalAPI(Vue); //全局api实现
initStateMixin(Vue); //实现了nextTick和$watch

//测试用的
// let render1 = compileToFunction(`<ul style="color:red">
// <li key='a'>a</li>
// <li key='b'>b</li>
// <li key='c'>c</li>
// <li key='d'>d</li>
// </ul>`);
// let vm = new Vue({ data: { name: "zf" } });
// let prevVNode = render1.call(vm);
// let el = createElm(prevVNode);
// document.body.appendChild(el);
// //用户自己操作DOM 会有问题
// let render2 = compileToFunction(`<ul style="color:blue">
// <li key='b'>b</li>
// <li key='m'>m</li>
// <li key='a'>a</li>
// <li key='p'>p</li>
// <li key='c'>c</li>
// <li key='q'>q</li>
// </ul>`);
// let vm2 = new Vue({ data: { name: "zf" } });
// let nextVNode = render2.call(vm2);
// //直接将新的替换掉了老的
// //let newEl = createElm(nextVNode)
// //不是直接替换 而是比较区别之后再替换 diff算法 平级比较的过程 父亲和父亲比对 儿子和儿子比对
// //el.parentNode.replaceChild(newEl, el)
// setTimeout(() => {
//   patch(prevVNode, nextVNode);
// }, 1000);
//console.log(nextVNode)

export default Vue;
