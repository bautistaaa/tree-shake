const { ESBuildMinifyPlugin } = require("esbuild-loader");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const ReactRefreshPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const path = require("path");
const assert = require("assert");

function insertBeforeJssStyles(element) {
  const head = document.head;
  const firstJssNode = head.querySelector("style[data-jss]");
  if (!firstJssNode) {
    head.appendChild(element);
  } else {
    head.insertBefore(element, firstJssNode);
  }
}

const DEV_PLUGINS = [
  new webpack.DefinePlugin({
    "process.env.NODE_ENV": JSON.stringify("development"),
    "process.env.NETFLIX_ENVIRONMENT": JSON.stringify("test"),
  }),
  new ReactRefreshPlugin({ overlay: { sockProtocol: "ws" } }),
];

const PROD_PLUGINS = [
  new webpack.DefinePlugin({
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.NETFLIX_ENVIRONMENT": JSON.stringify("prod"),
  }),
  new MiniCssExtractPlugin({
    filename: "static/chunk-[name].[contenthash:8].css",
    chunkFilename: "static/chunk-[name].[id].[contenthash:8].css",
    insert: insertBeforeJssStyles,
  }),
];

const COMMON_PLUGINS = [
  // process.env.WEBPACK_BUNDLE_ANALYZER && new BundleAnalyzerPlugin(),
  // new BundleAnalyzerPlugin(),
  new webpack.DefinePlugin({
    "process.env.BUILD_ID": JSON.stringify(
      process.env.BUILD_SHA || process.env.revision || new Date().getTime()
    ),
    "process.env.NETFLIX_STACK": JSON.stringify(process.env.NETFLIX_STACK),
  }),
  new webpack.ProvidePlugin({
    Buffer: ["buffer", "Buffer"],
  }),
  new webpack.DefinePlugin({
    "process.env.APP_CONFIG": "[]",
    "process.env.EDGE_VARIANT": JSON.stringify(process.env.EDGE_VARIANT),
  }),
  new HtmlWebpackPlugin({
    template: "public/index.html",
    templateParameters: { publicPath: "" },
  }),
].filter(Boolean);

const getLoaderRules = (isProduction) => [
  {
    test: /\.(tsx?)$/,
    exclude: /node_modules/,
    use: [swcLoader(isProduction, "typescript")],
  },
  {
    test: /\.(jsx?|mjs|cjs)$/,
    exclude: /node_modules/,
    use: [swcLoader(isProduction, "ecmascript")],
  },
  {
    test: /\.(js|mjs|cjs)/,
    resolve: { fullySpecified: false },
  },
  {
    test: [
      /\.bmp$/,
      /\.gif$/,
      /\.jpe?g$/,
      /\.png$/,
      /\.frag/,
      { and: [/\.svg/, { not: [/\.icon\.svg/] }] },
      /\.xml/,
    ],
    type: "asset/resource",
    generator: {
      filename: "static/[name].[hash:8].[ext]",
    },
  },
  {
    test: /\.(eot|woff|woff2|ttf)$/i,
    type: "asset/resource",
    generator: {
      filename: "static/[name].[hash][ext][query]",
    },
  },
  {
    test: /\.css$/i,
    use: [
      isProduction
        ? MiniCssExtractPlugin.loader
        : {
            loader: require.resolve("style-loader"),
            options: { insert: insertBeforeJssStyles },
          },
      {
        loader: require.resolve("css-loader"),
        options: {
          sourceMap: true,
        },
      },
    ],
  },
];

// reconcile environment variable NODE_ENV and CLI --mode options
function getIsProduction(mode, NODE_ENV) {
  if (!mode && !NODE_ENV) {
    return false;
  } else if (mode && NODE_ENV) {
    assert(
      mode === NODE_ENV,
      `--mode=${mode} and NODE_ENV=${NODE_ENV} are both present`
    );
    return mode === "production";
  }
  return mode === "production" || NODE_ENV === "production";
}

module.exports = (env, argv) => {
  const isProduction = getIsProduction(argv.mode, process.env.NODE_ENV);

  return {
    mode: isProduction ? "production" : "development",
    profile: false,
    cache: {
      type: "filesystem",
    },
    plugins: isProduction
      ? [...PROD_PLUGINS, ...COMMON_PLUGINS]
      : [...DEV_PLUGINS, ...COMMON_PLUGINS],
    module: {
      rules: getLoaderRules(isProduction),
    },
    bail: false,
    performance: { hints: false },
    // devtool: isProduction ? 'source-map' : 'eval-cheap-module-source-map',
    optimization: {
      minimize: false,
      minimizer: [new ESBuildMinifyPlugin()],
      runtimeChunk: "single",
      splitChunks: {
        automaticNameDelimiter: "-",
        cacheGroups: {
          default: false,
          packages: {
            chunks: "initial",
            test: (module) =>
              Boolean(
                module?.resource?.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)
              ),
            name: (module) => {
              const packageName = module.resource.match(
                /[\\/]node_modules[\\/](.*?)([\\/]|$)/
              )[1];
              return packageName.replace("@", "");
            },
            filename: "static/chunk-[name].[id].[contenthash].js",
            priority: 10,
            minSize: 1e5,
            minChunks: 1,
            maxAsyncRequests: Infinity,
            maxInitialRequests: Infinity,
          },
          vendor: {
            chunks: "initial",
            test: /[\\/]node_modules[\\/]/,
            name: "vendor",
            priority: 5,
            enforce: true,
          },
        },
      },
    },
    resolve: {
      extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json", ".wasm"],
      mainFields: ["browser", "module", "main"],
    },
    entry: ["./src/index.tsx"],
    output: {
      path: path.join(__dirname, "dist"),
      publicPath: "/",
      filename: "static/chunk-[name].[contenthash].js",
      chunkFilename: "static/chunk-[name].[contenthash].js",
      devtoolModuleFilenameTemplate: isProduction
        ? undefined
        : devtoolModuleFilenameTemplate,
    },
    devServer: {
      static: {
        directory: path.join(__dirname, "public"),
      },
      client: {
        webSocketURL: "auto://0.0.0.0:0/ws",
        overlay: false,
      },
      historyApiFallback: {
        disableDotRule: true,
      },
      allowedHosts: ["localhost", "127.0.0.1", ".netflixstudios.com"],
      hot: true,
      compress: true,
      port: 3000,
    },
  };
};

const swcLoader = (isProduction, syntax = "ecmascript", react = true) => {
  const jsc = {
    target: "es2019",
    externalHelpers: true,
    parser: { syntax: syntax, tsx: true, dynamicImport: true },
  };

  if (react) {
    jsc.transform = {
      react: {
        runtime: "automatic",
        refresh: !isProduction,
        development: !isProduction,
      },
    };
  }

  // eslint-disable-next-line spaced-comment
  return { loader: "swc-loader", options: { jsc /*module: { type: "es6" }*/ } };
};

function devtoolModuleFilenameTemplate(info) {
  return `file:///${path.resolve(info.absoluteResourcePath).replace(/\\/g, "/")}`;
}
