const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z]*`;
const qnameCapture = `((?:${ncname}\\:)?${ncname})`;
const startTagOpen = new RegExp(`^<${qnameCapture}`); // 标签开头的正则 捕获的内容是 标签名
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`); // 匹配标签结尾的  </div>
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+| ([^\s"'=<>`]+)))?/; // 匹配属性的
const startTagClose = /^\s*(\/?)>/; // 匹配标签结束的  >

//vue3采用的不是正则

export function parseHTML(html) {
  const ELEMENT_TYPE = 1;
  const TEXT_TYPE = 3;
  const stack = []; //用于存放元素
  let currentParent; //指向栈中最后一个
  let root; //根节点

  function createASTElement(tag, attrs) {
    return {
      tag,
      type: ELEMENT_TYPE,
      children: [],
      attrs,
      parent: null,
    };
  }
  //功能抛出去 解析
  //最终需要转换成一棵抽象语法树 栈型结构创建树
  function start(tag, attrs) {
    let node = createASTElement(tag, attrs); //创建一个ast节点
    if (!root) {
      //判断是否为空树
      root = node; //当前是树的根节点
    }
    if (currentParent) {
      node.parent = currentParent; //赋予parent属性
      currentParent.children.push(node); //赋予children属性
    }
    stack.push(node);
    currentParent = node; //currentParent是栈中的最后一个
  }
  function chars(text) {
    //文本直接放到当前指向的节点中
    text = text.replace(/\s/g, ""); //如果空格超过2就删除两个以上的
    text &&
      currentParent.children.push({
        type: TEXT_TYPE,
        text,
        parent: currentParent,
      });
  }
  function end(tag) {
    let node = stack.pop(); //弹出最后一个 校验标签是否合法
    currentParent = stack[stack.length - 1];
  }
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
        match.attrs.push({
          name: attr[1],
          value: attr[3] || attr[4] || attr[5] || true,
        });
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
      if (startTagMatch) {
        //解析到的开始标签
        start(startTagMatch.tagName, startTagMatch.attrs);
        continue;
      }
      let endTagMatch = html.match(endTag);
      if (endTagMatch) {
        end(endTagMatch[1]);
        advance(endTagMatch[0].length);
        continue;
      }
    }
    if (textEnd > 0) {
      let text = html.substring(0, textEnd); //文本内容
      if (text) {
        chars(text);
        advance(text.length); //解析到的文本标签
      }
    }
  }
  console.log(root)
  return root;
}
