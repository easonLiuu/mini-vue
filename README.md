# Mini-Vue

学源码最好的方法是实现源码。

本仓库是试着实现一个vue的简易版本，主要是深入理解vue原理，不仅仅是为了面试，在开发中你所遇到的问题可能都是对vue的理解不够深入。

另外，这是我的博客

[Vue相关](https://www.yuque.com/easonliu-rl8as/tk4pbo)

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
### 生成render函数

上面我们把ast语法树转换成了代码字符串，我们需要的是生成`render`方法并执行它，最简单的方法就是`new Function`一下，此处我们用`with`包裹了一下。

> with语句，可以方便地用来引用某个特定对象中已有的属性，用于设置代码在特定对象中的作用域。

也就是说，如果代码字符串中data里面的变量，使用`with(this)`，就是取this下面变量，比如`this.name`，此处的this就是当前vm实例。

另外说一下，模版引擎的实现原理就是 `with + new Function`

```javascript
export function compileToFunction(template) {
  let ast = parseHTML(template);
  let code = codeGen(ast);ender方法执行后的返回结果就是虚拟DOM)
  //模版引擎的实现原理      with + new Function
  code = `with(this){return ${code}}`
  let render = new Function(code);
  return render;
}
```

在`initMixin`方法里我们获取了`render`方法，我们需要调用`render`产生虚拟DOM。因此我们定义了`mountComponent`方法用来组件的挂载，这个方法主要有三大逻辑：

- 调用`render`产生虚拟DOM
- 根据虚拟DOM产生真实DOM
- 插入到el元素中

```javascript
export function initMixin(Vue) {
  ...
  Vue.prototype.$mount = function (el) {
      ...
      //写了template就用写了的template
      if (template) {
        //对模版编译
        const render = compileToFunction(template);
        ops.render = render;
      }
    }
    //最终获取render方法
    //组件的挂载
    mountComponent(vm, el);
  };
}

```

```javascript
export function initLifeCycle(Vue) {
  Vue.prototype._update = function () {
    console.log("update");
  };
  Vue.prototype._render = function () {
    console.log("render");
  };
}

export function mountComponent(vm, el) {
  //这里的el是通过querySelector处理过的
  vm.$el = el;
  //1.调用render 产生虚拟DOM
  vm._update(vm._render()); //vm.$options.render()  虚拟节点
  //2.根据虚拟DOM产生真实DOM
  //3.插入到el元素中
}

```

在调用`render`产生虚拟DOM和生成真实DOM时，我们调用了实例上的方法，因此需要在Vue原型上扩展方法，并在入口文件里`initLifeCycle(Vue)`初始化。

其中`vm._render()`就是执行代码生成的`render`函数，生成虚拟节点。

`vm._update()`就是生成真实DOM。

```javascript
import { initMixin } from "./init";
import { initLifeCycle } from "./lifecycle";

function Vue(options) {
  //默认调用_init
  this._init(options);
}
initMixin(Vue); //扩展init方法
initLifeCycle(Vue);
export default Vue;
```

讲到这里，我们先来把vue的核心流程梳理一下：

- 创造响应式数据 
- 模版转换成ast语法树 
- ast语法树转换成`render`函数 
- 后续每次数据更新可以只执行`render`函数，无需再次执行ast转换的过程
- `render`函数会产生虚拟节点
- 根据生成的虚拟节点创建真实DOM

### 虚拟DOM生成真实DOM

上面我们知道了在`vm.render()`里调用了生成的`render`函数，`render`函数用来生成虚拟DOM。因为`_render`是实例上面的方法，我们需要在Vue原型上定义这个方法。调用`render`方法时注意要改变this指向，目的是让with中的this指向vm。`render`里有`_c`，`_v`，`_s`等方法，我们也需要定义一下，其中`createElementVNode`是创建元素节点，`createTextVNode`是创建文本节点，`_s`里面就是对插值表达式里面对应的值进行处理。

```javascript
export function initLifeCycle(Vue) {
  ...
  //_c('div',{},...children)
  Vue.prototype._c = function () {
    return createElementVNode(this, ...arguments);
  };
  //_v(text)
  Vue.prototype._v = function () {
    return createTextVNode(this, ...arguments);
  };
  Vue.prototype._s = function (value) {
    console.log(value);
    if (typeof value !== "object") return value;
    return JSON.stringify(value);
  };
  Vue.prototype._render = function () {
    //渲染时会去实例中取值 属性和试图绑在一起
    const vm = this;
    //让with中的this指向vm
    return vm.$options.render.call(vm);
  };
}
```

我们来看看`createElementVNode`、`createTextVNode`的内部实现，这里就不赘述，逻辑很简单，本质上就是创建虚拟DOM，其中key属性就是我们后面进行diff时使用的。

这里需要注意一下ast语法树和虚拟DOM的区别：

- ast是语法层面的转化，描述语法本身，描述js css html等语言的
- 虚拟DOM：描述的dom元素，可以增加自定义属性，描述DOM的

```javascript
//h() _c()
export function createElementVNode(vm, tag, data, ...children) {
  if (data == null) {
    data = {};
  }
  let key = data.key;
  if (key) {
    delete data.key;
  }
  return vnode(vm, tag, key, data, children);
}

//_v()
export function createTextVNode(vm, text) {
  return vnode(vm, undefined, undefined, undefined, undefined, text);
}
function vnode(vm, tag, key, data, children, text) {
  return {
    vm,
    tag,
    key,
    data,
    children,
    text,
  };
}
```

接下来我们就需要将虚拟DOM转换成真实DOM，也就是调用`vm._update`方法，这个方法也需要在原型上定义，把虚拟DOM作为参数传入，在上一节中我们把el赋给了`vm.$el`，然后我们这个方法里取到el，注意这个el不能从options上取，`vm.$el`取到的el是通过`querySelector`处理过的，紧接着我们调用了`patch`方法，这个方法是核心，既有初始化的功能，又有更新(diff)的功能。

```javascript
export function initLifeCycle(Vue) {
  //虚拟dom变成真实dom
  Vue.prototype._update = function (vnode) {
    const vm = this;
    const el = vm.$el;
    //patch既有初始化的功能 又有更新的功能
    vm.$el = patch(el, vnode);
  };
  ...
}
```

我们看一下`patch`方法的实现，传入两个参数分别是旧虚拟DOM和新虚拟DOM，这个方法牵扯到diff算法，我们在这一节不讲解，我们主要看一下初渲染流程，首先根据`oldVNode.nodeType`判断是不是一个真实元素，如果是我们获取它并拿到它的父元素，紧接着使用`createElm`创建真实元素，创建后的真实DOM我们赋给`newEle`，注意此时插入真实DOM的方式，我们应该先在elm后插入真实DOM，再删除老节点(elm)，否则顺序会乱。

```javascript
function patch(oldVNode, vnode) {
  //初渲染流程
  const isRealElement = oldVNode.nodeType;
  if (isRealElement) {
    const elm = oldVNode; //获取真实元素
    const parentElm = elm.parentNode; //拿到父元素
    //创建真实元素
    let newEle = createElm(vnode);
    parentElm.insertBefore(newEle, elm.nextSibling); //先插入再删 否则顺序会乱
    parentElm.removeChild(elm); //删除老节点
    return newEle;
  } else {
    //diff算法
  }
}
```

然后我们看一下`createElm`的内部实现，逻辑很简单，就是创建真实DOM，这里有一个`vnode.el = document.createElement(tag)`，是将真实节点和虚拟节点对应起来，后面如果修改属性了，可以直接找到虚拟节点对应的真实节点，主要用来后面的diff算法。其中函数里调用了`patchProps`方法，用来更新属性。

```javascript
function createElm(vnode) {
  let { tag, data, children, text } = vnode;
  if (typeof tag === "string") {
    //这里将真实节点和虚拟节点对应起来 后面如果修改属性了 可以直接找到虚拟节点对应的真实节点
    vnode.el = document.createElement(tag); 
    //更新属性
    patchProps(vnode.el, data);
    children.forEach((child) => {
      vnode.el.appendChild(createElm(child));
    });
  } else {
    vnode.el = document.createTextNode(text);
  }
  return vnode.el;
}
```

我们看一下`patchProps`的内部实现，逻辑也比较简单，就是对属性进行一个循环，然后使用`setAttribute`设置属性，这里对style属性做了单独处理。

```javascript
function patchProps(el, props) {
  for (let key in props) {
    if (key === "style") {
      //style{color: 'red'}
      for (let styleName in props.style) {
        el.style[styleName] = props.style[styleName];
      }
    } else {
      el.setAttribute(key, props[key]);
    }
  }
}
```

最后我们回到`_update`方法，重新设置`vm.$el`，我们把`patch`返回的结果赋给`vm.$el`，用来后面的diff。

```javascript
export function initLifeCycle(Vue) {
  Vue.prototype._update = function (vnode) {
    const vm = this;
    const el = vm.$el;
    vm.$el = patch(el, vnode);
  };
}
```
### 依赖收集

vue中有一个思想：数据驱动视图。我们可以理解成：当`data`中的属性发生变化时，使用该视图的数据也需要随之发生变化。而实现这一功能核心逻辑就是依赖收集，我们来说一下这一逻辑的大概思路：

- 给模版中的属性，增加一个收集器`dep`
- 页面渲染时，渲染逻辑封装到`watcher`中 ，也就是`vm._update(vm._render())`
- 让`dep`记住这个`watcher`，稍后属性变化了，可以找到对应的`dep`中存放的`watcher`进行重新渲染

我们改造一下`mountComponent`函数，这个函数`new`了`Watcher`类，也就是说，我们将渲染逻辑封装到了`Watcher`类中。

```javascript
export function mountComponent(vm, el) {
  vm.$el = el;
  const updateComponent = () => {
    vm._update(vm._render());
  };
  const watcher = new Watcher(vm, updateComponent, true); //true用于标识是一个渲染Watcher
}
```

在实现`Watcher`类和`Dep`类之前，我们梳理一下`dep`和`watcher`的关系：

- 首先我们要知道，需要给每个属性增加一个`dep`，目的就是收集`watcher`，一个组件一个`watcher`，不同组件有不同的`watcher`
- 一个组件中，有多个属性，n个属性对应一个组件，因此n个`dep`对应一个`watcher`
- 一个属性可以对应多个组件，因此一个`dep`对应多个`watcher`
- 因此`dep`和`watcher`是**双向的、多对多的**关系

看一下`Watcher`类的实现，这里我们只需要先知道在创建`watcher`实例时调用了`get`方法，方法里会执行传入的`fn`方法用来渲染，在这个过程中会去`vm`上取值。`Dep.target = this`就是将`dep`和`watcher`关联起来，当创建渲染`watcher`时我们会把当前渲染的`watcher`放到`Dep.target`上，渲染完毕后清空。

```javascript
import Dep from "./dep";

let id = 0;
//每个属性有一个dep 属性是被观察者 watcher是观察者 属性变化了会通知观察者来更新 观察者模式
class Watcher {
  constructor(vm, fn, options) {
    this.id = id++;
    this.renderWatcher = options;
    this.getter = fn;
    this.deps = []; //后续实现计算属性和清理工作要用
    this.depsId = new Set();
    this.get(); //getter意味着调用这个函数可以发生取值操作
  }
  addDep(dep) {
    //一个组件对应多个属性 重复的属性也不用记录
    let id = dep.id;
    if (!this.depsId.has(id)) {
      this.deps.push(dep);
      this.depsId.add(id);
      dep.addSub(this); //watcher记住了dep dep也记住了watcher
    }
  }
  get() {
    Dep.target = this; 
    this.getter(); 
    Dep.target = null; 
  }
  update() {
    //属性更新重新渲染
    this.get();
  }
}

export default Watcher;

```

下面看一下`Dep`类的实现，用来收集`watcher`，`subs`用来存放当前属性对应的`watcher`，类中有`depend`方法，我们知道此时的`Dep.target`上是当前`watcher`实例，也就是说调用了`watcher`实例上面的`addDep`方法。

```javascript
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

export default Dep;

```

`depend`调用是在取值时调用，目的让当前取到的属性的收集器记住当前的`watcher`，其中，没有用到的属性不会被收集。

```javascript
export function defineReactive(target, key, value) {
  observe(value);
  let dep = new Dep(); //每一个属性都有一dep
  Object.defineProperty(target, key, {
    //取
    get() {
      if (Dep.target) {
        dep.depend(); //让这个属性的收集器记住当前的watcher
      }
      return value;
    },
    //修改
    set(newValue) {
      if (newValue === value) return;
      observe(newValue);
      value = newValue;
      dep.notify();//通知更新
    },
  });
}
```

但需要注意，不能像下面这么写：

```javascript
depend() {
    //不希望放重复的watcher 
    //下面这样写会重
    this.subs.push(Dep.target);
}
```

原因在于，一个组件对应多个属性，重复的属性也不用记录，这也就是上述代码中`depend`方法调用`addDep`的原因。

```javascript
addDep(dep) {
    let id = dep.id;
    if (!this.depsId.has(id)) {
      this.deps.push(dep);
      this.depsId.add(id);
      dep.addSub(this); //watcher记住了dep 而且去重了 此时dep也记住了watcher
    }
}
```

在`Watcher`类中，我们定义了`deps`数组，用于后续实现计算属性和清理工作，并将当前`dep`实例push进数组中，这就实现了`watcher`记住了`dep`并且实现了去重。

紧接着我们调用`dep`上的`addSub`方法，这个方法就是让`dep`记住`watcher`，就是前面所说的让当前取到的属性的收集器记住当前的`watcher`。

```javascript
addSub(watcher){
    this.subs.push(watcher); 
}
```

下面就比较好理解了，我们在修改属性值时调用`dep.notify`通知更新即可，因为此时该属性的收集器存放着该属性对应的`watcher`。

我们调用`watcher.update`告诉`watcher`要更新了，`get`方法就是调用了传入的`fn`函数，也就是`vm._update(vm._render())`。

至此，实现了数据驱动视图。

```javascript
 set(newValue) {
      if (newValue === value) return;
      observe(newValue);
      value = newValue;
      dep.notify();//通知更新
 },
```

```javascript
notify(){
    this.subs.forEach(watcher=>watcher.update()); //告诉watcher要更新了
}
```

```javascript
 update() {
    //属性更新重新渲染
    this.get();
 }
```

收集依赖里，每个属性有一个`dep`，属性是被观察者，`watcher`是观察者，属性变化了会通知观察者来更新，这就是设计模式里的经典模式——观察者模式。
### 异步更新

vue执行DOM更新是异步的， 只要是观察到数据变化， vue将会开启一个队列， 并缓冲在同一事件循环中发生的所有数据改变。 如果同一个watcher被多次触发，只会被推如到队列中一次。 在这种缓冲时去除重复数据对于避免不必要的计算，和DOM 操作非常重要。

在我们用vue时，我们经常用到一个方法是this.$nextTick（可以理解为是一次异步操作），常用的场景是在进行获取数据后，需要对新视图进行下一步操作或者其他操作时，发现获取不到dom**。赋值操作只完成了数据模型的改变并没有完成视图更新，这个时候需要$nextTick，接下来我们试着实现一下这一部分。

在之前的update方法中，我们直接使用了this.get()进行了渲染，在这里我们需要改成异步的，我们定义了queueWatcher函数，它用来把当前watcher暂存起来。

```javascript
 update() {
    //属性更新重新渲染
    //this.get();
    queueWatcher(this); //把当前watcher暂存起来
 }
```

在queueWatcher方法中，我们先定义了queue队列，用来存储watcher，然后对watcher进行了去重操作，这里我们需要明确的一点是，不管update执行多少次，刷新只执行一次，所以定义了一个pending用来防抖，就比如我们依次更改属性值，vm.name='a',vm.name='b'，这里update了两次，但我们只需要进行一次刷新操作，在第一次watcher进队列时，就把pending设为true了，那么下一次就不会进入if (!pending)里执行了，我们看到有一个nextTick方法，这个方法里有定时器相关操作，根据浏览器事件原理，定时器等同步代码执行完再执行，也就是说，第一次watcher进队列时，nextTick里的代码不会立即执行。

```javascript
//多次更新 只会把它们暂存到一个队列里，后面时间到了再执行更新操作
let queue = [];
let has = {};
let pending = false; //防抖
function queueWatcher(watcher) {
  const id = watcher.id;
  if (!has[id]) {
    queue.push(watcher);
    has[id] = true;
    //不管update执行多少次 刷新只执行一次
    if (!pending) {
      //定时器等同步代码执行完再执行 不会立即执行
      nextTick(flushSchedulerQueue, 0);
      pending = true;
    }
  }
}
```

我们来看一下nextTick的内部实现，定义了一个callbacks数组，用来维护nextTick中的callback方法，waiting和上面的pending是一个道理，其中timerFunc里有定时器相关方法，也不会立即执行。

这里我们总结一下，多次执行变成一步，只需要定义一下变量然后开一个异步方法就可以了。

我们要注意的是，nextTick中没有直接使用某个api，而是采用优雅降级的方式，内部先采用的是promise，如果浏览器不兼容，用MutationObserver，它也是个异步的方法，再不兼容，考虑ie专享的，setImmediate。我们可以看到在异步里直接调用flushCallbacks方法，这个就是按照顺序依次执行传入的回调。

这里说一下let observer = new MutationObserver(flushCallbacks)，这里传入的回调是异步执行，所以下面定义了一个文本节点然后监听文本的变化，文本从1变成2，回调函数就执行了。

```javascript
let callbacks = [];
let waiting = false;
//异步批处理
function flushCallbacks() {
  let cbs = callbacks.slice(0);
  waiting = false;
  callbacks = [];
  cbs.forEach((cb) => cb()); //按照顺序依次执行
}
let timerFunc;
if (Promise) {
  timerFunc = () => {
    Promise.resolve().then(flushCallbacks);
  };
} else if (MutationObserver) {
  let observer = new MutationObserver(flushCallbacks); //这里传入的回调是异步执行
  let textNode = document.createTextNode(1);
  observer.observe(textNode, {
    characterData: true,
  });
  timerFunc = () => {
    textNode.textContent = 2;
  };
} else if (setImmediate) {
  timerFunc = () => {
    setImmediate(flushCallbacks);
  };
} else {
  timerFunc = () => {
    setTimeout(flushCallbacks);
  };
}
export function nextTick(cb) {
  callbacks.push(cb); //维护nextTick中的callback方法
  if (!waiting) {
    // setTimeout(() => {
    //   flushCallbacks(); //最后一起刷新
    // }, 0);
    timerFunc();
    waiting = true;
  }
}

```

回到queueWatcher函数，我们在nextTick里传入的回调是flushSchedulerQueue，这个就是刷新调度队列的函数了，刷新的过程中，可能还有新的watcher，重新放到queue中。run方法就是Watcher类上的方法，里面执行更新渲染操作。

```javascript
//刷新调度队列
function flushSchedulerQueue() {
  let flushQueue = queue.slice(0);
  queue = [];
  has = {};
  pending = false;
  flushQueue.forEach((q) => q.run()); //刷新的过程中 可能还有新的watcher 重新放到queue中
}
```

```javascript
run() {
    this.get();
}
```

至此我们知道了，nextTick不是创建了一个异步任务，而是将这个任务维护到了队列里。

最后为了测试一下方法是否正确，我们在原型上挂载一下nextTick。

```javascript
Vue.prototype.$nextTick = nextTick
```

