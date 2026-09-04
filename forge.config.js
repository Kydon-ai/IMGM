const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { ignore } = require('./forge-packager-config');

module.exports = {
  packagerConfig: {
    name: 'IMGM', // 应用名称
    // sharp 的 .node 文件会被自动解包，但 Windows 运行时还需要同目录的
    // libvips DLL；因此必须把 sharp 和 @img 的完整目录一起解包。
    asar: {
      unpack: '**/node_modules/{sharp,@img}/**/*',
    },
    icon: './public/img/IMGM.ico', // 应用图标路径
    executableName: 'imgm', // 强制指定可执行文件名称（所有平台）
    // 排除开发数据、密钥、源码和测试，避免泄密并控制安装包体积。
    ignore,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: './public/img/IMGM.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
