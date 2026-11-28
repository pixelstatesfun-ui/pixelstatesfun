import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  plugins: [
    new webpack.DefinePlugin({
      'process.env.PKG_NAME': JSON.stringify('pixelstates'),
      'process.env.PKG_VERSION': JSON.stringify('3.1.0'),
    }),
  ],
  entry: path.resolve(currentDir, 'src/preview.jsx'),
  output: {
    path: path.resolve(currentDir, 'dist/public/assets'),
    filename: 'preview.js',
    publicPath: '/assets/',
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            configFile: false,
            presets: [
              ['@babel/preset-env', {
                targets: { esmodules: true },
                modules: false,
              }],
            ],
            plugins: [
              ['@babel/plugin-transform-react-jsx', {
                runtime: 'automatic',
                importSource: 'preact',
              }],
            ],
          },
        },
      },
      {
        test: /\.svg$/,
        use: ['@svgr/webpack'],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  stats: 'errors-warnings',
};
