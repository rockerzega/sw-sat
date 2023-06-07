const path = require('path')
const webpack = require('webpack')
const nodeExternals = require('webpack-node-externals')
const NodemonPlugin = require('nodemon-webpack-plugin')

module.exports = (env, argv) => {
  return {
    name: 'utils',
    entry: './src/index.ts',
    target: 'node',
    externals: [nodeExternals()],
    output: {
      path: path.resolve(__dirname, 'build'),
      filename: '[name].js',
    },
    resolve: {
      extensions: ['.js', '.ts'],
      alias: {
        '~': path.resolve(__dirname),
        '@': path.resolve(__dirname),
      },
    },
    node: {
      __filename: true,
      __dirname: true,
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: [/node_modules/, path.resolve(__dirname, 'build')],
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        __DEV__: argv.mode !== 'production',
      }),
      new NodemonPlugin(),
    ],
  }
}
