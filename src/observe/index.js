class Observer {
  constructor(data) {
    this.walk(data);
  }
  //循环对象属性 依次劫持
  walk(data) {
    //重新定义属性,性能差
    Object.keys(data).forEach((key) => defineReactive(data, key, data[key]));
  }
}

export function defineReactive(target, key, value) {
  observe(value);//对所有对象进行属性劫持
  //value存放在了闭包
  Object.defineProperty(target, key, {
    //取
    get() {
      return value;
    },
    //修改
    set(newValue) {
      if (newValue === value) return;
      observe(newValue)
      value = newValue;
    },
  });
}

export function observe(data) {
  //对对象进行劫持
  if (typeof data !== "object" || data == null) {
    //只对对象进行劫持
    return;
  }

  //判断一个对象是否被劫持过，一个对象如果被劫持了，后面就不需要被劫持了
  //需要增添一个实例，用实例判断是否被劫持过

  return new Observer(data);
}
