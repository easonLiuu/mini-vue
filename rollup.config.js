import babel from 'rollup-plugin-babel';
import resolve from '@rollup/plugin-node-resolve'

//rollup默认导出一个对象，作为打包的配置文件
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
        }),
        resolve()

    ]
}