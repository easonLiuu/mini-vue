import Dep, { popTarget, pushTarget } from "./dep";

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
    this.lazy = options.lazy;
    this.dirty = this.lazy; //缓存值
    this.vm = vm;
    this.lazy ? undefined : this.get();
    //this.get(); //getter意味着调用这个函数可以发生取值操作
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
  evaluate() {
    this.value = this.get(); //获取到用户函数的返回值 并且还要标识为脏
    this.dirty = false;
  }
  get() {
    //让dep和watcher关联起来 把当前Watcher挂在全局上
    // Dep.target = this; //静态属性只有一份
    // this.getter(); //会去vm上取值
    // Dep.target = null; //渲染完毕后清空
    pushTarget(this);
    let value = this.getter.call(this.vm);
    popTarget();
    return value;
  }
  depend(){
    let i = this.deps.length;
    while(i--){
        //让计算属性watcher也收集渲染watcher
        this.deps[i].depend()
    }
  }
  update() {
    //属性更新重新渲染
    //this.get();
    if (this.lazy) {
      //如果是计算属性 依赖值发生变化 变成脏值
      this.dirty = true;
    } else {
      queueWatcher(this); //把当前watcher暂存起来
    }
  }
  run() {
    this.get();
  }
}
//多次更新 只会把它们暂存到一个队列里，后面时间到了再执行更新操作
let queue = [];
let has = {};
let pending = false; //防抖
//刷新调度队列
function flushSchedulerQueue() {
  let flushQueue = queue.slice(0);
  queue = [];
  has = {};
  pending = false;
  flushQueue.forEach((q) => q.run()); //刷新的过程中 可能还有新的watcher 重新放到queue中
}
function queueWatcher(watcher) {
  const id = watcher.id;
  if (!has[id]) {
    queue.push(watcher);
    has[id] = true;
    //不管update执行多少次 刷新只执行一次
    if (!pending) {
      //定时器等同步代码执行完再执行 不会立即执行
      nextTick(flushSchedulerQueue, 0);
      pending = true;
    }
  }
}

let callbacks = [];
let waiting = false;
//异步批处理
function flushCallbacks() {
  let cbs = callbacks.slice(0);
  waiting = false;
  callbacks = [];
  cbs.forEach((cb) => cb()); //按照顺序依次执行
}

//nextTick中没有直接使用某个api,而是采用优雅降级的方式
//内部先采用的是promise  ie不兼容 所以用了MutationObserver 异步的 再不兼容 考虑ie专享的 setImmediate
let timerFunc;
if (Promise) {
  timerFunc = () => {
    Promise.resolve().then(flushCallbacks);
  };
} else if (MutationObserver) {
  let observer = new MutationObserver(flushCallbacks); //这里传入的回调是异步执行
  let textNode = document.createTextNode(1);
  observer.observe(textNode, {
    characterData: true,
  });
  timerFunc = () => {
    textNode.textContent = 2;
  };
} else if (setImmediate) {
  timerFunc = () => {
    setImmediate(flushCallbacks);
  };
} else {
  timerFunc = () => {
    setTimeout(flushCallbacks);
  };
}
export function nextTick(cb) {
  //先内部还是先用户 不一定
  callbacks.push(cb); //维护nextTick中的callback方法
  if (!waiting) {
    // setTimeout(() => {
    //   flushCallbacks(); //最后一起刷新
    // }, 0);
    timerFunc();
    waiting = true;
  }
}

//需要给每个属性增加一个dep，目的就是收集Watcher
//一个组件中 有多个属性 n个属性对应一个视图 n个dep对应一个watcher
//一个属性可以对应多个组件 一个dep对应多个watcher
//多对多的关系

export default Watcher;
