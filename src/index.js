import { initMixin } from "./init";
import { initLifeCycle } from "./lifecycle";
import { nextTick } from "./observe/watcher";

//将所有的方法耦合在一起
//options就是用户的选项
function Vue(options) {
  //默认调用_init
  this._init(options);
}
Vue.prototype.$nextTick = nextTick
initMixin(Vue); //扩展init方法
initLifeCycle(Vue);

export default Vue;
