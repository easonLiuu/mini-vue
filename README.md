# Mini-Vue

学源码最好的方法是实现源码。

本仓库是试着实现一个vue的简易版本，主要是深入理解vue原理，不仅仅是为了面试，在开发中你所遇到的问题可能都是对vue的理解不够深入。

另外，这是我的博客

[普通链接](https://www.yuque.com/easonliu-rl8as/tk4pbo)

主要从Vue基础、Vue周边、Vue源码（变化侦测、虚拟DOM、模版编译、实例方法、生命周期等角度）对其进行了详细解释。

如果你觉得有用，麻烦给个Star吧。

下面是实现mini-vue的一些逻辑。

### 初始化数据

打包工具使用的是rollup。

在rollup.config.js配置name属性在全局上挂载了属性Vue

```javascript
export default {
    input: './src/index.js',
    output: {
        file: './dist/vue.js',//出口
        name: 'Vue', //global.Vue 全局上挂载vue属性
        format: 'umd',
        sourcemap: true //调试源代码
    },
    plugins: [
        babel({
            exclude: 'node_modules/**'
        })
    ]
}
```

打包后可以看到，这是一个立即执行函数

```javascript
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Vue = factory());
})(this, (function () { 'use strict';

  function initState(vm) {
   ....
  }
  ....
  function Vue(options) {
    ...
  }
  return Vue;

}));
```

我们知道，使用vue时是这么定义data的：

```javascript
const vm = new Vue({
        data() {
          return {
            //代理数据
            name: "eason",
            age: 20,
          };
        },
      });
```

里面的数据如何初始化？

在`index.js`中我们默认调用`_init`方法，而`init`方法里通过`vm.$options = options`将用户的选项挂载到实例上，方法里还定义了`initState`用来初始化状态，`initState`方法里我们要定义了`initData`，在里面判断data是函数还是对象，不同的类型有不同的处理逻辑。

这里有个小技巧，我们定义原型上的方法_init扩展成了函数，通过函数的方式在原型上扩展功能。

```javascript
export function initMixin(Vue) {
  //初始化操作
  Vue.prototype._init = function (options) {
    //vm.$options： 获取用户的配置
    const vm = this;
    //将用户的选项挂载到实例上
    vm.$options = options;
    //初始化状态
    initState(vm);
  };
}
```
### 实现对象响应式

`observe(data)`是响应式模块，用来观测数据实现对象响应式，在初始化数据里调用`observe`，在里面我们只对对象进行劫持，return出new了一个`Observer`类，这个类里面循环对象的属性依次劫持。

```javascript
export function observe(data) {
  if (typeof data !== "object" || data == null) {
    return;
  }
  //判断一个对象是否被劫持过，一个对象如果被劫持了，后面就不需要被劫持了
  //需要增添一个实例，用实例判断是否被劫持过

  return new Observer(data);
}

```

walk里面重新定义了属性，调用了`defineReactive`，这个里面的逻辑就是对所有对象属性进行劫持，使用了`Object.defineProperty`实现了对象的响应式，可以看到，`value`存放在了闭包，所以不会自动销毁。`defineReactive`里最开始又调用了`observe(value)`目的是深层观测对象。

```javascript
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
      value = newValue;
    },
  });
}
```

最后一个很重要的点，就是在初始化数据时，我们使用了`vm.data = data`将对象放在了实例上，但如果就这么做，我们在写代码时取数据应该是`vm.data.xxxx`，但是实际开发中我们都是直接`vm.xxx`，所以这里需要将将`vm._data`用`vm`代理，因此定义了`proxy`函数，在实现响应式后，我们循环属性并依次调用`proxy`实现代理。

```javascript
function initData(vm) {
  ...
  vm._data = data;
  observe(data);
  for (let key in data) {
    proxy(vm, "_data", key);
  }
}
```

```javascript
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
```





