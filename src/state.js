import Dep from "./observe/dep";
import { observe } from "./observe/index";
import Watcher, { nextTick } from "./observe/watcher";

export function initState(vm) {
  //获取用户选项
  const opts = vm.$options;
  if (opts.data) {
    initData(vm);
  }
  if (opts.computed) {
    initComputed(vm);
  }
  if (opts.watch) {
    initWatch(vm);
  }
}
function initWatch(vm) {
  let watch = vm.$options.watch;
  for (let key in watch) {
    //字符串数组函数
    const handler = watch[key];
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}
function createWatcher(vm, key, handler) {
  if (typeof handler === "string") {
    handler = vm[handler];
  }
  return vm.$watch(key, handler);
}

function proxy(vm, target, key) {
  Object.defineProperty(vm, key, {
    get() {
      return vm[target][key];
    },
    set(newValue) {
      vm[target][key] = newValue;
    },
  });
}

function initData(vm) {
  //data可能是函数和对象
  let data = vm.$options.data;
  data = typeof data === "function" ? data.call(vm) : data;
  //对象放在实例上
  vm._data = data;
  //数据劫持
  //observe是响应式模块，用于观测数据
  observe(data);
  //将vm._data用vm代理
  for (let key in data) {
    proxy(vm, "_data", key);
  }
}

function initComputed(vm) {
  const computed = vm.$options.computed;
  //计算属性的所有watcher  方便后面取值
  const watchers = (vm._ComputedWatcher = {}); //将计算属性watcher保存到vm上
  for (let key in computed) {
    let userDef = computed[key];
    let fn = typeof userDef === "function" ? userDef : userDef.get;
    //监控计算属性中get的变化
    //如果直接new Watcher 默认会执行fn
    //懒执行

    watchers[key] = new Watcher(vm, fn, { lazy: true });
    //定义属性
    defineComputed(vm, key, userDef);
  }
  //console.log(computed)
}

function defineComputed(target, key, userDef) {
  //const getter = typeof userDef === 'function' ? userDef : userDef.get;
  const setter = userDef.set || (() => {});
  //可以通过实例拿到对应的属性
  Object.defineProperty(target, key, {
    //创造计算属性的watcher
    get: createComputedGetter(key),
    set: setter,
  });
}
//计算属性根本不会收集依赖 只会让自己的依赖属性收集依赖
function createComputedGetter(key) {
  //需要检测是否要执行这个getter
  return function () {
    const watcher = this._ComputedWatcher[key]; //获取到对应属性的watcher
    if (watcher.dirty) {
      //如果是脏的 执行用户传入的函数
      watcher.evaluate();
    }
    if (Dep.target) {
      //计算属性出栈后 还要渲染watcher 应该让计算属性watcher里面的属性 也去收集上一层watcher
      watcher.depend();
    }
    return watcher.value; //最后返回的是watcher上的值
  };
}

//第一次渲染有栈 先放的是渲染watcher 渲染watcher在渲染时会去计算属性 所以栈里会放计算属性watcher
//一取计算属性 就走到了evaluate 它会把当前的计算属性入栈
//我们走计算属性watcher时会取值 响应式数据 都有dep 这两个dep会去收集计算属性watcher
//改动firstname通知的是计算属性watcher 更新了dirty 但是页面不会重新渲染
//需要让firstname lastname记住渲染watcher   求完值之后 计算属性watcher出栈  此时dep.target是渲染watcher 调用depend就可以了

export function initStateMixin(Vue) {
  Vue.prototype.$nextTick = nextTick;
  //最终都会调用这个方法
  Vue.prototype.$watch = function (exprOrFn, cb) {
    console.log(exprOrFn, cb);
    //firstname
    //()=>vm.firstname
    //{user:true} 代表用户自己写的watcher
    //firstname值变化了 直接执行cb函数
    new Watcher(this, exprOrFn, { user: true }, cb);
  };
}
