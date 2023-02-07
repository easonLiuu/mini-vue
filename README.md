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

walk里面重新定义了属性，调用了`defineReactive`，这个里面的逻辑就是对所有对象属性进行劫持，使用了`Object.defineProperty`实现了对象的响应式，可以看到，`value`存放在了闭包，所以不会自动销毁。如果`newValue`是一个对象，继续深层实现响应式，所以在`set`里再一次调用`observe`。`defineReactive`里最开始又调用了`observe(value)`目的是深层观测对象。

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
      observe(newValue);
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
### 实现数组的函数劫持

数组劫持核心是，重写数组方法并观测数组中的每一项，对数组中新增属性进行判断，并对新增内容再次观测。

在重写数组方法时，我们使用的是面向切片编程，也就是内部调用原来的方法。首先`Array.prototype`获取数组原型，紧接着实现了重写，注意重写时要保留数组原有的特性。对数组的7个能够修改原数组的方法进行了重写。

```javascript
let oldArrayProto = Array.prototype; 
export let newArrayProto = Object.create(oldArrayProto);
//7个修改原数组的方法
let methods = ["push", "pop", "shift", "unshift", "reverse", "sort", "splice"];
methods.forEach((method) => {
  //arr.push(1,2,3)
  newArrayProto[method] = function (...args) {
    const result = oldArrayProto[method].call(this, ...args); //this是arr 
    return result;
  };
});

```

紧接着我们观测数组的每一项，如果数组里出现引用类型（对象）的数据，我们需要检测到对象的变化。

```javascript
class Observer {
  constructor(data) {
    if (Array.isArray(data)) {
      data.__proto__ = newArrayProto;
      this.observeArray(data);
    } else {
      this.walk(data);
    }
  }
  ...
  observeArray(data) {
    data.forEach((item) => observe(item));
  }
}
```

然后我们对数组中新增属性进行判断，`push`、`unshift`、`splice`三个方法会新增数组里的内容，并把新增的暂存起来，并对新增内容再次观测。

那么我们如何调用`observeArray`对新增的内容进行观测呢？

这里用了一个很巧妙的方式。注意下面代码中的`this`其实就是`src/index.js`里面的`data`，因此在`Observer`类中我们给数据新增了一个标识，把this当前`Observer`类的实例指向了`data.__ob__`。这样通过`this.__ob__`就能获取当前`Observer`类的实例了，在实例下有一个`observeArray`方法就能对新增内容进行观测了。

```javascript
methods.forEach((method) => {
  newArrayProto[method] = function (...args) {
    ...
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
    ...
  };
});
```

```javascript
class Observer {
  constructor(data) {
    Object.defineProperty(data, "__ob__", {
      value: this,
      enumerable: false, //不可枚举 循环时无法获取
    });
    //data.__ob__ = this; //还给数据加了一个标识 来判断是否被观测过
    ...
}
```

这里有一个需要注意的地方，在定义`__ob__`时一定要把它设置成不可枚举，这里`__ob__`的第二个作用是给数据加了一个标识，来判断是否被观测过，如果被观测过，直接返回当前实例。如果直接`data.__ob__ = this`，并且如果data是对象的话，循环属性一定会循环到`__ob__`，`__ob__`上是Observer对象，对象上又有`__ob__`属性，因此一定会造成一个死循环。

```javascript
export function observe(data) {
  ...
  if (data.__ob__ instanceof Observer) {
    return data.__ob__; //说明被观测过
  }
  ...
}
```
### 解析模版参数

我们知道，在使用`vue`时，我们指定`el`，用来把数据挂载到`el`上，因此在初始化操作时，我们要实现数据的挂载。首先判断是否具有`el`，如果有调用`vm.$mount`。

```javascript
export function initMixin(Vue) {
  //初始化操作
    ...
    if (options.el) {
      //实现数据的挂载
      vm.$mount(options.el);
    }
  };
```

`vm.$mount`的实现逻辑如下，我们首先判断`options`上是否指定了`render`函数，如果没有，查找`option`上是否写了`template`，如果没有但是写了`el`，那么我们取到`el`的外部HTML赋给`template`，如果写了`template`那么直接用写了的`template`，紧接着我们对模版进行编译，调用`compileToFunction`赋给`render`，然后我们在`ops`上设置`render`属性并把`render`赋给`ops.render`。

```javascript
Vue.prototype.$mount = function (el) {
    const vm = this;
    el = document.querySelector(el);
    let ops = vm.$options;
    if (!ops.render) {
      let template;
      if (!ops.template && el) {
        template = el.outerHTML;
      } else {
        if (el) {
          template = ops.template; 
        }
      }
      if (template) {
        const render = compileToFunction(template);
        ops.render = render;
      }
      console.log(template);
    }
    ops.render;
  };
```

在`src/observe/compiler/index`下定义`compileToFunction`，`compileToFunction`函数就是对模版进行编译，里面首先将`template`转换成ast语法树，然后生成`render`方法 (render方法执行后的返回结果就是虚拟DOM)

```javascript
//对模版进行编译
export function compileToFunction(template) {
  //1.将template转换成ast语法树
  ...
  //2.生成render方法 (render方法执行后的返回结果就是虚拟DOM)
}
```

这里需要说明一下：

如果是`script`标签引用的`vue.global.js` 编译是浏览器运行的，但vue还有runtime运行时，它不包含模版编译，它整个编译是打包时候通过loader来转义.vue文件，用runtime不能使用`template`（option里不能指定template，但是可以指定render）









