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

vue执行DOM更新是异步的， 只要是观察到数据变化， vue将会开启一个队列， 并缓冲在同一事件循环中发生的所有数据改变。 如果同一个watcher被多次触发，只会被推如到队列中一次。 在这种缓冲时去除重复数据对于避免不必要的计算，和DOM操作非常重要。

在我们用vue时，我们经常用到一个方法是`this.$nextTick`（可以理解为是一次异步操作），常用的场景是在进行获取数据后，需要对新视图进行下一步操作或者其他操作时，发现获取不到DOM。赋值操作只完成了数据模型的改变并没有完成视图更新，这个时候需要`$nextTick`，接下来我们试着实现一下这一部分。

在之前的`update`方法中，我们直接使用了`this.get()`进行了渲染，在这里我们需要改成异步的，我们定义了`queueWatcher`函数，它用来把当前`watcher`暂存起来。

```javascript
 update() {
    //属性更新重新渲染
    //this.get();
    queueWatcher(this); //把当前watcher暂存起来
 }
```

在`queueWatcher`方法中，我们先定义了`queue`队列，用来存储`watcher`，然后对`watcher`进行了去重操作，这里我们需要明确的一点是，不管`update`执行多少次，刷新只执行一次，所以定义了一个`pending`用来防抖，就比如我们依次更改属性值，`vm.name='a',vm.name='b'`，这里update了两次，但我们只需要进行一次刷新操作，在第一次`watcher`进队列时，就把pending设为true了，那么下一次就不会进入`if (!pending)`里执行了，我们看到有一个`nextTick`方法，这个方法里有异步相关操作，根据浏览器事件原理，定时器等同步代码执行完再执行，也就是说，第一次`watcher`进队列时，`nextTick`里的代码不会立即执行。

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

我们来看一下`nextTick`的内部实现，定义了一个`callbacks`数组，用来维护`nextTick`中的`callback`方法，`waiting`和上面的`pending`是一个道理，其中`timerFunc`里有定时器相关方法，也不会立即执行。

这里我们总结一下，多次执行变成一步，只需要定义一下变量然后开一个异步方法就可以了。

我们要注意的是，`nextTick`中没有直接使用某个api，而是采用优雅降级的方式，内部先采用的是`promise`，如果浏览器不兼容，用`MutationObserver`，它也是个异步的方法，再不兼容，考虑ie专享的，`setImmediate`。我们可以看到在异步里直接调用`flushCallbacks`方法，这个就是按照顺序依次执行传入的回调。

这里说一下`let observer = new MutationObserver(flushCallbacks)`，这里传入的回调是异步执行，所以下面定义了一个文本节点然后监听文本的变化，文本从1变成2，回调函数就执行了。

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

回到`queueWatche`r函数，我们在nextTick里传入的回调是`flushSchedulerQueue`，这个就是刷新调度队列的函数了，刷新的过程中，可能还有新的`watcher`，重新放到`queue`中。`run`方法就是`Watcher`类上的方法，里面执行更新渲染操作。

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

至此我们知道了，`nextTick`不是创建了一个异步任务，而是将这个任务维护到了队列里。

最后为了测试一下方法是否正确，我们在原型上挂载一下`nextTick`

```javascript
Vue.prototype.$nextTick = nextTick
```
### mixin与生命周期

> mixin（混入），提供了一种非常灵活的方式，来分发 Vue 组件中的可复用功能。

本质其实就是一个`js`对象，它可以包含我们组件中任意功能选项，如`data`、`components`、`methods`、`created`、`computed`等等

我们只要将共用的功能以对象的方式传`mixin`选项中，当组件使用`mixin`对象时所有`mixin`对象的选项都将被混入该组件本身的选项中来。

在日常的开发中，我们经常会遇到在不同的组件中经常会需要用到一些相同或者相似的代码，这些代码的功能相对独立。这时，可以通过`Vue`的`mixin`功能将相同或者相似的代码提出来。

常用方法如下：

```javascript
      Vue.mixin({
        created(){
            console.log('create1')
        }
      })
      Vue.mixin({
        created(){
            console.log('create2')
        }
      })
```

下面我们来看一看mixin的内部实现，mixin是全局上面的一个方法，所以我们定义initGlobalAPI用来初始化，里面定义了options对象和mixin静态方法，紧接着调用mergeOptions将用户的选项和全局上的options进行合并。比如下面：

`{} {created:function(){}} => {created: [fn]}`

`{created:[fn]} {created:function(){}} => {created:[fn,fn]}`

最开始`options`上为空，我们混入了一个`created`，这时需要将`created`和`options`合并，因此此时的`options`里有一个`created`，紧接着我们有混入了一个`created`，那么继续合并。

```javascript
export function initGlobalAPI(Vue) {
  //静态方法
  Vue.options = {};
  Vue.mixin = function (mixin) {
    //将用户的选项和全局上的options进行合并
    this.options = mergeOptions(this.options, mixin);
    return this;
  };
}

```

最后在`index.js`里调用此函数用于初始化。

```javascript
function Vue(options) {
  //默认调用_init
  this._init(options);
}
Vue.prototype.$nextTick = nextTick;
initMixin(Vue); //扩展init方法
initLifeCycle(Vue);
initGlobalAPI(Vue);
export default Vue;
```

那`mergeOptions`里是如何实现合并逻辑的呢？我们首先循环`parent`，也就是之前的`options`，然后调用`mergeField`方法，紧接着循环新的，也就是新的混入，如果新混入的`key`在`parent`中没有的话，那么调用`mergeField`方法。关于`mergeField`方法就是详细的核心的合并逻辑了，我们先来看`else`后面的，这部分是基础类型的合并逻辑，我们优先采用新的，比如下面：我们肯定是使用a:2。

```javascript
      Vue.mixin({
       a:1
      })
      Vue.mixin({
       a:2
      })
```

```javascript
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
```

而在`if`里面这些合并逻辑，是和生命周期方法有关的，这里我们采用了策略模式减少了`ifelse`，看一看`strats`的实现，这里在`LIFECYCLE`数组里只定义了两个生命周期，是为了简洁。循环`LIFECYCLE`添加生命周期方法。如果此时`p`和`c`都存在，那么我们就将其拼接在一起，如果只有`c`有，也就是第一次混入时，那么将其包装成一个数组。

 `{} {created:function(){}} => {created: [fn]}`，此时`parent[key]`为空，第一次混入，包装成`[fn]`。
 `{created:[fn]} {created:function(){}} => {created:[fn,fn]}`，第二次又混入了`created`方法，将其拼接。

```javascript
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
```

此时我们只是把混入的合并了，那如果用户也定义了相同的生命周期方法呢？比如下面的`created`，该如何合并？

```javascript
      Vue.mixin({
        created(){
            console.log('create1')
        }
      })
      Vue.mixin({
        created(){
            console.log('create2')
        }
      })
      const vm = new Vue({
        data() {
          return {
           ...
          };
        },
        created(){
            console.log('create3')
        }
      });
```

在初始化操作里，我们将用户的选项挂载到实例上，此时就可以将用户传的和全局配的(`this.constructor.options`)进行合并，最后挂载到`vm.$options`上。挂载完成后我们首先调用了`beforeCreate`生命周期函数，初始化状态结束后我们调用了`created`生命周期函数。

```javascript
 Vue.prototype._init = function (options) {
    //vm.$options： 获取用户的配置
    const vm = this;
    vm.$options = mergeOptions(this.constructor.options, options);
    callHook(vm, 'beforeCreate');
    //初始化状态
    initState(vm);
    callHook(vm, 'created');
    if (options.el) {
      //实现数据的挂载
      vm.$mount(options.el);
    }
  };
```

我们看一下`callHook`的实现，内部逻辑很简单，就是调用生命周期钩子函数，从`vm.$options[hook]`获取混入的和用户传的钩子函数合并后的的数组，然后循环依次执行，注意要将`this`指向当前`vue`实例。

```javascript
export function callHook(vm, hook) { //调用钩子函数
  const handlers = vm.$options[hook];
  if (handlers) {
    handlers.forEach((handler) => handler.call(vm));
  }
}
```

`mergeOptions`方法中可以看出它大致分为几个步骤：

- 校验混入对象的选项；
- 判断混入对象是否有`mixin`选项，有则递归进行合并；
- 定义一个 `options`，作为 `merge`的结果集；
- 将前者的选项通过策略模式合并到`options`；
- 后者中如果还存在其他的选项，则通过策略模式合并到`options`；
- 返回合并的结果`options`；

`mixin`的本质还是对象之间的合并，但是对不同对象和方法右不同的处理方式，对于普通对象，就是简单的对象合并类似于`Object.assign`(这部分没有说，有兴趣可以查看源码)，对于基础类型就是后面的覆盖前面的，而对于**生命周期上的方法，相同的则是合并到一个数组中，调用的时候依次调用。**
### 数组的依赖收集与更新

上面我们通过覆盖数组原型重写数组方法的方式侦测到了数组中元素和新增元素的变化并把它们转换成了响应式的，但如何收集依赖并触发依赖更新视图呢，我们看一看这一部分。

为什么`vm.arr.push(100)`不能更新视图呢？因为我们改变的不是`arr`属性，而是`arr`对象的数组对象，所以视图不会更新，因此我们需要给数组增加`dep`，如果数组新增了某一项，触发`dep`更新，这部分就是收集依赖。

但此处需要注意一下，我们也需要给对象增加`dep`，后续用户新增了属性，要触发`dep`更新，不过这个和数组依赖收集没什么关系，主要和`vm.$set`方法有关系，这里就不再赘述。

还要注意一点，之前是对象每一个属性都有一个`dep`，本节的`dep`一个数组或者一个对象的`dep`。

```javascript
		 const vm = new Vue({
        el: "#app",
        data: {
          arr: [1, 2, 3, ['a', 'b']], //给数组增加dep 如果数组新增了某一项 触发dep更新
          a: { a: 1 }, //给对象增加dep 后续用户新增了属性 触发dep更新
        },
      });
      //vm.arr[0] = 100; //监控不到变化 只重写了数组方法
     
      setTimeout(() => {
        vm.arr[3].push(100);
      }, 1000);
```

`vue`中把`array`的依赖存在了`Observer`中，是因为我们要保证这个依赖在`getter`和拦截器中都可以访问到。在`getter`中访问并收集依赖。

在`Observer`类中，`data`可能是对象也可能是数组，不管是什么，我们要给所有都要增加`dep`，都添加依赖收集功能。

```javascript
class Observer {
  constructor(data) {
    this.dep = new Dep(); //所有对象都要增加dep  给每个对象都添加依赖收集功能
    //这个data可能是对象也可能是数组
    ....
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
```

我们调用了`observe`函数，把`value`当作参数传了进去并拿到返回值，也就是`Observer`实例。实例上有`dep`了，我们就可以实现在`getter`中将收集依赖到`Observer`实例的`dep`中。也就是说，`childOb.dep`是用来收集依赖的。接下来通知依赖发生改变更新视图就可以了。

如果`arr: [1, 2, 3, ['a', 'b']]`，我们`vm.arr.push(100)`，视图会发生改变。

如果是`vm.arr[3].push(100)`这样的呢？

所以我们要继续判断当前的`value`是不是数组，如果是，调用`dependArray`继续收集依赖。

```javascript
export function defineReactive(target, key, value) {
  let childOb = observe(value); //childOb.dep 用来收集依赖的
  let dep = new Dep(); //每一个属性都有一dep
  //value存放在了闭包
  Object.defineProperty(target, key, {
    //取
    get() {
      if (Dep.target) {
        dep.depend(); 
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
    ...
  });
}
```

`dependArray`的逻辑很简单，就是一个深层次嵌套递归操作，这里就不说了。

```javascript
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
```

我们在拦截器中也可以访问到`dep`依赖，在数组拦截器里，当数组发生变化时，通知对应的`watcher`实现更新逻辑就可以了。

```javascript
ob.dep.notify(); //数组变化了通知对应的watcher实现更新逻辑
```
### 实现computed计算属性

先来回顾一下用法：

```html
    <div id="app">{{fullname}} {{fullname}}</div>
    <script src="vue.js"></script>
    <script>
      const vm = new Vue({
        el: "#app",
        data: {
          firstname: "L",
          lastname: "JR",
        },
        //计算属性依赖的值发生变化才会重新执行用户方法 dirty属性
        //默认计算属性不会立刻执行
        //计算属性就是一个defineProperty
        //计算属性也是一个watcher  默认渲染时会创造一个渲染watcher
        //底层就是一个带有dirty属性的watcher
        computed: {
          //fullname(){
          //    return this.firstname + this.lastname
          //}
          fullname: {
            get() {
              console.log('run')
              return this.firstname + this.lastname;
            },
            set(newVal) {
              console.log(newVal);
            },
          },
        },
      });
      setTimeout(() => {
        vm.firstname = "gg";  //执行计算属性watcher更新操作  dirty=true
      }, 1000);
```

接下来试着实现一下它，在初始化状态`initState`时，这个状态可能是`data`、`watch`、`computed`等，因此我们要在`initState`里调用初始化计算属性的函数`initComputed`。

```javascript
export function initState(vm) {
  const opts = vm.$options;
  ...
  if (opts.computed) {
    initComputed(vm);
  }
}
```

看一下`initComputed`函数，我们首先获取了`computed`，在循环`computed`前，定义了`watchers`，它是用来保存计算属性`watcher`的，并将计算属性`watcher`保存到`vm`上，循环`computed`判断是函数还是对象，紧接着`new`了一个`Watcher`，将属性名作为`key`保存进了`watchers`中，前面说过计算属性就是一个`defineProperty`，所以调用了`defineComputed`定义属性。

这里`lazy: true`的含义是懒执行，如果直接`new Watcher`，默认会执行`fn`，因此加了一个标识符号，只有取值的时候，才执行`fn`函数，也就是`get`函数。

```javascript
function initComputed(vm) {
  const computed = vm.$options.computed;
  //计算属性的所有watcher  方便后面取值
  const watchers = (vm._ComputedWatcher = {}); //将计算属性watcher保存到vm上
  for (let key in computed) {
    let userDef = computed[key];
    let fn = typeof userDef === "function" ? userDef : userDef.get;
    //监控计算属性中get的变化
    //如果直接new Watcher 默认会执行fn
    //懒执行

    watchers[key] = new Watcher(vm, fn, { lazy: true });
    //定义属性
    defineComputed(vm, key, userDef);
  }
  //console.log(computed)
}
```

看一下`Watcher`中的改造，对`lazy`属性进行了判断。其中`dirty`含义是是否从缓存中拿值，这个我们后面说。

```javascript
class Watcher {
  //不同组件有不同的Watcher  目前只有一个渲染根组件
  constructor(vm, fn, options) {
    this.id = id++;
    this.renderWatcher = options;
    this.getter = fn;
    this.deps = []; //后续实现计算属性和清理工作要用
    this.depsId = new Set();
    this.lazy = options.lazy;
    this.dirty = this.lazy; //缓存值
    this.vm = vm;
    this.lazy ? undefined : this.get();
    //this.get(); //getter意味着调用这个函数可以发生取值操作
  }
  get() {
    pushTarget(this);
    let value = this.getter.call(this.vm);
    popTarget();
    return value;
  }
}
```

除此之外我们对`get`方法也进行了改造，我们定义了一个栈，渲染时将`watcher`入栈，渲染完出栈，至于为什么要改造成栈的形式，我们后面说。

```javascript
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
```

接下来看一下`defineComputed`这个函数，因为上面说过计算属性就是一个`defineProperty`，需要能通过实例拿到对应的计算属性，因此定义了这个方法，在`get`中我们没有直接使用`getter`，因为计算属性有缓存，我们需要定义一个函数是和缓存有关的，如果直接写`getter`就没有缓存了。

```javascript
function defineComputed(target, key, userDef) {
  //const getter = typeof userDef === 'function' ? userDef : userDef.get;
  const setter = userDef.set || (() => {});
  //可以通过实例拿到对应的属性
  Object.defineProperty(target, key, {
    //创造计算属性的watcher
    get: createComputedGetter(key),
    set: setter,
  });
}
```

然后我们看一下`createComputedGetter`这个函数，这个函数就是检测是否要执行这个`getter`，返回了一个函数，我们通过 `this._ComputedWatcher`获取到对应属性的`watcher`，然后判断当前`watcher`实例上的`dirty`，如果是true，那么需要计算。

```javascript
function createComputedGetter(key) {
  return function () {
    const watcher = this._ComputedWatcher[key]; //获取到对应属性的watcher
    if (watcher.dirty) {
      //如果是脏的 执行用户传入的函数
      watcher.evaluate();
    }
    if (Dep.target) {
      //计算属性出栈后 还要渲染watcher 应该让计算属性watcher里面的属性 也去收集上一层watcher
      watcher.depend();
    }
    return watcher.value; //最后返回的是watcher上的值
  };
}
```

`Watcher`类中`evaluate`方法如下，我们就是调用了`get`方法获取到用户函数的返回值，并且结束后还要标识为脏数据。

```javascript
evaluate() {
    this.value = this.get(); //获取到用户函数的返回值 并且还要标识为脏
    this.dirty = false;
}
```
再把`update`方法改造一下，如果是计算属性，其依赖值发生变化，那么就要变成脏值。

```javascript
update() {
    //属性更新重新渲染
    //this.get();
    if (this.lazy) {
      this.dirty = true;
    } else {
      queueWatcher(this); //把当前watcher暂存起来
    }
  }
```

此时问题来了，执行完`get`后，计算属性出栈了，那此时如果改变计算属性依赖的值，dirty确实变化了，重新计算了，但是新的计算值能渲染到页面上吗？肯定是不行的，因为此时计算`watcher`依赖的属性收集的是当前的计算`watcher`，并不是渲染`watcher`，因此应该让计算属性`watcher`里面的属性，也去收集上一层`watcher`（渲染`watcher`)。

如果此时`Dep.target`上还有值，那么调用当前`watcher`实例上的`depend`方法，这个方法先获取当前计算属性`watcher`所依赖的属性，然后这些属性再收集渲染`watcher`。

```javascript
 depend(){
    let i = this.deps.length;
    while(i--){
        //让计算属性watcher也收集渲染watcher
        this.deps[i].depend()
    }
  }
```

最后我们`return watcher.value`，返回的是`watcher`上的值。

总结一下：

- 第一次渲染有栈，先放的是渲染`watcher`，渲染`watcher`在渲染时会去计算属性
- 一取计算属性，就走到了`evaluate`，它会把当前的计算属性入栈
- 我们走计算属性`watcher`时会取值，这个值是响应式数据，所以一定有`dep`，这两个`dep`会去收集计算属性`watcher `
- 改动依赖的值，通知的是计算属性`watcher`，更新了`dirty`，但是页面不会重新渲染
- 需要让依赖值记住渲染`watcher`，求完值之后，计算属性`watcher`出栈 ，此时`dep.target`是渲染`watcher`，调用`depend`就可以了

所以说，计算属性的底层就是一个带有`dirty`属性的`watcher`。
### 实现watch属性

我们先来看一下这个属性的用法，它一个对象，其中键是需要的观察的表达式，值是对应的回调函数。我们知道`vue`里有一个`vm.$watch`方法，它就是对一个目标进行监控，一旦该目标变化了的话，就会触发注册的回调函数。`vue`实例会在实例化调用`vm.$watch()`遍历`watch`对象的每一个属性。

```javascript
      const vm = new Vue({
        el: "#app",
        data: {
          firstname: "L",
          lastname: "JR",
        },
        watch: {
          //直接写函数
          firstname(newValue, oldValue){
              console.log('ok')
              console.log('222', newValue, oldValue)
          }
        //   firstname: [ //数组形式
        //     (newValue, oldValue) => {
        //       console.log(newValue);
        //     },
        //     (newValue, oldValue) => {
        //       console.log(newValue);
        //     },
        //   ],
        //   firstname:'fn' //fn是methods里定义的方法 我们这里省略了
        },
      });
      //就算上面的方式，也会被转换成$watch的写法
      vm.$watch(
        () => vm.firstname,
        (newValue, oldValue) => {
          console.log(newValue);
        }
      );
      setTimeout(() => {
        vm.firstname = "gg"; 
      }, 1000);
```

接着我们尝试实现它，首先在初始化状态时我们判断用户是否传入了`watch`，如果传入则调用`initWatch`方法初始化`watch`。

```javascript
export function initState(vm) {
  const opts = vm.$options;
  ...
  if (opts.watch) {
    initWatch(vm);
  }
}
```

接下来我们看一下`initWatch`的实现，使用`for...in`循环遍历`watch`对象，得到对象值并赋值给`handler`，根据官方给的用法，`handler`可能是数组、方法名(字符串)、函数等，根据`handler`的类型走不同的逻辑，但都是调用了`createWatcher`方法。

```javascript
function initWatch(vm) {
  let watch = vm.$options.watch;
  for (let key in watch) {
    //字符串数组函数
    const handler = watch[key];
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}
```

看一下`createWatcher`方法，首先判断传入的`handler`是否为字符串，如果是，说明这个字符串的值是一个方法名，在`methods`方法里，在初始化`methods`时我们将每一个方法挂载到了实例上，所以可以直接通过`vm[handler]`获取这个方法，最后赋给`handler`。然后调用`vm.$watch`将`watch`对象的键和值(`handler`)传入。也就是说，无论`watch`写成什么样，最终都会调用`vm.$watch`这个方法。

```javascript
function createWatcher(vm, key, handler) {
  if (typeof handler === "string") {
    handler = vm[handler];
  }
  return vm.$watch(key, handler);
}
```

定义一下`$watch`方法，里面就是`new`了一个`Watcher`，其中`{user:true}`代表用户自己写的`watcher`，后面会用到，`cb`就是回调函数，也就是`watch`对象的值。这里注意一个问题，`exprOrFn`就是上面的`key`，它既有可能是表达式，也可能是一个函数，因此需要改动一下`Watcher`类。

```javascript
Vue.prototype.$watch = function(exprOrFn, cb){
    //firstname
    //()=>vm.firstname
    //{user:true} 代表用户自己写的watcher
    //firstname值变化了 直接执行cb函数
    new Watcher(this, exprOrFn, {user:true}, cb)
}
```

在`Watcher`类中，需要判断`exprOrFn`的类型，如果是函数好说，如果不是函数需要将其包装成一个函数，比如是`firstname`，那么就需要包装成函数去取实例上的`firstname`的值，然后将传入的回调设为当前`watcher`实例上的回调。在`get`方法中，将第一次`getter`取到的值赋给`value`，当这个属性值发生改变时，会通知这个当前属性依赖收集器里面的所有`watcher`进行更新，也就是调用`run`方法，在`run`里获取新值以外，还要判断当前的`watcher`是不是自己的`watcher`，如果是，调用传入的回调函数，并将`newValue`和`oldValue`传入。

```javascript
class Watcher {
  //不同组件有不同的Watcher  目前只有一个渲染根组件
  constructor(vm, exprOrFn, options, cb) {
    ...
    if (typeof exprOrFn === "string") {
      this.getter = function () {
        return vm[exprOrFn]; //vm.firstname
      };
    } else {
      this.getter = exprOrFn;
    }
    this.cb = cb;
    this.user = options.user; //标识是不是用户自己watcher
    ...
  }
  ...
  get() {
    //让dep和watcher关联起来 把当前Watcher挂在全局上
    // Dep.target = this; //静态属性只有一份
    // this.getter(); //会去vm上取值
    // Dep.target = null; //渲染完毕后清空
    pushTarget(this);
    let value = this.getter.call(this.vm);
    popTarget();
    return value;
  }
  ...
  run() {
    let oldValue = this.value;
    let newValue = this.get();
    if(this.user){
        this.cb.call(this.vm, newValue, oldValue);
    }
  }
}
```

所以说，无论是`watch`属性，还是`computed`计算属性，都是对`Watcher`的一种封装。
### 基础diff

在之前的更新视图操作中，我们都是直接将新的替换DOM掉了老的DOM，这样对性能开销很大，因此应该将新的虚拟DOM和老的虚拟DOM进行一个对比，比较区别之后再替换，这就是我们说的`diff`算法，注意`diff`算法是一个平级比较的过程，父亲和父亲比对，儿子和儿子比对。

我们先来看一下基础`diff`流程：

- 判断两个节点是不是同一个节点，如果不是，直接删除老节点，换上新节点，无比对过程
- 如果是同一个节点，判断节点的`tag`和`key`，比较两个节点的属性是否有差异，如果有差异，复用老节点，将差异的属性更新
- 节点比较完毕后比较两人的儿子

下面我们完善`patch`函数，`if`里的逻辑是初渲染逻辑，这部分之前说过，我们主要看一下`else`里的逻辑，`return`了`patchVNode`函数。顾名思义，`patchVNode`函数就是比较新的虚拟DOM和老的虚拟DOM之间的差异的。

```javascript
export function patch(oldVNode, vnode) {
  //初渲染流程
  const isRealElement = oldVNode.nodeType;
  if (isRealElement) {
   ...
  } else {
    return patchVNode(oldVNode, vnode);
  }
}
```

下面看一下`patchVNode`的函数逻辑，首先调用`isSameVNode`方法判断两个节点是不是同一个节点，如果不是，那么没有比较过程，直接用老节点的父亲进行替换并返回新节点；如果是同一个节点，首先有一个特殊情况，节点的`tag`是`undefined`，可以判定为同一个节点，这种情况说明两个节点都是文本类型，我们期望比较文本的内容，首先复用老节点的元素，判断老节点的文本是否和新节点的文本相等，如果不相等，用新的文本覆盖掉老的。

紧接着如果两个节点都是标签类型并且是同一个节点，就需要比对标签的属性，这里调用了`patchProps`方法。

```javascript
function patchVNode(oldVNode, vnode) {
  if (!isSameVNode(oldVNode, vnode)) {
    let el = createElm(vnode);
    oldVNode.el.parentNode.replaceChild(el, oldVNode.el);
    return el;
  }
  let el = (vnode.el = oldVNode.el); //复用老节点的元素
  if (!oldVNode.tag) {
    //是文本
    if (!oldVNode.text !== vnode.text) {
      el.textContent = vnode.text; //用新的文本覆盖掉老的
    }
  }
  //是标签 需要比对标签的属性
  patchProps(el, oldVNode.data, vnode.data);
  //比较儿子节点 比较的时候 一方有儿子 一方没儿子
  //两方都有儿子
  let oldChildren = oldVNode.children || [];
  let newChildren = vnode.children || [];
  console.log(oldChildren, newChildren);
  if (oldChildren.length > 0 && newChildren.length > 0) {
    //完整diff 需要比较两个人的儿子
    updateChildren(el, oldChildren, newChildren);
  } else if (newChildren.length > 0) {
    //没有老的有新的
    mountChildren(el, newChildren);
  } else if (oldChildren.length > 0) {
    //新的没有老的有 删除
    el.innerHTML = ""; //这里可以循环删除 就简写了
  }
  return el;
}
```

我们对`patchProps`方法也进行了一下改造，我们要对`style`进行单独处理，如果老的样式中有新的没有的，需要删除，紧接着需要循环老的属性，如果老的属性中有而新的属性中没有，那么需要删除属性。

```javascript
export function patchProps(el, oldProps, props) {
  let oldStyles = oldProps.style || {};
  let newStyles = props.style || {};
  for (let key in oldStyles) {
    if (!newStyles[key]) {
      el.style[key] = "";
    }
  }

  for (let key in oldProps) {
    if (!props[key]) {
      el.removeAttribute(key);
    }
  }

  for (let key in props) {
    //新的覆盖老的
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

这里补充一下`isSameVNode`方法的实现，只有`key`和`tag`都为`true`时才能判断两个节点是同一个节点。

```javascript
export function isSameVNode(vnode1, vnode2){
  return vnode1.tag === vnode2.tag && vnode1.key === vnode2.key;
}
```

紧接着需要比较新虚拟DOM和老虚拟DOM的儿子，如果两个节点都有儿子，那么调用`updateChildren`进行完整的`diff`，这个方法我们后面说；如果老的没有儿子但是新的有儿子，调用`mountChildren`方法，如果新的没有儿子，老的有儿子，那么直接删除。

看一下`mountChildren`实现逻辑，其实就是对`newChildren`进行循环，拿到每一个虚拟DOM，然后调用`createElm`创建真实节点并插入到父节点中。

```javascript
function mountChildren(el, newChildren) {
  for (let i = 0; i < newChildren.length; i++) {
    let child = newChildren[i];
    el.appendChild(createElm(child));
  }
}
```

