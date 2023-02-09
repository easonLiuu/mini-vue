import { initMixin } from "./init";
import { initLifeCycle } from "./lifecycle";

//将所有的方法耦合在一起
//options就是用户的选项
function Vue(options) {
  //默认调用_init
  this._init(options);
}

initMixin(Vue); //扩展init方法
initLifeCycle(Vue);

export default Vue;
