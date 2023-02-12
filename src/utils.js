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
