let id = 0;
//没有用的属性不会做依赖收集
class Dep {
  constructor() {
    this.id = id++; //属性的dep收集watcher
    this.subs = []; //这里存放着当前属性对应的watcher有哪些
  }
  depend() {
    //不希望放重复的watcher 刚才只是一个单向的关系 dep->watcher
    //也需要watcher存放dep
    //下面这样写会重
    //this.subs.push(Dep.target);
    //console.log(this.subs)
    Dep.target.addDep(this); //让watcher记录dep
    //注意这是多对多的关系
  }
  addSub(watcher){
    this.subs.push(watcher); 
  }
  notify(){
    this.subs.forEach(watcher=>watcher.update()); //告诉watcher要更新了
  }
}
Dep.target = null;
let stack = [];
//渲染时将watcher入栈 渲染完出栈
export function pushTarget(watcher){
  stack.push(watcher);
  Dep.target = watcher;
}
export function popTarget(){
  stack.pop();
  Dep.target = stack[stack.length - 1]
}

export default Dep;
