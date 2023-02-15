import { initGlobalAPI } from "./globalAPI";
import { initMixin } from "./init";
import { initLifeCycle } from "./lifecycle";
import Watcher, { nextTick } from "./observe/watcher";

//将所有的方法耦合在一起
//options就是用户的选项
function Vue(options) {
  //默认调用_init
  this._init(options);
}
Vue.prototype.$nextTick = nextTick;
initMixin(Vue); //扩展init方法
initLifeCycle(Vue);
initGlobalAPI(Vue);
//最终都会调用这个方法
Vue.prototype.$watch = function(exprOrFn, cb){
    console.log(exprOrFn, cb);
    //firstname
    //()=>vm.firstname
    //{user:true} 代表用户自己写的watcher
    //firstname值变化了 直接执行cb函数
    new Watcher(this, exprOrFn, {user:true}, cb)
}
export default Vue;
