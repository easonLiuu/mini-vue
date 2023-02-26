//工具方法
const strats = {};
const LIFECYCLE = ["beforeCreate", "created"];
LIFECYCLE.forEach((hook) => {
  strats[hook] = function (p, c) {
    // {} {created:function(){}} => {created: [fn]}
    // {created:[fn]} {created;function(){}} => {created:[fn,fn]}
    if (c) {
      //儿子有 父亲有
      if (p) {
        //拼在一起
        return p.concat(c);
      } else {
        return [c]; //儿子有 父亲没有 将儿子包装成数组
      }
    } else {
      return p;
    }
  };
});
strats.components = function(parentVal, childVal){
  const res = Object.create(parentVal)
  if(childVal){
    for(let key in childVal){
      res[key] = childVal[key] //返回的是构造的对象 可以拿到父亲原型上的属性 并且将儿子的都拷贝到自己身上
    }
  }
  return res

}
export function mergeOptions(parent, child) {
  const options = {};
  //循环老的
  for (let key in parent) {
    mergeField(key);
  }
  for (let key in child) {
    const n = parent.hasOwnProperty(key);
    if (!n) {
      mergeField(key);
    }
  }
  function mergeField(key) {
    if (strats[key]) {
      options[key] = strats[key](parent[key], child[key]);
    } else {
      //如果不在策略中以儿子为准
      //优先采用儿子的
      //策略模式减少ifelse
      options[key] = child[key] || parent[key];
    }
  }
  return options;
}
