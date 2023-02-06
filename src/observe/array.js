//重写数组中的部分方法

let oldArrayProto = Array.prototype; //获取数组的原型

export let newArrayProto = Object.create(oldArrayProto);

//7个修改原数组的方法
let methods = ["push", "pop", "shift", "unshift", "reverse", "sort", "splice"];
methods.forEach((method) => {
  //arr.push(1,2,3)
  newArrayProto[method] = function (...args) {
    const result = oldArrayProto[method].call(this, ...args); //this是arr 内部调用原来方法 函数劫持 切片编程
    //需要对新增的数据再次劫持
    let inserted;
    //这里的this和index里的data是一个东西
    let ob = this.__ob__;
    switch (method) {
      case "push":
      case "unshift":
        inserted = args;
        break;
      case "splice":
        inserted = args.slice(2);
      default:
        break;
    }
    if (inserted) {
      //对新增内容再次进行观测
      ob.observeArray(inserted);
    }
    return result;
  };
});
