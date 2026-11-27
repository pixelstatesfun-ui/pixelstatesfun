import webpack from 'webpack';
import config from '../webpack.config.preview.js';

const compiler = webpack({
  ...config,
  mode: 'production',
});

compiler.run((err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const info = stats.toJson({
    errors: true,
    warnings: true,
  });
  if (stats.hasErrors()) {
    info.errors.forEach((e) => console.error(e.message || e));
    process.exit(1);
  }
  if (stats.hasWarnings()) {
    info.warnings.forEach((w) => console.warn(w.message || w));
  }
  console.log(
    `Built preview bundle in ${info.time}ms -> dist/public/assets/preview.js`,
  );
  compiler.close((closeErr) => {
    if (closeErr) {
      console.error(closeErr);
      process.exit(1);
    }
    process.exit(0);
  });
});
