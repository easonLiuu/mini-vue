import Dep from "./dep";

let id = 0;
//1.当创建渲染Watcher时我们会把当前渲染的Watcher放到Dep.target上
//2.调用_render()会取值 走到get上
//Watcher就是用于渲染的

//每个属性有一个dep 属性是被观察者 watcher是观察者 属性变化了会通知观察者来更新 观察者模式
class Watcher {
  //不同组件有不同的Watcher  目前只有一个渲染根组件
  constructor(vm, fn, options) {
    this.id = id++;
    this.renderWatcher = options;
    this.getter = fn;
    this.deps = []; //后续实现计算属性和清理工作要用
    this.depsId = new Set();
    this.get(); //getter意味着调用这个函数可以发生取值操作
  }
  addDep(dep) {
    //一个组件对应多个属性 重复的属性也不用记录
    let id = dep.id;
    if (!this.depsId.has(id)) {
      this.deps.push(dep);
      this.depsId.add(id);
      dep.addSub(this); //watcher记住了dep 而且去重了 此时dep也记住了watcher
    }
  }
  get() {
    //让dep和watcher关联起来 把当前Watcher挂在全局上
    Dep.target = this; //静态属性只有一份
    this.getter(); //会去vm上取值
    Dep.target = null; //渲染完毕后清空
  }
  update() {
    //属性更新重新渲染
    this.get();
  }
}

//需要给每个属性增加一个dep，目的就是收集Watcher
//一个组件中 有多个属性 n个属性对应一个视图 n个dep对应一个watcher
//一个属性可以对应多个组件 一个dep对应多个watcher
//多对多的关系

export default Watcher;
