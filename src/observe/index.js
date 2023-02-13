import { newArrayProto } from "./array";
import Dep from "./dep";

class Observer {
  constructor(data) {
    this.dep = new Dep(); //所有对象都要增加dep  给每个对象都添加依赖收集功能
    //这个data可能是对象也可能是数组
    Object.defineProperty(data, "__ob__", {
      value: this,
      enumerable: false, //不可枚举 循环时无法获取
    });
    //data.__ob__ = this; //还给数据加了一个标识 来判断是否被观测过
    if (Array.isArray(data)) {
      //重写数组方法 7个修改数组本身的方法
      //但是需要保留数组原有的特性
      //数组劫持核心： 重写数组方法并观测数组中的每一项，对数组中新增属性进行判断，并对新增内容再次观测
      data.__proto__ = newArrayProto;
      this.observeArray(data);
    } else {
      this.walk(data);
    }
  }
  //循环对象属性 依次劫持
  walk(data) {
    //重新定义属性,性能差
    Object.keys(data).forEach((key) => defineReactive(data, key, data[key]));
  }
  observeArray(data) {
    //数组里的每一项进行观测，这里是为了如果数组里有引用类型（对象），可以检测到对象的变化
    data.forEach((item) => observe(item));
  }
}
//深层次嵌套会递归
function dependArray(value) {
  for (let i = 0; i < value.length; i++) {
    let current = value[i];
    current.__ob__ && current.__ob__.dep.depend();
    if (Array.isArray(current)) {
      dependArray(current);
    }
  }
}
export function defineReactive(target, key, value) {
  let childOb = observe(value); //对所有对象进行属性劫持 childOb.dep 用来收集依赖的 childOb.dep用来收集依赖
  let dep = new Dep(); //每一个属性都有一dep
  //value存放在了闭包
  Object.defineProperty(target, key, {
    //取
    get() {
      if (Dep.target) {
        dep.depend(); //让这个属性的收集器记住当前的watcher
        if (childOb) {
          childOb.dep.depend();
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }
      return value;
    },
    //修改
    set(newValue) {
      if (newValue === value) return;
      observe(newValue);
      value = newValue;
      dep.notify(); //通知更新
    },
  });
}

export function observe(data) {
  //对对象进行劫持
  if (typeof data !== "object" || data == null) {
    //只对对象进行劫持
    return;
  }

  if (data.__ob__ instanceof Observer) {
    return data.__ob__; //说明被观测过
  }

  //判断一个对象是否被劫持过，一个对象如果被劫持了，后面就不需要被劫持了
  //需要增添一个实例，用实例判断是否被劫持过

  return new Observer(data);
}
