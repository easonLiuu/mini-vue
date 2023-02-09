import { parseHTML } from "./parse";

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
function genChildren(children) {
  return children.map((child) => gen(child)).join(",");
}
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
function codeGen(ast) {
  let children = genChildren(ast.children);

  let code = `_c('${ast.tag}', ${
    ast.attrs.length > 0 ? genProps(ast.attrs) : "null"
  }${ast.children.length ? `,${children}` : ""}
  )`;
  return code;
}
//对模版进行编译
export function compileToFunction(template) {
  //1.将template转换成ast语法树
  let ast = parseHTML(template);

  let code = codeGen(ast);

  //把树组装成下面的语法

  //   render(){
  //     return _c('div', {id: 'app'}, _c('div', {style: {color: 'red'}}, _v(_s(name)+'hello')
  //     ,_c('span', undefined, _v(_s(name))))
  //   }

  //2.生成render方法 (render方法执行后的返回结果就是虚拟DOM)
  //加with取值方便
  //模版引擎的实现原理      with + new Function
  code = `with(this){return ${code}}`
  let render = new Function(code);
  return render;
 
}
