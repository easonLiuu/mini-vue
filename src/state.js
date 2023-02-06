import { observe } from "./observe/index";

export function initState(vm) {
  //获取用户选项
  const opts = vm.$options;
  if (opts.data) {
    initData(vm);
  }
}

function proxy(vm, target, key) {
  Object.defineProperty(vm, key, {
    get() {
      return vm[target][key];
    },
    set(newValue){
        vm[target][key] = newValue;
    }
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
