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
### 模版转换成AST语法树

在`compileToFunction`函数里定义`parseHTML`并将`template`作为参数传入，`parseHTML`里面的两大核心逻辑是截取标签和创建AST语法树。

```javascript
export function compileToFunction(template) {
  //1.将template转换成ast语法树
  let ast = parseHTML(template);
  //2.生成render方法 (render方法执行后的返回结果就是虚拟DOM)
  ....
}

```

#### 截取标签

我们首先定义了几个正则，用来匹配标签和属性的，这里就不再赘述。但是注意vue3实现模版编译时用的不是正则，这个仓库里我们实现的是vue2的逻辑。

```javascript
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z]*`;
const qnameCapture = `((?:${ncname}\\:)?${ncname})`;
const startTagOpen = new RegExp(`^<${qnameCapture}`); // 标签开头的正则 捕获的内容是 标签名
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`); // 匹配标签结尾的  </div>
const attribute =
  /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+| ([^\s"'=<>`]+)))?/; // 匹配属性的
const startTagClose = /^\s*(\/?)>/; // 匹配标签结束的  >
const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/g; //{{}}
```

紧接着我们来截取标签，模版`html`最开始肯定是`<`开头，`textEnd` 为 0 的意义是开始标签或者结束标签，大于0 就是文本的结束位置，如果`textEnd == 0`，我们调用`parseStartTag`函数，这个函数就是用来匹配开始标签的，匹配成功后我们就创建一个`match`对象用来存放标签名和里面的属性，紧接着调用`advance`函数，它在每一次匹配成功后都会截取掉匹配的`html`，直到最后`html`为空。这也是为什么我们使用`while(html)`的原因。在`parseStartTag`里，如果不是开始标签的结束那么就一直匹配下去，因为标签里面可能包含属性等内容要继续解析下去，最后我们返回了`match`对象。

回到`while`循环里，我们解析到了开始标签，调用`start`函数，这个就是创建语法树的一些逻辑，我们把功能抛出去了，后面会说。如果我们解析到的不是开始标签，并且`textEnd`为0，那就有可能是一个结束标签，`let endTagMatch = html.match(endTag)`，使用正则匹配判断是与否。

如果`textEnd`大于0，那么`textEnd`就是文本的结束位置，这部分的逻辑也比较简单。

```javascript
function parseHTML(html) {
  ...
  //html最开始肯定是<
  function advance(n) {
    html = html.substring(n);
  }
  //匹配开始标签
  function parseStartTag() {
    const start = html.match(startTagOpen);
    if (start) {
      const match = {
        tagName: start[1], //标签名
        attrs: [],
      };
      advance(start[0].length);
      //如果不是开始标签的结束那么就一直匹配下去
      let attr;
      let end;
      while (
        !(end = html.match(startTagClose)) &&
        (attr = html.match(attribute))
      ) {
        advance(attr[0].length);
        match.attrs.push({name: attr[1], value: attr[3] || attr[4] || attr[5] || true})
      }
      if (end) {
        advance(end[0].length);
      }
      return match;
    }
    return false; //不是开始标签
  }
  while (html) {
    //textEnd 为 0 为开始标签或者结束标签
    //大于0 就是文本的结束位置
    let textEnd = html.indexOf("<"); //如果indexOf中索引是0 说明是个标签
    if (textEnd == 0) {
      //开始标签的匹配结果
      const startTagMatch = parseStartTag();
      if(startTagMatch){ //解析到的开始标签
        start(startTagMatch.tagName, startTagMatch.attrs);
        continue;
      }
      let endTagMatch = html.match(endTag);
      if(endTagMatch){
        end(endTagMatch[1]);
        advance(endTagMatch[0].length);   
        continue;
      }
    }
    if(textEnd > 0){
        let text = html.substring(0, textEnd); 
        if(text){
            chars(text);
            advance(text.length); 
        }
    }
  }
}
```

#### 创建AST抽象语法树

这部分的设计其实很巧妙，我们使用栈型结构创建树，当遇到开始标签时我们入栈，遇到结束标签时出栈，那么栈里面前面的元素一定是他的紧挨着的后面元素的父亲。

我们首先定义了`type`类型，分别表示元素节点，文本节点等，然后定义了一个栈用来存放元素，定义了`currentParent`指向栈中的最后一个，定义了`root`为根节点。

然后定义了`createASTElement`函数，返回了树的一些属性。

在解析到开始标签并返回值后，我们调用了`start`函数，这个函数里首先创建了一个`ast`节点，然后判断当前的树是否为空树，如果是，那么将当前节点设置为树的根节点。如果当前有`currentParent`属性，那么就将`currentParent`设为当前节点的父亲，为什么是`currentParent`？前面说过，`currentParent`指向栈中最后一个，这个一定是当前节点的父亲。并且给`currentParent`赋予`children`属性，这个属性的值就是当前节点。由于是开始标签，我们要将该节点入栈并将此节点设为`currentParent`。

在`textEnd`大于0并且`text`存在的情况下，我们调用`chars`，将文本直接放到当前指向的节点中，也就是设置成当前`currentParent`的孩子。当然由于我们是实现的vue简易版本，我们在处理空格文本这一部分不够严谨，这里不用在意。

在`textEnd == 0`并且匹配到了结束标签的情况下，我们调用`end`，弹出栈顶元素，并重新设置`currentParent`。

```javascript
function parseHTML(html) {

  const ELEMENT_TYPE = 1;
  const TEXT_TYPE = 3;
  const stack = []; 
  let currentParent; 
  let root; 

  function createASTElement(tag, attrs){
    return {
        tag,
        type: ELEMENT_TYPE,
        children:[],
        attrs,
        parent: null
    }
  }
  //栈型结构创建抽象语法树
  function start(tag, attrs){
    let node = createASTElement(tag, attrs); //创建一个ast节点
    if(!root){ //判断是否为空树
        root = node; //当前是树的根节点
    }
    if(currentParent){
        node.parent = currentParent; //赋予parent属性
        currentParent.children.push(node); //赋予children属性
    }
    stack.push(node);
    currentParent = node; //currentParent是栈中的最后一个
  }
  function chars(text){ //文本直接放到当前指向的节点中
    text = text.replace(/\s/g, '');
    text && currentParent.children.push({
        type: TEXT_TYPE,
        text,
        parent: currentParent
    })
  }
  function end(tag){
    let node = stack.pop();//弹出最后一个 校验标签是否合法
    currentParent = stack[stack.length - 1]
  }
  ...
}
```
### 生成代码字符串

上面我们创建了AST语法树，接下来我们来看看生成代码字符串的逻辑是如何实现的，假设模版是这样的，首先把模版转换成语法树，我们需要把树装成下面这样的语法

```html
<div id="app">
      <div style="color: red">
        {{name}hello
      </div>
      <span>
       {{name}}
      </span>      
    </div>
```

```javascript
 render(){
  return _c('div', {id: 'app'}, _c('div', {style: {color: 'red'}}, _v(_s(name)+'hello')
  ,_c('span', undefined, _v(_s(name))))
 }
```

上面return出去的就是代码字符串。

```javascript
export function compileToFunction(template) {
  let ast = parseHTML(template);
  codeGen(ast);
  console.log(codeGen(ast));
}
```

`codeGen`函数逻辑是什么呢？其实生成代码字符串就是一个字符串组装拼接的一个过程。我们按照需要生成的代码字符串的格式编写函数，`_c`里面第一个是标签名，第二个是属性，我们看一下属性这部分的逻辑，调用了`genProp`函数。

```javascript
function codeGen(ast) {
  let children = genChildren(ast.children);

  let code = `_c('${ast.tag}', ${
    ast.attrs.length > 0 ? genProps(ast.attrs) : "null"
  }${ast.children.length ? `,${children}` : ""}
  )`;
  return code;
}
```

这部分就是循环ast语法树里的`attrs`属性对其进行处理，需要注意的是，如果属性的`key`是`style`，要单独处理一下，比如`style="color:red;background:yellow"`，最后转成`style:{"color":"red","background":"yellow"}`，首先定义了一个空对象，然后进行了字符串分割，最后将obj对象赋给了`attr.value`。

```javascript
function genProps(attrs) {
  let str = "";
  for (let i = 0; i < attrs.length; i++) {
    let attr = attrs[i];
    if (attr.name === "style") {
      //color: red => {color:'red'}
      let obj = {};
      if (typeof attr.value == "string") {
        attr.value.split(";").forEach((item) => {
          let [key, value] = item.split(":");
          obj[key] = value;
        });
        attr.value = obj;
      }
    }
    str += `${attr.name}:${JSON.stringify(attr.value)},`;
  }
  //截取掉最后一个逗号
  return `{${str.slice(0, -1)}}`;
}
```

然后我们看一下对`children`属性的处理，在`codeGen`函数里我们调用了`genChildren`，在`genChildren`里又调用了`gen`函数。

```javascript
function genChildren(children) {
  return children.map((child) => gen(child)).join(",");
}
```

在`gen`函数中，我们先判断节点的类型，如果是元素节点，那么直接调用`codeGen`函数处理；如果是文本节点，我们首先获取`text`，文本节点分为两种类型，一种是有`{{}}`的，另外一种是纯文本节点，此处使用正则匹配。

纯文本节点的实现逻辑很简单，我们主要看一下有{{}}的，此处的核心逻辑是字符串分割，循环匹配，用一个数组存起来，我们首先定义`lastIndex`，它可以理解为最后一个节点出现的位置，

此处我们以`{{name}}kkkk{{age}}jjj`为例子，最后生成的代码字符串为：`_v(_s(name)+"kkkk"+_s(age)+"jjj") ,_c('span', null,_v("world"))`

当我们第一次匹配时，`index`为0，`match为['{{name}}', 'name', index: 0, input: '{{name}}kkkk{{age}}jjj', groups: undefined]`我们将匹配到的push进数组，紧接着重新计算`lastIndex = 0 + 8 = 8`，然后进行第二次匹配，匹配到的位置索引为12，此时`index>lastIndex`，也就是`12>8`，说明在第二个`{{}}`出现时前面一定有纯文本，我们提取出来push进`tokens`，也就是下面这一部分的逻辑。

```javascript
 if (index > lastIndex) {
          tokens.push(JSON.stringify(text.slice(lastIndex, index)));
 }
```

然后又把第二次匹配到的`match[1]push`进数组，再重新计算`lastIndex`，此时的`lastIndex`一定是最后一次出现`{{}}`的位置，此时如果`text`的长度还大于`lastIndex`，说明最后一次`{{}}`后还有纯文本，我们要提取出来`push`进数组。

最后进行字符串拼接即可。

在此处有一个需要注意的点，`defaultTagRE`，注意一下正则表达式`/g`对`exec()`测试结果的影响

> 对于`exec()`方法而言，在全局模式下，它每次执行都只会返回一个匹配项，并且会改变`lastIndex`的值，再次执行的时候，会从`lastIndex`这个位置开始继续搜索。

因此我们在每次循环之前都需要将`defaultTagRE.lastIndex`置为0，重新设置索引。

```javascript
const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/g; //{{}}
function gen(node) {
  if (node.type === 1) {
    return codeGen(node);
  } else {
    let text = node.text;
    if (!defaultTagRE.test(text)) {
      return `_v(${JSON.stringify(text)})`;
    } else {
      //_v(_s(name) + 'hello')
      let tokens = [];
      let match;
      //重新设置索引
      defaultTagRE.lastIndex = 0;
      let lastIndex = 0;
      while ((match = defaultTagRE.exec(text))) {
        let index = match.index; //匹配的位置
        if (index > lastIndex) {
          tokens.push(JSON.stringify(text.slice(lastIndex, index)));
        }
        tokens.push(`_s(${match[1].trim()})`);
        lastIndex = index + match[0].length;
      }
      if (lastIndex < text.length) {
        tokens.push(JSON.stringify(text.slice(lastIndex)));
      }
      return `_v(${tokens.join("+")})`;
    }
  }
}
```

最后，我们在`codeGen`函数里返回代码字符串`code`。











